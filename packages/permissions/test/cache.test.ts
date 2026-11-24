import { describe, expect, it, vi } from "vitest";
import { createPermissionCache, type PermissionSnapshot } from "../src/index.js";
import {
  ACME_ORG_ID,
  ANNA_ACCOUNT_ID,
  BETA_ORG_ID,
  JAN_ACCOUNT_ID,
  janSnapshot,
  PIOTR_ACCOUNT_ID,
} from "./fixtures.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createPermissionCache", () => {
  it("korzysta z wpisu w ramach maxAgeMs i przeładowuje po jego upływie", async () => {
    let time = 1_000;
    const load = vi.fn(async ({ accountId, organizationId }) =>
      janSnapshot({ accountId, organizationId, authzRevision: 1 }),
    );
    const cache = createPermissionCache({ load, maxAgeMs: 300_000, now: () => time });

    const first = await cache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    time += 299_999;
    const second = await cache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    expect(second).toBe(first);
    expect(load).toHaveBeenCalledTimes(1);

    // Dokładnie po maxAgeMs wpis jest nieświeży
    time += 1;
    await cache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("przeładowuje wpis, gdy token niesie nowsze authzRevision", async () => {
    let revision = 1;
    const load = vi.fn(async ({ accountId, organizationId }) =>
      janSnapshot({ accountId, organizationId, authzRevision: revision }),
    );
    const cache = createPermissionCache({ load });

    const s1 = await cache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    expect(s1.authzRevision).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);

    // Starsze lub równe authzRevision korzysta z cache
    await cache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    expect(load).toHaveBeenCalledTimes(1);

    // Nowsze authzRevision wymusza pobranie z Core
    revision = 2;
    const s2 = await cache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 2 });
    expect(s2.authzRevision).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("łączy równoczesne wywołania (single-flight: 10 równoczesnych get -> 1 load)", async () => {
    const gate = deferred<PermissionSnapshot>();
    const load = vi.fn(() => gate.promise);
    const cache = createPermissionCache({ load });

    const promises = Array.from({ length: 10 }, () =>
      cache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 }),
    );

    expect(load).toHaveBeenCalledTimes(1);
    const snapshot = janSnapshot({ authzRevision: 1 });
    gate.resolve(snapshot);

    const results = await Promise.all(promises);
    expect(results).toHaveLength(10);
    for (const item of results) {
      expect(item).toEqual(snapshot);
    }
  });

  it("dołączony wywołujący z wyższym authzRevision ponawia ładowanie najwyżej raz", async () => {
    const firstGate = deferred<PermissionSnapshot>();
    const secondGate = deferred<PermissionSnapshot>();
    const load = vi
      .fn<() => Promise<PermissionSnapshot>>()
      .mockReturnValueOnce(firstGate.promise)
      .mockReturnValueOnce(secondGate.promise);

    const cache = createPermissionCache({ load });

    const callerRev1 = cache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    const callerRev3 = cache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 3 });

    expect(load).toHaveBeenCalledTimes(1);
    firstGate.resolve(janSnapshot({ authzRevision: 1 }));

    expect((await callerRev1).authzRevision).toBe(1);

    // Nawet jeśli drugie ładowanie zwróci rev 2 (< 3), ponawia najwyżej raz i zwraca ten wynik bez pętli
    secondGate.resolve(janSnapshot({ authzRevision: 2 }));
    expect((await callerRev3).authzRevision).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("nie zapisuje nieudanego ładowania, odrzuca wszystkich czekających i ponawia przy kolejnym get", async () => {
    const gate = deferred<PermissionSnapshot>();
    const load = vi
      .fn<() => Promise<PermissionSnapshot>>()
      .mockReturnValueOnce(gate.promise)
      .mockResolvedValueOnce(janSnapshot({ authzRevision: 1 }));

    const cache = createPermissionCache({ load });

    const p1 = cache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    const p2 = cache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });

    gate.reject(new Error("Core unavailable"));

    await expect(p1).rejects.toThrow("Core unavailable");
    await expect(p2).rejects.toThrow("Core unavailable");

    const recovered = await cache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    expect(recovered.accountId).toBe(JAN_ACCOUNT_ID);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("unieważnia wpisy według konta, firmy albo całości", async () => {
    const load = vi.fn(async ({ accountId, organizationId }) =>
      janSnapshot({ accountId, organizationId, authzRevision: 1 }),
    );
    const cache = createPermissionCache({ load });

    await cache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    await cache.get({ accountId: ANNA_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    await cache.get({ accountId: PIOTR_ACCOUNT_ID, organizationId: BETA_ORG_ID, authzRevision: 1 });
    expect(load).toHaveBeenCalledTimes(3);

    // Unieważnienie jednego konta
    cache.invalidate({ accountId: JAN_ACCOUNT_ID });
    await cache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    await cache.get({ accountId: ANNA_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    expect(load).toHaveBeenCalledTimes(4);

    // Unieważnienie całej firmy Acme (nie rusza Beta)
    cache.invalidate({ organizationId: ACME_ORG_ID });
    await cache.get({ accountId: PIOTR_ACCOUNT_ID, organizationId: BETA_ORG_ID, authzRevision: 1 });
    expect(load).toHaveBeenCalledTimes(4);
    await cache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    await cache.get({ accountId: ANNA_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    expect(load).toHaveBeenCalledTimes(6);

    // Unieważnienie wszystkiego
    cache.invalidate();
    await cache.get({ accountId: PIOTR_ACCOUNT_ID, organizationId: BETA_ORG_ID, authzRevision: 1 });
    expect(load).toHaveBeenCalledTimes(7);
  });

  it("unieważnienie w trakcie ładowania zapobiega zapisaniu przestarzałej migawki w pamięci podręcznej", async () => {
    const staleGate = deferred<PermissionSnapshot>();
    const freshGate = deferred<PermissionSnapshot>();
    const load = vi
      .fn<() => Promise<PermissionSnapshot>>()
      .mockReturnValueOnce(staleGate.promise)
      .mockReturnValueOnce(freshGate.promise);

    const cache = createPermissionCache({ load });

    const beforeInvalidate = cache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    cache.invalidate({ organizationId: ACME_ORG_ID });

    // Wywołanie po unieważnieniu startuje osobne ładowanie zamiast czekać na przestarzałe
    const afterInvalidate = cache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    expect(load).toHaveBeenCalledTimes(2);

    // Świeża odpowiedź kończy się przed albo po przestarzałej — przestarzała nie nadpisuje cache
    freshGate.resolve(janSnapshot({ authzRevision: 2 }));
    staleGate.resolve(janSnapshot({ authzRevision: 1 }));

    expect((await beforeInvalidate).authzRevision).toBe(1);
    expect((await afterInvalidate).authzRevision).toBe(2);

    const cached = await cache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    expect(cached.authzRevision).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("usuwa najdawniej używany wpis przy przekroczeniu maxEntries (LRU)", async () => {
    const load = vi.fn(async ({ accountId, organizationId }) =>
      janSnapshot({ accountId, organizationId, authzRevision: 1 }),
    );
    const cache = createPermissionCache({ load, maxEntries: 2 });

    await cache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    await cache.get({ accountId: ANNA_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    // Odświeżenie Jana -> Anna staje się najdawniej używana
    await cache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    // Dodanie Piotra wyrzuca Annę
    await cache.get({ accountId: PIOTR_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    expect(load).toHaveBeenCalledTimes(3);

    // Jan i Piotr nadal w cache
    await cache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    await cache.get({ accountId: PIOTR_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    expect(load).toHaveBeenCalledTimes(3);

    // Anna została usunięta i musi zostać załadowana ponownie
    await cache.get({ accountId: ANNA_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 });
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("odrzuca migawkę innego konta, innej firmy oraz dane niezgodne ze schematem", async () => {
    const wrongAccountCache = createPermissionCache({
      load: async () => janSnapshot({ accountId: ANNA_ACCOUNT_ID, organizationId: ACME_ORG_ID }),
    });
    await expect(
      wrongAccountCache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 }),
    ).rejects.toThrow(/accountId|organizationId/);

    const wrongOrgCache = createPermissionCache({
      load: async () => janSnapshot({ accountId: JAN_ACCOUNT_ID, organizationId: BETA_ORG_ID }),
    });
    await expect(
      wrongOrgCache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 }),
    ).rejects.toThrow(/accountId|organizationId/);

    const invalidDataCache = createPermissionCache({
      load: async () => ({ invalid: true }),
    });
    await expect(
      invalidDataCache.get({ accountId: JAN_ACCOUNT_ID, organizationId: ACME_ORG_ID, authzRevision: 1 }),
    ).rejects.toThrow();
  });

  it("odrzuca niepoprawne opcje maxAgeMs i maxEntries", () => {
    expect(() => createPermissionCache({ load: async () => janSnapshot(), maxAgeMs: -1 })).toThrow(RangeError);
    expect(() => createPermissionCache({ load: async () => janSnapshot(), maxAgeMs: Number.NaN })).toThrow(RangeError);
    expect(() => createPermissionCache({ load: async () => janSnapshot(), maxEntries: 0 })).toThrow(RangeError);
    expect(() => createPermissionCache({ load: async () => janSnapshot(), maxEntries: 1.5 })).toThrow(RangeError);
  });
});
