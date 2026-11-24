# @monorise-team/permissions

Wspólna biblioteka do sprawdzania uprawnień, zakresów i delegowania w produktach Monorise. Dzięki jednej implementacji każdy produkt (AvenMail, TimoTime i kolejne) tak samo rozumie drzewo jednostek, dziedziczenie zakresów, role czasowe i rolę Ownera. Decyzje: ADR-0032 (jedno drzewo jednostek), ADR-0033 (zakres obejmuje poddrzewo), ADR-0034 (uprawnienia tylko się sumują), ADR-0035 (dostęp do aplikacji i delegowanie), ADR-0036 (uprawnienia deklarowane przez produkty i pamięć podręczna na 5 minut).

Przykład: Jan jest administratorem HR w firmie Acme z uprawnieniem `timotime.entries.approve` w zakresie „Oddział Kraków”. Może zatwierdzać godziny Anny z „Zespołu Kraków A” (pod „Działem HR Kraków”), a nowy zespół utworzony pod Krakowem od razu wpada w ten sam zakres. Jan nie zatwierdzi godzin Piotra z „Zespołu Warszawa” ani nikogo z „Księgowości”. Jeśli osoba należy jednocześnie do Krakowa i Warszawy, Jan może obsłużyć jej wpis, bo wystarczy pokrycie jednej z jej jednostek.

## Deklarowanie uprawnień produktu

Każdy produkt deklaruje swoje uprawnienia w kodzie przez `definePermissions`. Klucz ma postać `<produkt>.<zasób>.<akcja>` (może mieć więcej segmentów), a wynik jest zamrożony i zawiera typowane klucze oraz manifest do rejestracji w Core.

```ts
// src/permissions.ts
import { definePermissions, type PermissionKeyOf } from "@monorise-team/permissions";

export const timotime = definePermissions("timotime", {
  "entries.approve": "Zatwierdzanie godzin pracy",
  "entries.read": "Podgląd godzin pracy",
});

export type TimotimePermission = PermissionKeyOf<typeof timotime>;
// timotime.keys["entries.approve"] === "timotime.entries.approve"
// timotime.manifest -> lista { key, description } dla Core
```

Do sprawdzania danych wejściowych po stronie Core służą schematy Zod: `permissionKeySchema`, `permissionManifestSchema` i `permissionSnapshotSchema` oraz funkcja `parsePermissionKey`.

## Sprawdzanie w trasie API

Serwer pobiera migawkę uprawnień z pamięci podręcznej na podstawie zweryfikowanego tokenu dostępu (`accountId`, `organizationId`, `authzRevision`) i sprawdza dostęp przez `can` albo `assertCan`.

```ts
import { assertCan, can } from "@monorise-team/permissions";
import { timotime } from "./permissions.js";

// Sprawdzenie celu z przypisaniem do jednostek pracownika
assertCan(snapshot, timotime.keys["entries.approve"], {
  unitIds: employee.unitIds,
});

// Sprawdzenie bez celu (np. czy pokazać pozycję w menu)
const showApproveMenu = can(snapshot, timotime.keys["entries.approve"]);
```

Domyślnie biblioteka zawsze odmawia: niepoprawny klucz, brak produktu w `snapshot.products` (nawet dla Ownera), pusty cel `{}` przy zakresie innym niż `ORGANIZATION`, nieznana jednostka spoza drzewa firmy oraz wygasła rola czasowa (`now >= validUntil` lub `now < validFrom`) kończą się odmową.

## Filtrowanie list z `scopeOf`

Gdy endpoint zwraca listę rekordów (np. wpisów czasu pracy widocznych dla Jana), `scopeOf` zamienia uprawnienia na konkretny zakres do zapytania w bazie: `ORGANIZATION`, `LIMITED` (rozwinięta lista jednostek poddrzewa i zasobów) albo `NONE`.

```ts
import { scopeOf } from "@monorise-team/permissions";
import { timotime } from "./permissions.js";

const scope = scopeOf(snapshot, timotime.keys["entries.read"]);

if (scope.type === "NONE") {
  return [];
}
if (scope.type === "ORGANIZATION") {
  return db.entries.findAllForOrganization(context.organizationId);
}
return db.entries.findByScope(context.organizationId, {
  unitIds: scope.unitIds,
  resourceIds: scope.resourceIds,
});
```

## Delegowanie uprawnień

Administrator może nadać innym tylko te uprawnienia, które sam posiada, i tylko w swoim zakresie (ADR-0035). Funkcja `canDelegate` sprawdza właśnie tę regułę. To, czy konto w ogóle ma prawo przypisywać role, jest osobnym uprawnieniem sprawdzanym niezależnie.

```ts
import { canDelegate } from "@monorise-team/permissions";
import { timotime } from "./permissions.js";

// Jan (UNIT Kraków) może nadać to samo uprawnienie na zespół w Krakowie, ale nie na Warszawę ani całą firmę
canDelegate(snapshot, timotime.keys["entries.approve"], {
  type: "UNIT",
  unitId: teamKrakowAId,
});

// Przy delegowaniu pojedynczego zasobu można przekazać jednostki, do których ten zasób należy
canDelegate(
  snapshot,
  timotime.keys["entries.approve"],
  { type: "RESOURCE", resourceId: entry.id },
  { resourceUnitIds: entry.unitIds },
);
```

## Pamięć podręczna i unieważnianie

`createPermissionCache` przechowuje zwalidowane migawki maksymalnie przez 5 minut (`maxAgeMs = 300_000`), łączy równoczesne pobrania tego samego konta w jedno wywołanie `load` (single-flight), pilnuje limitu wpisów LRU (`maxEntries = 10_000`) i odrzuca migawkę innego konta lub innej firmy.

```ts
import { createPermissionCache } from "@monorise-team/permissions";

const permissionCache = createPermissionCache({
  load: ({ accountId, organizationId }) => coreClient.getPermissionSnapshot({ accountId, organizationId }),
});

// Przy każdym żądaniu: token niesie authzRevision; wyższa wersja od razu odświeża wpis
const snapshot = await permissionCache.get({
  accountId: context.accountId,
  organizationId: context.organizationId,
  authzRevision: context.authzRevision,
});
```

Kiedy wywoływać `invalidate`:

- po zdarzeniu `organization.permissions.changed`: `permissionCache.invalidate({ organizationId })` albo `permissionCache.invalidate({ accountId })`, gdy zdarzenie dotyczy konkretnego konta,
- po zmianie dostępu do aplikacji lub produktu (`organization.app_access.*`, `organization.product.*`) albo zmianie struktury jednostek (`organization.unit.*`): `permissionCache.invalidate({ organizationId })`,
- po dezaktywacji konta (`organization.account.deactivated`): `permissionCache.invalidate({ accountId })`,
- przy pełnym czyszczeniu (np. w testach): `permissionCache.invalidate()`.

Unieważnienie unieważnia także ładowania będące w toku, więc starsza odpowiedź z Core nie nadpisze świeżego stanu.

## Błędy

`assertCan` rzuca `PermissionError` z polami `name = "PermissionError"`, `code = "PERMISSION_DENIED"`, `statusCode = 403` i `permission` (sprawdzany klucz). Fastify odczytuje `statusCode` automatycznie, a produkty zamieniają ten błąd na standardową odpowiedź API HTTP 403 z kodem `PERMISSION_DENIED`. Komunikat błędu nigdy nie ujawnia zawartości migawki uprawnień.

## Co jest poza zakresem tej biblioteki

- Endpoint migawki uprawnień i rejestracja manifestów w Core (powstaną później w MonoriseCore).
- Klient HTTP, adaptery Fastify i Next.js, obsługa kolejek zdarzeń oraz zapytania do bazy.
- Gotowe szablony ról (ich dokładny skład powstanie razem z uprawnieniami pierwszych produktów).
