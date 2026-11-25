import { decodeJwt } from "jose";
import { beforeEach, describe, expect, it } from "vitest";
import { AuthError, AuthUnavailableError, OAuthError } from "../src/index.js";
import {
  applySessionCookies,
  createWebAuth,
  forwardSessionCookie,
  memorySessionStore,
  type WebAuth,
  type WebAuthOptions,
} from "../src/next.js";
import { createSealer } from "../src/seal.js";
import {
  ACCOUNT_ID,
  APP,
  CLIENT_ID,
  CLIENT_SECRET,
  CORE_API,
  createFakeCore,
  EMPLOYEE_ID,
  ISSUER,
  ORGANIZATION_ID,
  RESOURCE,
  SECRET,
  type FakeCore,
} from "./fake-core.js";

const SESSION = "__Host-monorise-session";
const TRANSACTION = "__Host-monorise-oauth";
const SECOND = 1000;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

let core: FakeCore;
let clock: number;
let auth: WebAuth;

function setupCookie(
  overrides: Partial<Omit<Extract<WebAuthOptions, { session: unknown }>, "session">> & {
    maxCookieBytes?: number;
  } = {},
): WebAuth {
  const { maxCookieBytes, ...rest } = overrides;
  return createWebAuth({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    appUrl: APP,
    resources: [RESOURCE, CORE_API],
    secret: SECRET,
    session: { mode: "cookie", ...(maxCookieBytes !== undefined ? { maxCookieBytes } : {}) },
    keys: core.keys,
    fetch: core.fetch,
    now: () => clock,
    ...rest,
  });
}

function setupStore(
  store = memorySessionStore(),
  overrides: Partial<Omit<Extract<WebAuthOptions, { store: unknown }>, "store">> = {},
): WebAuth {
  return createWebAuth({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    appUrl: APP,
    resources: [RESOURCE, CORE_API],
    secret: SECRET,
    store,
    keys: core.keys,
    fetch: core.fetch,
    now: () => clock,
    ...overrides,
  });
}

beforeEach(async () => {
  clock = Date.now();
  core = await createFakeCore({
    now: () => clock,
    clients: { "other-web": "other-client-secret" },
  });
  auth = setupCookie();
});

type Jar = Record<string, string>;

function parseSetCookies(headers: readonly string[]): { jar: Jar; raw: Record<string, string> } {
  const jar: Jar = {};
  const raw: Record<string, string> = {};
  for (const header of headers) {
    const pair = header.split(";")[0] ?? "";
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq);
    jar[name] = pair.slice(eq + 1);
    raw[name] = header;
  }
  return { jar, raw };
}

const setCookies = (response: Response) => parseSetCookies(response.headers.getSetCookie());

const cookieHeader = (jar: Jar) =>
  Object.entries(jar)
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

async function startSignIn(instance: WebAuth = auth, query = "", appUrl = APP) {
  const response = await instance.signIn(new Request(`${appUrl}/api/auth/sign-in${query}`));
  return { response, location: response.headers.get("location") ?? "", ...setCookies(response) };
}

async function signInFlow(instance: WebAuth = auth, returnTo = "/pulpit", appUrl = APP) {
  const start = await startSignIn(instance, `?returnTo=${encodeURIComponent(returnTo)}`, appUrl);
  const callback = core.approve(start.location);
  const done = await instance.callback(new Request(callback, { headers: { cookie: cookieHeader(start.jar) } }));
  const finished = setCookies(done);
  return {
    done,
    location: done.headers.get("location") ?? "",
    session: finished.jar[instance.cookieName] ?? "",
    raw: finished.raw,
    transactionJar: start.jar,
  };
}

const withSession = (
  session: string,
  init: RequestInit & { url?: string; cookieName?: string; extraCookies?: string } = {},
) => {
  const name = init.cookieName ?? SESSION;
  const cookie = init.extraCookies ? `${init.extraCookies}; ${name}=${session}` : `${name}=${session}`;
  return new Request(init.url ?? `${APP}/api/v1/me`, {
    ...init,
    headers: { cookie, ...(init.headers as Record<string, string>) },
  });
};

describe("konfiguracja createWebAuth: tryb sesji, cookieName i marginesy", () => {
  const base = () => ({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    appUrl: APP,
    resources: [RESOURCE, CORE_API] as [string, ...string[]],
    secret: SECRET,
    keys: core.keys,
    fetch: core.fetch,
    now: () => clock,
  });

  it("wymaga podania dokładnie jednego trybu sesji (`store` albo `session`)", () => {
    expect(() => createWebAuth(base() as unknown as WebAuthOptions)).toThrow(/Wybierz tryb sesji/);
    expect(() =>
      createWebAuth({
        ...base(),
        store: memorySessionStore(),
        session: { mode: "cookie" },
      } as unknown as WebAuthOptions),
    ).toThrow(/tylko jeden tryb sesji/);
    expect(() =>
      createWebAuth({
        ...base(),
        session: { mode: "cookie", maxCookieBytes: 0 },
      }),
    ).toThrow(/maxCookieBytes/);
  });

  it("waliduje cookieName pod kątem znaków niedozwolonych i przedrostków __Host- / __Secure-", () => {
    for (const invalid of [
      "",
      "__Host-a;b",
      "__Host-a=b",
      "__Host-a b",
      "__Host-a\nb",
      "__Host-a\x00b",
      "__Host-a\x7fb",
    ]) {
      expect(() => setupCookie({ cookieName: invalid })).toThrow(/cookieName/);
    }
    // Na HTTPS wymagany jest przedrostek __Host-.
    expect(() => setupCookie({ appUrl: APP, cookieName: "monorise-session" })).toThrow(/__Host-/);
    expect(() => setupCookie({ appUrl: APP, cookieName: "__Secure-session" })).toThrow(/__Host-/);
    expect(setupCookie({ appUrl: APP, cookieName: "__Host-portal-session" }).cookieName).toBe("__Host-portal-session");

    // Na HTTP zabronione są przedrostki __Host- i __Secure-.
    const httpApp = "http://portal.localhost:3000";
    expect(() => setupCookie({ appUrl: httpApp, cookieName: "__Host-session" })).toThrow(/__Host-/);
    expect(() => setupCookie({ appUrl: httpApp, cookieName: "__Secure-session" })).toThrow(/__Secure-/);
    expect(setupCookie({ appUrl: httpApp, cookieName: "portal-session" }).cookieName).toBe("portal-session");
  });

  it("waliduje marginesy odświeżania", () => {
    expect(() => setupCookie({ refreshMarginSeconds: -1 })).toThrow(/refreshMarginSeconds/);
    expect(() => setupCookie({ proxyRefreshMarginSeconds: Number.NaN })).toThrow(/proxyRefreshMarginSeconds/);
  });

  it("obsługuje zarówno `store`, jak i `session: { mode: 'store', store }` bez nagłówków Set-Cookie", async () => {
    const store = memorySessionStore();
    const viaStore = createWebAuth({ ...base(), store });
    const viaSession = createWebAuth({ ...base(), session: { mode: "store", store } });
    expect(viaStore.mode).toBe("store");
    expect(viaSession.mode).toBe("store");

    const signed = await signInFlow(viaSession);
    clock += 6 * MINUTE;
    const authenticated = await viaStore.authenticate(withSession(signed.session));
    expect(authenticated.via).toBe("session");
    if (authenticated.via !== "session") throw new Error("expected session");
    expect(authenticated.setCookies).toEqual([]);
    expect(authenticated.session.setCookies).toEqual([]);
    const response = applySessionCookies(new Response("ok"), authenticated);
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});

describe("sesja BFF w zaszyfrowanym ciasteczku (ADR-0098)", () => {
  it("loguje użytkownika i zapisuje zaszyfrowaną sesję w ciasteczku z flagami bezpieczeństwa", async () => {
    expect(auth.mode).toBe("cookie");
    const { done, location, session, raw } = await signInFlow(auth, "/firma?tab=role");
    expect(done.status).toBe(302);
    expect(location).toBe(`${APP}/firma?tab=role`);
    expect(raw[SESSION]).toMatch(/Path=\/; HttpOnly; SameSite=Lax; Secure; Expires=/);
    expect(raw[TRANSACTION]).toContain("Max-Age=0");
    // W ciasteczku jest szyfrogram JWE: brak jawnych tokenów i danych konta.
    expect(session.split(".")).toHaveLength(5);
    expect(session).not.toContain(ACCOUNT_ID);
    expect(session).not.toContain(ORGANIZATION_ID);
    expect(session).not.toContain("anna@acme.test");

    const result = await auth.authenticate(withSession(session));
    expect(result.via).toBe("session");
    if (result.via !== "session") throw new Error("expected session");
    expect(result.setCookies).toEqual([]);
    expect(result.context).toMatchObject({
      accountId: ACCOUNT_ID,
      organizationId: ORGANIZATION_ID,
      employeeId: EMPLOYEE_ID,
    });
    expect(result.session.profile).toEqual({ email: "anna@acme.test", name: "Anna Kowalska" });
    expect(decodeJwt(await result.session.accessToken()).aud).toContain(RESOURCE);
    expect(core.calls.token).toBe(1);
    expect(core.calls.refresh).toBe(0);
  });

  it("na http:// (praca lokalna) używa nazwy bez przedrostka __Host- i bez flagi Secure", async () => {
    const localApp = "http://portal.localhost:3000";
    const localAuth = setupCookie({ appUrl: localApp });
    expect(localAuth.cookieName).toBe("monorise-session");

    const { session, raw } = await signInFlow(localAuth, "/", localApp);
    expect(raw["monorise-session"]).toContain("Path=/; HttpOnly; SameSite=Lax; Expires=");
    expect(raw["monorise-session"]).not.toContain("Secure");
    const current = await localAuth.getSessionFromCookie(session);
    expect(current?.context.accountId).toBe(ACCOUNT_ID);
  });

  it("przy odświeżeniu zwraca nowe ciasteczko z obróconym tokenem odświeżania i zapisuje je przez applySessionCookies", async () => {
    const first = await signInFlow();
    clock += 6 * MINUTE;

    const refreshed = await auth.authenticate(withSession(first.session));
    expect(core.calls.refresh).toBe(1);
    expect(refreshed.setCookies).toHaveLength(1);
    expect(refreshed.session?.setCookies).toEqual(refreshed.setCookies);
    expect(refreshed.setCookies[0]).toMatch(
      new RegExp(`^${SESSION}=.+; Path=/; HttpOnly; SameSite=Lax; Secure; Expires=`),
    );

    const response = applySessionCookies(Response.json({ ok: true }), refreshed);
    const { jar } = setCookies(response);
    const secondCookie = jar[SESSION] ?? "";
    expect(secondCookie).toBeTruthy();
    expect(secondCookie).not.toBe(first.session);

    // Kolejne żądanie z nowym ciasteczkiem nie odświeża ponownie w Core.
    const nextCheck = await auth.authenticate(withSession(secondCookie));
    expect(nextCheck.setCookies).toEqual([]);
    expect(core.calls.refresh).toBe(1);

    // Po kolejnych 6 minutach nowe ciasteczko ma już obrócony token odświeżania i odświeża się dalej.
    clock += 6 * MINUTE;
    const third = await auth.authenticate(withSession(secondCookie));
    expect(core.calls.refresh).toBe(2);
    expect(third.setCookies).toHaveLength(1);
    expect(parseSetCookies(third.setCookies).jar[SESSION]).not.toBe(secondCookie);
  });

  it("odświeżenie w session.accessToken(CORE_API) aktualizuje result.setCookies do najnowszego ciasteczka", async () => {
    const { session: initialCookie } = await signInFlow();
    const result = await auth.authenticate(withSession(initialCookie));
    expect(result.setCookies).toEqual([]);

    // Pierwsze pobranie tokenu dla drugiego zasobu (CORE_API) rotuje token odświeżania w Core.
    const coreToken = await result.session!.accessToken(CORE_API);
    expect(decodeJwt(coreToken).aud).toContain(CORE_API);
    expect(core.calls.refresh).toBe(1);
    expect(result.setCookies).toHaveLength(1);
    expect(result.session?.setCookies).toEqual(result.setCookies);

    // Nowe ciasteczko zawiera oba tokeny i nowy token odświeżania.
    const updatedCookie = parseSetCookies(result.setCookies).jar[SESSION] ?? "";
    const secondRequest = await auth.authenticate(withSession(updatedCookie));
    expect(secondRequest.setCookies).toEqual([]);
    expect(await secondRequest.session!.accessToken(CORE_API)).toBe(coreToken);
    expect(core.calls.refresh).toBe(1);
  });

  it("RSC: getSessionFromCookie() w trybie cookie domyślnie nie wywołuje Core", async () => {
    const { session: freshCookie } = await signInFlow();

    // Świeży token główny jest dostępny bez pytania Core.
    const scFresh = await auth.getSessionFromCookie(freshCookie);
    expect(scFresh).not.toBeNull();
    expect(scFresh!.setCookies).toEqual([]);
    expect(decodeJwt(await scFresh!.accessToken()).aud).toContain(RESOURCE);
    // Brak tokenu drugiego zasobu w ciasteczku -> czyste 401 bez wywoływania Core.
    await expect(scFresh!.accessToken(CORE_API)).rejects.toMatchObject({
      name: "AuthError",
      code: "UNAUTHENTICATED",
      statusCode: 401,
    });
    expect(core.calls.refresh).toBe(0);

    // Po wygaśnięciu tokenu głównego domyślne getSessionFromCookie() zwraca null i nie pyta Core.
    clock += 6 * MINUTE;
    expect(await auth.getSessionFromCookie(freshCookie)).toBeNull();
    expect(core.calls.refresh).toBe(0);

    // Z jawnym `{ refresh: true }` (np. Server Action) odświeża i zwraca ciasteczko do zapisu.
    const refreshed = await auth.getSessionFromCookie(freshCookie, { refresh: true });
    expect(refreshed).not.toBeNull();
    expect(refreshed!.setCookies).toHaveLength(1);
    expect(core.calls.refresh).toBe(1);
  });

  it("margines proxy: getSession() odświeża przy 100 s do końca, a authenticate() jeszcze nie", async () => {
    const { session } = await signInFlow();
    // Token żyje 300 s -> po 200 s zostało 100 s (poniżej domyślnych 120 s dla proxy, powyżej 30 s dla handlerów).
    clock += 200 * SECOND;

    const fromHandler = await auth.authenticate(withSession(session));
    expect(fromHandler.setCookies).toEqual([]);
    expect(core.calls.refresh).toBe(0);

    const fromProxy = await auth.getSession(withSession(session));
    expect(fromProxy).not.toBeNull();
    expect(fromProxy!.setCookies).toHaveLength(1);
    expect(core.calls.refresh).toBe(1);
  });

  it("wzorzec proxy.ts + Server Component: forwardSessionCookie przekazuje odświeżoną sesję bez drugiego odświeżenia", async () => {
    const { session: staleCookie } = await signInFlow();
    clock += 6 * MINUTE;

    const incoming = withSession(staleCookie, {
      url: `${APP}/ustawienia`,
      extraCookies: "theme=dark",
    });
    const proxySession = await auth.getSession(incoming);
    expect(proxySession).not.toBeNull();
    expect(proxySession!.setCookies).toHaveLength(1);
    expect(core.calls.refresh).toBe(1);

    const forwardedHeaders = forwardSessionCookie(incoming, proxySession);
    expect(forwardedHeaders.get("cookie")).toContain("theme=dark");
    expect(forwardedHeaders.get("cookie")).not.toContain(staleCookie);

    const cookieVal = forwardedHeaders
      .get("cookie")!
      .split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith(`${SESSION}=`))!
      .slice(SESSION.length + 1);
    const scSession = await auth.getSessionFromCookie(cookieVal);
    expect(scSession?.context.accountId).toBe(ACCOUNT_ID);
    expect(scSession?.setCookies).toEqual([]);
    expect(core.calls.refresh).toBe(1);
  });

  it("równoczesne żądania w jednym procesie odświeżają sesję tylko raz i wszystkie dostają nowe ciasteczko", async () => {
    const { session: staleCookie } = await signInFlow();
    clock += 6 * MINUTE;

    const results = await Promise.all([1, 2, 3].map(() => auth.authenticate(withSession(staleCookie))));
    expect(core.calls.refresh).toBe(1);
    expect(results.every((r) => r.setCookies.length === 1)).toBe(true);
    const cookies = results.map((r) => parseSetCookies(r.setCookies).jar[SESSION]);
    expect(new Set(cookies).size).toBe(1);

    // Równoczesne pobranie CORE_API z tych sesji także wywołuje Core tylko raz.
    const coreTokens = await Promise.all(results.map((r) => r.session!.accessToken(CORE_API)));
    expect(core.calls.refresh).toBe(2);
    expect(new Set(coreTokens).size).toBe(1);
    const updatedCookies = results.map((r) => parseSetCookies(r.setCookies).jar[SESSION]);
    expect(new Set(updatedCookies).size).toBe(1);
    expect(updatedCookies[0]).not.toBe(cookies[0]);
  });

  it("odpowiedzi w odwróconej kolejności w jednym procesie zawsze wysyłają najnowsze ciasteczko", async () => {
    const { session: c0 } = await signInFlow();
    clock += 6 * MINUTE;

    // Żądanie 1 odświeża C0 -> C1, ale jeszcze nie zwraca odpowiedzi.
    const req1 = await auth.authenticate(withSession(c0));
    const c1 = parseSetCookies(req1.setCookies).jar[SESSION] ?? "";
    expect(c1).toBeTruthy();

    // Żądanie 2 przychodzi z C1, rotuje C1 -> C2 (np. pobierając CORE_API) i kończy się jako pierwsze.
    const req2 = await auth.authenticate(withSession(c1));
    await req2.session!.accessToken(CORE_API);
    const res2 = applySessionCookies(Response.json({ n: 2 }), req2);
    const c2 = setCookies(res2).jar[SESSION] ?? "";
    expect(c2).toBeTruthy();
    expect(c2).not.toBe(c1);

    // Żądanie 1 kończy się jako drugie — musi wysłać najnowsze C2, a nie starsze C1.
    const res1 = applySessionCookies(Response.json({ n: 1 }), req1);
    expect(setCookies(res1).jar[SESSION]).toBe(c2);
  });

  it("dwie osobne instancje przy oknie ponownego użycia 20 s (w tym ~5 ms luka) dostają te same tokeny i sesja żyje dalej", async () => {
    core.state.reuseIntervalSeconds = 20;
    core.state.replayGapResponses = 1; // Symulacja ~5 ms luki Core -> pojedyncza powtórka po 100 ms.
    const instanceA = setupCookie();
    const instanceB = setupCookie();
    const { session: staleCookie } = await signInFlow(instanceA);
    clock += 6 * MINUTE;

    const winner = await instanceA.authenticate(withSession(staleCookie));
    const winnerCookie = parseSetCookies(winner.setCookies).jar[SESSION] ?? "";
    const winnerToken = await winner.session!.accessToken();

    // Instancja B (osobny proces bez wspólnej pamięci) wpada w ~5 ms lukę, ponawia raz po ~100 ms i dostaje ten sam token.
    const follower = await instanceB.authenticate(withSession(staleCookie));
    const followerToken = await follower.session!.accessToken();
    expect(followerToken).toBe(winnerToken);
    expect(core.calls.refresh).toBe(3); // 1 (A) + 1 (B luka 400) + 1 (B powtórka 200)

    // Po kolejnych 6 minutach ciasteczko zwycięzcy nadal bez problemu się odświeża.
    clock += 6 * MINUTE;
    const next = await instanceA.authenticate(withSession(winnerCookie));
    expect(next.setCookies).toHaveLength(1);
  });

  it("dwie osobne instancje bez okna ponownego użycia (0 s): przegrywający dostaje czyste 401 (maks. 1 powtórka) i Core unieważnia rodzinę", async () => {
    core.state.reuseIntervalSeconds = 0;
    const instanceA = setupCookie();
    const instanceB = setupCookie();
    const { session: staleCookie } = await signInFlow(instanceA);
    clock += 6 * MINUTE;

    const winner = await instanceA.authenticate(withSession(staleCookie));
    expect(winner.setCookies).toHaveLength(1);
    const winnerCookie = parseSetCookies(winner.setCookies).jar[SESSION] ?? "";

    const refreshesBeforeLoser = core.calls.refresh;
    await expect(instanceB.authenticate(withSession(staleCookie))).rejects.toMatchObject({
      name: "AuthError",
      code: "UNAUTHENTICATED",
      statusCode: 401,
    });
    // Pierwsza próba + dokładnie jedna powtórka po ~100 ms (nigdy pętla).
    expect(core.calls.refresh - refreshesBeforeLoser).toBe(2);

    // Ponieważ reuseIntervalSeconds = 0, Core unieważnił całą rodzinę tokenów tej sesji.
    clock += 6 * MINUTE;
    expect(await instanceA.getSession(withSession(winnerCookie))).toBeNull();
  });

  it("ponowne logowanie na starym już obróconym ciasteczku nie kasuje nowej sesji (tryb cookie i store)", async () => {
    // 1. Tryb cookie: przeglądarka ma stare ciasteczko C0, którego token odświeżania został już obrócony na C1.
    const first = await signInFlow();
    clock += 6 * MINUTE;
    await auth.authenticate(withSession(first.session)); // obraca RT0 -> RT1

    // Użytkownik loguje się ponownie, wysyłając w żądaniu callback stare ciasteczko C0 (z już obróconym RT0).
    // Dzięki wywołaniu revoke przed exchangeCode() wyczyszczenie rodziny następuje PRZED wydaniem nowego tokenu.
    const start = await startSignIn();
    const callbackUrl = core.approve(start.location);
    const relogin = await auth.callback(
      new Request(callbackUrl, { headers: { cookie: `${cookieHeader(start.jar)}; ${SESSION}=${first.session}` } }),
    );
    expect(relogin.status).toBe(302);
    const newCookie = setCookies(relogin).jar[SESSION] ?? "";

    // Po 6 minutach nowa sesja musi się normalnie odświeżyć!
    clock += 6 * MINUTE;
    const refreshed = await auth.authenticate(withSession(newCookie));
    expect(refreshed.setCookies).toHaveLength(1);

    // 2. Ten sam scenariusz w trybie store (wspólna kolejność w callback()).
    const store = memorySessionStore();
    const storeAuth = setupStore(store);
    const storeFirst = await signInFlow(storeAuth);
    // Zapisujemy kopię starego wiersza z nieobróconym tokenem, potem obracamy token w Core i przywracamy stary wiersz.
    const oldIdHash = await (async () => {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(storeFirst.session));
      return Buffer.from(digest).toString("base64url");
    })();
    const oldRecord = await store.get(oldIdHash);
    clock += 6 * MINUTE;
    await storeAuth.authenticate(withSession(storeFirst.session));
    if (oldRecord) await store.set(oldRecord); // symuluje wyścig z już obróconym tokenem w wierszu

    const storeStart = await startSignIn(storeAuth);
    const storeCallback = await storeAuth.callback(
      new Request(core.approve(storeStart.location), {
        headers: { cookie: `${cookieHeader(storeStart.jar)}; ${SESSION}=${storeFirst.session}` },
      }),
    );
    expect(storeCallback.status).toBe(302);
    const storeNewSession = setCookies(storeCallback).jar[SESSION] ?? "";

    clock += 6 * MINUTE;
    expect(await storeAuth.getSession(withSession(storeNewSession))).not.toBeNull();
  });

  it("wylogowanie i ponowne logowanie nie wywołują /revoke dla już wygasłego ciasteczka", async () => {
    const { session } = await signInFlow();
    clock += 31 * DAY;

    const out = await auth.signOut(
      withSession(session, { url: `${APP}/api/auth/sign-out`, method: "POST", headers: { origin: APP } }),
    );
    expect(out.status).toBe(303);
    expect(setCookies(out).raw[SESSION]).toContain("Max-Age=0");
    expect(core.calls.revoke).toBe(0);

    const start = await startSignIn();
    const relogin = await auth.callback(
      new Request(core.approve(start.location), {
        headers: { cookie: `${cookieHeader(start.jar)}; ${SESSION}=${session}` },
      }),
    );
    expect(relogin.status).toBe(302);
    expect(core.calls.revoke).toBe(0);
  });

  it("błędy OAuth przy odświeżaniu: invalid_grant / invalid_request / invalid_scope kończą sesję, a invalid_client owija się w AuthUnavailableError (nigdy surowy OAuthError)", async () => {
    const store = memorySessionStore();
    const storeAuth = setupStore(store);

    for (const instance of [auth, storeAuth]) {
      // 1. Dezaktywacja konta (invalid_grant) -> koniec sesji (null / 401).
      const s1 = await signInFlow(instance);
      clock += 6 * MINUTE;
      core.state.accountDeactivated = true;
      expect(await instance.getSession(withSession(s1.session))).toBeNull();
      core.state.accountDeactivated = false;

      // 2. Usunięty użytkownik (invalid_request) -> koniec sesji (null / 401).
      const s2 = await signInFlow(instance);
      clock += 6 * MINUTE;
      core.state.userDeleted = true;
      await expect(instance.authenticate(withSession(s2.session))).rejects.toMatchObject({
        name: "AuthError",
        code: "UNAUTHENTICATED",
        statusCode: 401,
      });
      core.state.userDeleted = false;

      // 3. Obcięte zakresy (invalid_scope) -> koniec sesji (null / 401).
      const s3 = await signInFlow(instance);
      clock += 6 * MINUTE;
      core.state.scopeShrunk = true;
      expect(await instance.getSession(withSession(s3.session))).toBeNull();
      core.state.scopeShrunk = false;

      // 4. Błąd konfiguracji klienta (invalid_client) -> AuthUnavailableError (503), nigdy surowy OAuthError.
      const s4 = await signInFlow(instance);
      clock += 6 * MINUTE;
      core.state.refreshError = { error: "invalid_client", status: 401 };
      const caught = await instance.authenticate(withSession(s4.session)).catch((e: unknown) => e);
      expect(caught).toBeInstanceOf(AuthUnavailableError);
      expect(caught).not.toBeInstanceOf(OAuthError);
      expect((caught as AuthUnavailableError).statusCode).toBe(503);
      core.state.refreshError = null;
    }
  });

  it("przepełnienie rozmiaru ciasteczka po rotacji zrzuca inne tokeny zasobów i ratuje sesję", async () => {
    const extraResources = [RESOURCE, CORE_API, "https://api-3.example.test", "https://api-4.example.test"] as [
      string,
      ...string[],
    ];
    const many = setupCookie({ resources: extraResources });
    const signed = await signInFlow(many);
    const current = await many.getSessionFromCookie(signed.session, { refresh: true });
    expect(current).not.toBeNull();

    // Pobieranie 2., 3. i 4. zasobu nie traci sesji mimo domyślnego limitu 3800 bajtów.
    const t2 = await current!.accessToken(CORE_API);
    const t3 = await current!.accessToken("https://api-3.example.test");
    const t4 = await current!.accessToken("https://api-4.example.test");
    expect(decodeJwt(t2).aud).toContain(CORE_API);
    expect(decodeJwt(t3).aud).toContain("https://api-3.example.test");
    expect(decodeJwt(t4).aud).toContain("https://api-4.example.test");

    // Ciasteczko po zrzuceniu nadmiarowych tokenów mieści się w limicie i sesja dalej się odświeża!
    const newestCookie = parseSetCookies(current!.setCookies).jar[SESSION] ?? "";
    expect(Buffer.byteLength(newestCookie, "utf8")).toBeLessThanOrEqual(3800);
    clock += 6 * MINUTE;
    const stillAlive = await many.authenticate(withSession(newestCookie));
    expect(stillAlive.setCookies).toHaveLength(1);

    // Przy logowaniu zbyt mały limit nadal rzuca czytelny błąd i sprząta token w Core.
    const tight = setupCookie({ maxCookieBytes: 500 });
    const start = await startSignIn(tight);
    const revokesBefore = core.calls.revoke;
    await expect(
      tight.callback(new Request(core.approve(start.location), { headers: { cookie: cookieHeader(start.jar) } })),
    ).rejects.toThrow(/przekracza limit 500 bajtów.*resources/i);
    expect(core.calls.revoke).toBe(revokesBefore + 1);
  });

  it("applySessionCookies działa na Response.redirect() z niemutowalnymi nagłówkami i podmienia istniejący Set-Cookie bez duplikatów", async () => {
    const { session } = await signInFlow();
    clock += 6 * MINUTE;
    const refreshed = await auth.authenticate(withSession(session));
    const expectedValue = parseSetCookies(refreshed.setCookies).jar[SESSION];

    // 1. Response.redirect() ma niemutowalne nagłówki — helper zwraca nową kopię z Location i Set-Cookie.
    const immutableRedirect = Response.redirect(`${APP}/gotowe`, 302);
    const appliedRedirect = applySessionCookies(immutableRedirect, refreshed);
    expect(appliedRedirect).not.toBe(immutableRedirect);
    expect(appliedRedirect.status).toBe(302);
    expect(appliedRedirect.headers.get("location")).toBe(`${APP}/gotowe`);
    expect(setCookies(appliedRedirect).jar[SESSION]).toBe(expectedValue);

    // 2. Istniejący Set-Cookie dla tej samej nazwy zostaje podmieniony (nie zduplikowany), inne ciasteczka zostają.
    const existing = new Response("ok", {
      headers: [
        ["Set-Cookie", "theme=dark; Path=/"],
        ["Set-Cookie", `${SESSION}=stare; Path=/; HttpOnly; Secure`],
      ],
    });
    const replaced = applySessionCookies(existing, refreshed);
    const allSetCookies = replaced.headers.getSetCookie();
    expect(allSetCookies).toHaveLength(2);
    expect(allSetCookies.filter((h) => h.startsWith(`${SESSION}=`))).toHaveLength(1);
    expect(setCookies(replaced).jar).toEqual({ theme: "dark", [SESSION]: expectedValue });
  });

  it("withAuth zawsze dołącza odświeżone ciasteczko — również na ścieżce błędu i własnym onError", async () => {
    const { session } = await signInFlow();
    clock += 6 * MINUTE;

    // 1. Handler rzuca AuthError (np. 403 z warstwy uprawnień) -> 403 JSON + obrócone ciasteczko!
    const res403 = await auth.withAuth(withSession(session), () => {
      throw new AuthError("PERMISSION_DENIED", "Brak uprawnień do wpisu");
    });
    expect(res403.status).toBe(403);
    expect(await res403.json()).toEqual({
      data: null,
      meta: { requestId: expect.stringMatching(/^req_/) },
      error: { code: "PERMISSION_DENIED", message: "Brak uprawnień do wpisu", details: [] },
    });
    const rotatedAfter403 = setCookies(res403).jar[SESSION] ?? "";
    expect(rotatedAfter403).toBeTruthy();

    // 2. Handler wywołuje accessToken(CORE_API) (rotacja!) i rzuca błąd domenowy obsłużony w onError -> ciasteczko zachowane.
    const resCustom = await auth.withAuth(
      withSession(rotatedAfter403),
      async (result) => {
        if (result.via === "session") await result.session.accessToken(CORE_API);
        throw new Error("VALIDATION_FAILED");
      },
      {
        onError: () => Response.json({ data: null, meta: {}, error: { code: "VALIDATION" } }, { status: 422 }),
      },
    );
    expect(resCustom.status).toBe(422);
    const rotatedAfter422 = setCookies(resCustom).jar[SESSION] ?? "";
    expect(rotatedAfter422).toBeTruthy();
    expect(rotatedAfter422).not.toBe(rotatedAfter403);

    // 3. Brak sesji -> czyste 401 JSON bez Set-Cookie.
    const res401 = await auth.withAuth(
      new Request(`${APP}/api/v1/me`, { headers: { "x-request-id": "req_od_klienta" } }),
      () => Response.json({ ok: true }),
    );
    expect(res401.status).toBe(401);
    expect(((await res401.json()) as { meta: { requestId: string } }).meta.requestId).toBe("req_od_klienta");
    expect(res401.headers.getSetCookie()).toEqual([]);
  });

  it("wiązanie ciasteczka z aplikacją: ciasteczko z innego clientId, originu lub nazwy przy tym samym sekrecie jest odrzucane", async () => {
    const { session, transactionJar } = await signInFlow();

    // Inny clientId z tym samym sekretem.
    const otherClient = setupCookie({ clientId: "other-web", clientSecret: "other-client-secret" });
    expect(await otherClient.getSessionFromCookie(session)).toBeNull();

    // Inny origin aplikacji z tym samym sekretem.
    const otherOrigin = setupCookie({ appUrl: "https://admin.example.test" });
    expect(await otherOrigin.getSessionFromCookie(session)).toBeNull();

    // Inna nazwa ciasteczka z tym samym sekretem.
    const otherName = setupCookie({ cookieName: "__Host-other-session" });
    expect(await otherName.getSessionFromCookie(session)).toBeNull();

    // Ciasteczko transakcji OAuth z jednej aplikacji nie otworzy się w drugiej (nawet w trybie store).
    const otherStore = setupStore(memorySessionStore(), {
      clientId: "other-web",
      clientSecret: "other-client-secret",
    });
    const callbackAttempt = await otherStore.callback(
      new Request(`${APP}/api/auth/callback?state=x&iss=${encodeURIComponent(ISSUER)}&code=c`, {
        headers: { cookie: cookieHeader(transactionJar) },
      }),
    );
    expect(new URL(callbackAttempt.headers.get("location") ?? "").searchParams.get("auth_error")).toBe("expired");
  });

  it("nieprawidłowy nagłówek Authorization daje 401 nawet przy ważnym ciasteczku sesji", async () => {
    const { session } = await signInFlow();
    for (const badAuth of ["Basic xyz", "Bearer ", "Bearer", "Bearer a b", "Token abc"]) {
      await expect(
        auth.authenticate(withSession(session, { headers: { authorization: badAuth } })),
      ).rejects.toMatchObject({
        name: "AuthError",
        code: "UNAUTHENTICATED",
        statusCode: 401,
      });
    }
    // Ważny nagłówek Bearer działa nadal i ma via: "bearer", session: null.
    const bearer = await auth.authenticate(
      withSession(session, { headers: { authorization: `Bearer ${await core.token()}` } }),
    );
    expect(bearer.via).toBe("bearer");
    expect(bearer.session).toBeNull();
    expect(bearer.setCookies).toEqual([]);
  });

  it("unseal odrzuca wejście dłuższe niż 8192 znaki od razu bez parsowania", async () => {
    const sealer = createSealer([SECRET], "test-limit");
    const overlong = "a".repeat(8193);
    expect(await sealer.unseal(overlong)).toBeNull();
    expect(await auth.getSessionFromCookie(overlong)).toBeNull();
    await expect(auth.authenticate(withSession(overlong))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      statusCode: 401,
    });
  });

  it("odrzuca podrobione, uszkodzone, przeterminowane i zaszyfrowane obcym kluczem ciasteczka bez wycieku wyjątku", async () => {
    const { session, transactionJar } = await signInFlow();
    const tampered = `${session.slice(0, -4)}AAAA`;
    const otherSecret = setupCookie({ secret: "zupelnie-inny-sekret-sesji-dluzszy-niz-32-znaki" });
    const transactionCookieValue = transactionJar[TRANSACTION] ?? "";

    for (const bad of [tampered, "nie-jwe", "", "a.b.c.d.e", transactionCookieValue]) {
      expect(await auth.getSessionFromCookie(bad)).toBeNull();
      await expect(auth.authenticate(withSession(bad))).rejects.toBeInstanceOf(AuthError);
    }

    expect(await otherSecret.getSessionFromCookie(session)).toBeNull();
    await expect(otherSecret.authenticate(withSession(session))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      statusCode: 401,
    });

    clock += 31 * DAY;
    expect(await auth.getSessionFromCookie(session)).toBeNull();
    expect(core.calls.refresh).toBe(0);
  });

  it("wymiana sekretu: stary klucz nadal otwiera ciasteczka, nowy szyfruje nowe i odświeżone", async () => {
    const OLD = SECRET;
    const NEW = "nowy-sekret-sesji-rowniez-dluzszy-niz-32-znaki";

    const oldAuth = setupCookie({ secret: OLD });
    const rotatedAuth = setupCookie({ secret: [NEW, OLD] });
    const newOnlyAuth = setupCookie({ secret: NEW });

    const { session: oldCookie } = await signInFlow(oldAuth);

    expect(await rotatedAuth.getSessionFromCookie(oldCookie)).not.toBeNull();
    expect(await newOnlyAuth.getSessionFromCookie(oldCookie)).toBeNull();

    clock += 6 * MINUTE;
    const refreshed = await rotatedAuth.authenticate(withSession(oldCookie));
    const reencryptedCookie = parseSetCookies(refreshed.setCookies).jar[SESSION] ?? "";
    expect(await newOnlyAuth.getSessionFromCookie(reencryptedCookie)).not.toBeNull();
    expect(await oldAuth.getSessionFromCookie(reencryptedCookie)).toBeNull();

    const { session: newCookie } = await signInFlow(rotatedAuth);
    expect(await newOnlyAuth.getSessionFromCookie(newCookie)).not.toBeNull();
    expect(await oldAuth.getSessionFromCookie(newCookie)).toBeNull();
  });

  it("wylogowanie wymaga POST z adresu aplikacji, czyści pamięć podręczną procesu i działa przy niedostępnym Core", async () => {
    const { session: oldCookie } = await signInFlow();
    expect((await auth.signOut(withSession(oldCookie, { url: `${APP}/api/auth/sign-out` }))).status).toBe(405);
    const foreign = await auth.signOut(
      withSession(oldCookie, {
        url: `${APP}/api/auth/sign-out`,
        method: "POST",
        headers: { origin: "https://zly.example" },
      }),
    );
    expect(foreign.status).toBe(403);
    expect(core.calls.revoke).toBe(0);

    // Po odświeżeniu wylogowanie nawet ze starszym ciasteczkiem unieważnia najnowszy token i czyści pamięć procesu.
    clock += 6 * MINUTE;
    const refreshed = await auth.authenticate(withSession(oldCookie));
    const rotatedCookie = parseSetCookies(refreshed.setCookies).jar[SESSION] ?? "";
    const out = await auth.signOut(
      withSession(oldCookie, { url: `${APP}/api/auth/sign-out`, method: "POST", headers: { origin: APP } }),
    );
    expect(out.status).toBe(303);
    expect(setCookies(out).raw[SESSION]).toContain("Max-Age=0");
    expect(core.calls.revoke).toBe(1);

    clock += 6 * MINUTE;
    expect(await auth.getSession(withSession(rotatedCookie))).toBeNull();

    // Gdy Core jest niedostępny, wylogowanie i tak zwraca 303 i czyści ciasteczko.
    const { session: s2 } = await signInFlow();
    core.state.down = true;
    const outDown = await auth.signOut(
      withSession(s2, { url: `${APP}/api/auth/sign-out`, method: "POST", headers: { origin: APP } }),
    );
    expect(outDown.status).toBe(303);
    expect(setCookies(outDown).raw[SESSION]).toContain("Max-Age=0");
  });

  it("zachowuje ochronę CSRF w authenticate", async () => {
    const { session } = await signInFlow();
    await expect(
      auth.authenticate(withSession(session, { method: "POST", headers: { origin: "https://zly.example" } })),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED", statusCode: 403 });
    expect((await auth.authenticate(withSession(session, { method: "POST", headers: { origin: APP } }))).via).toBe(
      "session",
    );
  });
});
