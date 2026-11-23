import { createHash } from "node:crypto";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

/** Sztuczny serwer OAuth zachowujący się jak MonoriseCore (sprawdzone na lokalnym Core 23.11.2026). */

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
  resources: string[];
  nonce: string | undefined;
}

export interface TokenOptions {
  audience?: string | string[];
  issuer?: string;
  typ?: string;
  expiresIn?: number;
  issuedAt?: number;
  claims?: Record<string, unknown>;
  omit?: string[];
  key?: Parameters<SignJWT["sign"]>[0];
}

export async function createFakeCore() {
  const { privateKey, publicKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
  const jwk = { ...(await exportJWK(publicKey)), kid: "klucz-1", alg: "EdDSA", use: "sig" };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const codes = new Map<string, Grant & { challenge: string; redirectUri: string; used: boolean }>();
  const refreshTokens = new Map<string, Grant & { family: string; active: boolean }>();
  const calls = { token: 0, refresh: 0, revoke: 0, userinfo: 0 };
  const state = { authzRevision: 0, accountDeactivated: false, down: false };

  /** Token dostępu jak z Core: `at+jwt`, EdDSA, odbiorcy API i `userinfo`. */
  async function token(options: TokenOptions = {}): Promise<string> {
    const issuedAt = options.issuedAt ?? Math.floor(Date.now() / 1000);
    const claims: Record<string, unknown> = {
      org_id: ORGANIZATION_ID,
      employee_id: EMPLOYEE_ID,
      authz_rev: state.authzRevision,
      sid: "sesja-core-1",
      client_id: CLIENT_ID,
      scope: "openid profile email offline_access",
      ...options.claims,
    };
    const payload = Object.fromEntries(Object.entries(claims).filter(([name]) => !options.omit?.includes(name)));
    return new SignJWT(payload)
      .setProtectedHeader({ alg: "EdDSA", kid: "klucz-1", typ: options.typ ?? "at+jwt" })
      .setIssuer(options.issuer ?? ISSUER)
      .setSubject(ACCOUNT_ID)
      .setAudience(options.audience ?? [RESOURCE, USERINFO])
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + (options.expiresIn ?? 300))
      .sign(options.key ?? privateKey);
  }

  async function idToken(nonce: string | undefined): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ nonce, sid: "sesja-core-1", acr: "0", auth_time: now })
      .setProtectedHeader({ alg: "EdDSA", kid: "klucz-1", typ: "JWT" })
      .setIssuer(ISSUER)
      .setSubject(ACCOUNT_ID)
      .setAudience(CLIENT_ID)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);
  }

  /** Udaje przeglądarkę na ekranie logowania Core: z adresu logowania robi adres powrotu z kodem. */
  function approve(authorize: string, overrides: { iss?: string; state?: string } = {}): string {
    const query = new URL(authorize).searchParams;
    const code = `kod-${crypto.randomUUID()}`;
    codes.set(code, {
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

  async function issue(grant: Grant, resource: string, family: string): Promise<Response> {
    const refreshToken = `odswiezanie-${crypto.randomUUID()}`;
    refreshTokens.set(refreshToken, { ...grant, family, active: true });
    return json(200, {
      access_token: await token({ audience: [resource, USERINFO] }),
      token_type: "Bearer",
      expires_in: 300,
      refresh_token: refreshToken,
      scope: "openid profile email offline_access",
      id_token: await idToken(grant.nonce),
    });
  }

  const fetch: typeof globalThis.fetch = async (input, init) => {
    if (state.down) throw new TypeError("fetch failed");
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === "/api/auth/oauth2/userinfo") {
      calls.userinfo++;
      return json(200, { sub: ACCOUNT_ID, email: "anna@acme.test", name: "Anna Kowalska", email_verified: true });
    }
    const form = new URLSearchParams(String(init?.body ?? ""));
    if (form.get("client_id") !== CLIENT_ID || form.get("client_secret") !== CLIENT_SECRET) {
      return json(401, { error: "invalid_client" });
    }
    if (url.pathname === "/api/auth/oauth2/revoke") {
      calls.revoke++;
      const entry = refreshTokens.get(form.get("token") ?? "");
      if (entry) entry.active = false;
      return new Response(null, { status: 200 });
    }
    if (url.pathname !== "/api/auth/oauth2/token") return json(404, { error: "not_found" });

    if (form.get("grant_type") === "authorization_code") {
      calls.token++;
      const entry = codes.get(form.get("code") ?? "");
      if (!entry || entry.used || entry.redirectUri !== form.get("redirect_uri"))
        return json(400, { error: "invalid_grant" });
      entry.used = true;
      if (challengeOf(form.get("code_verifier") ?? "") !== entry.challenge) {
        return json(400, { error: "invalid_grant", error_description: "PKCE" });
      }
      const resource = form.get("resource") ?? entry.resources[0] ?? "";
      if (!entry.resources.includes(resource)) return json(400, { error: "invalid_target" });
      return issue(entry, resource, crypto.randomUUID());
    }
    if (form.get("grant_type") === "refresh_token") {
      calls.refresh++;
      const entry = refreshTokens.get(form.get("refresh_token") ?? "");
      if (!entry) return json(400, { error: "invalid_grant" });
      if (!entry.active || state.accountDeactivated) {
        // Ponowne użycie albo dezaktywacja: Core unieważnia całą rodzinę tokenów (RFC 9700).
        for (const other of refreshTokens.values()) if (other.family === entry.family) other.active = false;
        return json(400, { error: "invalid_grant" });
      }
      const resource = form.get("resource") ?? entry.resources[0] ?? "";
      if (!entry.resources.includes(resource)) {
        return json(400, { error: "invalid_target", error_description: "requested resource invalid" });
      }
      entry.active = false;
      return issue(entry, resource, entry.family);
    }
    return json(400, { error: "unsupported_grant_type" });
  };

  return { keys, fetch, approve, token, calls, state };
}

export type FakeCore = Awaited<ReturnType<typeof createFakeCore>>;
