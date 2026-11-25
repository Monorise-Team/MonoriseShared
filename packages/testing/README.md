# @monorise-team/testing

Wspólna biblioteka testów zgodności produktów Monorise z Core (ADR-0046, ADR-0075). Zapewnia testowego wystawcę kluczy i tokenów EdDSA, atrapę MonoriseCore (JWKS, OAuth `client_credentials`, `/core/v1/me`, migawkę uprawnień, katalog pracowników i jednostek, rejestrację manifestów), budowniczych danych firmy, gotowe testy kontraktu produktu (dla Vitesta i dowolnego innego runnera), test izolacji firm (RLS) oraz budowniczego zdarzeń z katalogu `@monorise-team/events`.

`vitest` jest opcjonalną zależnością równorzędną (`peerDependenciesMeta.vitest.optional = true`) i jest importowany leniwie wyłącznie w `defineProductContractTests` oraz `defineTenantIsolationTests`. Pozostałe funkcje działają bez Vitesta.

## Zakres sprawdzeń względem kontraktu produktu (ADR-0046)

| Obszar / obowiązek                                                       | Stan                      | Co sprawdza biblioteka                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Obowiązek 1** — logowanie i uprawnienia (`@monorise-team/permissions`) | **gotowe**                | Każda chroniona trasa odrzuca: brak tokenu (`401 UNAUTHENTICATED`), token dla innego odbiorcy (`aud`), obcy klucz, token wygasły, innego wystawcę (`iss`), brak `org_id` oraz poprawny token osoby bez uprawnienia w migawce (`403 PERMISSION_DENIED`).       |
| **Obowiązek 2** — reakcja na zdarzenia z Core                            | **częściowo / planowane** | Dziś dostępny jest budowniczy koperty `organization.permissions.changed` (`buildPermissionsChangedEvent`) do testowania odbiorców. Pełny zestaw zdarzeń (dezaktywacja, koniec umowy, anonimizacja) dojdzie wraz z nadawcami w Core.                           |
| **Obowiązek 3** — eksport, usunięcie firmy i anonimizacja (ADR-0041)     | **planowane**             | Zostanie dodane, gdy produkty wdrożą endpointy i zadania eksportu oraz anonimizacji.                                                                                                                                                                          |
| **Obowiązek 4** — wspólny dziennik zdarzeń (ADR-0039)                    | **planowane**             | Zostanie dodane, gdy produkty zaczną wysyłać `audit.entry.recorded`.                                                                                                                                                                                          |
| **Obowiązek 5** — dostęp wsparcia Monorise za zgodą klienta (ADR-0040)   | **planowane**             | Zostanie dodane razem z obsługą zgód wsparcia i dostępu awaryjnego.                                                                                                                                                                                           |
| **Obowiązek 6** — dostęp firmy i konta do produktu (ADR-0051)            | **gotowe**                | Każda chroniona trasa odrzuca z `403 PRODUCT_ACCESS_REQUIRED` osobę z firmy bez aktywnego `Entitlement` oraz konto bez aktywnego `AppAccess`.                                                                                                                 |
| **Obowiązek 7** — opis OpenAPI 3.1 (ADR-0044)                            | **gotowe**                | Wersja `3.1.x`, unikalne `operationId`, `security` na operacjach niepublicznych, koperta `{ data, meta: { requestId }, error }` na sukcesach, wspólny schemat błędu przez `$ref` z `code` i `message`, oraz `limit`, `cursor` i `meta.nextCursor` na listach. |
| **Koperta błędu** (ADR-0044)                                             | **gotowe**                | Każda odmowa z obowiązków 1 i 6 (oraz osobno `checkErrorEnvelope`) musi mieć kształt `{ data: null, meta: { requestId }, error: { code, message, details: [] } }`.                                                                                            |
| **Separacja firm / RLS** (ADR-0037)                                      | **gotowe**                | `checkTenantIsolation` i `defineTenantIsolationTests` zapisują wiersze jako firma A i sprawdzają, że firma A je widzi, a firma B nigdy ich nie odczyta.                                                                                                       |

## Szybki start: produkt Next.js BFF (np. TimoTime)

Produkt z warstwą BFF (ADR-0050) często wywołuje Core po adresie URL (`CORE_AUTH_URL`, `CORE_API_URL`) i przyjmuje zarówno tokeny `Authorization: Bearer` (aplikacja mobilna), jak i ciasteczko sesji BFF.

```ts
import { afterAll, beforeAll } from "vitest";
import {
  createFakeCore,
  defineProductContractTests,
  defineTenantIsolationTests,
  type FakeCore,
  type FakeCoreServerHandle,
} from "@monorise-team/testing";

let fakeCore: FakeCore;
let coreServer: FakeCoreServerHandle;

beforeAll(async () => {
  fakeCore = await createFakeCore({
    products: [{ key: "timotime", clientId: "timotime-web", clientSecret: "sekret-testowy" }],
  });
  coreServer = await fakeCore.listen();

  process.env.CORE_AUTH_URL = coreServer.url;
  process.env.CORE_API_URL = coreServer.url;
  process.env.TIMOTIME_CORE_JWKS = JSON.stringify(fakeCore.issuer.jwks);
});

afterAll(async () => {
  await coreServer.close();
});

await defineProductContractTests({
  productKey: "timotime",
  audience: "http://time.localhost:3300",
  fakeCore: () => fakeCore,
  // Handler mapujący Web Request na trasy Route Handler Next.js
  handler: (request) => dispatchNextRoute(request),
  // Opcjonalnie dla tras wymagających sesji BFF zamiast Bearer:
  createSession: async ({ accessToken, coreAccessToken }) => ({
    cookie: await issueTestSessionCookie({ accessToken, coreAccessToken }),
  }),
  routes: [
    { method: "GET", path: "/api/v1/time/entries" },
    { method: "POST", path: "/api/v1/time/start", body: { kind: "WORK" } },
    { method: "GET", path: "/api/v1/team/entries" },
  ],
  openApi: () => buildProductOpenApiDocument(),
});

await defineTenantIsolationTests({
  seedAsTenant: (organizationId) => seedTimeEntry(organizationId),
  readAsTenant: (organizationId) => readTimeEntriesWithRls(organizationId),
  cleanup: ({ tenantAId, tenantBId }) => cleanupTenants([tenantAId, tenantBId]),
});
```

## Szybki start: produkt Fastify (API z Bearer JWT)

Dla serwera Fastify możesz przekazać `baseUrl` uruchomionego serwera albo cienki wrapper `handler` korzystający z `app.inject`:

```ts
import { createFakeCore, defineProductContractTests } from "@monorise-team/testing";

const fakeCore = await createFakeCore({
  issuer: "https://auth.monorise.test",
  coreApiUrl: "https://api.monorise.test",
  products: [{ key: "avenmail", clientId: "avenmail-web", clientSecret: "sekret-aven" }],
});

const app = buildAvenServer({
  issuer: fakeCore.issuerUrl,
  keys: fakeCore.issuer.localJWKSet,
  coreApiUrl: fakeCore.coreApiUrl,
  coreFetch: fakeCore.fetch,
});

await defineProductContractTests({
  productKey: "avenmail",
  audience: "https://aven.monorise.test",
  fakeCore,
  handler: async (request) => {
    const url = new URL(request.url);
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();
    const res = await app.inject({
      method: request.method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      url: `${url.pathname}${url.search}`,
      headers: Object.fromEntries(request.headers.entries()),
      payload: body,
    });
    return new Response(res.rawPayload, {
      status: res.statusCode,
      headers: res.headers as Record<string, string>,
    });
  },
  routes: [
    { method: "GET", path: "/api/v1/mailboxes" },
    { method: "POST", path: "/api/v1/messages", body: { subject: "Test" } },
  ],
  openApi: () => buildAvenOpenApiDocument(),
});
```

## Przykład budowania danych firmy Acme

Budowniczy w `fakeCore.organization(...)` pozwala opisać strukturę jednostek, dostęp firmy (`Entitlement`), dostęp kont do aplikacji (`AppAccess`), role i ich przypisania w zakresie jednostki lub zasobu:

```ts
import { createFakeCore } from "@monorise-team/testing";

const fakeCore = await createFakeCore({
  issuer: "https://auth.monorise.test",
  coreApiUrl: "https://api.monorise.test",
  products: [{ key: "timotime", clientId: "timotime-web", clientSecret: "sekret-timotime" }],
});

const acme = fakeCore.organization({ name: "Acme", domain: "acme.test" });

const krakow = acme.addUnit({ name: "Oddział Kraków", type: "BRANCH" });
const magazyn = acme.addUnit({ name: "Magazyn Kraków", type: "TEAM", parentId: krakow.id });
const warszawa = acme.addUnit({ name: "Oddział Warszawa", type: "BRANCH" });

acme.grantEntitlement("timotime");

const anna = acme.addEmployee({
  firstName: "Anna",
  lastName: "Nowak",
  email: "anna@acme.test",
  unitIds: [magazyn.id],
  products: ["timotime"],
});

const jan = acme.addEmployee({
  firstName: "Jan",
  lastName: "Kowalski",
  email: "jan@acme.test",
  unitIds: [krakow.id],
  products: ["timotime"],
});

const piotr = acme.addEmployee({
  firstName: "Piotr",
  lastName: "Zieliński",
  email: "piotr@acme.test",
  unitIds: [warszawa.id],
  products: ["timotime"],
});

const kierownik = acme.addRole({
  name: "Kierownik",
  product: "timotime",
  permissions: ["timotime.entries.read", "timotime.entries.approve"],
});

acme.assignRole({
  accountId: jan.accountId,
  roleId: kierownik.id,
  scope: { type: "UNIT", unitId: krakow.id },
});

// Podpisany token Jana dla API produktu (z org_id, employee_id i authz_rev z atrapy Core)
const janToken = await acme.signUserToken(jan.accountId, {
  audience: "https://time.monorise.test",
});
```

Ten sam scenariusz można zapisać deklaratywnie przez `fakeCore.seedOrganization({ name: "Acme", ... })`.

## Użycie bez Vitesta i pomocniki niskopoziomowe

Każde sprawdzenie jest dostępne jako zwykła funkcja asynchroniczna zwracająca `{ passed, violations }`:

- `checkAuthentication(config)` — obowiązek 1,
- `checkProductAccess(config)` — obowiązek 6,
- `checkOpenApiDocument(documentOrLoader, options)` — obowiązek 7,
- `checkErrorEnvelope(response, options)` — format koperty błędu,
- `checkTenantIsolation(options)` — izolacja firm (ADR-0037),
- `createTestIssuer({ issuer })` — klucze Ed25519, `jwks`, `signUserToken`, `signMachineToken` oraz `invalid` (`expired`, `wrongAudience`, `foreignKey`, `wrongIssuer`, `missingOrgId`),
- `buildPermissionsChangedEvent({ organizationId, accountId, authzRevision })` — koperta zdarzenia `organization.permissions.changed` zgodna z `@monorise-team/events`.
