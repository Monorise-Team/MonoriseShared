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
 * Sesje aplikacji w przeglądarce przez BFF (ADR-0050, ADR-0098):
 * - tryb `store` (produkty z własną bazą): przeglądarka ma ciasteczko `HttpOnly` z losowym identyfikatorem,
 *   a tokeny z Core leżą zaszyfrowane w bazie produktu;
 * - tryb `cookie` (aplikacje bez bazy, np. Portal i Admin): zaszyfrowane dane sesji i tokeny leżą w jednym
 *   ciasteczku `HttpOnly` (AES-256-GCM), a po odświeżeniu tokenów serwer odsyła nowe ciasteczko w odpowiedzi.
 *
 * Funkcje przyjmują standardowe `Request` i zwracają `Response`, więc pasują wprost do route handlerów Next.js
 * oraz pliku `proxy.ts`.
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

/** Sesja BFF w zaszyfrowanym ciasteczku dla aplikacji bez własnej bazy danych (ADR-0098). */
export interface CookieSessionOptions {
  mode: "cookie";
  /**
   * Największa dopuszczalna długość zaszyfrowanej wartości ciasteczka w bajtach (domyślnie 3800,
   * z zapasem poniżej limitu 4096 bajtów w przeglądarkach).
   */
  maxCookieBytes?: number;
}

/** Sesja BFF w magazynie po stronie serwera, np. w tabeli bazy produktu (ADR-0050). */
export interface StoreSessionOptions {
  mode: "store";
  store: SessionStore;
}

export type SessionModeOptions = CookieSessionOptions | StoreSessionOptions;

interface WebAuthBaseOptions {
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
  /**
   * Sekret do szyfrowania sesji: co najmniej 32 losowe bajty (`openssl rand -base64 32`), nigdy hasło z klawiatury.
   * Przy wymianie: `[nowy, stary]`.
   */
  secret: string | string[];
  /**
   * Nazwa ciasteczka sesji; domyślnie `__Host-monorise-session` na HTTPS (`monorise-session` na HTTP).
   * Na HTTPS musi zaczynać się od `__Host-`, a na HTTP nie może zaczynać się od `__Host-` ani `__Secure-`.
   */
  cookieName?: string;
  /** Najdłuższy czas sesji w sekundach; domyślnie 30 dni, jak token odświeżania w Core. */
  sessionMaxAge?: number;
  /**
   * Zapas czasu przed wygaśnięciem tokenu dostępu (w sekundach) dla `authenticate()` i `accessToken()`.
   * Domyślnie 30 sekund.
   */
  refreshMarginSeconds?: number;
  /**
   * Szerszy zapas czasu przed wygaśnięciem tokenu (w sekundach) dla `getSession()` w `proxy.ts`,
   * żeby nawigacja odświeżyła ciasteczko zanim wyrenderuje się Server Component. Domyślnie 120 sekund.
   */
  proxyRefreshMarginSeconds?: number;
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

export type WebAuthOptions = WebAuthBaseOptions &
  (
    | {
        /** Magazyn sesji po stronie serwera (ADR-0050). */
        store: SessionStore;
        session?: never;
      }
    | {
        /** Tryb sesji: `{ mode: "cookie" }` dla aplikacji bez bazy (ADR-0098) albo `{ mode: "store", store }`. */
        session: SessionModeOptions;
        store?: never;
      }
  );

export type SessionCookieSource = { readonly setCookies: readonly string[] } | readonly string[];

export interface GetSessionOptions {
  /**
   * Czy wolno odświeżyć wygasający token w Core.
   * W trybie `cookie` domyślnie `false` (bezpieczne w Server Components, które nie mogą wysłać `Set-Cookie`).
   * Przekaż `true` tylko tam, gdzie sam zapiszesz `session.setCookies` do odpowiedzi (np. Route Handler, Server Action).
   * W trybie `store` domyślnie `true`.
   */
  refresh?: boolean;
}

export interface WithAuthOptions {
  /**
   * Zamienia błąd rzucony przez `authenticate()` albo przez `handler` na odpowiedź HTTP
   * (np. własny format błędów). Do zwróconej odpowiedzi również trafią odświeżone ciasteczka sesji.
   * Domyślnie `AuthError` (401/403) i `AuthUnavailableError` (503, kod `INTERNAL_ERROR`) są zamieniane na kopertę JSON
   * `{ data: null, meta: { requestId }, error: { code, message, details: [] } }`, a pozostałe błędy są rzucane dalej.
   */
  onError?: (error: unknown, request: Request) => Response | Promise<Response>;
}

export interface Session {
  context: AuthContext;
  profile: { email: string | null; name: string | null };
  expiresAt: Date;
  /** Token dostępu dla API (domyślnie API produktu), odświeżany w Core, gdy kończy się jego ważność. */
  accessToken(resource?: string): Promise<string>;
  /**
   * Nagłówki `Set-Cookie` do dołączenia do odpowiedzi (przez `applySessionCookies` albo `withAuth`),
   * gdy w trybie ciasteczka odświeżono tokeny. W trybie `store` i bez odświeżenia: pusta tablica.
   * Odczyt zawsze zwraca najnowsze znane ciasteczko tej sesji w procesie.
   */
  readonly setCookies: readonly string[];
}

export type Authenticated =
  | {
      context: AuthContext;
      /** Aplikacja na komputer albo telefon z tokenem z Core w nagłówku `Authorization: Bearer`. */
      via: "bearer";
      session: null;
      /** Zawsze pusta tablica przy uwierzytelnieniu tokenem Bearer. */
      readonly setCookies: readonly string[];
    }
  | {
      context: AuthContext;
      /** Przeglądarka z ciasteczkiem sesji BFF. */
      via: "session";
      session: Session;
      /**
       * Nagłówki `Set-Cookie` do dołączenia do odpowiedzi przez `applySessionCookies` albo `withAuth`.
       * W trybie `store` zawsze pusta tablica. W trybie `cookie` zwraca najnowsze ciasteczko tej sesji
       * po odświeżeniu (także po `session.accessToken()` i przy równoczesnych żądaniach).
       */
      readonly setCookies: readonly string[];
    };

export interface WebAuth {
  /** `GET`: przekierowanie na logowanie w Core. Parametry: `returnTo` (ścieżka w aplikacji), `prompt=login`. */
  signIn(request: Request): Promise<Response>;
  /** `GET`: powrót z Core z kodem; zakłada sesję i wraca pod `returnTo`. */
  callback(request: Request): Promise<Response>;
  /** `POST`: kończy sesję aplikacji i unieważnia token odświeżania w Core. */
  signOut(request: Request): Promise<Response>;
  /**
   * Sesja z ciasteczka żądania albo `null` (odświeża z wyprzedzeniem `proxyRefreshMarginSeconds`, domyślnie 120 s).
   * Uwaga: NIE sprawdza CSRF — nie używaj do żądań zmieniających stan (`POST`, `PATCH`, `DELETE`);
   * do tras API służy `authenticate()` albo `withAuth()`.
   */
  getSession(request: Request): Promise<Session | null>;
  /**
   * Sesja z wartości ciasteczka, np. w Server Component: `(await cookies()).get(auth.cookieName)?.value`.
   * W trybie `cookie` domyślnie `refresh: false` (nie wywołuje Core, bo Server Component nie zapisze `Set-Cookie`).
   */
  getSessionFromCookie(value: string | undefined, options?: GetSessionOptions): Promise<Session | null>;
  /**
   * Kto pyta w trasie API: token z nagłówka `Authorization` albo sesja z ciasteczka. Zmiany przez ciasteczko
   * (POST, PATCH, DELETE) muszą przyjść z adresu aplikacji (ochrona przed CSRF). Rzuca `AuthError`.
   */
  authenticate(request: Request): Promise<Authenticated>;
  /**
   * Zalecany wzorzec w trasach API: uwierzytelnia żądanie, uruchamia `handler` i dołącza odświeżone
   * ciasteczka sesji do odpowiedzi — także gdy `handler` zwróci błąd albo rzuci `AuthError`/`AuthUnavailableError`
   * (lub inny błąd zamieniony na odpowiedź przez `onError`).
   */
  withAuth(
    request: Request,
    handler: (auth: Authenticated) => Response | Promise<Response>,
    options?: WithAuthOptions,
  ): Promise<Response>;
  cookieName: string;
  readonly mode: "store" | "cookie";
}

function cookieNameOf(header: string): string | null {
  const pair = header.split(";")[0] ?? "";
  const eq = pair.indexOf("=");
  if (eq <= 0) return null;
  return pair.slice(0, eq).trim() || null;
}

function deduplicateSetCookies(cookies: readonly string[]): { headers: string[]; names: Set<string> } {
  const order: string[] = [];
  const byName = new Map<string, string>();
  for (const header of cookies) {
    const name = cookieNameOf(header);
    if (!name) continue;
    if (!byName.has(name)) order.push(name);
    byName.set(name, header);
  }
  return {
    headers: order.map((name) => byName.get(name)!),
    names: new Set(order),
  };
}

function writeSetCookies(headers: Headers, incoming: string[], incomingNames: Set<string>): void {
  const existing = headers.getSetCookie();
  const hasConflict = existing.some((header) => {
    const name = cookieNameOf(header);
    return name !== null && incomingNames.has(name);
  });
  if (hasConflict) {
    const kept = existing.filter((header) => {
      const name = cookieNameOf(header);
      return name === null || !incomingNames.has(name);
    });
    headers.delete("set-cookie");
    for (const header of kept) headers.append("Set-Cookie", header);
  }
  for (const header of incoming) headers.append("Set-Cookie", header);
}

/**
 * Dołącza (lub podmienia dla tej samej nazwy) nagłówki `Set-Cookie` z wyniku `authenticate` albo z `Session`
 * w odpowiedzi HTTP i zwraca odpowiedź do odesłania. Działa również na odpowiedziach z niemutowalnymi nagłówkami
 * (np. `Response.redirect()` albo wynik `fetch()`), tworząc wtedy nową kopię `Response`.
 * W trybie `store` i gdy nie było odświeżenia zwraca oryginalną odpowiedź bez zmian.
 */
export function applySessionCookies(response: Response, source: SessionCookieSource | null | undefined): Response {
  if (!source) return response;
  const rawCookies = "setCookies" in source ? source.setCookies : source;
  if (rawCookies.length === 0) return response;
  const { headers: incoming, names } = deduplicateSetCookies(rawCookies);
  if (incoming.length === 0) return response;

  try {
    writeSetCookies(response.headers, incoming, names);
    return response;
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    const headers = new Headers(response.headers);
    writeSetCookies(headers, incoming, names);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

/**
 * Zwraca kopię nagłówków żądania z podmienionym ciasteczkiem sesji z `setCookies`,
 * aby Server Componenty w tym samym żądaniu (po `NextResponse.next({ request: { headers } })`)
 * odczytały już odświeżoną sesję zamiast starego ciasteczka.
 */
export function forwardSessionCookie(
  request: Request | Headers,
  source: SessionCookieSource | null | undefined,
): Headers {
  const headers = new Headers(request instanceof Headers ? request : request.headers);
  if (!source) return headers;
  const cookies = "setCookies" in source ? source.setCookies : source;
  if (cookies.length === 0) return headers;

  const updates = new Map<string, string | null>();
  for (const header of cookies) {
    const parts = header.split(";").map((part) => part.trim());
    const first = parts[0] ?? "";
    const eq = first.indexOf("=");
    if (eq <= 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    const cleared = value === "" || parts.some((part) => /^max-age=0$/i.test(part));
    updates.set(name, cleared ? null : value);
  }
  if (updates.size === 0) return headers;

  const existing = headers.get("cookie");
  const pairs: Array<[string, string]> = [];
  if (existing) {
    for (const part of existing.split(";")) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (!updates.has(name)) pairs.push([name, value]);
    }
  }
  for (const [name, value] of updates) {
    if (value !== null) pairs.push([name, value]);
  }
  if (pairs.length === 0) headers.delete("cookie");
  else headers.set("cookie", pairs.map(([name, value]) => `${name}=${value}`).join("; "));
  return headers;
}

interface StoredToken {
  value: string;
  expiresAt: number;
}

interface SessionData {
  v: 1;
  /** Stały identyfikator sesji w trybie ciasteczka (do kolejkowania odświeżań w procesie). */
  id?: string;
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

interface RecentCookieRefresh {
  data: SessionData;
  sealed: string;
  previousRefreshTokens: Set<string>;
  updatedAt: number;
}

type ResolvedMode = { kind: "store"; store: SessionStore } | { kind: "cookie"; maxCookieBytes: number };

type RefreshOutcome = { status: "ok"; data: SessionData } | { status: "invalid_grant" } | { status: "ended" };

const utf8 = new TextEncoder();
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const TRANSACTION_TTL_MS = 10 * 60_000;
/** Domyślny zapas czasu dla `authenticate()` i `accessToken()` (30 s). */
const DEFAULT_REFRESH_MARGIN_SECONDS = 30;
/** Domyślny szerszy zapas czasu dla `getSession()` w `proxy.ts` (120 s). */
const DEFAULT_PROXY_REFRESH_MARGIN_SECONDS = 120;
const DEFAULT_SESSION_MAX_AGE = 30 * 24 * 60 * 60;
/** Zapas poniżej limitu 4096 bajtów na ciasteczko w przeglądarkach (nazwa + atrybuty zajmują ~110 bajtów). */
const DEFAULT_MAX_COOKIE_BYTES = 3800;
/** Krótkie okno pamięci podręcznej w procesie dla równoczesnych żądań z tym samym wygasającym ciasteczkiem. */
const REFRESH_CACHE_TTL_MS = 30_000;
const MAX_REFRESH_CACHE_ENTRIES = 1000;
/** Opóźnienie jednorazowej powtórki po `invalid_grant` (pokrywa ~5 ms lukę ponownego użycia w Core). */
const INVALID_GRANT_RETRY_DELAY_MS = 100;

const dehydrate = (context: AuthContext): SessionData["context"] => ({
  ...context,
  expiresAt: context.expiresAt.getTime(),
});
const hydrate = (context: SessionData["context"]): AuthContext => ({
  ...context,
  expiresAt: new Date(context.expiresAt),
});

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function resolveMode(options: WebAuthOptions): ResolvedMode {
  const hasStore = options.store !== undefined;
  const hasSession = options.session !== undefined;
  if (hasStore === hasSession) {
    throw new Error(
      hasStore
        ? "Podaj tylko jeden tryb sesji: albo `store`, albo `session` (nie oba naraz)"
        : 'Wybierz tryb sesji: podaj `store` (sesja w bazie) albo `session: { mode: "cookie" }` (sesja w ciasteczku)',
    );
  }
  if (options.store) return { kind: "store", store: options.store };
  const session = options.session;
  if (session?.mode === "store") {
    if (!session.store) throw new Error('Tryb `session: { mode: "store" }` wymaga podania `store`');
    return { kind: "store", store: session.store };
  }
  if (session?.mode === "cookie") {
    const maxCookieBytes = session.maxCookieBytes ?? DEFAULT_MAX_COOKIE_BYTES;
    if (!Number.isInteger(maxCookieBytes) || maxCookieBytes <= 0) {
      throw new Error("Parametr `maxCookieBytes` musi być dodatnią liczbą całkowitą");
    }
    return { kind: "cookie", maxCookieBytes };
  }
  throw new Error("Nieznany tryb sesji w `session.mode`");
}

function hasInvalidCookieNameChar(name: string): boolean {
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code <= 0x20 || code >= 0x7f || name[i] === ";" || name[i] === "=") return true;
  }
  return false;
}

function validateCookieName(name: string, secure: boolean): string {
  if (!name || hasInvalidCookieNameChar(name)) {
    throw new Error(
      "Nieprawidłowa nazwa ciasteczka w `cookieName`: nie może być pusta ani zawierać `;`, `=`, białych znaków ani znaków sterujących",
    );
  }
  if (secure && !name.startsWith("__Host-")) {
    throw new Error("Na HTTPS nazwa ciasteczka w `cookieName` musi zaczynać się od przedrostka `__Host-`");
  }
  if (!secure && (name.startsWith("__Host-") || name.startsWith("__Secure-"))) {
    throw new Error("Na HTTP nazwa ciasteczka w `cookieName` nie może zaczynać się od `__Host-` ani `__Secure-`");
  }
  return name;
}

function validateMarginSeconds(value: number | undefined, fallback: number, name: string): number {
  const seconds = value ?? fallback;
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    throw new Error(`Parametr \`${name}\` musi być nieujemną liczbą`);
  }
  return seconds * 1000;
}

function isValidSessionData(value: unknown): value is SessionData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<SessionData>;
  return (
    data.v === 1 &&
    typeof data.expiresAt === "number" &&
    typeof data.createdAt === "number" &&
    typeof data.refreshToken === "string" &&
    data.refreshToken.length > 0 &&
    typeof data.context === "object" &&
    data.context !== null &&
    typeof data.context.accountId === "string" &&
    typeof data.context.organizationId === "string" &&
    typeof data.context.employeeId === "string" &&
    typeof data.context.expiresAt === "number" &&
    typeof data.profile === "object" &&
    data.profile !== null &&
    typeof data.tokens === "object" &&
    data.tokens !== null
  );
}

export function createWebAuth(options: WebAuthOptions): WebAuth {
  const mode = resolveMode(options);
  const app = new URL(options.appUrl);
  const appOrigin = app.origin;
  const secure = app.protocol === "https:";
  const sessionCookie = validateCookieName(
    options.cookieName ?? (secure ? "__Host-monorise-session" : "monorise-session"),
    secure,
  );
  const transactionCookie = secure ? "__Host-monorise-oauth" : "monorise-oauth";
  const redirectUri = new URL(options.callbackPath ?? "/api/auth/callback", appOrigin).toString();
  const primary = options.resources[0];
  const scopes = options.scopes ?? DEFAULT_SCOPES;
  const maxAgeMs = (options.sessionMaxAge ?? DEFAULT_SESSION_MAX_AGE) * 1000;
  const refreshMarginMs = validateMarginSeconds(
    options.refreshMarginSeconds,
    DEFAULT_REFRESH_MARGIN_SECONDS,
    "refreshMarginSeconds",
  );
  const proxyRefreshMarginMs = validateMarginSeconds(
    options.proxyRefreshMarginSeconds,
    DEFAULT_PROXY_REFRESH_MARGIN_SECONDS,
    "proxyRefreshMarginSeconds",
  );
  const now = options.now ?? Date.now;
  const secrets = Array.isArray(options.secret) ? options.secret : [options.secret];
  const normalizedIssuer = options.issuer.replace(/\/+$/, "");
  const cookieBinding = JSON.stringify([normalizedIssuer, options.clientId, appOrigin, sessionCookie]);
  const transactionBinding = JSON.stringify([normalizedIssuer, options.clientId, appOrigin, transactionCookie]);
  // Cel `"session"` w trybie `store` pozostaje bez zmian dla zgodności z istniejącymi wierszami w bazie.
  const sessions = createSealer(secrets, "session");
  const cookieSessions = createSealer(secrets, `cookie-session:${cookieBinding}`);
  const transactions = createSealer(secrets, `oauth-transaction:${transactionBinding}`);
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

  // ── Wspólna logika odświeżania i kolejkowania ────────────────────────────────────────────────────────

  const isFresh = (data: SessionData, resource: string, marginMs: number) => {
    const token = data.tokens[resource];
    return token !== undefined && token.expiresAt - now() > marginMs;
  };

  // Core wydaje przy odświeżeniu nowy token odświeżania i unieważnia rodzinę tokenów, gdy stary zostanie użyty
  // po oknie ponownego użycia. Równoczesne żądania jednej sesji w procesie kolejkujemy, żeby nie ścigały się w Core.
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

  async function requestRefreshedSession(current: SessionData, resource: string): Promise<RefreshOutcome> {
    let tokens: TokenResponse;
    try {
      tokens = await refreshTokens({ ...client, refreshToken: current.refreshToken, resource });
    } catch (error) {
      if (error instanceof OAuthError && error.status >= 400 && error.status < 500) {
        if (error.error === "invalid_grant") return { status: "invalid_grant" };
        // Usunięte konto (`invalid_request`) albo obcięte zakresy (`invalid_scope`) kończą sesję.
        if (error.error === "invalid_scope" || error.error === "invalid_request") return { status: "ended" };
        // Błędy konfiguracji klienta (`invalid_client`, `unauthorized_client`, `invalid_target`) nie kończą sesji
        // i nigdy nie wypuszczają surowego `OAuthError` poza bibliotekę.
        throw new AuthUnavailableError(`Błąd konfiguracji klienta OAuth w Core (${error.error})`, { cause: error });
      }
      throw new AuthUnavailableError("Core nie odświeżył tokenów", { cause: error });
    }

    let context: AuthContext;
    try {
      context = await verifierFor(resource)(tokens.access_token);
    } catch (error) {
      if (error instanceof AuthUnavailableError) throw error;
      return { status: "ended" };
    }
    if (context.accountId !== current.context.accountId || context.organizationId !== current.context.organizationId) {
      return { status: "ended" };
    }

    const refreshedAt = now();
    const activeTokens: Record<string, StoredToken> = {};
    for (const [key, stored] of Object.entries(current.tokens)) {
      if (stored.expiresAt > refreshedAt) activeTokens[key] = stored;
    }
    activeTokens[resource] = { value: tokens.access_token, expiresAt: refreshedAt + tokens.expires_in * 1000 };

    return {
      status: "ok",
      data: {
        ...current,
        context: dehydrate(context),
        refreshToken: tokens.refresh_token ?? current.refreshToken,
        tokens: activeTokens,
      },
    };
  }

  // ── Sesje w magazynie (tryb `store`) ─────────────────────────────────────────────────────────────────

  async function saveStore(store: SessionStore, id: string, data: SessionData): Promise<void> {
    await store.set({
      id,
      accountId: data.context.accountId,
      organizationId: data.context.organizationId,
      expiresAt: new Date(data.expiresAt),
      data: await sessions.seal(data),
    });
  }

  async function loadStore(store: SessionStore, id: string): Promise<SessionData | null> {
    const record = await store.get(id);
    if (!record) return null;
    const raw = record.expiresAt.getTime() > now() ? await sessions.unseal<unknown>(record.data) : null;
    if (!isValidSessionData(raw) || raw.expiresAt <= now()) {
      await store.delete(id);
      return null;
    }
    return raw;
  }

  async function ensureFreshStore(
    store: SessionStore,
    id: string,
    data: SessionData,
    resource: string,
    marginMs: number,
  ): Promise<SessionData | null> {
    if (isFresh(data, resource, marginMs)) return data;
    return exclusive(id, async () => {
      // Inne żądanie mogło już odświeżyć tokeny, więc czytamy sesję jeszcze raz.
      const current = await loadStore(store, id);
      if (!current) return null;
      if (isFresh(current, resource, marginMs)) return current;

      const outcome = await requestRefreshedSession(current, resource);
      if (outcome.status !== "ok") {
        await store.delete(id);
        return null;
      }
      await saveStore(store, id, outcome.data);
      return outcome.data;
    });
  }

  // ── Sesje w zaszyfrowanym ciasteczku (tryb `cookie`) ─────────────────────────────────────────────────

  const recentRefreshes = new Map<string, RecentCookieRefresh>();

  function cookieLockKey(data: SessionData): Promise<string> {
    return data.id ? Promise.resolve(data.id) : sha256(data.refreshToken);
  }

  async function unsealCookieRaw(value: string | undefined): Promise<SessionData | null> {
    if (!value) return null;
    const raw = await cookieSessions.unseal<unknown>(value);
    return isValidSessionData(raw) ? raw : null;
  }

  async function loadCookie(value: string | undefined): Promise<SessionData | null> {
    const data = await unsealCookieRaw(value);
    if (!data || data.expiresAt <= now()) return null;
    if (data.context.clientId !== options.clientId) return null;
    return data;
  }

  class CookieSizeExceededError extends Error {
    constructor(size: number, maxBytes: number) {
      super(
        `Zaszyfrowane ciasteczko sesji ma ${size} bajtów i przekracza limit ${maxBytes} bajtów. ` +
          "Ogranicz listę `resources` albo użyj trybu z bazą danych (`store`).",
      );
      this.name = "CookieSizeExceededError";
    }
  }

  async function sealCookie(data: SessionData, maxBytes: number): Promise<string> {
    const sealed = await cookieSessions.seal(data);
    const size = utf8.encode(sealed).byteLength;
    if (size > maxBytes) throw new CookieSizeExceededError(size, maxBytes);
    return sealed;
  }

  /**
   * Po rotacji tokenu odświeżania w Core utrata nowego ciasteczka zakończyłaby sesję.
   * Jeśli pełny zestaw tokenów przekracza limit, przed zgłoszeniem błędu zrzucamy zbędne tokeny innych zasobów
   * (zostawiając żądany zasób i zasób główny, jeśli oba się mieszczą, a w ostateczności sam żądany zasób).
   */
  async function sealRefreshedCookie(
    next: SessionData,
    resource: string,
    maxBytes: number,
  ): Promise<{ data: SessionData; sealed: string }> {
    try {
      return { data: next, sealed: await sealCookie(next, maxBytes) };
    } catch (error) {
      if (!(error instanceof CookieSizeExceededError)) throw error;
    }

    const requestedToken = next.tokens[resource];
    const primaryToken = next.tokens[primary];
    const tokenCount = Object.keys(next.tokens).length;

    if (requestedToken && primaryToken && resource !== primary && tokenCount > 2) {
      const reduced: SessionData = {
        ...next,
        tokens: { [primary]: primaryToken, [resource]: requestedToken },
      };
      try {
        return { data: reduced, sealed: await sealCookie(reduced, maxBytes) };
      } catch (error) {
        if (!(error instanceof CookieSizeExceededError)) throw error;
      }
    }

    if (requestedToken && tokenCount > 1) {
      const minimal: SessionData = {
        ...next,
        tokens: { [resource]: requestedToken },
      };
      return { data: minimal, sealed: await sealCookie(minimal, maxBytes) };
    }

    return { data: next, sealed: await sealCookie(next, maxBytes) };
  }

  function matchesSessionIdentity(entry: RecentCookieRefresh, data: SessionData): boolean {
    return (
      entry.data.context.accountId === data.context.accountId &&
      entry.data.context.organizationId === data.context.organizationId &&
      entry.data.createdAt === data.createdAt
    );
  }

  function getLatestRefreshForSession(lockKey: string, data: SessionData): RecentCookieRefresh | null {
    const entry = recentRefreshes.get(lockKey);
    if (!entry) return null;
    const currentNow = now();
    if (currentNow - entry.updatedAt > REFRESH_CACHE_TTL_MS || entry.data.expiresAt <= currentNow) {
      recentRefreshes.delete(lockKey);
      return null;
    }
    if (!matchesSessionIdentity(entry, data)) return null;
    return entry;
  }

  function getRecentRefresh(lockKey: string, data: SessionData): RecentCookieRefresh | null {
    const entry = getLatestRefreshForSession(lockKey, data);
    if (!entry) return null;
    if (data.refreshToken !== entry.data.refreshToken && !entry.previousRefreshTokens.has(data.refreshToken)) {
      return null;
    }
    return entry;
  }

  function rememberRefresh(lockKey: string, entry: RecentCookieRefresh): void {
    const currentNow = now();
    for (const [key, existing] of recentRefreshes) {
      if (currentNow - existing.updatedAt > REFRESH_CACHE_TTL_MS || existing.data.expiresAt <= currentNow) {
        recentRefreshes.delete(key);
      }
    }
    recentRefreshes.delete(lockKey);
    while (recentRefreshes.size >= MAX_REFRESH_CACHE_ENTRIES) {
      const oldest = recentRefreshes.keys().next().value;
      if (oldest === undefined) break;
      recentRefreshes.delete(oldest);
    }
    recentRefreshes.set(lockKey, entry);
  }

  async function ensureFreshCookie(
    maxCookieBytes: number,
    data: SessionData,
    resource: string,
    marginMs: number,
  ): Promise<{ data: SessionData; lockKey: string; setCookie: string | null } | null> {
    const lockKey = await cookieLockKey(data);
    if (isFresh(data, resource, marginMs)) return { data, lockKey, setCookie: null };
    return exclusive(lockKey, async () => {
      // Jeśli inne równoczesne żądanie w tym samym procesie już odświeżyło tę sesję,
      // używamy jej najnowszego stanu, żeby nie użyć ponownie starego tokenu odświeżania.
      const cached = getRecentRefresh(lockKey, data);
      if (cached && isFresh(cached.data, resource, marginMs)) {
        return {
          data: cached.data,
          lockKey,
          setCookie: cookie(sessionCookie, cached.sealed, { expires: new Date(cached.data.expiresAt) }),
        };
      }

      const current = cached ? cached.data : data;
      let outcome = await requestRefreshedSession(current, resource);
      if (outcome.status === "invalid_grant" && !cached) {
        // Pokrywa ~5 ms lukę w Core zaraz po rotacji tokenu (zanim odpowiedź ponownego użycia trafi do magazynu).
        await delay(INVALID_GRANT_RETRY_DELAY_MS);
        outcome = await requestRefreshedSession(current, resource);
      }
      if (outcome.status !== "ok") {
        recentRefreshes.delete(lockKey);
        return null;
      }

      const { data: stored, sealed } = await sealRefreshedCookie(outcome.data, resource, maxCookieBytes);
      const previousRefreshTokens = new Set(cached?.previousRefreshTokens);
      previousRefreshTokens.add(current.refreshToken);
      previousRefreshTokens.add(data.refreshToken);
      rememberRefresh(lockKey, { data: stored, sealed, previousRefreshTokens, updatedAt: now() });

      return {
        data: stored,
        lockKey,
        setCookie: cookie(sessionCookie, sealed, { expires: new Date(stored.expiresAt) }),
      };
    });
  }

  // ── Obiekt Session ───────────────────────────────────────────────────────────────────────────────────

  function toReadOnlySession(data: SessionData): Session {
    const emptyCookies: readonly string[] = [];
    return {
      context: hydrate(data.context),
      profile: data.profile,
      expiresAt: new Date(data.expiresAt),
      setCookies: emptyCookies,
      async accessToken(resource = primary) {
        if (!options.resources.includes(resource)) throw new Error(`API ${resource} nie ma na liście resources`);
        const token = data.tokens[resource];
        if (!token || token.expiresAt <= now()) {
          throw new AuthError("UNAUTHENTICATED", "Token dostępu wygasł i wymaga odświeżenia z zapisem ciasteczka");
        }
        return token.value;
      },
    };
  }

  function toStoreSession(store: SessionStore, id: string, data: SessionData, marginMs: number): Session {
    let latest = data;
    const emptyCookies: readonly string[] = [];
    return {
      context: hydrate(data.context),
      profile: data.profile,
      expiresAt: new Date(data.expiresAt),
      setCookies: emptyCookies,
      async accessToken(resource = primary) {
        if (!options.resources.includes(resource)) throw new Error(`API ${resource} nie ma na liście resources`);
        const fresh = await ensureFreshStore(store, id, latest, resource, marginMs);
        const token = fresh?.tokens[resource];
        if (!fresh || !token) throw new AuthError("UNAUTHENTICATED", "Sesja wygasła");
        latest = fresh;
        return token.value;
      },
    };
  }

  function toCookieSession(
    maxCookieBytes: number,
    data: SessionData,
    lockKey: string,
    initialSetCookie: string | null,
    marginMs: number,
  ): Session {
    let latest = data;
    let currentLockKey = lockKey;
    let fallbackSetCookie = initialSetCookie;
    let hasPendingCookie = initialSetCookie !== null;

    return {
      context: hydrate(data.context),
      profile: data.profile,
      expiresAt: new Date(data.expiresAt),
      get setCookies(): readonly string[] {
        if (!hasPendingCookie) return [];
        // Zawsze zwracamy najnowsze ciasteczko tej sesji w procesie, żeby późniejsza odpowiedź
        // nie nadpisała w przeglądarce nowszego obróconego ciasteczka z innego żądania.
        const newest = getLatestRefreshForSession(currentLockKey, latest);
        if (newest) {
          return [cookie(sessionCookie, newest.sealed, { expires: new Date(newest.data.expiresAt) })];
        }
        return fallbackSetCookie ? [fallbackSetCookie] : [];
      },
      async accessToken(resource = primary) {
        if (!options.resources.includes(resource)) throw new Error(`API ${resource} nie ma na liście resources`);
        const fresh = await ensureFreshCookie(maxCookieBytes, latest, resource, marginMs);
        const token = fresh?.data.tokens[resource];
        if (!fresh || !token) throw new AuthError("UNAUTHENTICATED", "Sesja wygasła");
        latest = fresh.data;
        currentLockKey = fresh.lockKey;
        if (fresh.setCookie) {
          hasPendingCookie = true;
          fallbackSetCookie = fresh.setCookie;
        }
        return token.value;
      },
    };
  }

  async function loadSessionFromCookieValue(
    value: string | undefined,
    allowRefresh: boolean,
    marginMs: number,
  ): Promise<Session | null> {
    if (!value) return null;
    if (mode.kind === "store") {
      const id = await sha256(value);
      const data = await loadStore(mode.store, id);
      if (!data) return null;
      if (!allowRefresh) {
        const primaryToken = data.tokens[primary];
        if (!primaryToken || primaryToken.expiresAt <= now()) return null;
        return toReadOnlySession(data);
      }
      // Token API produktu żyje 5 minut, więc co 5 minut Core potwierdza, że konto może dalej pracować.
      const fresh = await ensureFreshStore(mode.store, id, data, primary, marginMs);
      return fresh ? toStoreSession(mode.store, id, fresh, marginMs) : null;
    }

    const data = await loadCookie(value);
    if (!data) return null;
    if (!allowRefresh) {
      const primaryToken = data.tokens[primary];
      if (!primaryToken || primaryToken.expiresAt <= now()) return null;
      return toReadOnlySession(data);
    }
    const fresh = await ensureFreshCookie(mode.maxCookieBytes, data, primary, marginMs);
    return fresh ? toCookieSession(mode.maxCookieBytes, fresh.data, fresh.lockKey, fresh.setCookie, marginMs) : null;
  }

  async function getSessionFromCookie(
    value: string | undefined,
    sessionOptions?: GetSessionOptions,
  ): Promise<Session | null> {
    const allowRefresh = sessionOptions?.refresh ?? mode.kind === "store";
    return loadSessionFromCookieValue(value, allowRefresh, refreshMarginMs);
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

  async function revokePreviousSession(previousCookieValue: string | undefined): Promise<void> {
    if (!previousCookieValue) return;
    if (mode.kind === "store") {
      const previousId = await sha256(previousCookieValue);
      const previousData = await loadStore(mode.store, previousId);
      await mode.store.delete(previousId);
      if (previousData && previousData.expiresAt > now()) {
        await revokeToken({ ...client, token: previousData.refreshToken, hint: "refresh_token" }).catch(
          () => undefined,
        );
      }
      return;
    }

    const previousData = await loadCookie(previousCookieValue);
    if (previousData) {
      const lockKey = await cookieLockKey(previousData);
      const cached = getRecentRefresh(lockKey, previousData);
      recentRefreshes.delete(lockKey);
      const tokenToRevoke = cached ? cached.data.refreshToken : previousData.refreshToken;
      await revokeToken({ ...client, token: tokenToRevoke, hint: "refresh_token" }).catch(() => undefined);
      return;
    }

    // Jeśli ciasteczko wygasło, nie wywołujemy /revoke w Core, ale sprzątamy ewentualny stary wpis w pamięci.
    const expiredRaw = await unsealCookieRaw(previousCookieValue);
    if (expiredRaw) recentRefreshes.delete(await cookieLockKey(expiredRaw));
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

    // Poprzednią sesję unieważniamy PRZED `exchangeCode()`: jeśli jej token był już obrócony, Core czyści
    // całą rodzinę (clientId, userId), więc musi to nastąpić zanim wyda nowy token dla nowej sesji.
    await revokePreviousSession(readCookie(request, sessionCookie));

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
      ...(mode.kind === "cookie" ? { id: randomToken(16) } : {}),
      context: dehydrate(context),
      profile,
      refreshToken: tokens.refresh_token,
      tokens: { [primary]: { value: tokens.access_token, expiresAt: issuedAt + tokens.expires_in * 1000 } },
      createdAt: issuedAt,
      expiresAt: issuedAt + maxAgeMs,
    };

    if (mode.kind === "store") {
      const sessionId = randomToken(32);
      await saveStore(mode.store, await sha256(sessionId), data);

      return redirect(new URL(transaction.returnTo, appOrigin).toString(), [
        clear,
        cookie(sessionCookie, sessionId, { expires: new Date(data.expiresAt) }),
      ]);
    }

    let sealed: string;
    try {
      sealed = await sealCookie(data, mode.maxCookieBytes);
    } catch (error) {
      await revokeToken({ ...client, token: tokens.refresh_token, hint: "refresh_token" }).catch(() => undefined);
      throw error;
    }

    return redirect(new URL(transaction.returnTo, appOrigin).toString(), [
      clear,
      cookie(sessionCookie, sealed, { expires: new Date(data.expiresAt) }),
    ]);
  }

  async function signOut(request: Request): Promise<Response> {
    if (request.method.toUpperCase() !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
    if (!fromApp(request)) return new Response(null, { status: 403 });
    await revokePreviousSession(readCookie(request, sessionCookie));
    return redirect(
      new URL(options.afterSignOut ?? "/", appOrigin).toString(),
      [cookie(sessionCookie, "", { maxAge: 0 })],
      303,
    );
  }

  async function authenticate(request: Request): Promise<Authenticated> {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== null && authHeader.trim().length > 0) {
      const token = bearerToken(authHeader);
      if (!token) throw new AuthError("UNAUTHENTICATED", "Nieprawidłowy nagłówek Authorization");
      return { context: await verifierFor(primary)(token), via: "bearer", session: null, setCookies: [] };
    }

    const value = readCookie(request, sessionCookie);
    if (!value) throw new AuthError("UNAUTHENTICATED", "Brak sesji");
    if (!SAFE_METHODS.has(request.method.toUpperCase()) && !fromApp(request)) {
      throw new AuthError("PERMISSION_DENIED", "Żądanie spoza aplikacji");
    }
    const session = await loadSessionFromCookieValue(value, true, refreshMarginMs);
    if (!session) throw new AuthError("UNAUTHENTICATED", "Sesja wygasła albo nie istnieje");
    return {
      context: session.context,
      via: "session",
      session,
      get setCookies() {
        return session.setCookies;
      },
    };
  }

  /** Standardowa koperta błędu API Monorise (ADR-0044): `requestId` z nagłówka `x-request-id` albo nowy. */
  function errorEnvelope(request: Request, status: number, code: string, message: string): Response {
    const incoming = request.headers.get("x-request-id");
    const requestId = incoming && /^[\w-]{1,64}$/.test(incoming) ? incoming : `req_${randomToken(8)}`;
    return Response.json(
      { data: null, meta: { requestId }, error: { code, message, details: [] } },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }

  async function withAuth(
    request: Request,
    handler: (auth: Authenticated) => Response | Promise<Response>,
    withAuthOptions?: WithAuthOptions,
  ): Promise<Response> {
    let authenticated: Authenticated | undefined;
    try {
      authenticated = await authenticate(request);
      const response = await handler(authenticated);
      return applySessionCookies(response, authenticated);
    } catch (error) {
      if (withAuthOptions?.onError) {
        const errorResponse = await withAuthOptions.onError(error, request);
        return applySessionCookies(errorResponse, authenticated);
      }
      if (error instanceof AuthError) {
        return applySessionCookies(errorEnvelope(request, error.statusCode, error.code, error.message), authenticated);
      }
      if (error instanceof AuthUnavailableError) {
        return applySessionCookies(
          errorEnvelope(request, error.statusCode, "INTERNAL_ERROR", error.message),
          authenticated,
        );
      }
      throw error;
    }
  }

  return {
    signIn,
    callback,
    signOut,
    getSession: (request) => loadSessionFromCookieValue(readCookie(request, sessionCookie), true, proxyRefreshMarginMs),
    getSessionFromCookie,
    authenticate,
    withAuth,
    cookieName: sessionCookie,
    mode: mode.kind,
  };
}
