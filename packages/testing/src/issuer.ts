import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JSONWebKeySet,
  type JWK,
  type JWTVerifyGetKey,
} from "jose";

/** Para kluczy Ed25519 wygenerowana przez `jose`. */
export type GeneratedEd25519KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

export interface CreateTestIssuerOptions {
  /** Adres wystawcy Core (pole `iss`), np. `https://auth.monorise.test`. */
  issuer: string;
  /** Identyfikator klucza w nagłówku JWT i JWKS (domyślnie `test-key-1`). */
  kid?: string;
  /** Opcjonalna gotowa para kluczy Ed25519 (przydatne przy rekonfiguracji adresu wystawcy). */
  keyPair?: GeneratedEd25519KeyPair;
}

export interface SignUserTokenInput {
  /** Identyfikator konta Monorise (`sub`, UUID). */
  accountId: string;
  /** Identyfikator firmy (`org_id`, UUID). */
  organizationId: string;
  /** Identyfikator pracownika (`employee_id`, UUID). */
  employeeId: string;
  /** Odbiorca tokenu (`aud`), np. adres API produktu lub Core API. */
  audience: string | string[];
  /** Wersja uprawnień konta (`authz_rev`, domyślnie `0`). */
  authzRevision?: number;
  /** Identyfikator sesji Core (`sid`); `null` pomija pole w tokenie. */
  sid?: string | null;
  /** Opcjonalny identyfikator klienta OAuth (`client_id`). */
  clientId?: string;
  /** Opcjonalny zakres OAuth (`scope`). */
  scope?: string | readonly string[];
  /** Opcjonalne metody logowania (`amr`). */
  amr?: readonly string[];
  /** Czas życia tokenu w sekundach (domyślnie `300` — 5 minut zgodnie z ADR-0023). */
  expiresIn?: number;
  /** Czas wystawienia tokenu (domyślnie bieżący czas). */
  now?: Date;
  /** Nagłówek `typ` JWT (domyślnie `at+jwt` zgodnie z RFC 9068). */
  typ?: string;
}

export interface SignMachineTokenInput {
  /** Identyfikator poufnego klienta produktu (`client_id`, np. `timotime-web`). */
  clientId: string;
  /** Odbiorca tokenu (`aud`), zwykle adres Core API. */
  audience: string | string[];
  /** Zakresy maszynowe (`scope`), np. `core:permissions.read core:directory.read`. */
  scope: string | readonly string[];
  /** Czas życia tokenu w sekundach (domyślnie `300` — 5 minut). */
  expiresIn?: number;
  /** Czas wystawienia tokenu (domyślnie bieżący czas). */
  now?: Date;
}

export type MissingOrgIdTokenInput = Omit<SignUserTokenInput, "organizationId"> & {
  organizationId?: string;
};

/** Pomocniki do generowania niepoprawnych wariantów tokenu użytkownika (do testów odrzuceń 401). */
export interface InvalidTokenHelpers {
  /** Token po terminie ważności (`exp` w przeszłości, poza tolerancją zegara). */
  expired(input: SignUserTokenInput, expiredAgoSeconds?: number): Promise<string>;
  /** Token wystawiony dla innego API (inne `aud`). */
  wrongAudience(input: SignUserTokenInput, audience?: string): Promise<string>;
  /** Token podpisany obcym kluczem Ed25519, którego nie ma w JWKS wystawcy. */
  foreignKey(input: SignUserTokenInput): Promise<string>;
  /** Token wystawiony przez innego, niezaufanego wystawcę (`iss`). */
  wrongIssuer(input: SignUserTokenInput, issuer?: string): Promise<string>;
  /** Token z poprawnym podpisem i wystawcą, ale bez wymaganego pola `org_id`. */
  missingOrgId(input: MissingOrgIdTokenInput): Promise<string>;
}

/** Testowy wystawca kluczy Ed25519 i tokenów JWT zgodny z kontraktem MonoriseCore (ADR-0023). */
export interface TestIssuer {
  readonly issuer: string;
  readonly kid: string;
  /** Adres JWKS wyprowadzony z wystawcy tak samo jak w `@monorise-team/auth` (`<issuer>/api/auth/jwks`). */
  readonly jwksUrl: string;
  readonly publicKey: GeneratedEd25519KeyPair["publicKey"];
  readonly privateKey: GeneratedEd25519KeyPair["privateKey"];
  readonly jwk: JWK;
  readonly jwks: JSONWebKeySet;
  /** Lokalny zestaw kluczy `jose` do bezpośredniego przekazania do `createTokenVerifier` lub `jwtVerify`. */
  readonly localJWKSet: JWTVerifyGetKey;
  /** Podpisuje token dostępu użytkownika (`at+jwt`, EdDSA, domyślnie 5 minut). */
  signUserToken(input: SignUserTokenInput): Promise<string>;
  /** Podpisuje token maszynowy `client_credentials` (`at+jwt`, EdDSA, bez `org_id`). */
  signMachineToken(input: SignMachineTokenInput): Promise<string>;
  /** Pomocniki budujące niepoprawne warianty tokenu użytkownika. */
  readonly invalid: InvalidTokenHelpers;
}

const DEFAULT_TOKEN_TTL_SECONDS = 300;
const DEFAULT_EXPIRED_AGO_SECONDS = 60;
const DEFAULT_WRONG_AUDIENCE = "https://other-product.monorise.test";
const FALLBACK_WRONG_AUDIENCE = "https://another-product.monorise.test";
const DEFAULT_WRONG_ISSUER = "https://untrusted-issuer.monorise.test";
const FALLBACK_WRONG_ISSUER = "https://foreign-issuer.monorise.test";

function normalizeIssuer(issuer: string): string {
  return issuer.trim().replace(/\/+$/, "");
}

function toEpochSeconds(date: Date | undefined): number {
  return Math.floor((date ?? new Date()).getTime() / 1000);
}

function normalizeScope(scope: string | readonly string[]): string {
  return typeof scope === "string" ? scope : scope.join(" ");
}

function pickDifferentAudience(current: string | string[], explicit?: string): string {
  if (explicit !== undefined) return explicit;
  const list = Array.isArray(current) ? current : [current];
  return list.includes(DEFAULT_WRONG_AUDIENCE) ? FALLBACK_WRONG_AUDIENCE : DEFAULT_WRONG_AUDIENCE;
}

function pickDifferentIssuer(currentIssuer: string, explicit?: string): string {
  if (explicit !== undefined) return explicit;
  return currentIssuer === DEFAULT_WRONG_ISSUER ? FALLBACK_WRONG_ISSUER : DEFAULT_WRONG_ISSUER;
}

/**
 * Tworzy testowego wystawcę tokenów JWT (para kluczy Ed25519, JWKS z `kid`, podpisywanie tokenów
 * użytkownika i tokenów maszynowych oraz generatory niepoprawnych wariantów tokenów).
 */
export async function createTestIssuer(options: CreateTestIssuerOptions): Promise<TestIssuer> {
  const issuer = normalizeIssuer(options.issuer);
  if (!issuer) {
    throw new TypeError("Adres wystawcy (issuer) nie może być pusty");
  }
  const kid = options.kid?.trim() || "test-key-1";
  const keyPair = options.keyPair ?? (await generateKeyPair("EdDSA", { crv: "Ed25519" }));
  const publicJwk: JWK = {
    ...(await exportJWK(keyPair.publicKey)),
    kid,
    alg: "EdDSA",
    use: "sig",
  };
  const jwks: JSONWebKeySet = { keys: [publicJwk] };
  const localJWKSet = createLocalJWKSet(jwks);

  let foreignKeyPairPromise: Promise<GeneratedEd25519KeyPair> | undefined;
  const getForeignKeyPair = () => {
    foreignKeyPairPromise ??= generateKeyPair("EdDSA", { crv: "Ed25519" });
    return foreignKeyPairPromise;
  };

  interface InternalSignOverrides {
    issuer?: string;
    audience?: string | string[];
    kid?: string;
    key?: GeneratedEd25519KeyPair["privateKey"];
    omitOrgId?: boolean;
    issuedAt?: number;
    expiresAt?: number;
  }

  async function buildUserToken(input: MissingOrgIdTokenInput, overrides: InternalSignOverrides = {}): Promise<string> {
    const iat = overrides.issuedAt ?? toEpochSeconds(input.now);
    const exp = overrides.expiresAt ?? iat + (input.expiresIn ?? DEFAULT_TOKEN_TTL_SECONDS);

    const payload: Record<string, unknown> = {
      employee_id: input.employeeId,
      authz_rev: input.authzRevision ?? 0,
    };
    if (!overrides.omitOrgId) {
      if (!input.organizationId) {
        throw new TypeError("Brak organizationId w tokenie użytkownika");
      }
      payload.org_id = input.organizationId;
    }
    if (input.sid !== null) {
      payload.sid = input.sid ?? "test-session";
    }
    if (input.clientId !== undefined) {
      payload.client_id = input.clientId;
    }
    if (input.scope !== undefined) {
      payload.scope = normalizeScope(input.scope);
    }
    if (input.amr !== undefined) {
      payload.amr = [...input.amr];
    }

    return new SignJWT(payload)
      .setProtectedHeader({
        alg: "EdDSA",
        kid: overrides.kid ?? kid,
        typ: input.typ ?? "at+jwt",
      })
      .setIssuer(overrides.issuer ?? issuer)
      .setSubject(input.accountId)
      .setAudience(overrides.audience ?? input.audience)
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(overrides.key ?? keyPair.privateKey);
  }

  async function signUserToken(input: SignUserTokenInput): Promise<string> {
    return buildUserToken(input);
  }

  async function signMachineToken(input: SignMachineTokenInput): Promise<string> {
    const iat = toEpochSeconds(input.now);
    const exp = iat + (input.expiresIn ?? DEFAULT_TOKEN_TTL_SECONDS);

    return new SignJWT({
      client_id: input.clientId,
      scope: normalizeScope(input.scope),
    })
      .setProtectedHeader({ alg: "EdDSA", kid, typ: "at+jwt" })
      .setIssuer(issuer)
      .setSubject(input.clientId)
      .setAudience(input.audience)
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(keyPair.privateKey);
  }

  const invalid: InvalidTokenHelpers = {
    async expired(input, expiredAgoSeconds = DEFAULT_EXPIRED_AGO_SECONDS) {
      const nowSec = toEpochSeconds(input.now);
      const ago = Math.max(1, Math.floor(expiredAgoSeconds));
      const exp = nowSec - ago;
      const iat = exp - DEFAULT_TOKEN_TTL_SECONDS;
      return buildUserToken(input, { issuedAt: iat, expiresAt: exp });
    },

    async wrongAudience(input, audience) {
      return buildUserToken(input, {
        audience: pickDifferentAudience(input.audience, audience),
      });
    },

    async foreignKey(input) {
      const foreign = await getForeignKeyPair();
      return buildUserToken(input, {
        kid: `${kid}-foreign`,
        key: foreign.privateKey,
      });
    },

    async wrongIssuer(input, wrongIss) {
      return buildUserToken(input, {
        issuer: pickDifferentIssuer(issuer, wrongIss),
      });
    },

    async missingOrgId(input) {
      return buildUserToken(input, { omitOrgId: true });
    },
  };

  return {
    issuer,
    kid,
    jwksUrl: `${issuer}/api/auth/jwks`,
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    jwk: publicJwk,
    jwks,
    localJWKSet,
    signUserToken,
    signMachineToken,
    invalid,
  };
}
