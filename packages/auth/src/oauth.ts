import { OAuthError } from "./errors.js";

/**
 * Funkcje OAuth 2.1 niezależne od platformy (fetch i Web Crypto): działają na serwerze, w przeglądarce
 * i w aplikacji na komputer. Core jest serwerem autoryzacji (ADR-0022), a logowanie zawsze używa PKCE.
 */

export interface OAuthEndpoints {
  authorize: string;
  token: string;
  revoke: string;
  userinfo: string;
  jwks: string;
}

/** Adresy serwera OAuth w Core (Better Auth udostępnia je pod `/api/auth`). */
export function oauthEndpoints(issuer: string): OAuthEndpoints {
  const base = issuer.replace(/\/+$/, "");
  return {
    authorize: `${base}/api/auth/oauth2/authorize`,
    token: `${base}/api/auth/oauth2/token`,
    revoke: `${base}/api/auth/oauth2/revoke`,
    userinfo: `${base}/api/auth/oauth2/userinfo`,
    jwks: `${base}/api/auth/jwks`,
  };
}

/** Zakresy, o które aplikacje Monorise proszą przy logowaniu (`offline_access` daje token odświeżania). */
export const DEFAULT_SCOPES = ["openid", "profile", "email", "offline_access"];

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** Losowa wartość w base64url (domyślnie 32 bajty), np. `state`, `nonce` albo identyfikator sesji. */
export function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return base64url(buffer);
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64url(new Uint8Array(digest));
}

export interface Pkce {
  verifier: string;
  challenge: string;
  method: "S256";
}

/** Para PKCE (RFC 7636): weryfikator zostaje u aplikacji, a do Core idzie tylko jego skrót. */
export async function createPkce(): Promise<Pkce> {
  const verifier = randomToken(32);
  return { verifier, challenge: await sha256(verifier), method: "S256" };
}

export interface AuthorizeUrlParams {
  issuer: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes?: string[];
  nonce?: string;
  /** API, do których aplikacja dostanie tokeny (RFC 8707); token dla innego API wymaga ich już przy logowaniu. */
  resources?: string[];
  /** `login` wymusza ponowne podanie hasła, nawet przy aktywnej sesji w Core. */
  prompt?: "login";
}

/** Adres ekranu logowania Core, na który aplikacja przekierowuje użytkownika. */
export function authorizeUrl(params: AuthorizeUrlParams): URL {
  const url = new URL(oauthEndpoints(params.issuer).authorize);
  const query = url.searchParams;
  query.set("response_type", "code");
  query.set("client_id", params.clientId);
  query.set("redirect_uri", params.redirectUri);
  query.set("scope", (params.scopes ?? DEFAULT_SCOPES).join(" "));
  query.set("state", params.state);
  query.set("code_challenge", params.codeChallenge);
  query.set("code_challenge_method", "S256");
  if (params.nonce) query.set("nonce", params.nonce);
  for (const resource of params.resources ?? []) query.append("resource", resource);
  if (params.prompt) query.set("prompt", params.prompt);
  return url;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  /** Ważność tokenu dostępu w sekundach (w Core 300). */
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

export interface ClientOptions {
  issuer: string;
  clientId: string;
  /** Tylko klienci poufni (serwer aplikacji); aplikacje na komputer i telefon nie mają sekretu. */
  clientSecret?: string;
  /** Własny fetch (testy). */
  fetch?: typeof fetch;
}

type Form = Record<string, string | undefined>;

async function post(options: ClientOptions, url: string, form: Form): Promise<Response> {
  const body = new URLSearchParams();
  body.set("client_id", options.clientId);
  if (options.clientSecret) body.set("client_secret", options.clientSecret);
  for (const [key, value] of Object.entries(form)) if (value !== undefined) body.set(key, value);
  return (options.fetch ?? fetch)(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
}

async function readError(response: Response): Promise<OAuthError> {
  const body = (await response.json().catch(() => null)) as { error?: unknown; error_description?: unknown } | null;
  const error = typeof body?.error === "string" ? body.error : "server_error";
  const description = typeof body?.error_description === "string" ? body.error_description : undefined;
  return new OAuthError(error, response.status, description);
}

async function tokenRequest(options: ClientOptions, form: Form): Promise<TokenResponse> {
  const response = await post(options, oauthEndpoints(options.issuer).token, form);
  if (!response.ok) throw await readError(response);
  const body = (await response.json()) as Partial<TokenResponse>;
  if (typeof body.access_token !== "string" || typeof body.expires_in !== "number") {
    throw new OAuthError("invalid_response", response.status, "Odpowiedź bez tokenu dostępu");
  }
  if (body.token_type?.toLowerCase() !== "bearer") {
    throw new OAuthError("invalid_response", response.status, `Nieobsługiwany typ tokenu: ${body.token_type}`);
  }
  return body as TokenResponse;
}

/** Wymiana kodu z powrotu na tokeny; `resource` wybiera API, dla którego będzie token dostępu. */
export function exchangeCode(
  params: ClientOptions & { code: string; redirectUri: string; codeVerifier: string; resource?: string },
): Promise<TokenResponse> {
  return tokenRequest(params, {
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
    resource: params.resource,
  });
}

/**
 * Nowy token dostępu z tokenu odświeżania. Core wydaje wtedy też nowy token odświeżania, a stary przestaje
 * działać; ponowne użycie starego unieważnia całą rodzinę tokenów (RFC 9700).
 */
export function refreshTokens(
  params: ClientOptions & { refreshToken: string; resource?: string },
): Promise<TokenResponse> {
  return tokenRequest(params, {
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
    resource: params.resource,
  });
}

/** Unieważnia token w Core (RFC 7009), np. token odświeżania przy wylogowaniu. */
export async function revokeToken(
  params: ClientOptions & { token: string; hint?: "refresh_token" | "access_token" },
): Promise<void> {
  const response = await post(params, oauthEndpoints(params.issuer).revoke, {
    token: params.token,
    token_type_hint: params.hint,
  });
  if (!response.ok) throw await readError(response);
}

export interface UserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
}

/** Dane osoby (imię, e-mail) z Core; token z logowania obejmuje adres `userinfo`. */
export async function fetchUserInfo(params: {
  issuer: string;
  accessToken: string;
  fetch?: typeof fetch;
}): Promise<UserInfo> {
  const response = await (params.fetch ?? fetch)(oauthEndpoints(params.issuer).userinfo, {
    headers: { Authorization: `Bearer ${params.accessToken}`, Accept: "application/json" },
  });
  if (!response.ok) throw await readError(response);
  const body = (await response.json()) as Partial<UserInfo>;
  if (typeof body.sub !== "string") throw new OAuthError("invalid_response", response.status, "Brak pola sub");
  return body as UserInfo;
}
