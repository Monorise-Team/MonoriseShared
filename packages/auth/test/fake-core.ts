import { createHash } from "node:crypto";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

/**
 * Sztuczny serwer OAuth zachowujący się jak MonoriseCore (@better-auth/oauth-provider 1.7.27):
 * rotacja tokenu odświeżania oznacza stary token jako unieważniony (`revokedAt`), ponowne użycie
 * unieważnionego tokenu w `/oauth2/token` lub `/oauth2/revoke` unieważnia całą rodzinę tokenów
 * tej pary `(clientId, userId)`, a w oknie `reuseIntervalSeconds` zwraca tę samą odpowiedź.
 */

export const ISSUER = "https://auth.example.test";
export const RESOURCE = "https://aven.example.test";
export const CORE_API = "https://api.example.test";
export const APP = "https://aven-mail.example.test";
export const CLIENT_ID = "avenmail-web";
export const CLIENT_SECRET = "sekret-klienta-do-testow";
export const SECRET = "sekret-sesji-do-testow-dluzszy-niz-32-znaki";
export const ACCOUNT_ID = "01936f4e-8a1b-7c3d-9e2f-0a1b2c3d4e5f";
export const ORGANIZATION_ID = "01936f4e-7d10-7a2b-8c3d-4e5f6a7b8c9d";
export const EMPLOYEE_ID = "01936f4e-9b2c-7d4e-8f5a-6b7c8d9e0f1a";
const USERINFO = `${ISSUER}/api/auth/oauth2/userinfo`;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const challengeOf = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

interface Grant {
  clientId: string;
  resources: string[];
  nonce: string | undefined;
}

interface IssuedBody {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
  id_token: string;
}

interface RefreshEntry extends Grant {
  accountId: string;
  revokedAt: number | null;
  rotatedResponse: IssuedBody | null;
}

export interface TokenOptions {
  audience?: string | string[];
  issuer?: string;
  typ?: string;
  expiresIn?: number;
  issuedAt?: number;
  clientId?: string;
  claims?: Record<string, unknown>;
  omit?: string[];
  key?: Parameters<SignJWT["sign"]>[0];
}

export interface FakeCoreOptions {
  /** Zegar używany do sprawdzania okna `reuseIntervalSeconds`. */
  now?: () => number;
  /** Mapa dozwolonych klientów `clientId -> clientSecret`. */
  clients?: Record<string, string>;
}

export async function createFakeCore(options: FakeCoreOptions = {}) {
  const getNow = options.now ?? Date.now;
  const clients: Record<string, string> = { [CLIENT_ID]: CLIENT_SECRET, ...options.clients };
  const { privateKey, publicKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
  const jwk = { ...(await exportJWK(publicKey)), kid: "klucz-1", alg: "EdDSA", use: "sig" };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const codes = new Map<string, Grant & { challenge: string; redirectUri: string; used: boolean }>();
  const refreshTokens = new Map<string, RefreshEntry>();
  const calls = { token: 0, refresh: 0, revoke: 0, userinfo: 0 };
  const state = {
    authzRevision: 0,
    accountDeactivated: false,
    userDeleted: false,
    scopeShrunk: false,
    down: false,
    /** Okno ponownego użycia obróconego tokenu w sekundach (w Core: 20 s). */
    reuseIntervalSeconds: 0,
    /** Symulacja ~5 ms luki po rotacji: tyle pierwszych powtórzeń w oknie zwróci 400 invalid_grant bez czyszczenia rodziny. */
    replayGapResponses: 0,
    /** Wymuszony błąd OAuth na refresh_token (np. `invalid_client`). */
    refreshError: null as { error: string; status?: number; description?: string } | null,
  };

  /** Token dostępu jak z Core: `at+jwt`, EdDSA, odbiorcy API i `userinfo`. */
  async function token(tokenOptions: TokenOptions = {}): Promise<string> {
    const issuedAt = tokenOptions.issuedAt ?? Math.floor(Date.now() / 1000);
    const claims: Record<string, unknown> = {
      org_id: ORGANIZATION_ID,
      employee_id: EMPLOYEE_ID,
      authz_rev: state.authzRevision,
      sid: "sesja-core-1",
      client_id: tokenOptions.clientId ?? CLIENT_ID,
      scope: "openid profile email offline_access",
      ...tokenOptions.claims,
    };
    const payload = Object.fromEntries(Object.entries(claims).filter(([name]) => !tokenOptions.omit?.includes(name)));
    return new SignJWT(payload)
      .setProtectedHeader({ alg: "EdDSA", kid: "klucz-1", typ: tokenOptions.typ ?? "at+jwt" })
      .setIssuer(tokenOptions.issuer ?? ISSUER)
      .setSubject(ACCOUNT_ID)
      .setAudience(tokenOptions.audience ?? [RESOURCE, USERINFO])
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + (tokenOptions.expiresIn ?? 300))
      .sign(tokenOptions.key ?? privateKey);
  }

  async function idToken(nonce: string | undefined, clientId: string): Promise<string> {
    const nowSec = Math.floor(Date.now() / 1000);
    return new SignJWT({ nonce, sid: "sesja-core-1", acr: "0", auth_time: nowSec })
      .setProtectedHeader({ alg: "EdDSA", kid: "klucz-1", typ: "JWT" })
      .setIssuer(ISSUER)
      .setSubject(ACCOUNT_ID)
      .setAudience(clientId)
      .setIssuedAt(nowSec)
      .setExpirationTime(nowSec + 3600)
      .sign(privateKey);
  }

  /** Udaje przeglądarkę na ekranie logowania Core: z adresu logowania robi adres powrotu z kodem. */
  function approve(authorize: string, overrides: { iss?: string; state?: string } = {}): string {
    const query = new URL(authorize).searchParams;
    const code = `kod-${crypto.randomUUID()}`;
    codes.set(code, {
      clientId: query.get("client_id") ?? CLIENT_ID,
      challenge: query.get("code_challenge") ?? "",
      redirectUri: query.get("redirect_uri") ?? "",
      resources: query.getAll("resource"),
      nonce: query.get("nonce") ?? undefined,
      used: false,
    });
    const back = new URL(query.get("redirect_uri") ?? "");
    back.searchParams.set("code", code);
    back.searchParams.set("state", overrides.state ?? query.get("state") ?? "");
    back.searchParams.set("iss", overrides.iss ?? ISSUER);
    return back.toString();
  }

  function wipeFamily(clientId: string, accountId: string): void {
    const revokedAt = getNow();
    for (const entry of refreshTokens.values()) {
      if (entry.clientId === clientId && entry.accountId === accountId) {
        entry.revokedAt ??= revokedAt;
        entry.rotatedResponse = null;
      }
    }
  }

  async function issue(grant: Grant, resource: string): Promise<IssuedBody> {
    const refreshToken = `odswiezanie-${crypto.randomUUID()}`;
    refreshTokens.set(refreshToken, {
      ...grant,
      accountId: ACCOUNT_ID,
      revokedAt: null,
      rotatedResponse: null,
    });
    return {
      access_token: await token({ audience: [resource, USERINFO], clientId: grant.clientId }),
      token_type: "Bearer",
      expires_in: 300,
      refresh_token: refreshToken,
      scope: "openid profile email offline_access",
      id_token: await idToken(grant.nonce, grant.clientId),
    };
  }

  const fetch: typeof globalThis.fetch = async (input, init) => {
    if (state.down) throw new TypeError("fetch failed");
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === "/api/auth/oauth2/userinfo") {
      calls.userinfo++;
      return json(200, { sub: ACCOUNT_ID, email: "anna@acme.test", name: "Anna Kowalska", email_verified: true });
    }
    const form = new URLSearchParams(String(init?.body ?? ""));
    const reqClientId = form.get("client_id") ?? "";
    const reqClientSecret = form.get("client_secret") ?? "";
    if (!reqClientId || clients[reqClientId] !== reqClientSecret) {
      return json(401, { error: "invalid_client" });
    }
    if (url.pathname === "/api/auth/oauth2/revoke") {
      calls.revoke++;
      const entry = refreshTokens.get(form.get("token") ?? "");
      if (entry && entry.clientId === reqClientId) {
        if (entry.revokedAt !== null) {
          // Ponowne użycie już obróconego/unieważnionego tokenu w /revoke kasuje całą rodzinę (clientId, userId).
          wipeFamily(entry.clientId, entry.accountId);
          return json(400, { error: "invalid_grant" });
        }
        entry.revokedAt = getNow();
        entry.rotatedResponse = null;
      }
      return new Response(null, { status: 200 });
    }
    if (url.pathname !== "/api/auth/oauth2/token") return json(404, { error: "not_found" });

    if (form.get("grant_type") === "authorization_code") {
      calls.token++;
      const entry = codes.get(form.get("code") ?? "");
      if (!entry || entry.used || entry.clientId !== reqClientId || entry.redirectUri !== form.get("redirect_uri")) {
        return json(400, { error: "invalid_grant" });
      }
      entry.used = true;
      if (challengeOf(form.get("code_verifier") ?? "") !== entry.challenge) {
        return json(400, { error: "invalid_grant", error_description: "PKCE" });
      }
      const resource = form.get("resource") ?? entry.resources[0] ?? "";
      if (!entry.resources.includes(resource)) return json(400, { error: "invalid_target" });
      return json(200, await issue(entry, resource));
    }
    if (form.get("grant_type") === "refresh_token") {
      calls.refresh++;
      if (state.refreshError) {
        return json(state.refreshError.status ?? 400, {
          error: state.refreshError.error,
          error_description: state.refreshError.description,
        });
      }
      const entry = refreshTokens.get(form.get("refresh_token") ?? "");
      if (!entry || entry.clientId !== reqClientId) return json(400, { error: "invalid_grant" });
      if (state.userDeleted) return json(400, { error: "invalid_request", error_description: "user not found" });
      if (state.scopeShrunk) return json(400, { error: "invalid_scope" });
      if (state.accountDeactivated) {
        wipeFamily(entry.clientId, entry.accountId);
        return json(400, { error: "invalid_grant" });
      }
      if (entry.revokedAt !== null) {
        const withinReuse =
          state.reuseIntervalSeconds > 0 &&
          entry.rotatedResponse !== null &&
          getNow() - entry.revokedAt <= state.reuseIntervalSeconds * 1000;
        if (withinReuse) {
          if (state.replayGapResponses > 0) {
            state.replayGapResponses--;
            return json(400, { error: "invalid_grant" });
          }
          return json(200, entry.rotatedResponse);
        }
        // Ponowne użycie poza oknem: Core unieważnia całą rodzinę tokenów (RFC 9700).
        wipeFamily(entry.clientId, entry.accountId);
        return json(400, { error: "invalid_grant" });
      }
      const resource = form.get("resource") ?? entry.resources[0] ?? "";
      if (!entry.resources.includes(resource)) {
        return json(400, { error: "invalid_target", error_description: "requested resource invalid" });
      }
      const rotated = await issue(entry, resource);
      entry.revokedAt = getNow();
      entry.rotatedResponse = rotated;
      return json(200, rotated);
    }
    return json(400, { error: "unsupported_grant_type" });
  };

  return { keys, fetch, approve, token, calls, state };
}

export type FakeCore = Awaited<ReturnType<typeof createFakeCore>>;
