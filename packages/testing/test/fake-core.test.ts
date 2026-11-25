import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { uuidv7 } from "@monorise-team/events";
import { can, permissionSnapshotSchema, scopeOf } from "@monorise-team/permissions";
import { describe, expect, it } from "vitest";
import {
  CORE_DIRECTORY_READ_SCOPE,
  CORE_PERMISSIONS_READ_SCOPE,
  CORE_PERMISSIONS_REGISTER_SCOPE,
  createFakeCore,
} from "../src/index.js";

const ISSUER = "https://auth.core.test";
const CORE_API = "https://api.core.test";

async function fetchMachineToken(
  fakeCore: Awaited<ReturnType<typeof createFakeCore>>,
  scope: string,
  overrides: { clientId?: string; clientSecret?: string; resource?: string } = {},
): Promise<string> {
  const response = await fakeCore.fetch(`${ISSUER}/api/auth/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: overrides.clientId ?? "timotime-web",
      client_secret: overrides.clientSecret ?? "sekret-timotime",
      resource: overrides.resource ?? CORE_API,
      scope,
    }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
  };
  expect(body.token_type).toBe("Bearer");
  expect(body.expires_in).toBe(300);
  expect(body.scope).toBe(scope);
  return body.access_token;
}

describe("createFakeCore — OAuth, JWKS i /core/v1/me", () => {
  it("udostępnia JWKS i wydaje token maszynowy client_credentials tylko dla poprawnych danych i zakresów", async () => {
    const core = await createFakeCore({
      issuer: ISSUER,
      coreApiUrl: CORE_API,
      products: [
        {
          key: "timotime",
          clientId: "timotime-web",
          clientSecret: "sekret-timotime",
        },
      ],
    });

    const jwksRes = await core.fetch(`${ISSUER}/api/auth/jwks`);
    expect(jwksRes.status).toBe(200);
    expect(await jwksRes.json()).toEqual(core.issuer.jwks);

    // Błędny sekret -> 401 invalid_client
    const badSecret = await core.fetch(`${ISSUER}/api/auth/oauth2/token`, {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: "timotime-web",
        client_secret: "zly-sekret",
        resource: CORE_API,
        scope: CORE_PERMISSIONS_READ_SCOPE,
      }),
    });
    expect(badSecret.status).toBe(401);
    expect((await badSecret.json()) as { error: string }).toMatchObject({ error: "invalid_client" });

    // Błędny zasób -> 400 invalid_target
    const badResource = await core.fetch(`${ISSUER}/api/auth/oauth2/token`, {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: "timotime-web",
        client_secret: "sekret-timotime",
        resource: "https://inna-usluga.test",
        scope: CORE_PERMISSIONS_READ_SCOPE,
      }),
    });
    expect(badResource.status).toBe(400);
    expect((await badResource.json()) as { error: string }).toMatchObject({ error: "invalid_target" });

    // Niedozwolony zakres -> 400 invalid_scope
    const badScope = await core.fetch(`${ISSUER}/api/auth/oauth2/token`, {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: "timotime-web",
        client_secret: "sekret-timotime",
        resource: CORE_API,
        scope: "core:admin.all",
      }),
    });
    expect(badScope.status).toBe(400);
    expect((await badScope.json()) as { error: string }).toMatchObject({ error: "invalid_scope" });

    const token = await fetchMachineToken(core, `${CORE_PERMISSIONS_READ_SCOPE} ${CORE_DIRECTORY_READ_SCOPE}`);
    expect(token.split(".")).toHaveLength(3);
  });

  it("obsługuje GET /core/v1/me dla aktywnego konta i odrzuca konto DEACTIVATED oraz token maszynowy", async () => {
    const core = await createFakeCore({
      issuer: ISSUER,
      coreApiUrl: CORE_API,
      products: [{ key: "timotime", clientId: "timotime-web", clientSecret: "sekret-timotime" }],
    });

    const acme = core.organization({ name: "Acme", domain: "acme.test" });
    const anna = acme.addEmployee({
      firstName: "Anna",
      lastName: "Nowak",
      email: "anna@acme.test",
      jobTitle: "Specjalistka",
      isOwner: true,
    });
    const marek = acme.addEmployee({
      firstName: "Marek",
      lastName: "Wyłączony",
      accountStatus: "DEACTIVATED",
    });

    const annaToken = await acme.signUserToken(anna.accountId, { audience: CORE_API });
    const meRes = await core.fetch(`${CORE_API}/core/v1/me`, {
      headers: { Authorization: `Bearer ${annaToken}` },
    });
    expect(meRes.status).toBe(200);
    const meBody = (await meRes.json()) as { data: unknown; meta: { requestId: string }; error: null };
    expect(meBody.error).toBeNull();
    expect(meBody.meta.requestId).toMatch(/^req_/);
    expect(meBody.data).toEqual({
      account: { id: anna.accountId, email: "anna@acme.test", status: "ACTIVE", isOwner: true },
      employee: {
        id: anna.employeeId,
        accountId: anna.accountId,
        firstName: "Anna",
        lastName: "Nowak",
        workEmail: "anna@acme.test",
        jobTitle: "Specjalistka",
        status: "ACTIVE",
      },
      organization: { id: acme.id, name: "Acme", status: "ACTIVE" },
    });

    const marekToken = await acme.signUserToken(marek.accountId, { audience: CORE_API });
    const deactivatedRes = await core.fetch(`${CORE_API}/core/v1/me`, {
      headers: { Authorization: `Bearer ${marekToken}` },
    });
    expect(deactivatedRes.status).toBe(401);
    expect(((await deactivatedRes.json()) as { error: { code: string } }).error.code).toBe("ACCOUNT_DEACTIVATED");

    const machineToken = await fetchMachineToken(core, CORE_PERMISSIONS_READ_SCOPE);
    const machineOnMe = await core.fetch(`${CORE_API}/core/v1/me`, {
      headers: { Authorization: `Bearer ${machineToken}` },
    });
    expect(machineOnMe.status).toBe(401);
  });
});

describe("createFakeCore — migawka uprawnień zgodna z regułami Core", () => {
  it("odwzorowuje reguły Entitlement, AppAccess, Owner, filtrowania produktu, jednostek ARCHIVED oraz INVITED/DEACTIVATED", async () => {
    const core = await createFakeCore({
      issuer: ISSUER,
      coreApiUrl: CORE_API,
      products: [
        { key: "timotime", clientId: "timotime-web", clientSecret: "sekret-timotime" },
        { key: "kivotasks", clientId: "kivotasks-web", clientSecret: "sekret-kivotasks" },
      ],
    });

    // Scenariusz firmy Acme: Oddział Kraków -> Magazyn Kraków, Oddział Warszawa, archiwalny zespół
    const acme = core.organization({ name: "Acme", domain: "acme.test" });
    const krakow = acme.addUnit({ name: "Oddział Kraków", type: "BRANCH" });
    const magazyn = acme.addUnit({ name: "Magazyn Kraków", type: "TEAM", parentId: krakow.id });
    const warszawa = acme.addUnit({ name: "Oddział Warszawa", type: "BRANCH" });
    const archiwalny = acme.addUnit({
      name: "Stary Magazyn",
      type: "TEAM",
      parentId: krakow.id,
      status: "ARCHIVED",
    });

    acme.grantEntitlement("timotime");

    const owner = acme.addEmployee({ firstName: "Ewa", lastName: "Właścicielka", isOwner: true });
    const jan = acme.addEmployee({
      firstName: "Jan",
      lastName: "Kowalski",
      unitIds: [krakow.id],
      products: ["timotime"],
    });
    const bezAplikacji = acme.addEmployee({
      firstName: "Piotr",
      lastName: "BezAplikacji",
      unitIds: [warszawa.id],
      products: [],
    });
    const zaproszony = acme.addEmployee({
      firstName: "Karol",
      lastName: "Zaproszony",
      accountStatus: "INVITED",
      products: ["timotime"],
    });
    const wylaczony = acme.addEmployee({
      firstName: "Zofia",
      lastName: "Wyłączona",
      accountStatus: "DEACTIVATED",
      products: ["timotime"],
    });

    const kierownikRole = acme.addRole({
      name: "Kierownik",
      product: "timotime",
      permissions: ["timotime.entries.read", "timotime.entries.approve", "timotime.entries.legacy"],
    });
    const archivedRole = acme.addRole({
      name: "Stara rola",
      product: "timotime",
      permissions: ["timotime.reports.export"],
      archivedAt: new Date("2026-01-01T00:00:00Z"),
    });
    const otherProductRole = acme.addRole({
      name: "Zadania",
      product: "kivotasks",
      permissions: ["kivotasks.tasks.read"],
    });
    const coreRole = acme.addRole({
      name: "Admin Core",
      product: null,
      permissions: ["core.employees.manage"],
    });

    core.deprecatePermission("timotime", "timotime.entries.legacy");

    acme.assignRole({
      accountId: jan.accountId,
      roleId: kierownikRole.id,
      scope: { type: "UNIT", unitId: krakow.id },
      validFrom: "2026-01-01T00:00:00Z",
      validUntil: "2027-01-01T00:00:00Z",
    });
    acme.assignRole({
      accountId: jan.accountId,
      roleId: archivedRole.id,
      scope: { type: "ORGANIZATION" },
    });
    acme.assignRole({
      accountId: jan.accountId,
      roleId: otherProductRole.id,
      scope: { type: "ORGANIZATION" },
    });
    acme.assignRole({
      accountId: jan.accountId,
      roleId: coreRole.id,
      scope: { type: "ORGANIZATION" },
    });
    acme.assignRole({
      accountId: zaproszony.accountId,
      roleId: kierownikRole.id,
      scope: { type: "ORGANIZATION" },
    });
    acme.assignRole({
      accountId: wylaczony.accountId,
      roleId: kierownikRole.id,
      scope: { type: "ORGANIZATION" },
    });

    const machineToken = await fetchMachineToken(core, CORE_PERMISSIONS_READ_SCOPE);
    const getSnapshot = async (orgId: string, accountId: string) => {
      const res = await core.fetch(
        `${CORE_API}/core/v1/products/timotime/permission-snapshot?organizationId=${orgId}&accountId=${accountId}`,
        { headers: { Authorization: `Bearer ${machineToken}` } },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: unknown };
      return permissionSnapshotSchema.parse(body.data);
    };

    // 1. Jan: ma timotime, tylko aktywne uprawnienia timotime (bez legacy, bez archivedRole, bez kivotasks, bez core)
    const janSnap = await getSnapshot(acme.id, jan.accountId);
    expect(janSnap.products).toEqual(["timotime"]);
    expect(janSnap.grants.map((g) => g.permission).sort()).toEqual([
      "timotime.entries.approve",
      "timotime.entries.read",
    ]);
    // Jednostki obejmują też ARCHIVED
    expect(janSnap.units.map((u) => u.id)).toContain(archiwalny.id);
    expect(
      can(janSnap, "timotime.entries.read", { unitIds: [magazyn.id] }, { now: new Date("2026-06-01T00:00:00Z") }),
    ).toBe(true);
    expect(
      can(janSnap, "timotime.entries.read", { unitIds: [archiwalny.id] }, { now: new Date("2026-06-01T00:00:00Z") }),
    ).toBe(true);
    expect(
      can(janSnap, "timotime.entries.read", { unitIds: [warszawa.id] }, { now: new Date("2026-06-01T00:00:00Z") }),
    ).toBe(false);
    expect(scopeOf(janSnap, "timotime.entries.read", { now: new Date("2026-06-01T00:00:00Z") })).toEqual({
      type: "LIMITED",
      unitIds: [krakow.id, magazyn.id, archiwalny.id].sort(),
      resourceIds: [],
    });

    // 2. Owner z aktywnym Entitlement dostaje produkt nawet bez jawnego AppAccess
    const ownerSnap = await getSnapshot(acme.id, owner.accountId);
    expect(ownerSnap.isOwner).toBe(true);
    expect(ownerSnap.products).toEqual(["timotime"]);

    // 3. Konto bez AppAccess -> puste products
    const noAppSnap = await getSnapshot(acme.id, bezAplikacji.accountId);
    expect(noAppSnap.products).toEqual([]);

    // 4. INVITED i DEACTIVATED -> puste products i puste grants, ale drzewo jednostek zostaje
    for (const inactive of [zaproszony, wylaczony]) {
      const snap = await getSnapshot(acme.id, inactive.accountId);
      expect(snap.products).toEqual([]);
      expect(snap.grants).toEqual([]);
      expect(snap.units.length).toBe(4);
    }

    // 5. Firma bez Entitlement -> nawet Owner ma puste products
    const noPlanOrg = core.organization({ name: "BezPlanu", domain: "bezplanu.test" });
    const noPlanOwner = noPlanOrg.addEmployee({ firstName: "Adam", lastName: "Nowy", isOwner: true });
    const noPlanSnap = await getSnapshot(noPlanOrg.id, noPlanOwner.accountId);
    expect(noPlanSnap.isOwner).toBe(true);
    expect(noPlanSnap.products).toEqual([]);

    // 6. Klient innego produktu nie może czytać migawki timotime -> 403 PERMISSION_DENIED
    const kivoToken = await fetchMachineToken(core, CORE_PERMISSIONS_READ_SCOPE, {
      clientId: "kivotasks-web",
      clientSecret: "sekret-kivotasks",
    });
    const forbidden = await core.fetch(
      `${CORE_API}/core/v1/products/timotime/permission-snapshot?organizationId=${acme.id}&accountId=${jan.accountId}`,
      { headers: { Authorization: `Bearer ${kivoToken}` } },
    );
    expect(forbidden.status).toBe(403);
    expect(((await forbidden.json()) as { error: { code: string } }).error.code).toBe("PERMISSION_DENIED");
  });
});

describe("createFakeCore — katalog (stronicowanie, filtry), rejestracja manifestów i serwer HTTP", () => {
  it("stronicuje /directory/unit-members i /directory/employees z kursorem oraz obsługuje powtarzalne filtry", async () => {
    const core = await createFakeCore({
      issuer: ISSUER,
      coreApiUrl: CORE_API,
      products: [{ key: "timotime", clientId: "timotime-web", clientSecret: "sekret-timotime" }],
    });

    const seeded = core.seedOrganization({
      name: "Acme",
      domain: "acme.test",
      entitlements: ["timotime"],
      units: [
        { key: "krakow", name: "Oddział Kraków", type: "BRANCH" },
        { key: "magazyn", name: "Magazyn Kraków", type: "TEAM", parentKey: "krakow" },
        { key: "warszawa", name: "Oddział Warszawa", type: "BRANCH" },
      ],
      employees: [
        { key: "anna", firstName: "Anna", lastName: "Nowak", jobTitle: "Kierowniczka", unitKeys: ["magazyn"] },
        { key: "jan", firstName: "Jan", lastName: "Kowalski", unitKeys: ["krakow"] },
        { key: "piotr", firstName: "Piotr", lastName: "Zieliński", unitKeys: ["warszawa"] },
        { key: "bezKonta", firstName: "Tomasz", lastName: "Magazynier", createAccount: false, unitKeys: ["magazyn"] },
      ],
    });

    const token = await fetchMachineToken(core, CORE_DIRECTORY_READ_SCOPE);
    const orgId = seeded.organization.id;

    // Stronicowanie wszystkich pracowników po 2 na stronę
    const collectedEmployees: { id: string; firstName: string; workEmail?: unknown; jobTitle?: unknown }[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const qs = new URLSearchParams({ organizationId: orgId, limit: "2" });
      if (cursor) qs.set("cursor", cursor);
      const res = await core.fetch(`${CORE_API}/core/v1/products/timotime/directory/employees?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: { id: string; firstName: string; workEmail?: unknown; jobTitle?: unknown }[];
        meta: { nextCursor: string | null };
      };
      collectedEmployees.push(...body.data);
      cursor = body.meta.nextCursor;
      pages += 1;
    } while (cursor !== null);

    expect(pages).toBe(2);
    expect(collectedEmployees).toHaveLength(4);
    // Minimalne dane pracownika — bez workEmail i jobTitle
    for (const emp of collectedEmployees) {
      expect(emp.workEmail).toBeUndefined();
      expect(emp.jobTitle).toBeUndefined();
    }

    // Powtarzalny filtr unitId
    const krakowId = seeded.units.krakow!.id;
    const magazynId = seeded.units.magazyn!.id;
    const membersRes = await core.fetch(
      `${CORE_API}/core/v1/products/timotime/directory/unit-members?organizationId=${orgId}&unitId=${krakowId}&unitId=${magazynId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(membersRes.status).toBe(200);
    const membersBody = (await membersRes.json()) as { data: { employeeId: string; accountId: string | null }[] };
    expect(membersBody.data).toHaveLength(3);
    expect(membersBody.data.some((m) => m.accountId === null)).toBe(true);

    // Niepoprawny kursor -> 422 VALIDATION_FAILED
    const badCursor = await core.fetch(
      `${CORE_API}/core/v1/products/timotime/directory/employees?organizationId=${orgId}&cursor=niepoprawny!`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(badCursor.status).toBe(422);
    expect(((await badCursor.json()) as { error: { code: string } }).error.code).toBe("VALIDATION_FAILED");

    // Brak Entitlement -> 403 PERMISSION_DENIED
    const otherOrg = core.organization({ name: "BrakPlanu" });
    const noEntRes = await core.fetch(
      `${CORE_API}/core/v1/products/timotime/directory/employees?organizationId=${otherOrg.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(noEntRes.status).toBe(403);
    expect(((await noEntRes.json()) as { error: { code: string } }).error.code).toBe("PERMISSION_DENIED");
  });

  it("rejestruje manifest uprawnień i szablonów ról idempotentnie i zapisuje historię rejestracji", async () => {
    const core = await createFakeCore({
      issuer: ISSUER,
      coreApiUrl: CORE_API,
      products: [{ key: "timotime", clientId: "timotime-web", clientSecret: "sekret-timotime" }],
    });

    const token = await fetchMachineToken(core, CORE_PERMISSIONS_REGISTER_SCOPE);

    const firstPermRes = await core.fetch(`${CORE_API}/core/v1/products/timotime/permissions`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        { key: "timotime.entries.read", description: "Podgląd wpisów" },
        { key: "timotime.entries.approve", description: "Zatwierdzanie wpisów" },
      ]),
    });
    expect(firstPermRes.status).toBe(200);
    expect(((await firstPermRes.json()) as { data: unknown }).data).toEqual({
      added: ["timotime.entries.approve", "timotime.entries.read"],
      updated: [],
      deprecated: [],
      restored: [],
      unchanged: 0,
    });

    const secondPermRes = await core.fetch(`${CORE_API}/core/v1/products/timotime/permissions`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([{ key: "timotime.entries.read", description: "Podgląd wpisów zespołu" }]),
    });
    expect(secondPermRes.status).toBe(200);
    expect(((await secondPermRes.json()) as { data: unknown }).data).toEqual({
      added: [],
      updated: ["timotime.entries.read"],
      deprecated: ["timotime.entries.approve"],
      restored: [],
      unchanged: 0,
    });

    // Szablon z wycofanym uprawnieniem -> 422
    const badTemplate = await core.fetch(`${CORE_API}/core/v1/products/timotime/role-templates`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([{ key: "timotime.manager", name: "Kierownik", permissions: ["timotime.entries.approve"] }]),
    });
    expect(badTemplate.status).toBe(422);

    // Poprawny szablon
    const okTemplate = await core.fetch(`${CORE_API}/core/v1/products/timotime/role-templates`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([{ key: "timotime.manager", name: "Kierownik", permissions: ["timotime.entries.read"] }]),
    });
    expect(okTemplate.status).toBe(200);
    expect(((await okTemplate.json()) as { data: unknown }).data).toEqual({
      added: ["timotime.manager"],
      updated: [],
      archived: [],
      restored: [],
      unchanged: 0,
    });

    expect(core.registrations.permissions).toHaveLength(2);
    expect(core.registrations.roleTemplates).toHaveLength(1);
    expect(core.registrations.roleTemplates[0]?.templates[0]?.key).toBe("timotime.manager");
  });

  it("uruchamia serwer HTTP przez listen(), synchronizuje adresy i obsługuje żądania Node HTTP", async () => {
    const core = await createFakeCore({
      products: [{ key: "timotime", clientId: "timotime-web", clientSecret: "sekret-http" }],
    });
    const server = await core.listen();

    /** Pomocnik wywołujący bezpośrednio listener `request` serwera `node:http` (działa też bez połączeń TCP loopback). */
    const dispatchHttp = (options: { method: string; url: string; headers?: Record<string, string>; body?: string }) =>
      new Promise<{ status: number; headers: Record<string, string>; body: string }>((resolve, reject) => {
        const req = Readable.from(
          options.body ? [Buffer.from(options.body, "utf8")] : [],
        ) as unknown as IncomingMessage;
        req.method = options.method;
        req.url = options.url;
        req.headers = Object.fromEntries(Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));

        const resHeaders: Record<string, string> = {};
        const chunks: Buffer[] = [];
        const res = new EventEmitter() as unknown as ServerResponse;
        res.statusCode = 200;
        res.setHeader = ((name: string, value: string | number | readonly string[]) => {
          resHeaders[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
          return res;
        }) as ServerResponse["setHeader"];
        res.end = ((chunk?: unknown) => {
          if (chunk !== undefined) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
          }
          resolve({
            status: res.statusCode,
            headers: resHeaders,
            body: Buffer.concat(chunks).toString("utf8"),
          });
          return res;
        }) as ServerResponse["end"];

        try {
          server.server.emit("request", req, res);
        } catch (error) {
          reject(error);
        }
      });

    try {
      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(server.port).toBeGreaterThan(0);
      expect(server.server.listening).toBe(true);
      expect(core.issuerUrl).toBe(server.url);
      expect(core.coreApiUrl).toBe(server.url);

      const jwksRes = await dispatchHttp({ method: "GET", url: "/api/auth/jwks" });
      expect(jwksRes.status).toBe(200);
      expect(JSON.parse(jwksRes.body)).toEqual(core.issuer.jwks);

      const tokenRes = await dispatchHttp({
        method: "POST",
        url: "/api/auth/oauth2/token",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: "timotime-web",
          client_secret: "sekret-http",
          resource: server.url,
          scope: CORE_PERMISSIONS_READ_SCOPE,
        }).toString(),
      });
      expect(tokenRes.status).toBe(200);
      const { access_token: token } = JSON.parse(tokenRes.body) as { access_token: string };

      const org = core.organization({ name: "Acme HTTP", domain: "http.test" });
      org.grantEntitlement("timotime");
      const emp = org.addEmployee({ firstName: "Anna", lastName: "HTTP", products: ["timotime"] });

      const snapRes = await dispatchHttp({
        method: "GET",
        url: `/core/v1/products/timotime/permission-snapshot?organizationId=${org.id}&accountId=${emp.accountId}`,
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(snapRes.status).toBe(200);
      const snapBody = JSON.parse(snapRes.body) as { data: { products: string[] } };
      expect(snapBody.data.products).toEqual(["timotime"]);

      const notFound = await dispatchHttp({ method: "GET", url: `/core/v1/unknown-${uuidv7()}` });
      expect(notFound.status).toBe(404);
    } finally {
      await server.close();
      expect(server.server.listening).toBe(false);
    }
  });

  it("odpowiada przez prawdziwy fetch na 127.0.0.1, gdy środowisko pozwala na loopback TCP", async (ctx) => {
    const core = await createFakeCore({
      products: [{ key: "timotime", clientId: "timotime-web", clientSecret: "sekret-http" }],
    });
    const server = await core.listen();

    try {
      let jwksRes: Response;
      try {
        jwksRes = await fetch(`${server.url}/api/auth/jwks`);
      } catch (error) {
        const cause = error instanceof Error ? (error.cause as { code?: string } | undefined) : undefined;
        if (cause?.code === "EPERM") {
          ctx.skip();
          return;
        }
        throw error;
      }
      expect(jwksRes.status).toBe(200);
      expect(await jwksRes.json()).toEqual(core.issuer.jwks);
    } finally {
      await server.close();
    }
  });
});
