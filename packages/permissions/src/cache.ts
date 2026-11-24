import { permissionSnapshotSchema, type PermissionSnapshot } from "./snapshot.js";

/** Parametry przekazywane funkcji `load` pobierającej migawkę uprawnień z Core. */
export interface PermissionCacheLoadKey {
  readonly accountId: string;
  readonly organizationId: string;
}

/** Zapytanie do pamięci podręcznej uprawnień na podstawie zweryfikowanego tokenu dostępu. */
export interface PermissionCacheQuery extends PermissionCacheLoadKey {
  readonly authzRevision: number;
}

/** Filtr unieważniania wpisów w pamięci podręcznej uprawnień. */
export interface PermissionCacheFilter {
  readonly organizationId?: string;
  readonly accountId?: string;
}

/** Konfiguracja pamięci podręcznej uprawnień (ADR-0036: domyślnie 5 minut). */
export interface PermissionCacheOptions {
  /** Pobiera surową migawkę uprawnień z Core; wynik jest walidowany przez `permissionSnapshotSchema`. */
  readonly load: (key: PermissionCacheLoadKey) => Promise<unknown>;
  /** Maksymalny wiek wpisu w milisekundach. Domyślnie `300_000` (5 minut). */
  readonly maxAgeMs?: number;
  /** Maksymalna liczba wpisów (LRU). Domyślnie `10_000`. */
  readonly maxEntries?: number;
  /** Zegar w milisekundach (np. do testów). Domyślnie `Date.now`. */
  readonly now?: () => number;
}

/** Pamięć podręczna migawek uprawnień z pojedynczym ładowaniem w locie (single-flight) i unieważnianiem. */
export interface PermissionCache {
  get(query: PermissionCacheQuery): Promise<PermissionSnapshot>;
  invalidate(filter?: PermissionCacheFilter): void;
}

interface CacheEntry {
  readonly organizationId: string;
  readonly accountId: string;
  readonly snapshot: PermissionSnapshot;
  readonly loadedAt: number;
}

interface InFlightEntry {
  readonly organizationId: string;
  readonly accountId: string;
  invalidated: boolean;
  readonly promise: Promise<PermissionSnapshot>;
}

const DEFAULT_MAX_AGE_MS = 300_000;
const DEFAULT_MAX_ENTRIES = 10_000;

function makeCacheKey(organizationId: string, accountId: string): string {
  return `${organizationId}\0${accountId}`;
}

function matchesFilter(organizationId: string, accountId: string, filter?: PermissionCacheFilter): boolean {
  if (filter === undefined) {
    return true;
  }
  if (filter.organizationId !== undefined && filter.organizationId !== organizationId) {
    return false;
  }
  if (filter.accountId !== undefined && filter.accountId !== accountId) {
    return false;
  }
  return true;
}

/**
 * Tworzy pamięć podręczną migawek uprawnień (ADR-0036).
 *
 * - Waliduje każdą pobraną migawkę przez `permissionSnapshotSchema` i sprawdza zgodność `accountId` i `organizationId`.
 * - Odświeża wpis po `maxAgeMs` albo gdy token niesie nowsze `authzRevision`.
 * - Łączy równoczesne wywołania dla tego samego konta w jedno wywołanie `load` (single-flight).
 * - Unieważnienie w trakcie ładowania zapobiega zapisaniu przestarzałej odpowiedzi do pamięci podręcznej.
 */
export function createPermissionCache(options: PermissionCacheOptions): PermissionCache {
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const now = options.now ?? Date.now;
  const { load } = options;

  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0) {
    throw new RangeError(`maxAgeMs must be a finite number >= 0, received: ${String(maxAgeMs)}`);
  }
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new RangeError(`maxEntries must be an integer >= 1, received: ${String(maxEntries)}`);
  }

  const entries = new Map<string, CacheEntry>();
  const inFlight = new Map<string, InFlightEntry>();

  function getFresh(key: string, requestedRevision: number): PermissionSnapshot | undefined {
    const entry = entries.get(key);
    if (entry === undefined) {
      return undefined;
    }

    const age = now() - entry.loadedAt;
    if (age >= maxAgeMs) {
      entries.delete(key);
      return undefined;
    }

    if (entry.snapshot.authzRevision < requestedRevision) {
      return undefined;
    }

    // Odśwież pozycję LRU przy trafieniu.
    entries.delete(key);
    entries.set(key, entry);
    return entry.snapshot;
  }

  function setEntry(key: string, entry: CacheEntry): void {
    if (entries.has(key)) {
      entries.delete(key);
    }
    entries.set(key, entry);

    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) break;
      entries.delete(oldestKey);
    }
  }

  function startLoad(key: string, query: PermissionCacheLoadKey): Promise<PermissionSnapshot> {
    const startedAt = now();
    let resolveFlight!: (snapshot: PermissionSnapshot) => void;
    let rejectFlight!: (error: unknown) => void;
    const promise = new Promise<PermissionSnapshot>((resolve, reject) => {
      resolveFlight = resolve;
      rejectFlight = reject;
    });

    const flight: InFlightEntry = {
      organizationId: query.organizationId,
      accountId: query.accountId,
      invalidated: false,
      promise,
    };
    inFlight.set(key, flight);

    void (async () => {
      try {
        const raw = await load({
          accountId: query.accountId,
          organizationId: query.organizationId,
        });
        const snapshot = permissionSnapshotSchema.parse(raw);

        if (snapshot.accountId !== query.accountId || snapshot.organizationId !== query.organizationId) {
          throw new Error("Loaded permission snapshot does not match requested accountId or organizationId");
        }

        if (!flight.invalidated) {
          setEntry(key, {
            organizationId: query.organizationId,
            accountId: query.accountId,
            snapshot,
            loadedAt: startedAt,
          });
        }

        resolveFlight(snapshot);
      } catch (error) {
        rejectFlight(error);
      } finally {
        if (inFlight.get(key) === flight) {
          inFlight.delete(key);
        }
      }
    })();

    return promise;
  }

  async function get(query: PermissionCacheQuery): Promise<PermissionSnapshot> {
    const key = makeCacheKey(query.organizationId, query.accountId);
    const cached = getFresh(key, query.authzRevision);
    if (cached !== undefined) {
      return cached;
    }

    const existingFlight = inFlight.get(key);
    const joinedExisting = existingFlight !== undefined;
    const snapshot = await (existingFlight ? existingFlight.promise : startLoad(key, query));

    if (joinedExisting && snapshot.authzRevision < query.authzRevision) {
      const freshAfterWait = getFresh(key, query.authzRevision);
      if (freshAfterWait !== undefined) {
        return freshAfterWait;
      }
      const nextFlight = inFlight.get(key);
      return await (nextFlight ? nextFlight.promise : startLoad(key, query));
    }

    return snapshot;
  }

  function invalidate(filter?: PermissionCacheFilter): void {
    if (filter === undefined || (filter.organizationId === undefined && filter.accountId === undefined)) {
      entries.clear();
      for (const flight of inFlight.values()) {
        flight.invalidated = true;
      }
      inFlight.clear();
      return;
    }

    for (const [key, entry] of entries) {
      if (matchesFilter(entry.organizationId, entry.accountId, filter)) {
        entries.delete(key);
      }
    }

    for (const [key, flight] of inFlight) {
      if (matchesFilter(flight.organizationId, flight.accountId, filter)) {
        flight.invalidated = true;
        inFlight.delete(key);
      }
    }
  }

  return { get, invalidate };
}
