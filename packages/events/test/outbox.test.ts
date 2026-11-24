import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  EventValidationError,
  createOutboxRelay,
  defineEvent,
  fromOutboxRecord,
  toOutboxRecord,
  type EventEnvelope,
  type OutboxRecord,
} from "../src/index.js";

const ORG_ID = "01936f4e-7d10-7a2b-8c3d-4e5f6a7b8c9d";

const itemChanged = defineEvent({
  type: "organization.item.changed",
  version: 1,
  data: z.object({ step: z.number().int() }),
});

function makeRecord(step: number, resourceId = `item-${step}`): OutboxRecord {
  const envelope = itemChanged.create({
    source: "core",
    organizationId: ORG_ID,
    resourceType: "item",
    resourceId,
    resourceVersion: step,
    occurredAt: new Date(Date.UTC(2026, 10, 22, 10, 0, step)),
    data: { step },
  });
  return toOutboxRecord(envelope);
}

describe("outbox record conversion", () => {
  it("round-trips between EventEnvelope and OutboxRecord without storing source or traceId", () => {
    const envelope = itemChanged.create({
      source: "core",
      organizationId: null,
      resourceType: "item",
      resourceId: "item-1",
      resourceVersion: 0,
      occurredAt: new Date("2026-11-22T10:15:00.000Z"),
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      data: { step: 1 },
    });

    const record = toOutboxRecord(envelope);
    expect(record).toEqual({
      id: envelope.id,
      organizationId: null,
      type: envelope.type,
      version: envelope.version,
      resourceType: envelope.resourceType,
      resourceId: envelope.resourceId,
      resourceVersion: envelope.resourceVersion,
      payload: { step: 1 },
      occurredAt: new Date("2026-11-22T10:15:00.000Z"),
      publishedAt: null,
    });
    expect("source" in record).toBe(false);
    expect("traceId" in record).toBe(false);

    const restored = fromOutboxRecord(record, {
      source: "core",
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
    });
    expect(restored).toEqual(envelope);
  });

  it("rejects invalid envelopes and invalid outbox records", () => {
    expect(() => toOutboxRecord({ id: "bad" } as unknown as EventEnvelope)).toThrow(EventValidationError);

    const valid = makeRecord(1);
    expect(() => fromOutboxRecord({ ...valid, occurredAt: new Date("invalid") }, { source: "core" })).toThrow(
      EventValidationError,
    );
    expect(() => fromOutboxRecord(valid, { source: "BAD" })).toThrow(EventValidationError);
  });
});

describe("createOutboxRelay", () => {
  it("rejects invalid source or batchSize", () => {
    const noop = {
      fetchPending: async () => [],
      publish: async () => {},
      markPublished: async () => {},
    };
    expect(() => createOutboxRelay({ ...noop, source: "BAD-SOURCE" })).toThrow(TypeError);
    expect(() => createOutboxRelay({ ...noop, source: "core", batchSize: 0 })).toThrow(TypeError);
    expect(() => createOutboxRelay({ ...noop, source: "core", batchSize: 1.5 })).toThrow(TypeError);
  });

  it("publishes pending records in order and marks them with the current timestamp", async () => {
    const records = [makeRecord(1), makeRecord(2), makeRecord(3)];
    const publishedEnvelopes: EventEnvelope[] = [];
    const marked: Array<{ ids: readonly string[]; at: Date }> = [];
    const fixedNow = new Date("2026-11-22T12:00:00.000Z");

    const relay = createOutboxRelay({
      source: "core",
      fetchPending: async () => records,
      publish: async (envelopes) => {
        publishedEnvelopes.push(...envelopes);
      },
      markPublished: async (ids, publishedAt) => {
        marked.push({ ids, at: publishedAt });
      },
      now: () => fixedNow,
    });

    const result = await relay.runOnce();
    expect(result).toEqual({ fetched: 3, published: 3, failed: [] });
    expect(publishedEnvelopes.map((e) => e.id)).toEqual(records.map((r) => r.id));
    expect(marked).toEqual([{ ids: records.map((r) => r.id), at: fixedNow }]);
  });

  it("handles partial publish failures by marking only published ids", async () => {
    const records = [makeRecord(1), makeRecord(2), makeRecord(3)];
    const markedIds: string[] = [];

    const relay = createOutboxRelay({
      source: "core",
      fetchPending: async () => records,
      publish: async () => ({ failedIds: [records[1]!.id] }),
      markPublished: async (ids) => {
        markedIds.push(...ids);
      },
    });

    const result = await relay.runOnce();
    expect(result.fetched).toBe(3);
    expect(result.published).toBe(2);
    expect(result.failed).toEqual([{ id: records[1]!.id, reason: "publish_failed" }]);
    expect(markedIds).toEqual([records[0]!.id, records[2]!.id]);
  });

  it("marks nothing and rethrows if publish throws", async () => {
    const records = [makeRecord(1), makeRecord(2)];
    const markPublished = vi.fn(async () => {});

    const relay = createOutboxRelay({
      source: "core",
      fetchPending: async () => records,
      publish: async () => {
        throw new Error("EventBridge unavailable");
      },
      markPublished,
    });

    await expect(relay.runOnce()).rejects.toThrow("EventBridge unavailable");
    expect(markPublished).not.toHaveBeenCalled();
  });

  it("skips corrupt records, reports them in failed, and publishes the rest", async () => {
    const good1 = makeRecord(1);
    const corrupt: OutboxRecord = { ...makeRecord(2), type: "invalid_single_segment" };
    const good3 = makeRecord(3);

    const publishedIds: string[] = [];
    const markedIds: string[] = [];

    const relay = createOutboxRelay({
      source: "core",
      fetchPending: async () => [good1, corrupt, good3],
      publish: async (envelopes) => {
        publishedIds.push(...envelopes.map((e) => e.id));
      },
      markPublished: async (ids) => {
        markedIds.push(...ids);
      },
    });

    const result = await relay.runOnce();
    expect(result.fetched).toBe(3);
    expect(result.published).toBe(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.id).toBe(corrupt.id);
    expect(result.failed[0]?.reason).toBe("invalid");
    expect(result.failed[0]?.error).toBeInstanceOf(EventValidationError);
    expect(publishedIds).toEqual([good1.id, good3.id]);
    expect(markedIds).toEqual([good1.id, good3.id]);
  });

  it("shares a single in-flight run for concurrent runOnce calls", async () => {
    const records = [makeRecord(1)];
    let releaseFetch!: () => void;
    const fetchGate = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });

    const fetchPending = vi.fn(async () => {
      await fetchGate;
      return records;
    });
    const publish = vi.fn(async () => {});
    const markPublished = vi.fn(async () => {});

    const relay = createOutboxRelay({
      source: "core",
      fetchPending,
      publish,
      markPublished,
    });

    const first = relay.runOnce();
    const second = relay.runOnce();
    expect(first).toBe(second);

    releaseFetch();
    const [resultA, resultB] = await Promise.all([first, second]);
    expect(resultA).toEqual({ fetched: 1, published: 1, failed: [] });
    expect(resultB).toBe(resultA);
    expect(fetchPending).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(markPublished).toHaveBeenCalledTimes(1);

    // Subsequent call after completion starts a fresh run.
    await relay.runOnce();
    expect(fetchPending).toHaveBeenCalledTimes(2);
  });

  it("respects batchSize when fetching and slicing records", async () => {
    const records = [makeRecord(1), makeRecord(2), makeRecord(3)];
    const receivedLimits: number[] = [];
    const publishedIds: string[] = [];

    const relay = createOutboxRelay({
      source: "core",
      batchSize: 2,
      fetchPending: async (limit) => {
        receivedLimits.push(limit);
        return records;
      },
      publish: async (envelopes) => {
        publishedIds.push(...envelopes.map((e) => e.id));
      },
      markPublished: async () => {},
    });

    const result = await relay.runOnce();
    expect(receivedLimits).toEqual([2]);
    expect(result).toEqual({ fetched: 2, published: 2, failed: [] });
    expect(publishedIds).toEqual([records[0]!.id, records[1]!.id]);
  });

  it("does not call publish or markPublished when there are no pending records", async () => {
    const publish = vi.fn(async () => {});
    const markPublished = vi.fn(async () => {});

    const relay = createOutboxRelay({
      source: "core",
      fetchPending: async () => [],
      publish,
      markPublished,
    });

    const result = await relay.runOnce();
    expect(result).toEqual({ fetched: 0, published: 0, failed: [] });
    expect(publish).not.toHaveBeenCalled();
    expect(markPublished).not.toHaveBeenCalled();
  });
});
