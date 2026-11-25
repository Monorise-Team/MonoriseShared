import { decodeJwt } from "jose";
import { beforeEach, describe, expect, it } from "vitest";
import { AuthError, AuthUnavailableError } from "../src/index.js";
import {
  applySessionCookies,
  createWebAuth,
  forwardSessionCookie,
  memorySessionStore,
  type WebAuth,
  type WebAuthOptions,
} from "../src/next.js";
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

beforeEach(async () => {
  core = await createFakeCore();
  clock = Date.now();
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

describe("wybór trybu sesji w createWebAuth", () => {
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
    expect(authenticated.setCookies).toEqual([]);
    expect(authenticated.session?.setCookies).toEqual([]);
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
    expect(result.setCookies).toEqual([]);
    expect(result.context).toMatchObject({
      accountId: ACCOUNT_ID,
      organizationId: ORGANIZATION_ID,
      employeeId: EMPLOYEE_ID,
    });
    expect(result.session?.profile).toEqual({ email: "anna@acme.test", name: "Anna Kowalska" });
    expect(decodeJwt(await result.session!.accessToken()).aud).toContain(RESOURCE);
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

  it("odświeżenie w session.accessToken(CORE_API) aktualizuje setCookies do najnowszego ciasteczka", async () => {
    const { session: initialCookie } = await signInFlow();
    const result = await auth.authenticate(withSession(initialCookie));
    // Świeża sesja po logowaniu nie generuje jeszcze Set-Cookie.
    expect(result.setCookies).toEqual([]);
    const { setCookies: destructured } = result;

    // Pierwsze pobranie tokenu dla drugiego zasobu (CORE_API) rotuje token odświeżania w Core.
    const coreToken = await result.session!.accessToken(CORE_API);
    expect(decodeJwt(coreToken).aud).toContain(CORE_API);
    expect(core.calls.refresh).toBe(1);
    expect(result.setCookies).toHaveLength(1);
    expect(destructured).toHaveLength(1);
    expect(result.session?.setCookies).toEqual(result.setCookies);

    // Nowe ciasteczko zawiera oba tokeny i nowy token odświeżania.
    const updatedCookie = parseSetCookies(result.setCookies).jar[SESSION] ?? "";
    const secondRequest = await auth.authenticate(withSession(updatedCookie));
    expect(secondRequest.setCookies).toEqual([]);
    expect(await secondRequest.session!.accessToken(CORE_API)).toBe(coreToken);
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

    // Proxy przekazuje nagłówki do Server Componentu i odsyła Set-Cookie do przeglądarki.
    const forwardedHeaders = forwardSessionCookie(incoming, proxySession);
    expect(forwardedHeaders.get("cookie")).toContain("theme=dark");
    expect(forwardedHeaders.get("cookie")).not.toContain(staleCookie);

    const serverComponentRequest = new Request(`${APP}/ustawienia`, { headers: forwardedHeaders });
    const scSession = await auth.getSession(serverComponentRequest);
    expect(scSession?.context.accountId).toBe(ACCOUNT_ID);
    expect(scSession?.setCookies).toEqual([]);
    // Server Component odczytał już świeżą sesję bez wywoływania Core.
    expect(core.calls.refresh).toBe(1);
  });

  it("równoczesne żądania w jednym procesie odświeżają sesję tylko raz i wszystkie dostają nowe ciasteczko", async () => {
    const { session: staleCookie } = await signInFlow();
    clock += 6 * MINUTE;

    const results = await Promise.all([1, 2, 3].map(() => auth.authenticate(withSession(staleCookie))));
    expect(core.calls.refresh).toBe(1);
    expect(results.every((r) => r.setCookies.length === 1)).toBe(true);
    // Wszystkie równoczesne odpowiedzi odsyłają dokładnie ten sam nowy szyfrogram.
    const cookies = results.map((r) => parseSetCookies(r.setCookies).jar[SESSION]);
    expect(new Set(cookies).size).toBe(1);

    // Równoczesne pobranie CORE_API z tych sesji także wywołuje Core tylko raz.
    const coreTokens = await Promise.all(results.map((r) => r.session!.accessToken(CORE_API)));
    expect(core.calls.refresh).toBe(2);
    expect(new Set(coreTokens).size).toBe(1);
    expect(results.every((r) => r.setCookies.length === 1)).toBe(true);
    const updatedCookies = results.map((r) => parseSetCookies(r.setCookies).jar[SESSION]);
    expect(new Set(updatedCookies).size).toBe(1);
    expect(updatedCookies[0]).not.toBe(cookies[0]);
  });

  it("równoczesne żądania tej samej sesji o różne zasoby kolejkują się i nie powodują ponownego użycia starego tokenu", async () => {
    const { session: initialCookie } = await signInFlow();
    const [r1, r2] = await Promise.all([
      auth.authenticate(withSession(initialCookie)),
      auth.authenticate(withSession(initialCookie)),
    ]);

    // Po 6 minutach oba zasoby wymagają odświeżenia; dwa żądania proszą równocześnie o inne zasoby.
    clock += 6 * MINUTE;
    const [primaryToken, coreToken] = await Promise.all([
      r1.session!.accessToken(RESOURCE),
      r2.session!.accessToken(CORE_API),
    ]);
    expect(decodeJwt(primaryToken).aud).toContain(RESOURCE);
    expect(decodeJwt(coreToken).aud).toContain(CORE_API);
    // Drugie odświeżenie użyło obróconego tokenu odświeżania z pierwszego — rodzina tokenów w Core działa dalej.
    expect(core.calls.refresh).toBe(2);
    const newestCookie = parseSetCookies(r2.setCookies).jar[SESSION] ?? "";
    clock += 6 * MINUTE;
    const afterRefresh = await auth.authenticate(withSession(newestCookie));
    expect(afterRefresh.setCookies).toHaveLength(1);
    expect(core.calls.refresh).toBe(3);
  });

  it("wyścig dwóch osobnych procesów z tym samym starym ciasteczkiem kończy się czystym 401 dla przegrywającego", async () => {
    const instanceA = setupCookie();
    const instanceB = setupCookie();
    const { session: staleCookie } = await signInFlow(instanceA);
    clock += 6 * MINUTE;

    // Instancja A wygrywa i rotuje token odświeżania w Core.
    const winner = await instanceA.authenticate(withSession(staleCookie));
    expect(winner.setCookies).toHaveLength(1);

    // Instancja B (osobny proces bez wspólnej pamięci) dostaje invalid_grant z Core -> czyste 401.
    await expect(instanceB.authenticate(withSession(staleCookie))).rejects.toMatchObject({
      name: "AuthError",
      code: "UNAUTHENTICATED",
      statusCode: 401,
    });
    expect(await instanceB.getSession(withSession(staleCookie))).toBeNull();
  });

  it("wylogowanie wymaga POST z adresu aplikacji, unieważnia token w Core i czyści ciasteczko", async () => {
    const { session } = await signInFlow();
    expect((await auth.signOut(withSession(session, { url: `${APP}/api/auth/sign-out` }))).status).toBe(405);
    const foreign = await auth.signOut(
      withSession(session, {
        url: `${APP}/api/auth/sign-out`,
        method: "POST",
        headers: { origin: "https://zly.example" },
      }),
    );
    expect(foreign.status).toBe(403);
    expect(core.calls.revoke).toBe(0);

    const out = await auth.signOut(
      withSession(session, { url: `${APP}/api/auth/sign-out`, method: "POST", headers: { origin: APP } }),
    );
    expect(out.status).toBe(303);
    expect(out.headers.get("location")).toBe(`${APP}/`);
    expect(setCookies(out).raw[SESSION]).toContain("Max-Age=0");
    expect(core.calls.revoke).toBe(1);

    // Po wygaśnięciu tokenu dostępu unieważniony token odświeżania zostaje odrzucony przez Core.
    clock += 6 * MINUTE;
    expect(await auth.getSession(withSession(session))).toBeNull();
  });

  it("wylogowanie po odświeżeniu czyści pamięć podręczną procesu i unieważnia najnowszy token odświeżania", async () => {
    const { session: oldCookie } = await signInFlow();
    clock += 6 * MINUTE;
    const refreshed = await auth.authenticate(withSession(oldCookie));
    const rotatedCookie = parseSetCookies(refreshed.setCookies).jar[SESSION] ?? "";

    // Wylogowanie nawet ze starszym ciasteczkiem usuwa wpis z pamięci podręcznej i unieważnia nowy token.
    const out = await auth.signOut(
      withSession(oldCookie, { url: `${APP}/api/auth/sign-out`, method: "POST", headers: { origin: APP } }),
    );
    expect(out.status).toBe(303);
    expect(core.calls.revoke).toBe(1);

    // Stare ciasteczko nie dostanie już sesji z pamięci podręcznej procesu.
    expect(await auth.getSession(withSession(oldCookie))).toBeNull();
    // Nowy token odświeżania z obróconego ciasteczka też jest unieważniony w Core.
    clock += 6 * MINUTE;
    expect(await auth.getSession(withSession(rotatedCookie))).toBeNull();
  });

  it("wylogowanie czyści ciasteczko nawet wtedy, gdy Core jest chwilowo niedostępny", async () => {
    const { session } = await signInFlow();
    core.state.down = true;
    const out = await auth.signOut(
      withSession(session, { url: `${APP}/api/auth/sign-out`, method: "POST", headers: { origin: APP } }),
    );
    expect(out.status).toBe(303);
    expect(setCookies(out).raw[SESSION]).toContain("Max-Age=0");
  });

  it("nowe logowanie w tej samej przeglądarce unieważnia token odświeżania poprzedniej sesji", async () => {
    const first = await signInFlow();
    const start = await startSignIn();
    const callback = core.approve(start.location);
    const second = await auth.callback(
      new Request(callback, { headers: { cookie: `${cookieHeader(start.jar)}; ${SESSION}=${first.session}` } }),
    );
    expect(second.status).toBe(302);
    expect(core.calls.revoke).toBe(1);

    clock += 6 * MINUTE;
    expect(await auth.getSession(withSession(first.session))).toBeNull();
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

    // Obcy klucz szyfrujący.
    expect(await otherSecret.getSessionFromCookie(session)).toBeNull();
    await expect(otherSecret.authenticate(withSession(session))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      statusCode: 401,
    });

    // Sesja po upływie 30 dni (bez wywoływania Core).
    clock += 31 * DAY;
    expect(await auth.getSessionFromCookie(session)).toBeNull();
    expect(core.calls.refresh).toBe(0);
  });

  it("pilnuje limitu rozmiaru zaszyfrowanego ciasteczka przy logowaniu i odświeżaniu", async () => {
    // 1. Przekroczenie limitu przy logowaniu (np. zbyt mały limit albo za duży ładunek).
    const tight = setupCookie({ maxCookieBytes: 500 });
    const start = await startSignIn(tight);
    const callback = core.approve(start.location);
    await expect(
      tight.callback(new Request(callback, { headers: { cookie: cookieHeader(start.jar) } })),
    ).rejects.toThrow(/przekracza limit 500 bajtów.*resources/i);
    // Token odświeżania wydany przy odrzuconym logowaniu jest sprzątany w Core.
    expect(core.calls.revoke).toBe(1);

    // 2. Domyślny limit 3800 bajtów przy zbyt dużej liczbie zasobów.
    const extraResources = [
      RESOURCE,
      CORE_API,
      "https://api-3.example.test",
      "https://api-4.example.test",
      "https://api-5.example.test",
      "https://api-6.example.test",
    ] as [string, ...string[]];
    const many = setupCookie({ resources: extraResources });
    const signed = await signInFlow(many);
    const current = await many.getSessionFromCookie(signed.session);
    expect(current).not.toBeNull();

    let tooLargeError: unknown;
    try {
      for (const res of extraResources.slice(1)) {
        await current!.accessToken(res);
      }
    } catch (error) {
      tooLargeError = error;
    }
    expect(tooLargeError).toBeInstanceOf(Error);
    expect((tooLargeError as Error).message).toMatch(/przekracza limit 3800 bajtów.*resources/i);
  });

  it("wymiana sekretu: stary klucz nadal otwiera ciasteczka, nowy szyfruje nowe i odświeżone", async () => {
    const OLD = SECRET;
    const NEW = "nowy-sekret-sesji-rowniez-dluzszy-niz-32-znaki";

    const oldAuth = setupCookie({ secret: OLD });
    const rotatedAuth = setupCookie({ secret: [NEW, OLD] });
    const newOnlyAuth = setupCookie({ secret: NEW });

    const { session: oldCookie } = await signInFlow(oldAuth);

    // Stary klucz nadal otwiera się po dodaniu nowego na początek listy.
    expect(await rotatedAuth.getSessionFromCookie(oldCookie)).not.toBeNull();
    // Sam nowy klucz nie otworzy starego ciasteczka.
    expect(await newOnlyAuth.getSessionFromCookie(oldCookie)).toBeNull();

    // Odświeżenie w trybie [NEW, OLD] ponownie szyfruje ciasteczko już nowym kluczem.
    clock += 6 * MINUTE;
    const refreshed = await rotatedAuth.authenticate(withSession(oldCookie));
    const reencryptedCookie = parseSetCookies(refreshed.setCookies).jar[SESSION] ?? "";
    expect(await newOnlyAuth.getSessionFromCookie(reencryptedCookie)).not.toBeNull();
    expect(await oldAuth.getSessionFromCookie(reencryptedCookie)).toBeNull();

    // Nowe logowanie w trybie [NEW, OLD] od razu szyfruje nowym kluczem.
    const { session: newCookie } = await signInFlow(rotatedAuth);
    expect(await newOnlyAuth.getSessionFromCookie(newCookie)).not.toBeNull();
    expect(await oldAuth.getSessionFromCookie(newCookie)).toBeNull();
  });

  it("przy niedostępnym Core zgłasza 503, a przy dezaktywacji konta kończy sesję", async () => {
    const { session } = await signInFlow();
    clock += 6 * MINUTE;

    core.state.down = true;
    await expect(auth.authenticate(withSession(session))).rejects.toBeInstanceOf(AuthUnavailableError);

    core.state.down = false;
    core.state.accountDeactivated = true;
    expect(await auth.getSession(withSession(session))).toBeNull();
    await expect(auth.authenticate(withSession(session))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      statusCode: 401,
    });
  });

  it("zachowuje ochronę CSRF i obsługę nagłówka Authorization: Bearer w authenticate", async () => {
    const { session } = await signInFlow();
    const bearer = await auth.authenticate(
      new Request(`${APP}/api/v1/me`, { headers: { authorization: `Bearer ${await core.token()}` } }),
    );
    expect(bearer.via).toBe("bearer");
    expect(bearer.setCookies).toEqual([]);

    await expect(
      auth.authenticate(withSession(session, { method: "POST", headers: { origin: "https://zly.example" } })),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED", statusCode: 403 });
    expect((await auth.authenticate(withSession(session, { method: "POST", headers: { origin: APP } }))).via).toBe(
      "session",
    );
  });
});
