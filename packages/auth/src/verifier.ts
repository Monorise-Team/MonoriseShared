import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from "jose";
import { AccessTokenClaims, toAuthContext, type AuthContext } from "./claims.js";
import { AuthError, AuthUnavailableError } from "./errors.js";
import { oauthEndpoints } from "./oauth.js";

export interface TokenVerifierOptions {
  /** Adres Core, np. `https://auth.monorise.studio`; musi się zgadzać z polem `iss`. */
  issuer: string;
  /** API, dla którego wydano token (pole `aud`), np. `https://aven.monorise.studio`. */
  audience: string | string[];
  /** Klucze publiczne Core; domyślnie JWKS z `<issuer>/api/auth/jwks`. W testach `createLocalJWKSet`. */
  keys?: JWTVerifyGetKey;
  /** Dozwolone typy tokenu z nagłówka `typ`; domyślnie tylko tokeny dostępu `at+jwt` (RFC 9068). */
  types?: string[];
  /** Tolerancja różnicy zegarów w sekundach (domyślnie 5). */
  clockTolerance?: number;
}

export type TokenVerifier = (token: string) => Promise<AuthContext>;

/** Klucze publiczne Core pobierane z JWKS i trzymane w pamięci (nowy klucz po wymianie pobiera się sam). */
export function remoteKeys(jwksUrl: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(jwksUrl), { cooldownDuration: 30_000, cacheMaxAge: 10 * 60_000 });
}

/** Błędy samego tokenu; pozostałe (brak sieci, zły JWKS) oznaczają niedostępny Core. */
const TOKEN_ERRORS = new Set([
  "ERR_JWT_EXPIRED",
  "ERR_JWT_CLAIM_VALIDATION_FAILED",
  "ERR_JWT_INVALID",
  "ERR_JWS_INVALID",
  "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
  "ERR_JOSE_ALG_NOT_ALLOWED",
  "ERR_JOSE_NOT_SUPPORTED",
  "ERR_JWKS_NO_MATCHING_KEY",
  "ERR_JWKS_MULTIPLE_MATCHING_KEYS",
]);

const normalizeType = (type: string) => type.toLowerCase().replace(/^application\//, "");

/**
 * Sprawdza token dostępu lokalnie, bez pytania Core przy każdym żądaniu (ADR-0023): podpis EdDSA kluczem
 * z JWKS, wystawca, odbiorca, typ, ważność i komplet pól firmy. Zwraca kontekst firmy.
 */
export function createTokenVerifier(options: TokenVerifierOptions): TokenVerifier {
  const keys = options.keys ?? remoteKeys(oauthEndpoints(options.issuer).jwks);
  const types = new Set((options.types ?? ["at+jwt"]).map(normalizeType));

  return async (token) => {
    let verified;
    try {
      verified = await jwtVerify(token, keys, {
        issuer: options.issuer,
        audience: options.audience,
        algorithms: ["EdDSA"],
        clockTolerance: options.clockTolerance ?? 5,
        requiredClaims: ["sub", "iat", "exp"],
      });
    } catch (error) {
      if (error instanceof errors.JOSEError && TOKEN_ERRORS.has(error.code)) {
        throw new AuthError("UNAUTHENTICATED", "Token jest nieważny albo wygasł", { cause: error });
      }
      throw new AuthUnavailableError("Nie udało się pobrać kluczy logowania z Core", { cause: error });
    }

    const type = verified.protectedHeader.typ;
    if (!type || !types.has(normalizeType(type))) {
      throw new AuthError("UNAUTHENTICATED", "To nie jest token dostępu");
    }
    const claims = AccessTokenClaims.safeParse(verified.payload);
    if (!claims.success) throw new AuthError("UNAUTHENTICATED", "Token nie ma pól konta i firmy");
    return toAuthContext(claims.data);
  };
}

/** Token z nagłówka `Authorization: Bearer …` albo `null`. */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match?.[1] ?? null;
}
