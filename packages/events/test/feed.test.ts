import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EventValidationError,
  coreEvents,
  createEventConsumer,
  createEventFeedPoller,
  organizationPermissionsChanged,
  type EventConsumer,
  type FeedCursorStore,
  type FeedEvent,
  type FeedPage,
  type ProcessedEventStore,
  type ResourceVersionStore,
} from "../src/index.js";

const ORG_ID = "01936f4e-7d10-7a2b-8c3d-4e5f6a7b8c9d";

function createMemoryStores() {
  const processedKeys = new Map<string, Date>();
  const versions = new Map<string, number>();

  const processed: ProcessedEventStore<undefined> = {
    async isProcessed(_tx, consumer, eventId) {
      return processedKeys.has(`${consumer}:${eventId}`);
    },
    async markProcessed(_tx, consumer, eventId, processedAt) {
      processedKeys.set(`${consumer}:${eventId}`, processedAt);
    },
  };

  const resourceVersions: ResourceVersionStore<undefined> = {
    async get(_tx, resourceType, resourceId) {
      return versions.get(`${resourceType}:${resourceId}`) ?? null;
    },
  };

  return { processed, resourceVersions, processedKeys, versions };
}

function createMemoryCursorStore(initial: string | null = null) {
  let current: string | null = initial;
  const saved: string[] = [];

  const store: FeedCursorStore = {
    async load() {
      return current;
    },
    async save(sequence) {
      saved.push(sequence);
      current = sequence;
    },
  };

  return {
    store,
    saved,
    get current() {
      return current;
    },
  };
}

function makePermissionFeedEvent(sequence: string, authzRevision: number): FeedEvent {
  const envelope = organizationPermissionsChanged.create({
    source: "core",
    organizationId: ORG_ID,
    resourceType: "organization",
    resourceId: ORG_ID,
    resourceVersion: authzRevision,
    data: { authzRevision },
  });
  return { ...envelope, sequence };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createEventFeedPoller", () => {
  it("validates options at creation time", () => {
    const { processed } = createMemoryStores();
    const consumer = createEventConsumer({
      consumer: "timotime",
      catalog: coreEvents,
      processed,
      handlers: {},
    });
    const cursor = createMemoryCursorStore().store;
    const fetchPage = async (): Promise<FeedPage> => ({ items: [], nextCursor: null });

    expect(() => createEventFeedPoller({ consumer, fetchPage, cursor, limit: 0 })).toThrow(TypeError);
    expect(() => createEventFeedPoller({ consumer, fetchPage, cursor, limit: 501 })).toThrow(TypeError);
    expect(() => createEventFeedPoller({ consumer, fetchPage, cursor, limit: 1.5 })).toThrow(TypeError);
    expect(() => createEventFeedPoller({ consumer, fetchPage, cursor, maxPagesPerRun: 0 })).toThrow(TypeError);
    expect(() => createEventFeedPoller({ consumer, fetchPage, cursor, maxPagesPerRun: 2.5 })).toThrow(TypeError);
    expect(() => createEventFeedPoller({ consumer, fetchPage, cursor, intervalMs: 99 })).toThrow(TypeError);
    expect(() => createEventFeedPoller({ consumer, fetchPage, cursor, intervalMs: 100.5 })).toThrow(TypeError);
    expect(() =>
      createEventFeedPoller({
        consumer: {} as EventConsumer,
        fetchPage,
        cursor,
      }),
    ).toThrow(TypeError);
  });

  it("fetches two pages in order, strips sequence before consumer.handle, and stops when caught up", async () => {
    const { processed } = createMemoryStores();
    const receivedRevisions: number[] = [];
    const innerConsumer = createEventConsumer({
      consumer: "timotime",
      catalog: coreEvents,
      processed,
      handlers: {
        "organization.permissions.changed": async (event) => {
          receivedRevisions.push(event.data.authzRevision);
        },
      },
    });

    const rawSeen: unknown[] = [];
    const consumer: EventConsumer = {
      async handle(raw) {
        rawSeen.push(raw);
        return innerConsumer.handle(raw);
      },
    };

    const e1 = makePermissionFeedEvent("1", 1);
    const e2 = makePermissionFeedEvent("2", 2);
    const e3 = makePermissionFeedEvent("3", 3);

    const fetchCalls: Array<{ after: string | null; limit: number }> = [];
    const fetchPage = vi.fn(async (after: string | null, limit: number): Promise<FeedPage> => {
      fetchCalls.push({ after, limit });
      if (after === null) {
        return { items: [e1, e2], nextCursor: "2" };
      }
      if (after === "2") {
        return { items: [e3], nextCursor: null };
      }
      return { items: [], nextCursor: null };
    });

    const cursorState = createMemoryCursorStore();
    const poller = createEventFeedPoller({
      consumer,
      fetchPage,
      cursor: cursorState.store,
      limit: 2,
    });

    const summary = await poller.runOnce();
    expect(summary).toEqual({
      processed: 3,
      duplicate: 0,
      stale: 0,
      ignored: 0,
      pages: 2,
      cursor: "3",
      caughtUp: true,
    });
    expect(fetchCalls).toEqual([
      { after: null, limit: 2 },
      { after: "2", limit: 2 },
    ]);
    expect(receivedRevisions).toEqual([1, 2, 3]);
    expect(cursorState.saved).toEqual(["1", "2", "3"]);
    for (const raw of rawSeen) {
      expect(typeof raw).toBe("object");
      expect(raw).not.toBeNull();
      expect("sequence" in (raw as Record<string, unknown>)).toBe(false);
    }
  });

  it("saves the cursor after each event and resumes from it on the next run", async () => {
    const { processed } = createMemoryStores();
    const handled: number[] = [];
    const consumer = createEventConsumer({
      consumer: "timotime",
      catalog: coreEvents,
      processed,
      handlers: {
        "organization.permissions.changed": async (event) => {
          handled.push(event.data.authzRevision);
        },
      },
    });

    const e1 = makePermissionFeedEvent("9", 1);
    const e2 = makePermissionFeedEvent("10", 2);
    const e3 = makePermissionFeedEvent("11", 3);
    const feed = [e1, e2, e3];

    const cursorState = createMemoryCursorStore();
    const seenAfter: Array<string | null> = [];
    let availableUpTo = 2;

    const poller = createEventFeedPoller({
      consumer,
      cursor: cursorState.store,
      fetchPage: async (after) => {
        seenAfter.push(after);
        const afterBig = after === null ? 0n : BigInt(after);
        const items = feed.slice(0, availableUpTo).filter((item) => BigInt(item.sequence) > afterBig);
        return { items, nextCursor: null };
      },
    });

    const first = await poller.runOnce();
    expect(first).toEqual({
      processed: 2,
      duplicate: 0,
      stale: 0,
      ignored: 0,
      pages: 1,
      cursor: "10",
      caughtUp: true,
    });
    expect(cursorState.saved).toEqual(["9", "10"]);

    availableUpTo = 3;
    const second = await poller.runOnce();
    expect(second).toEqual({
      processed: 1,
      duplicate: 0,
      stale: 0,
      ignored: 0,
      pages: 1,
      cursor: "11",
      caughtUp: true,
    });
    expect(seenAfter).toEqual([null, "10"]);
    expect(handled).toEqual([1, 2, 3]);
  });

  it("counts duplicate, stale, and ignored outcomes from consumer.handle", async () => {
    const { processed, resourceVersions, versions } = createMemoryStores();
    versions.set(`organization:${ORG_ID}`, 5);

    const consumer = createEventConsumer({
      consumer: "timotime",
      catalog: coreEvents,
      processed,
      resourceVersions,
      handlers: {
        "organization.permissions.changed": async () => {},
      },
    });

    const fresh = makePermissionFeedEvent("1", 6);
    const duplicateOfFresh: FeedEvent = { ...fresh, sequence: "2" };
    const stale = makePermissionFeedEvent("3", 4);
    const ignored: FeedEvent = {
      ...organizationPermissionsChanged.create({
        source: "core",
        organizationId: ORG_ID,
        resourceType: "organization",
        resourceId: ORG_ID,
        resourceVersion: 7,
        data: { authzRevision: 7 },
      }),
      type: "organization.account.deactivated",
      sequence: "4",
    };

    const cursorState = createMemoryCursorStore();
    const poller = createEventFeedPoller({
      consumer,
      cursor: cursorState.store,
      fetchPage: async () => ({
        items: [fresh, duplicateOfFresh, stale, ignored],
        nextCursor: null,
      }),
    });

    const summary = await poller.runOnce();
    expect(summary).toEqual({
      processed: 1,
      duplicate: 1,
      stale: 1,
      ignored: 1,
      pages: 1,
      cursor: "4",
      caughtUp: true,
    });
  });

  it("stops on handler error, rejects, keeps cursor at the last saved event, and retries on next run", async () => {
    const { processed } = createMemoryStores();
    let failSecond = true;
    const applied: number[] = [];

    const consumer = createEventConsumer({
      consumer: "timotime",
      catalog: coreEvents,
      processed,
      handlers: {
        "organization.permissions.changed": async (event) => {
          if (failSecond && event.data.authzRevision === 2) {
            throw new Error("DB write failed");
          }
          applied.push(event.data.authzRevision);
        },
      },
    });

    const e1 = makePermissionFeedEvent("1", 1);
    const e2 = makePermissionFeedEvent("2", 2);
    const e3 = makePermissionFeedEvent("3", 3);
    const feed = [e1, e2, e3];

    const cursorState = createMemoryCursorStore();
    const poller = createEventFeedPoller({
      consumer,
      cursor: cursorState.store,
      fetchPage: async (after) => {
        const afterBig = after === null ? 0n : BigInt(after);
        return {
          items: feed.filter((item) => BigInt(item.sequence) > afterBig),
          nextCursor: null,
        };
      },
    });

    await expect(poller.runOnce()).rejects.toThrow("DB write failed");
    expect(cursorState.current).toBe("1");
    expect(cursorState.saved).toEqual(["1"]);
    expect(applied).toEqual([1]);

    failSecond = false;
    const retrySummary = await poller.runOnce();
    expect(retrySummary).toEqual({
      processed: 2,
      duplicate: 0,
      stale: 0,
      ignored: 0,
      pages: 1,
      cursor: "3",
      caughtUp: true,
    });
    expect(applied).toEqual([1, 2, 3]);
    expect(cursorState.current).toBe("3");
  });

  it("rejects malformed or non-increasing sequences with EventValidationError using BigInt comparison", async () => {
    const { processed } = createMemoryStores();
    const consumer = createEventConsumer({
      consumer: "timotime",
      catalog: coreEvents,
      processed,
      handlers: { "organization.permissions.changed": async () => {} },
    });

    const malformedCases = ["0", "01", "-5", "abc", "", "1.5"];
    for (const badSequence of malformedCases) {
      const poller = createEventFeedPoller({
        consumer,
        cursor: createMemoryCursorStore().store,
        fetchPage: async () => ({
          items: [makePermissionFeedEvent(badSequence, 1)],
          nextCursor: null,
        }),
      });
      await expect(poller.runOnce()).rejects.toBeInstanceOf(EventValidationError);
    }

    // "9" is lexicographically greater than "10", so BigInt comparison must catch it as non-increasing.
    const nonIncreasingFromStore = createEventFeedPoller({
      consumer,
      cursor: createMemoryCursorStore("10").store,
      fetchPage: async () => ({
        items: [makePermissionFeedEvent("9", 1)],
        nextCursor: null,
      }),
    });
    await expect(nonIncreasingFromStore.runOnce()).rejects.toBeInstanceOf(EventValidationError);

    // Duplicate sequence within the same page must also throw EventValidationError.
    const cursorState = createMemoryCursorStore();
    const nonIncreasingInPage = createEventFeedPoller({
      consumer,
      cursor: cursorState.store,
      fetchPage: async () => ({
        items: [makePermissionFeedEvent("10", 1), makePermissionFeedEvent("10", 2)],
        nextCursor: null,
      }),
    });
    await expect(nonIncreasingInPage.runOnce()).rejects.toBeInstanceOf(EventValidationError);
    expect(cursorState.current).toBe("10");

    // 64-bit integer sequences larger than Number.MAX_SAFE_INTEGER work cleanly.
    const largePoller = createEventFeedPoller({
      consumer,
      cursor: createMemoryCursorStore("9007199254740993").store,
      fetchPage: async () => ({
        items: [makePermissionFeedEvent("9007199254740994", 1)],
        nextCursor: null,
      }),
    });
    await expect(largePoller.runOnce()).resolves.toMatchObject({
      processed: 1,
      cursor: "9007199254740994",
      caughtUp: true,
    });
  });

  it("handles an empty page cleanly", async () => {
    const { processed } = createMemoryStores();
    const consumer = createEventConsumer({
      consumer: "timotime",
      catalog: coreEvents,
      processed,
      handlers: {},
    });

    const cursorState = createMemoryCursorStore("42");
    const fetchPage = vi.fn(async (): Promise<FeedPage> => ({
      items: [],
      nextCursor: null,
    }));

    const poller = createEventFeedPoller({
      consumer,
      cursor: cursorState.store,
      fetchPage,
    });

    const summary = await poller.runOnce();
    expect(summary).toEqual({
      processed: 0,
      duplicate: 0,
      stale: 0,
      ignored: 0,
      pages: 1,
      cursor: "42",
      caughtUp: true,
    });
    expect(cursorState.saved).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("stops at maxPagesPerRun and reports caughtUp false when more pages remain", async () => {
    const { processed } = createMemoryStores();
    const consumer = createEventConsumer({
      consumer: "timotime",
      catalog: coreEvents,
      processed,
      handlers: { "organization.permissions.changed": async () => {} },
    });

    const cursorState = createMemoryCursorStore();
    const fetchPage = vi.fn(async (after: string | null): Promise<FeedPage> => {
      const next = String((after === null ? 0 : Number(after)) + 1);
      return {
        items: [makePermissionFeedEvent(next, Number(next))],
        nextCursor: next,
      };
    });

    const poller = createEventFeedPoller({
      consumer,
      cursor: cursorState.store,
      fetchPage,
      limit: 1,
      maxPagesPerRun: 2,
    });

    const summary = await poller.runOnce();
    expect(summary).toEqual({
      processed: 2,
      duplicate: 0,
      stale: 0,
      ignored: 0,
      pages: 2,
      cursor: "2",
      caughtUp: false,
    });
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("shares a single in-flight run across concurrent runOnce calls", async () => {
    const { processed } = createMemoryStores();
    const consumer = createEventConsumer({
      consumer: "timotime",
      catalog: coreEvents,
      processed,
      handlers: { "organization.permissions.changed": async () => {} },
    });

    let releaseFetch!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });

    const fetchPage = vi.fn(async (after: string | null): Promise<FeedPage> => {
      await gate;
      return {
        items: after === null ? [makePermissionFeedEvent("1", 1)] : [],
        nextCursor: null,
      };
    });

    const poller = createEventFeedPoller({
      consumer,
      cursor: createMemoryCursorStore().store,
      fetchPage,
    });

    const first = poller.runOnce();
    const second = poller.runOnce();
    expect(first).toBe(second);

    releaseFetch();
    const [resA, resB] = await Promise.all([first, second]);
    expect(resA).toBe(resB);
    expect(resA.processed).toBe(1);
    expect(fetchPage).toHaveBeenCalledTimes(1);

    await poller.runOnce();
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("runs immediately on start(), polls after intervalMs once previous run finishes, handles errors via onError, and stops cleanly", async () => {
    vi.useFakeTimers();

    const { processed } = createMemoryStores();
    const consumer = createEventConsumer({
      consumer: "timotime",
      catalog: coreEvents,
      processed,
      handlers: { "organization.permissions.changed": async () => {} },
    });

    let call = 0;
    const errors: unknown[] = [];
    const fetchPage = vi.fn(async (): Promise<FeedPage> => {
      call += 1;
      if (call === 2) {
        throw new Error("Core temporarily unavailable");
      }
      return {
        items: call === 1 ? [makePermissionFeedEvent("1", 1)] : [makePermissionFeedEvent(String(call), call)],
        nextCursor: null,
      };
    });

    const poller = createEventFeedPoller({
      consumer,
      cursor: createMemoryCursorStore().store,
      fetchPage,
      intervalMs: 1000,
      onError: (err) => {
        errors.push(err);
      },
    });

    const stop = poller.start();

    // First run starts immediately without waiting for intervalMs.
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchPage).toHaveBeenCalledTimes(1);

    // Before intervalMs passes, no second run occurs.
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchPage).toHaveBeenCalledTimes(1);

    // At intervalMs, second run runs and throws -> routed to onError, loop keeps running.
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("Core temporarily unavailable");

    // After another intervalMs, third run executes normally.
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchPage).toHaveBeenCalledTimes(3);

    // Stopping cancels pending timers and prevents further runs.
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("never overlaps runs when a run takes longer than intervalMs and lets in-flight run finish on stop", async () => {
    vi.useFakeTimers();

    const { processed } = createMemoryStores();
    const consumer = createEventConsumer({
      consumer: "timotime",
      catalog: coreEvents,
      processed,
      handlers: {},
    });

    let releaseRun!: () => void;
    let inFlightCount = 0;
    let maxConcurrent = 0;

    const fetchPage = vi.fn(async (): Promise<FeedPage> => {
      inFlightCount += 1;
      maxConcurrent = Math.max(maxConcurrent, inFlightCount);
      await new Promise<void>((resolve) => {
        releaseRun = resolve;
      });
      inFlightCount -= 1;
      return { items: [], nextCursor: null };
    });

    const poller = createEventFeedPoller({
      consumer,
      cursor: createMemoryCursorStore().store,
      fetchPage,
      intervalMs: 200,
    });

    const stop = poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchPage).toHaveBeenCalledTimes(1);

    // Advancing longer than intervalMs while run 1 is still in flight must NOT start run 2.
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(maxConcurrent).toBe(1);

    // Calling stop while run 1 is in flight allows it to finish without scheduling run 2.
    stop();
    releaseRun();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(inFlightCount).toBe(0);
  });
});
