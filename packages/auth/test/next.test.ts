import { decodeJwt } from "jose";
import { beforeEach, describe, expect, it } from "vitest";
import { AuthUnavailableError } from "../src/index.js";
import { createWebAuth, memorySessionStore, type WebAuth } from "../src/next.js";
import {
  ACCOUNT_ID,
  APP,
  CLIENT_ID,
  CLIENT_SECRET,
  CORE_API,
  createFakeCore,
  ISSUER,
  ORGANIZATION_ID,
  RESOURCE,
  SECRET,
  type FakeCore,
} from "./fake-core.js";

const SESSION = "__Host-monorise-session";
const TRANSACTION = "__Host-monorise-oauth";
const MINUTE = 60_000;

let core: FakeCore;
let store: ReturnType<typeof memorySessionStore>;
let clock: number;
let auth: WebAuth;

function setup(secret: string | string[] = SECRET): WebAuth {
  return createWebAuth({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    appUrl: APP,
    resources: [RESOURCE, CORE_API],
    secret,
    store,
    keys: core.keys,
    fetch: core.fetch,
    now: () => clock,
  });
}

beforeEach(async () => {
  core = await createFakeCore();
  store = memorySessionStore();
  clock = Date.now();
  auth = setup();
});

type Jar = Record<string, string>;

function setCookies(response: Response): { jar: Jar; raw: Record<string, string> } {
  const jar: Jar = {};
  const raw: Record<string, string> = {};
  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(";")[0] ?? "";
    const name = pair.slice(0, pair.indexOf("="));
    jar[name] = pair.slice(pair.indexOf("=") + 1);
    raw[name] = header;
  }
  return { jar, raw };
}

const cookieHeader = (jar: Jar) =>
  Object.entries(jar)
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

async function startSignIn(query = "") {
  const response = await auth.signIn(new Request(`${APP}/api/auth/sign-in${query}`));
  return { response, location: response.headers.get("location") ?? "", ...setCookies(response) };
}

async function signInFlow(returnTo = "/skrzynka") {
  const start = await startSignIn(`?returnTo=${encodeURIComponent(returnTo)}`);
  const callback = core.approve(start.location);
  const done = await auth.callback(new Request(callback, { headers: { cookie: cookieHeader(start.jar) } }));
  const finished = setCookies(done);
  return {
    done,
    location: done.headers.get("location") ?? "",
    session: finished.jar[SESSION] ?? "",
    raw: finished.raw,
  };
}

const withSession = (session: string, init: RequestInit & { url?: string } = {}) =>
  new Request(init.url ?? `${APP}/api/v1/me`, {
    ...init,
    headers: { cookie: `${SESSION}=${session}`, ...(init.headers as Record<string, string>) },
  });

describe("logowanie w przeglądarce przez Core (BFF)", () => {
  it("przekierowuje do Core z PKCE, stanem, nonce i oboma API", async () => {
    const start = await startSignIn("?returnTo=/skrzynka");
    expect(start.response.status).toBe(302);
    const url = new URL(start.location);
    expect(`${url.origin}${url.pathname}`).toBe(`${ISSUER}/api/auth/oauth2/authorize`);
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(`${APP}/api/auth/callback`);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("nonce")).toBeTruthy();
    expect(url.searchParams.getAll("resource")).toEqual([RESOURCE, CORE_API]);
    expect(start.raw[TRANSACTION]).toMatch(/HttpOnly; SameSite=Lax; Secure; Max-Age=600$/);
    // W ciasteczku jest tylko szyfrogram: ani weryfikatora PKCE, ani stanu nie da się odczytać.
    expect(start.jar[TRANSACTION]).not.toContain(url.searchParams.get("state"));
  });

  it("po powrocie z Core zakłada sesję i wraca pod returnTo", async () => {
    const { done, location, session, raw } = await signInFlow("/skrzynka?folder=INBOX");
    expect(done.status).toBe(302);
    expect(location).toBe(`${APP}/skrzynka?folder=INBOX`);
    expect(raw[SESSION]).toMatch(/Path=\/; HttpOnly; SameSite=Lax; Secure; Expires=/);
    expect(raw[TRANSACTION]).toContain("Max-Age=0");
    expect(store.size).toBe(1);
    // W bazie jest skrót identyfikatora, a nie wartość z ciasteczka.
    expect(await store.get(session)).toBeNull();

    const current = await auth.getSession(withSession(session));
    expect(current?.context).toMatchObject({ accountId: ACCOUNT_ID, organizationId: ORGANIZATION_ID });
    expect(current?.profile).toEqual({ email: "anna@acme.test", name: "Anna Kowalska" });
    expect(decodeJwt(await current!.accessToken()).aud).toContain(RESOURCE);
    expect(core.calls.token).toBe(1);
  });

  it("odrzuca powrót z innym stanem, od innego wystawcy, bez ciasteczka i po 10 minutach", async () => {
    const tries = [
      { name: "state", callback: (location: string) => core.approve(location, { state: "obcy" }), jar: true },
      {
        name: "issuer",
        callback: (location: string) => core.approve(location, { iss: "https://zly.example" }),
        jar: true,
      },
      { name: "expired", callback: (location: string) => core.approve(location), jar: false },
    ];
    for (const attempt of tries) {
      const start = await startSignIn();
      const response = await auth.callback(
        new Request(attempt.callback(start.location), {
          headers: { cookie: attempt.jar ? cookieHeader(start.jar) : "" },
        }),
      );
      expect(new URL(response.headers.get("location") ?? "").searchParams.get("auth_error")).toBe(attempt.name);
    }

    const late = await startSignIn();
    clock += 11 * MINUTE;
    const response = await auth.callback(
      new Request(core.approve(late.location), { headers: { cookie: cookieHeader(late.jar) } }),
    );
    expect(new URL(response.headers.get("location") ?? "").searchParams.get("auth_error")).toBe("expired");
    expect(core.calls.token).toBe(0);
    expect(store.size).toBe(0);
  });

  it("po zalogowaniu nie przekierowuje poza aplikację", async () => {
    for (const returnTo of ["//zly.example/x", "https://zly.example", "/\\zly.example", "zly", "/\t/zly.example"]) {
      const { location } = await signInFlow(returnTo);
      expect(location).toBe(`${APP}/`);
    }
  });

  it("po 5 minutach odświeża tokeny raz, nawet przy równoczesnych żądaniach", async () => {
    const { session } = await signInFlow();
    clock += 6 * MINUTE;
    const sessions = await Promise.all([1, 2, 3].map(() => auth.getSession(withSession(session))));
    expect(sessions.every((current) => current !== null)).toBe(true);
    expect(core.calls.refresh).toBe(1);

    // Token dla Core API z tej samej sesji (logowanie objęło oba API).
    const coreToken = await sessions[0]!.accessToken(CORE_API);
    expect(decodeJwt(coreToken).aud).toContain(CORE_API);
    expect(core.calls.refresh).toBe(2);
    expect(await sessions[1]!.accessToken(CORE_API)).toBe(coreToken);
    expect(core.calls.refresh).toBe(2);
  });

  it("kończy sesję, gdy Core nie przedłuża tokenów (np. dezaktywacja konta)", async () => {
    const { session } = await signInFlow();
    core.state.accountDeactivated = true;
    clock += 6 * MINUTE;
    expect(await auth.getSession(withSession(session))).toBeNull();
    expect(store.size).toBe(0);
  });

  it("przy niedostępnym Core zgłasza 503 i nie kasuje sesji", async () => {
    const { session } = await signInFlow();
    core.state.down = true;
    clock += 6 * MINUTE;
    await expect(auth.getSession(withSession(session))).rejects.toBeInstanceOf(AuthUnavailableError);
    expect(store.size).toBe(1);
  });

  it("wylogowuje tylko żądaniem POST z adresu aplikacji i unieważnia token w Core", async () => {
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
    expect(store.size).toBe(1);

    const out = await auth.signOut(
      withSession(session, { url: `${APP}/api/auth/sign-out`, method: "POST", headers: { origin: APP } }),
    );
    expect(out.status).toBe(303);
    expect(out.headers.get("location")).toBe(`${APP}/`);
    expect(setCookies(out).raw[SESSION]).toContain("Max-Age=0");
    expect(store.size).toBe(0);
    expect(core.calls.revoke).toBe(1);
  });

  it("nowe logowanie w tej samej przeglądarce usuwa poprzednią sesję", async () => {
    const first = await signInFlow();
    const start = await startSignIn();
    const callback = core.approve(start.location);
    await auth.callback(
      new Request(callback, { headers: { cookie: `${cookieHeader(start.jar)}; ${SESSION}=${first.session}` } }),
    );
    expect(store.size).toBe(1);
    expect(await auth.getSession(withSession(first.session))).toBeNull();
  });

  it("nowy sekret odczytuje sesje, dopóki stary jest na liście", async () => {
    const { session } = await signInFlow();
    const NEW = "nowy-sekret-sesji-rowniez-dluzszy-niz-32-znaki";
    expect(await setup([NEW, SECRET]).getSession(withSession(session))).not.toBeNull();
    expect(await setup(NEW).getSession(withSession(session))).toBeNull();
    expect(() => setup("za-krotki")).toThrow(/32 znaki/);
  });
});

describe("kto pyta w trasie API", () => {
  it("przyjmuje token z aplikacji na telefon i komputer, ale tylko dla API produktu", async () => {
    const result = await auth.authenticate(
      new Request(`${APP}/api/v1/me`, { headers: { authorization: `Bearer ${await core.token()}` } }),
    );
    expect(result.via).toBe("bearer");
    expect(result.context.organizationId).toBe(ORGANIZATION_ID);
    await expect(
      auth.authenticate(
        new Request(`${APP}/api/v1/me`, {
          headers: { authorization: `Bearer ${await core.token({ audience: CORE_API })}` },
        }),
      ),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("przyjmuje sesję z ciasteczka, ale zmiany tylko z adresu aplikacji (CSRF)", async () => {
    const { session } = await signInFlow();
    expect((await auth.authenticate(withSession(session))).via).toBe("session");
    expect((await auth.authenticate(withSession(session, { method: "POST", headers: { origin: APP } }))).via).toBe(
      "session",
    );
    await expect(
      auth.authenticate(withSession(session, { method: "POST", headers: { origin: "https://zly.example" } })),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED", statusCode: 403 });
    await expect(auth.authenticate(withSession(session, { method: "DELETE" }))).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
    await expect(auth.authenticate(new Request(`${APP}/api/v1/me`))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      statusCode: 401,
    });
  });
});
