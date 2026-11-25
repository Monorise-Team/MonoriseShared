import { CompactEncrypt, base64url, compactDecrypt, decodeProtectedHeader } from "jose";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
/** Maksymalna długość wejścia akceptowana przez `unseal` przed jakimkolwiek parsowaniem. */
const MAX_SEALED_LENGTH = 8192;

export interface Sealer {
  seal(value: unknown): Promise<string>;
  /** Odszyfrowana wartość albo `null`, gdy szyfrogram jest uszkodzony, podrobiony albo z nieznanym kluczem. */
  unseal<T>(sealed: string | null | undefined): Promise<T | null>;
}

interface Key {
  kid: string;
  key: Uint8Array;
}

async function deriveKey(secret: string, purpose: string): Promise<Key> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: encoder.encode("@monorise-team/auth"), info: encoder.encode(purpose) },
    material,
    256,
  );
  const key = new Uint8Array(bits);
  const kid = base64url.encode(new Uint8Array(await crypto.subtle.digest("SHA-256", key))).slice(0, 12);
  return { kid, key };
}

/**
 * Szyfrowanie AES-256-GCM (JWE `dir`) kluczem wyprowadzonym z sekretu aplikacji (HKDF-SHA-256), osobnym dla
 * każdego celu. Przy wymianie sekretu nowy podaje się jako pierwszy: on szyfruje, a starsze tylko odszyfrowują.
 */
export function createSealer(secrets: string[], purpose: string): Sealer {
  if (secrets.length === 0) throw new Error("Brak sekretu sesji");
  if (secrets.some((secret) => secret.length < 32)) throw new Error("Sekret sesji musi mieć co najmniej 32 znaki");
  const keys = Promise.all(secrets.map((secret) => deriveKey(secret, purpose)));

  return {
    async seal(value) {
      const current = (await keys)[0];
      if (!current) throw new Error("Brak sekretu sesji");
      return new CompactEncrypt(encoder.encode(JSON.stringify(value)))
        .setProtectedHeader({ alg: "dir", enc: "A256GCM", kid: current.kid })
        .encrypt(current.key);
    },
    async unseal<T>(sealed: string | null | undefined): Promise<T | null> {
      if (!sealed || sealed.length > MAX_SEALED_LENGTH) return null;
      try {
        const { kid } = decodeProtectedHeader(sealed);
        const match = (await keys).find((candidate) => candidate.kid === kid);
        if (!match) return null;
        const { plaintext } = await compactDecrypt(sealed, match.key, {
          keyManagementAlgorithms: ["dir"],
          contentEncryptionAlgorithms: ["A256GCM"],
        });
        return JSON.parse(decoder.decode(plaintext)) as T;
      } catch {
        return null;
      }
    },
  };
}
