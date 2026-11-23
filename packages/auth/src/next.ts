import { jwtVerify, type JWTVerifyGetKey } from "jose";
import type { AuthContext } from "./claims.js";
import { AuthError, AuthUnavailableError, OAuthError } from "./errors.js";
import {
  authorizeUrl,
  createPkce,
  DEFAULT_SCOPES,
  exchangeCode,
  fetchUserInfo,
  oauthEndpoints,
  randomToken,
  refreshTokens,
  revokeToken,
  sha256,
  type TokenResponse,
} from "./oauth.js";
import { createSealer } from "./seal.js";
import { bearerToken, createTokenVerifier, remoteKeys, type TokenVerifier } from "./verifier.js";

/**
 * Sesje aplikacji w przeglądarce przez BFF (ADR-0050): przeglądarka ma tylko ciasteczko `HttpOnly`
 * z losowym identyfikatorem, a tokeny z Core leżą zaszyfrowane po stronie serwera. Funkcje przyjmują
 * standardowe `Request` i zwracają `Response`, więc pasują wprost do route handlerów Next.js.
 */

/** Wiersz sesji w bazie produktu. */
export interface SessionRecord {
  /** Skrót SHA-256 identyfikatora z ciasteczka; sam identyfikator nie trafia do bazy. */
  id: string;
  accountId: string;
  organizationId: string;
  expiresAt: Date;
  /** Zaszyfrowane tokeny, kontekst firmy i dane osoby. */
  data: string;
}

/** Miejsce na sesje, np. tabela w bazie produktu (Prisma). Po dezaktywacji konta usuń jego sesje po `accountId`. */
export interface SessionStore {
  get(id: string): Promise<SessionRecord | null>;
  set(record: SessionRecord): Promise<void>;
  delete(id: string): Promise<void>;
}

/** Sesje w pamięci procesu: do testów i pracy lokalnej, nie na serwer. */
export function memorySessionStore(): SessionStore & { readonly size: number } {
  const records = new Map<string, SessionRecord>();
  return {
    get: async (id) => records.get(id) ?? null,
    set: async (record) => {
      records.set(record.id, record);
    },
    delete: async (id) => {
      records.delete(id);
    },
    get size() {
      return records.size;
    },
  };
}

export interface WebAuthOptions {
  /** Adres Core, np. `https://auth.monorise.studio`. */
  issuer: string;
  clientId: string;
  /** Sekret klienta poufnego (serwer aplikacji); nigdy nie trafia do przeglądarki. */
  clientSecret?: string;
  /** Adres aplikacji w przeglądarce, np. `https://aven-mail.monorise.studio`. */
  appUrl: string;
  /** Ścieżka powrotu z Core, zarejestrowana w Core jako adres powrotu. Domyślnie `/api/auth/callback`. */
  callbackPath?: string;
  /** API, do których aplikacja potrzebuje tokenów. Pierwsze to API produktu: dla niego są tokeny sesji. */
  resources: [string, ...string[]];
  scopes?: string[];
  /** Sekret do szyfrowania sesji (co najmniej 32 znaki). Przy wymianie: `[nowy, stary]`. */
  secret: string | string[];
  store: SessionStore;
  /** Nazwa ciasteczka sesji; domyślnie `__Host-monorise-session` (na `http://` bez przedrostka). */
  cookieName?: string;
  /** Najdłuższy czas sesji w sekundach; domyślnie 30 dni, jak token odświeżania w Core. */
  sessionMaxAge?: number;
  /** Dokąd wrócić po wylogowaniu. Domyślnie `/`. */
  afterSignOut?: string;
  /** Dokąd wrócić po nieudanym logowaniu (z parametrem `auth_error`). Domyślnie `/`. */
  errorPath?: string;
  /** Klucze do sprawdzania tokenów; domyślnie JWKS Core. W testach `createLocalJWKSet`. */
  keys?: JWTVerifyGetKey;
  /** Własny fetch i zegar (testy). */
  fetch?: typeof fetch;
  now?: () => number;
}

export interface Session {
  context: AuthContext;
  profile: { email: string | null; name: string | null };
  expiresAt: Date;
  /** Token dostępu dla API (domyślnie API produktu), odświeżany w Core, gdy kończy się jego ważność. */
  accessToken(resource?: string): Promise<string>;
}

export interface Authenticated {
  context: AuthContext;
  /** `bearer`: aplikacja na komputer albo telefon z tokenem z Core; `session`: przeglądarka z ciasteczkiem. */
  via: "bearer" | "session";
  session: Session | null;
}

export interface WebAuth {
  /** `GET`: przekierowanie na logowanie w Core. Parametry: `returnTo` (ścieżka w aplikacji), `prompt=login`. */
  signIn(request: Request): Promise<Response>;
  /** `GET`: powrót z Core z kodem; zakłada sesję i wraca pod `returnTo`. */
  callback(request: Request): Promise<Response>;
  /** `POST`: kończy sesję aplikacji i unieważnia token odświeżania w Core. */
  signOut(request: Request): Promise<Response>;
  /** Sesja z ciasteczka żądania albo `null`. */
  getSession(request: Request): Promise<Session | null>;
  /** Sesja z wartości ciasteczka, np. w Server Component: `(await cookies()).get(auth.cookieName)?.value`. */
  getSessionFromCookie(value: string | undefined): Promise<Session | null>;
  /**
   * Kto pyta w trasie API: token z nagłówka `Authorization` albo sesja z ciasteczka. Zmiany przez ciasteczko
   * (POST, PATCH, DELETE) muszą przyjść z adresu aplikacji (ochrona przed CSRF). Rzuca `AuthError`.
   */
  authenticate(request: Request): Promise<Authenticated>;
  cookieName: string;
}

interface StoredToken {
  value: string;
  expiresAt: number;
}

interface SessionData {
  v: 1;
  context: Omit<AuthContext, "expiresAt"> & { expiresAt: number };
  profile: Session["profile"];
  refreshToken: string;
  tokens: Record<string, StoredToken>;
  createdAt: number;
  expiresAt: number;
}

interface Transaction {
  state: string;
  verifier: string;
  nonce: string;
  returnTo: string;
  createdAt: number;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const TRANSACTION_TTL_MS = 10 * 60_000;
/** Token odświeżamy, gdy zostało mu mniej niż 30 sekund. */
const REFRESH_MARGIN_MS = 30_000;
const DEFAULT_SESSION_MAX_AGE = 30 * 24 * 60 * 60;

const dehydrate = (context: AuthContext): SessionData["context"] => ({
  ...context,
  expiresAt: context.expiresAt.getTime(),
});
const hydrate = (context: SessionData["context"]): AuthContext => ({
  ...context,
  expiresAt: new Date(context.expiresAt),
});

export function createWebAuth(options: WebAuthOptions): WebAuth {
  const app = new URL(options.appUrl);
  const appOrigin = app.origin;
  const secure = app.protocol === "https:";
  const sessionCookie = options.cookieName ?? (secure ? "__Host-monorise-session" : "monorise-session");
  const transactionCookie = secure ? "__Host-monorise-oauth" : "monorise-oauth";
  const redirectUri = new URL(options.callbackPath ?? "/api/auth/callback", appOrigin).toString();
  const primary = options.resources[0];
  const scopes = options.scopes ?? DEFAULT_SCOPES;
  const maxAgeMs = (options.sessionMaxAge ?? DEFAULT_SESSION_MAX_AGE) * 1000;
  const now = options.now ?? Date.now;
  const secrets = Array.isArray(options.secret) ? options.secret : [options.secret];
  const sessions = createSealer(secrets, "session");
  const transactions = createSealer(secrets, "oauth-transaction");
  const keys = options.keys ?? remoteKeys(oauthEndpoints(options.issuer).jwks);
  const client = {
    issuer: options.issuer,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    fetch: options.fetch,
  };

  const verifiers = new Map<string, TokenVerifier>();
  const verifierFor = (resource: string): TokenVerifier => {
    let verifier = verifiers.get(resource);
    if (!verifier) {
      verifier = createTokenVerifier({ issuer: options.issuer, audience: resource, keys });
      verifiers.set(resource, verifier);
    }
    return verifier;
  };

  // ── Ciasteczka i odpowiedzi ──────────────────────────────────────────────────────────────────────────

  function readCookie(request: Request, name: string): string | undefined {
    const header = request.headers.get("cookie");
    if (!header) return undefined;
    for (const part of header.split(";")) {
      const index = part.indexOf("=");
      if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
    }
    return undefined;
  }

  function cookie(name: string, value: string, lifetime: { maxAge?: number; expires?: Date }): string {
    const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax"];
    if (secure) parts.push("Secure");
    if (lifetime.expires) parts.push(`Expires=${lifetime.expires.toUTCString()}`);
    if (lifetime.maxAge !== undefined) parts.push(`Max-Age=${lifetime.maxAge}`);
    return parts.join("; ");
  }

  function redirect(location: string, cookies: string[], status = 302): Response {
    const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
    for (const value of cookies) headers.append("Set-Cookie", value);
    return new Response(null, { status, headers });
  }

  /** Tylko ścieżka w aplikacji: `returnTo=https://zly.example` albo `//zly.example` wraca na `/`. */
  function safeReturnTo(value: string | null): string {
    if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
    try {
      const url = new URL(value, appOrigin);
      return url.origin === appOrigin ? `${url.pathname}${url.search}${url.hash}` : "/";
    } catch {
      return "/";
    }
  }

  function errorUrl(reason: string): string {
    const url = new URL(options.errorPath ?? "/", appOrigin);
    url.searchParams.set("auth_error", reason);
    return url.toString();
  }

  /** Żądanie z adresu aplikacji (CSRF): nagłówek `Origin` albo `Sec-Fetch-Site: same-origin`. */
  function fromApp(request: Request): boolean {
    const origin = request.headers.get("origin");
    if (origin) return origin === appOrigin;
    return request.headers.get("sec-fetch-site") === "same-origin";
  }

  // ── Sesje w magazynie ────────────────────────────────────────────────────────────────────────────────

  async function save(id: string, data: SessionData): Promise<void> {
    await options.store.set({
      id,
      accountId: data.context.accountId,
      organizationId: data.context.organizationId,
      expiresAt: new Date(data.expiresAt),
      data: await sessions.seal(data),
    });
  }

  async function load(id: string): Promise<SessionData | null> {
    const record = await options.store.get(id);
    if (!record) return null;
    const data = record.expiresAt.getTime() > now() ? await sessions.unseal<SessionData>(record.data) : null;
    if (data?.v !== 1) {
      await options.store.delete(id);
      return null;
    }
    return data;
  }

  const isFresh = (data: SessionData, resource: string) => {
    const token = data.tokens[resource];
    return token !== undefined && token.expiresAt - now() > REFRESH_MARGIN_MS;
  };

  // Core wydaje przy odświeżeniu nowy token odświeżania i unieważnia rodzinę tokenów, gdy stary zostanie użyty
  // drugi raz. Dlatego równoczesne żądania jednej sesji odświeżają tokeny po kolei, a nie naraz.
  const locks = new Map<string, Promise<unknown>>();
  function exclusive<T>(id: string, task: () => Promise<T>): Promise<T> {
    const previous = locks.get(id) ?? Promise.resolve();
    const run = previous.then(task, task);
    const settled = run.catch(() => undefined);
    locks.set(id, settled);
    void settled.then(() => {
      if (locks.get(id) === settled) locks.delete(id);
    });
    return run;
  }

  async function ensureFresh(id: string, data: SessionData, resource: string): Promise<SessionData | null> {
    if (isFresh(data, resource)) return data;
    return exclusive(id, async () => {
      // Inne żądanie mogło już odświeżyć tokeny, więc czytamy sesję jeszcze raz.
      const current = await load(id);
      if (!current) return null;
      if (isFresh(current, resource)) return current;

      let tokens: TokenResponse;
      try {
        tokens = await refreshTokens({ ...client, refreshToken: current.refreshToken, resource });
      } catch (error) {
        if (error instanceof OAuthError && error.error === "invalid_grant") {
          // Core nie przedłuża sesji: wylogowanie w Core, dezaktywacja konta albo unieważnione tokeny.
          await options.store.delete(id);
          return null;
        }
        if (error instanceof OAuthError && error.status < 500) throw error;
        throw new AuthUnavailableError("Core nie odświeżył tokenów", { cause: error });
      }

      let context: AuthContext;
      try {
        context = await verifierFor(resource)(tokens.access_token);
      } catch (error) {
        if (error instanceof AuthUnavailableError) throw error;
        await options.store.delete(id);
        return null;
      }
      if (
        context.accountId !== current.context.accountId ||
        context.organizationId !== current.context.organizationId
      ) {
        await options.store.delete(id);
        return null;
      }

      const refreshedAt = now();
      const next: SessionData = {
        ...current,
        context: dehydrate(context),
        refreshToken: tokens.refresh_token ?? current.refreshToken,
        tokens: {
          ...current.tokens,
          [resource]: { value: tokens.access_token, expiresAt: refreshedAt + tokens.expires_in * 1000 },
        },
      };
      await save(id, next);
      return next;
    });
  }

  function toSession(id: string, data: SessionData): Session {
    let latest = data;
    return {
      context: hydrate(data.context),
      profile: data.profile,
      expiresAt: new Date(data.expiresAt),
      async accessToken(resource = primary) {
        if (!options.resources.includes(resource)) throw new Error(`API ${resource} nie ma na liście resources`);
        const fresh = await ensureFresh(id, latest, resource);
        const token = fresh?.tokens[resource];
        if (!fresh || !token) throw new AuthError("UNAUTHENTICATED", "Sesja wygasła");
        latest = fresh;
        return token.value;
      },
    };
  }

  async function getSessionFromCookie(value: string | undefined): Promise<Session | null> {
    if (!value) return null;
    const id = await sha256(value);
    const data = await load(id);
    if (!data) return null;
    // Token API produktu żyje 5 minut, więc co 5 minut Core potwierdza, że konto może dalej pracować.
    const fresh = await ensureFresh(id, data, primary);
    return fresh ? toSession(id, fresh) : null;
  }

  async function verifyIdToken(idToken: string, nonce: string, accountId: string): Promise<void> {
    const { payload } = await jwtVerify(idToken, keys, {
      issuer: options.issuer,
      audience: options.clientId,
      algorithms: ["EdDSA"],
      clockTolerance: 5,
    });
    if (payload.nonce !== nonce || payload.sub !== accountId) {
      throw new AuthError("UNAUTHENTICATED", "ID token nie pasuje do tego logowania");
    }
  }

  // ── Trasy ────────────────────────────────────────────────────────────────────────────────────────────

  async function signIn(request: Request): Promise<Response> {
    const query = new URL(request.url).searchParams;
    const pkce = await createPkce();
    const transaction: Transaction = {
      state: randomToken(),
      verifier: pkce.verifier,
      nonce: randomToken(),
      returnTo: safeReturnTo(query.get("returnTo")),
      createdAt: now(),
    };
    const location = authorizeUrl({
      issuer: options.issuer,
      clientId: options.clientId,
      redirectUri,
      state: transaction.state,
      codeChallenge: pkce.challenge,
      nonce: transaction.nonce,
      scopes,
      resources: options.resources,
      prompt: query.get("prompt") === "login" ? "login" : undefined,
    });
    const sealed = await transactions.seal(transaction);
    return redirect(location.toString(), [cookie(transactionCookie, sealed, { maxAge: TRANSACTION_TTL_MS / 1000 })]);
  }

  async function callback(request: Request): Promise<Response> {
    const query = new URL(request.url).searchParams;
    const clear = cookie(transactionCookie, "", { maxAge: 0 });
    const fail = (reason: string) => redirect(errorUrl(reason), [clear]);

    const transaction = await transactions.unseal<Transaction>(readCookie(request, transactionCookie));
    if (!transaction || now() - transaction.createdAt > TRANSACTION_TTL_MS) return fail("expired");
    if (query.get("state") !== transaction.state) return fail("state");
    // RFC 9207: odpowiedź musi pochodzić od Core, a nie od innego serwera logowania.
    if (query.get("iss") !== options.issuer) return fail("issuer");
    if (query.get("error")) return fail(query.get("error") === "access_denied" ? "denied" : "failed");
    const code = query.get("code");
    if (!code) return fail("failed");

    let tokens: TokenResponse;
    try {
      tokens = await exchangeCode({
        ...client,
        code,
        redirectUri,
        codeVerifier: transaction.verifier,
        resource: primary,
      });
    } catch (error) {
      return fail(error instanceof OAuthError ? "failed" : "unavailable");
    }
    if (!tokens.refresh_token || !tokens.id_token) return fail("failed");

    let context: AuthContext;
    try {
      context = await verifierFor(primary)(tokens.access_token);
      await verifyIdToken(tokens.id_token, transaction.nonce, context.accountId);
    } catch (error) {
      return fail(error instanceof AuthUnavailableError ? "unavailable" : "failed");
    }

    const profile = await fetchUserInfo({
      issuer: options.issuer,
      accessToken: tokens.access_token,
      fetch: options.fetch,
    })
      .then((info) => ({ email: info.email ?? null, name: info.name ?? null }))
      .catch(() => ({ email: null, name: null }));

    const issuedAt = now();
    const data: SessionData = {
      v: 1,
      context: dehydrate(context),
      profile,
      refreshToken: tokens.refresh_token,
      tokens: { [primary]: { value: tokens.access_token, expiresAt: issuedAt + tokens.expires_in * 1000 } },
      createdAt: issuedAt,
      expiresAt: issuedAt + maxAgeMs,
    };

    // Poprzednia sesja z tej przeglądarki znika (ochrona przed utrwaleniem sesji).
    const previous = readCookie(request, sessionCookie);
    if (previous) await options.store.delete(await sha256(previous));
    const sessionId = randomToken(32);
    await save(await sha256(sessionId), data);

    return redirect(new URL(transaction.returnTo, appOrigin).toString(), [
      clear,
      cookie(sessionCookie, sessionId, { expires: new Date(data.expiresAt) }),
    ]);
  }

  async function signOut(request: Request): Promise<Response> {
    if (request.method.toUpperCase() !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
    if (!fromApp(request)) return new Response(null, { status: 403 });
    const value = readCookie(request, sessionCookie);
    if (value) {
      const id = await sha256(value);
      const data = await load(id);
      await options.store.delete(id);
      if (data) {
        await revokeToken({ ...client, token: data.refreshToken, hint: "refresh_token" }).catch(() => undefined);
      }
    }
    return redirect(
      new URL(options.afterSignOut ?? "/", appOrigin).toString(),
      [cookie(sessionCookie, "", { maxAge: 0 })],
      303,
    );
  }

  async function authenticate(request: Request): Promise<Authenticated> {
    const token = bearerToken(request.headers.get("authorization"));
    if (token) return { context: await verifierFor(primary)(token), via: "bearer", session: null };

    const value = readCookie(request, sessionCookie);
    if (!value) throw new AuthError("UNAUTHENTICATED", "Brak sesji");
    if (!SAFE_METHODS.has(request.method.toUpperCase()) && !fromApp(request)) {
      throw new AuthError("PERMISSION_DENIED", "Żądanie spoza aplikacji");
    }
    const session = await getSessionFromCookie(value);
    if (!session) throw new AuthError("UNAUTHENTICATED", "Sesja wygasła albo nie istnieje");
    return { context: session.context, via: "session", session };
  }

  return {
    signIn,
    callback,
    signOut,
    getSession: (request) => getSessionFromCookie(readCookie(request, sessionCookie)),
    getSessionFromCookie,
    authenticate,
    cookieName: sessionCookie,
  };
}
