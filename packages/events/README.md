# @monorise-team/events

Wspólna biblioteka zdarzeń Monorise: koperta komunikatu, definicje i katalog zdarzeń, wzorzec outbox oraz odbiorca odporny na duplikaty, opóźnienia i zmianę kolejności. Decyzje: ADR-0045 (EventBridge, SQS i outbox) oraz `05-integration/events.md`.

Przykład: Owner Acme dezaktywuje Annę w Portalu. Core w jednej transakcji zapisuje zmianę konta oraz zdarzenie `organization.account.deactivated` w tabeli `OutboxEvent`. Osobny proces (relay) wysyła je na szynę zdarzeń. Kolejka TimoTime dostarcza to samo zdarzenie dwa razy, a chwilę później spóźnione starsze zdarzenie z niższą wersją zasobu. Odbiorca w TimoTime zapisuje przetworzone identyfikatory w `ProcessedEvent`, porównuje `resourceVersion` i wykonuje dezaktywację dokładnie raz.

## Definiowanie zdarzeń i katalogu

Każde zdarzenie ma nazwę w formacie `<obszar>.<zasób>.<zdarzenie>`, numer wersji schematu danych oraz schemat `data` (obiekt Zod). Pole `data` trzyma tylko minimum potrzebne odbiorcom, bez danych wrażliwych.

```ts
import { z } from "zod";
import { defineEvent, defineEventCatalog } from "@monorise-team/events";

export const accountDeactivated = defineEvent({
  type: "organization.account.deactivated",
  version: 1,
  data: z.object({
    employeeId: z.uuid(),
  }),
});

export const catalog = defineEventCatalog([accountDeactivated]);
```

Katalog rozróżnia trzy przypadki przy odczycie komunikatu (`catalog.parse`):

- znany typ i znana wersja: zwraca `{ status: "known", event, definition }` ze sprawdzonym `data`,
- nieznany typ: zwraca `{ status: "unknown", envelope }`, który odbiorca może bezpiecznie pominąć,
- znany typ, ale nieznana wersja: rzuca `UnsupportedEventVersionError`, żeby komunikat trafił na kolejkę błędów (DLQ), zamiast zostać po cichu pominięty.

## Zapis do outboxa w jednej transakcji

Nadawca zapisuje zmianę domenową i wiersz `OutboxEvent` w tej samej transakcji bazy danych. Tabela `OutboxEvent` nie ma kolumn `source` ani `traceId`: `source` podaje proces wysyłający.

```ts
import { toOutboxRecord } from "@monorise-team/events";

await prisma.$transaction(async (tx) => {
  const account = await tx.account.update({
    where: { id: accountId },
    data: { active: false, version: { increment: 1 } },
  });

  const envelope = accountDeactivated.create({
    source: "core",
    organizationId: account.organizationId,
    resourceType: "account",
    resourceId: account.id,
    resourceVersion: account.version,
    data: { employeeId: account.employeeId },
  });

  await tx.outboxEvent.create({ data: toOutboxRecord(envelope) });
});
```

## Wysyłka z outboxa (relay)

`createOutboxRelay` pobiera porcję niewysłanych wierszy, składa z nich koperty, przekazuje je w tej samej kolejności do `publish` i oznacza jako wysłane tylko te identyfikatory, które zostały przyjęte.

```ts
import { createOutboxRelay } from "@monorise-team/events";

const relay = createOutboxRelay({
  source: "core",
  batchSize: 100,
  fetchPending: (limit) =>
    // Przy wielu instancjach blokuj wiersze w bazie, np. SELECT ... FOR UPDATE SKIP LOCKED
    fetchPendingOutboxRows(limit),
  publish: (envelopes) => publisher.publish(envelopes),
  markPublished: (ids, publishedAt) => markOutboxRowsPublished(ids, publishedAt),
});

const summary = await relay.runOnce();
```

- Równoczesne wywołania `runOnce()` na jednym obiekcie relay współdzielą bieżący przebieg (single flight).
- Koordynacja między wieloma procesami lub kontenerami należy do produktu (np. `FOR UPDATE SKIP LOCKED` w `fetchPending`).
- Częściowy błąd wysyłki (`publish` zwraca `{ failedIds }`) zostawia nieudane wiersze jako niewysłane. Wyjątek z `publish` nie oznacza żadnego wiersza i przerywa przebieg. Uszkodzony wiersz trafia do `summary.failed`, a reszta partii idzie dalej.

## Odbiorca (`ProcessedEvent` i wersja zasobu)

Odbiorca nigdy nie zakłada dostarczenia dokładnie raz ani zachowania kolejności. Sprawdzenie duplikatu, sprawdzenie wersji zasobu, obsługa zdarzenia oraz zapis do `ProcessedEvent` wykonują się w jednym wywołaniu `transaction`, więc produkt może zamknąć je w jednej transakcji bazy.

```ts
import { createEventConsumer, parseQueueMessageBody } from "@monorise-team/events";

const consumer = createEventConsumer({
  consumer: "timotime",
  catalog,
  transaction: (work) => prisma.$transaction(work),
  processed: {
    isProcessed: async (tx, name, eventId) =>
      Boolean(await tx.processedEvent.findUnique({ where: { consumer_eventId: { consumer: name, eventId } } })),
    markProcessed: async (tx, name, eventId, processedAt) => {
      await tx.processedEvent.create({ data: { consumer: name, eventId, processedAt } });
    },
  },
  resourceVersions: {
    get: async (tx, resourceType, resourceId) => {
      if (resourceType !== "account") return null;
      const row = await tx.account.findUnique({ where: { id: resourceId }, select: { version: true } });
      return row?.version ?? null;
    },
  },
  handlers: {
    "organization.account.deactivated": async (event, { tx }) => {
      await tx.account.update({
        where: { id: event.resourceId },
        data: { active: false, version: event.resourceVersion },
      });
    },
  },
});

// W workerze SQS:
const outcome = await consumer.handle(parseQueueMessageBody(sqsMessage.Body));
```

Wynik `handle` to `"processed"`, `"duplicate"`, `"stale"` (starsza albo równa wersja zasobu, zapisana w `ProcessedEvent`) albo `"ignored"` (nieznany typ lub brak obsługi, bez zapytań do bazy). Gdy funkcja obsługi rzuci błąd, zdarzenie nie zostaje oznaczone jako przetworzone, a błąd wraca do kolejki (ponowienie, potem DLQ).

## Odświeżanie pamięci uprawnień (`organization.permissions.changed`)

Biblioteka eksportuje gotową definicję `organizationPermissionsChanged` oraz katalog `coreEvents`. Po otrzymaniu zdarzenia produkt czyści pamięć podręczną uprawnień z `@monorise-team/permissions` dla wskazanej firmy:

```ts
import { coreEvents, createEventConsumer } from "@monorise-team/events";

const permissionsConsumer = createEventConsumer({
  consumer: "timotime",
  catalog: coreEvents,
  processed,
  handlers: {
    "organization.permissions.changed": async (event) => {
      if (event.organizationId) {
        await permissionsCache.invalidate({ organizationId: event.organizationId });
      }
    },
  },
});
```

## Testy lokalne

Do testów i pracy lokalnej służy `createInMemoryEventBus()`: implementuje `EventPublisher`, rozsyła każdą kopertę po serializacji JSON do wszystkich subskrybentów (`subscribe`) i dostarcza je deterministycznie po wywołaniu `flush()`.

## Poza zakresem tej paczki

- Klienci AWS EventBridge i SQS oraz infrastruktura kolejek i archiwum.
- Modele Prisma dla `OutboxEvent` i `ProcessedEvent` w bazach poszczególnych produktów.
- Schematy `data` dla pozostałych zdarzeń z katalogu (powstaną razem z ich nadawcami w Core i produktach).
