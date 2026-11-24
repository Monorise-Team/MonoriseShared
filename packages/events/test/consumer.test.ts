import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  EventValidationError,
  UnsupportedEventVersionError,
  coreEvents,
  createEventConsumer,
  defineEvent,
  defineEventCatalog,
  on,
  organizationPermissionsChanged,
  type ProcessedEventStore,
  type ResourceVersionStore,
} from "../src/index.js";

const ORG_ID = "01936f4e-7d10-7a2b-8c3d-4e5f6a7b8c9d";
const RESOURCE_ID = "01936f4e-8a1b-7c3d-9e2f-0a1b2c3d4e5f";

const sampleUpdated = defineEvent({
  type: "organization.sample.updated",
  version: 1,
  data: z.object({ value: z.string() }),
});

const otherEvent = defineEvent({
  type: "organization.other.created",
  version: 1,
  data: z.object({ ok: z.boolean() }),
});

const catalog = defineEventCatalog([sampleUpdated, otherEvent]);

function createMemoryStores<TTx>() {
  const processedKeys = new Map<string, Date>();
  const versions = new Map<string, number>();

  const processed: ProcessedEventStore<TTx> = {
    async isProcessed(_tx, consumer, eventId) {
      return processedKeys.has(`${consumer}:${eventId}`);
    },
    async markProcessed(_tx, consumer, eventId, processedAt) {
      processedKeys.set(`${consumer}:${eventId}`, processedAt);
    },
  };

  const resourceVersions: ResourceVersionStore<TTx> = {
    async get(_tx, resourceType, resourceId) {
      return versions.get(`${resourceType}:${resourceId}`) ?? null;
    },
  };

  return { processed, resourceVersions, processedKeys, versions };
}

describe("createEventConsumer", () => {
  it("validates consumer name at creation time", () => {
    const { processed } = createMemoryStores<undefined>();
    expect(() =>
      createEventConsumer({
        consumer: "TimoTime",
        catalog,
        handlers: {},
        processed,
      }),
    ).toThrow(TypeError);

    expect(() =>
      createEventConsumer({
        consumer: "timo_time",
        catalog,
        handlers: {},
        processed,
      }),
    ).toThrow(TypeError);
  });

  it("processes a new event once and skips duplicates on second delivery", async () => {
    const { processed } = createMemoryStores<undefined>();
    const applied: string[] = [];

    const consumer = createEventConsumer({
      consumer: "timotime",
      catalog,
      processed,
      handlers: {
        "organization.sample.updated": on(sampleUpdated, async (event, ctx) => {
          expect(ctx.consumer).toBe("timotime");
          expect(ctx.tx).toBeUndefined();
          applied.push(event.data.value);
        }),
      },
    });

    const event = sampleUpdated.create({
      source: "core",
      organizationId: ORG_ID,
      resourceType: "sample",
      resourceId: RESOURCE_ID,
      resourceVersion: 1,
      data: { value: "first" },
    });

    expect(await consumer.handle(event)).toBe("processed");
    expect(await consumer.handle(event)).toBe("duplicate");
    expect(applied).toEqual(["first"]);
  });

  it("marks stale events (older or equal resourceVersion) as processed without running the handler", async () => {
    const { processed, resourceVersions, processedKeys, versions } = createMemoryStores<undefined>();
    const handler = vi.fn(async () => {});

    versions.set(`sample:${RESOURCE_ID}`, 5);

    const consumer = createEventConsumer({
      consumer: "timotime",
      catalog,
      processed,
      resourceVersions,
      handlers: {
        "organization.sample.updated": handler,
      },
    });

    const older = sampleUpdated.create({
      source: "core",
      organizationId: ORG_ID,
      resourceType: "sample",
      resourceId: RESOURCE_ID,
      resourceVersion: 4,
      data: { value: "old" },
    });
    const equal = sampleUpdated.create({
      source: "core",
      organizationId: ORG_ID,
      resourceType: "sample",
      resourceId: RESOURCE_ID,
      resourceVersion: 5,
      data: { value: "same" },
    });
    const newer = sampleUpdated.create({
      source: "core",
      organizationId: ORG_ID,
      resourceType: "sample",
      resourceId: RESOURCE_ID,
      resourceVersion: 6,
      data: { value: "new" },
    });

    expect(await consumer.handle(older)).toBe("stale");
    expect(await consumer.handle(equal)).toBe("stale");
    expect(processedKeys.has(`timotime:${older.id}`)).toBe(true);
    expect(processedKeys.has(`timotime:${equal.id}`)).toBe(true);
    expect(handler).not.toHaveBeenCalled();

    // Redelivering a previously-stale event is now recognized as a duplicate.
    expect(await consumer.handle(older)).toBe("duplicate");

    expect(await consumer.handle(newer)).toBe("processed");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("treats known resourceVersion 0 as stale for incoming version 0", async () => {
    const { processed, resourceVersions, versions } = createMemoryStores<undefined>();
    const handler = vi.fn(async () => {});
    versions.set(`sample:${RESOURCE_ID}`, 0);

    const consumer = createEventConsumer({
      consumer: "timotime",
      catalog,
      processed,
      resourceVersions,
      handlers: { "organization.sample.updated": handler },
    });

    const event = sampleUpdated.create({
      source: "core",
      organizationId: ORG_ID,
      resourceType: "sample",
      resourceId: RESOURCE_ID,
      resourceVersion: 0,
      data: { value: "initial" },
    });

    expect(await consumer.handle(event)).toBe("stale");
    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores unknown types and unhandled catalog types without calling any stores or transaction", async () => {
    const isProcessed = vi.fn(async () => false);
    const markProcessed = vi.fn(async () => {});
    const getVersion = vi.fn(async () => null);
    const transactionCalled = vi.fn();

    const consumer = createEventConsumer({
      consumer: "timotime",
      catalog,
      processed: { isProcessed, markProcessed },
      resourceVersions: { get: getVersion },
      transaction: async <R>(work: (tx: { id: number }) => Promise<R>): Promise<R> => {
        transactionCalled();
        return work({ id: 1 });
      },
      handlers: {
        "organization.sample.updated": async () => {},
      },
    });

    const unhandledKnown = otherEvent.create({
      source: "core",
      organizationId: ORG_ID,
      resourceType: "other",
      resourceId: RESOURCE_ID,
      resourceVersion: 1,
      data: { ok: true },
    });
    const unknownType = {
      ...unhandledKnown,
      type: "billing.invoice.created",
      data: { number: "INV-1" },
    };

    expect(await consumer.handle(unknownType)).toBe("ignored");
    expect(await consumer.handle(unhandledKnown)).toBe("ignored");
    expect(transactionCalled).not.toHaveBeenCalled();
    expect(isProcessed).not.toHaveBeenCalled();
    expect(markProcessed).not.toHaveBeenCalled();
    expect(getVersion).not.toHaveBeenCalled();
  });

  it("throws UnsupportedEventVersionError for unknown version of a known type and EventValidationError for bad envelopes", async () => {
    const { processed } = createMemoryStores<undefined>();
    const consumer = createEventConsumer({
      consumer: "timotime",
      catalog,
      processed,
      handlers: { "organization.sample.updated": async () => {} },
    });

    const event = sampleUpdated.create({
      source: "core",
      organizationId: ORG_ID,
      resourceType: "sample",
      resourceId: RESOURCE_ID,
      resourceVersion: 1,
      data: { value: "ok" },
    });

    await expect(consumer.handle({ ...event, version: 2 })).rejects.toBeInstanceOf(UnsupportedEventVersionError);
    await expect(consumer.handle({ invalid: true })).rejects.toBeInstanceOf(EventValidationError);
  });

  it("does not mark processed when handler throws, allowing a retry to succeed", async () => {
    const { processed } = createMemoryStores<undefined>();
    let shouldFail = true;
    const attempts: string[] = [];

    const consumer = createEventConsumer({
      consumer: "timotime",
      catalog,
      processed,
      handlers: {
        "organization.sample.updated": async (event) => {
          attempts.push(event.id);
          if (shouldFail) {
            throw new Error("transient DB error");
          }
        },
      },
    });

    const event = sampleUpdated.create({
      source: "core",
      organizationId: ORG_ID,
      resourceType: "sample",
      resourceId: RESOURCE_ID,
      resourceVersion: 1,
      data: { value: "retry-me" },
    });

    await expect(consumer.handle(event)).rejects.toThrow("transient DB error");

    shouldFail = false;
    expect(await consumer.handle(event)).toBe("processed");
    expect(await consumer.handle(event)).toBe("duplicate");
    expect(attempts).toEqual([event.id, event.id]);
  });

  it("runs duplicate check, resource version check, handler, and markProcessed in one transaction with the same tx", async () => {
    interface FakeTx {
      readonly txId: string;
    }

    const seenTx: Array<{ step: string; tx: FakeTx }> = [];
    const activeTx: FakeTx = { txId: "tx-42" };
    let transactionCalls = 0;

    const consumer = createEventConsumer({
      consumer: "timotime",
      catalog,
      transaction: async <R>(work: (tx: FakeTx) => Promise<R>): Promise<R> => {
        transactionCalls += 1;
        return work(activeTx);
      },
      processed: {
        async isProcessed(tx) {
          seenTx.push({ step: "isProcessed", tx });
          return false;
        },
        async markProcessed(tx) {
          seenTx.push({ step: "markProcessed", tx });
        },
      },
      resourceVersions: {
        async get(tx) {
          seenTx.push({ step: "resourceVersions.get", tx });
          return null;
        },
      },
      handlers: {
        "organization.sample.updated": async (event, { tx }) => {
          expect(event.data.value).toBe("atomic");
          seenTx.push({ step: "handler", tx });
        },
      },
    });

    const event = sampleUpdated.create({
      source: "core",
      organizationId: ORG_ID,
      resourceType: "sample",
      resourceId: RESOURCE_ID,
      resourceVersion: 1,
      data: { value: "atomic" },
    });

    expect(await consumer.handle(event)).toBe("processed");
    expect(transactionCalls).toBe(1);
    expect(seenTx.map((entry) => entry.step)).toEqual([
      "isProcessed",
      "resourceVersions.get",
      "handler",
      "markProcessed",
    ]);
    for (const entry of seenTx) {
      expect(entry.tx).toBe(activeTx);
    }
  });
});

describe("organizationPermissionsChanged and coreEvents", () => {
  it("parses organization.permissions.changed and invalidates the permission cache", async () => {
    const { processed } = createMemoryStores<undefined>();
    const invalidate = vi.fn(async (_scope: { organizationId: string }) => {});

    const event = organizationPermissionsChanged.create({
      source: "core",
      organizationId: ORG_ID,
      resourceType: "organization",
      resourceId: ORG_ID,
      resourceVersion: 9,
      data: { authzRevision: 9 },
    });

    expect(organizationPermissionsChanged.parse(JSON.parse(JSON.stringify(event)))).toEqual(event);

    const consumer = createEventConsumer({
      consumer: "timotime",
      catalog: coreEvents,
      processed,
      handlers: {
        "organization.permissions.changed": async (incoming) => {
          if (incoming.organizationId) {
            await invalidate({ organizationId: incoming.organizationId });
          }
        },
      },
    });

    expect(await consumer.handle(event)).toBe("processed");
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ organizationId: ORG_ID });
  });
});
