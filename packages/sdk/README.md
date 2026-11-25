# @monorise-team/sdk

Typowany klient Core API Monorise generowany z opisu OpenAPI (`openapi/core-api.json` z repozytorium MonoriseCore). Produkty webowe, desktopowe (Tauri), mobilne (Expo) i serwery produktów wywołują Core wyłącznie przez tę bibliotekę. Klient używa wyłącznie standardowego `fetch`, bez zależności od Node.js.

Biblioteka podąża ściśle za opisem Core API: zawiera tylko te typy i metody, które istnieją w kodzie MonoriseCore. Nie dodaje własnych endpointów ani nie obsługuje logowania ani odświeżania tokenów (tym zajmuje się `@monorise-team/auth`).

## Dostępne operacje

Wszystkie metody pochodzą bezpośrednio z `openapi/core-api.json` (etapy 1–3 dziedziny Core i zaproszenia):

- **System (publiczne, bez tokenu)**: `getHealth`, `getOpenApi`
- **Konto, firma i pracownicy**: `getMe`, `getOrganization`, `transferOrganizationOwner`, `listEmployees`, `createEmployee`
- **Zaproszenia pracowników**: `listInvitations`, `createInvitation`, `resendInvitation`, `revokeInvitation`
- **Struktura firmy**: `listUnits`, `createUnit`, `updateUnit`, `listUnitMembers`, `putUnitMember`, `deleteUnitMember`
- **Uprawnienia i role**: `listPermissions`, `listRoles`, `getRole`, `createRole`, `updateRole`, `archiveRole`, `listRoleAssignments`, `createRoleAssignment`, `deleteRoleAssignment`
- **Dostęp do aplikacji**: `listEntitlements`, `listAppAccess`, `grantAppAccess`, `revokeAppAccess`
- **Produkty (token maszynowy OAuth 2.1 `client_credentials`)**: `registerProductPermissions`, `registerProductRoleTemplates`, `getProductPermissionSnapshot`, `listProductDirectoryEmployees`, `listProductDirectoryUnitMembers`, `listProductEvents` (kanał zdarzeń Core, zakres `core:events.read`, ADR-0100; kursor to numer ostatnio przetworzonego zdarzenia, a pobiera go `createEventFeedPoller` z `@monorise-team/events`)

## Przykład: dane zalogowanego konta i firmy

AvenMail pokazuje Annie z firmy Acme jej imię i nazwę firmy. Wywołuje `core.getMe()` z tokenem Anny i dostaje gotowe, typowane dane — bez ręcznego rozpakowywania koperty `{ data, meta, error }`:

```ts
import { createCoreClient } from "@monorise-team/sdk";

const core = createCoreClient({
  baseUrl: "https://api.monorise.studio",
  getAccessToken: () => session.accessToken,
});

const me = await core.getMe();
console.log(me.employee.firstName); // "Anna"
console.log(me.organization.name); // "Acme"
```

Adres `baseUrl` wskazuje serwer (np. `http://localhost:3200` lokalnie albo `https://api.monorise.studio` produkcyjnie) — ścieżki operacji zawierają już `/core/v1`.

Operacje publiczne (`getHealth()`, `getOpenApi()`) nigdy nie wywołują `getAccessToken` ani nie wysyłają nagłówka `Authorization`. Operacje chronione (zarówno tokenem użytkownika, jak i tokenem maszynowym produktu) rzucają `CoreApiMissingTokenError` jeszcze przed wysłaniem żądania, gdy tokenu brakuje. `getOpenApi()` zwraca surowy dokument OpenAPI (zgodnie ze specyfikacją nie jest owinięty w kopertę), a operacje zwracające `204 No Content` (`deleteUnitMember`, `archiveRole`, `deleteRoleAssignment`, `revokeAppAccess`, `revokeInvitation`) zwracają `void`.

## Stronicowanie list

Operacje listowe (np. `listUnits`, `listEmployees`, `listUnitMembers`, `listRoles`, `listAppAccess`, `listProductDirectoryEmployees`) zachowują kursor następnej strony z `meta.nextCursor` i zwracają obiekt `{ items, nextCursor }`:

```ts
import { createCoreClient, paginate } from "@monorise-team/sdk";

const core = createCoreClient({
  baseUrl: "https://api.monorise.studio",
  getAccessToken: () => session.accessToken,
});

// Pojedyncza strona:
const firstPage = await core.listUnits({ query: { status: "ACTIVE", limit: 50 } });
console.log(firstPage.items.length, firstPage.nextCursor);

// Wszystkie elementy ze wszystkich stron (automatycznie podąża za nextCursor aż do null):
for await (const unit of paginate(core.listUnits, { query: { status: "ACTIVE", limit: 50 } })) {
  console.log(unit.name);
}

// Operacje z wymaganymi parametrami ścieżki lub zapytania:
for await (const member of paginate(core.listUnitMembers, { path: { unitId }, query: { limit: 100 } })) {
  console.log(member.employee.firstName, member.role);
}
```

Operacje niebędące listami (`getMe`, `getOrganization`, `createUnit`, `getProductPermissionSnapshot` itd.) zwracają bezpośrednio zawartość pola `data`.

## Przykład: serwer produktu z tokenem maszynowym

Serwer TimoTime pobiera migawkę uprawnień Jana z firmy Acme, używając tokenu maszynowego `client_credentials` (zakres `core:permissions.read`), i łączy klienta SDK z pamięcią podręczną `createPermissionCache` z `@monorise-team/permissions`:

```ts
import { can, createPermissionCache } from "@monorise-team/permissions";
import { createCoreClient } from "@monorise-team/sdk";

const core = createCoreClient({
  baseUrl: process.env.CORE_API_URL!,
  getAccessToken: () => getCoreMachineToken("core:permissions.read"),
});

const permissionCache = createPermissionCache({
  load: ({ organizationId, accountId }) =>
    core.getProductPermissionSnapshot({
      path: { productKey: "timotime" },
      query: { organizationId, accountId },
    }),
});

// Przy żądaniu Jana do TimoTime:
const snapshot = await permissionCache.get({
  organizationId: janSession.organizationId,
  accountId: janSession.accountId,
  authzRevision: janSession.authzRevision,
});

const canApprove = can(snapshot, "timotime.entries.approve", {
  unitIds: [annaUnitId],
});
```

Ten sam klient z odpowiednim tokenem maszynowym obsługuje też rejestrację manifestu przy wdrożeniu (`registerProductPermissions`, `registerProductRoleTemplates` z zakresem `core:permissions.register`) oraz katalog (`listProductDirectoryEmployees`, `listProductDirectoryUnitMembers` z zakresem `core:directory.read` i powtarzalnymi filtrami `employeeId` / `unitId`).

## Obsługa błędów

Klient rozróżnia błędy zwrócone przez Core, błędy połączenia i niezgodność odpowiedzi z kontraktem:

```ts
import {
  CoreApiError,
  CoreApiMissingTokenError,
  CoreApiProtocolError,
  CoreApiUnavailableError,
} from "@monorise-team/sdk";

try {
  const me = await core.getMe();
  return me;
} catch (error) {
  if (error instanceof CoreApiError) {
    // Błąd w kopercie Core: np. error.code === "UNAUTHENTICATED", "ACCOUNT_DEACTIVATED" lub "VALIDATION_FAILED"
    // Dostępne pola: error.status, error.code, error.message, error.details, error.requestId
    if (error.code === "ACCOUNT_DEACTIVATED") {
      return { reason: "deactivated", requestId: error.requestId };
    }
    throw error;
  }
  if (error instanceof CoreApiUnavailableError) {
    // Brak połączenia z Core (błąd sieci, DNS, przerwane żądanie) — nie wylogowuj użytkownika
    return { reason: "unavailable" };
  }
  if (error instanceof CoreApiProtocolError) {
    // Odpowiedź niezgodna z opisem OpenAPI (np. HTML z bramki zamiast JSON lub brak koperty)
    throw error;
  }
  if (error instanceof CoreApiMissingTokenError) {
    // Wywołano operację chronioną bez tokenu dostępu
    throw error;
  }
  throw error;
}
```

Komunikaty błędów są po angielsku i nigdy nie zawierają tokenu dostępu.

## Aktualizacja po zmianach w Core API

Lokalna kopia opisu znajduje się w `packages/sdk/openapi/core-api.json`, a pliki generowane (`src/generated/`) są zatwierdzane w repozytorium. Zwykły build i `pnpm check` nie łączą się z siecią — testy sprawdzają jedynie, czy `src/generated/` zgadza się z lokalną kopią.

Gdy w MonoriseCore pojawi się nowy endpoint lub zmieni się schemat:

```bash
# Pobiera opis z gałęzi dev MonoriseCore (wymaga dostępu do GitHuba / tokenu GitHuba)
# i generuje typy oraz tabelę operacji:
pnpm --filter @monorise-team/sdk sync

# Albo z gałęzi prod:
pnpm --filter @monorise-team/sdk sync -- --ref prod

# Regeneracja wyłącznie z lokalnej kopii (działa bez sieci):
pnpm --filter @monorise-team/sdk generate
```

Nie edytuj plików w `src/generated/` ręcznie — każda zmiana musi pochodzić z `openapi/core-api.json`.

## Poza zakresem tej paczki

- Logowanie, OAuth 2.1, sesje BFF i odświeżanie tokenów (`@monorise-team/auth`).
- Nowe endpointy Core (dodawane najpierw w MonoriseCore, potem synchronizowane przez `sync`).
- Testy zgodności produktów (`@monorise-team/testing`).
