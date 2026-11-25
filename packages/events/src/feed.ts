import type { EventConsumer, EventHandleResult } from "./consumer.js";
import { EventValidationError } from "./errors.js";

const POSITIVE_SEQUENCE_PATTERN = /^[1-9][0-9]*$/;
const STORED_CURSOR_PATTERN = /^(0|[1-9][0-9]*)$/;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const DEFAULT_MAX_PAGES_PER_RUN = 10;
const DEFAULT_INTERVAL_MS = 5000;
const MIN_INTERVAL_MS = 100;

/** Raw event envelope returned by the Core numbered event feed, augmented with a monotonic `sequence`. */
export interface FeedEvent {
  sequence: string;
  [field: string]: unknown;
}

/** Single page returned by `GET /core/v1/products/{product}/events`. */
export interface FeedPage {
  items: readonly FeedEvent[];
  nextCursor: string | null;
}

/** Persistence abstraction for the product's last processed feed sequence. */
export interface FeedCursorStore {
  load(): Promise<string | null>;
  save(sequence: string): Promise<void>;
}

/** Configuration for `createEventFeedPoller(...)`. */
export interface EventFeedPollerOptions {
  consumer: EventConsumer;
  fetchPage: (after: string | null, limit: number) => Promise<FeedPage>;
  cursor: FeedCursorStore;
  limit?: number;
  maxPagesPerRun?: number;
  intervalMs?: number;
  onError?: (error: unknown) => void;
}

/** Summary of a single `runOnce()` poll cycle. */
export interface EventFeedRunSummary {
  processed: number;
  duplicate: number;
  stale: number;
  ignored: number;
  pages: number;
  cursor: string | null;
  caughtUp: boolean;
}

/** Single-flight poller that pulls numbered Core events, feeds `EventConsumer`, and advances the cursor. */
export interface EventFeedPoller {
  runOnce(): Promise<EventFeedRunSummary>;
  start(): () => void;
}

function assertIntegerInRange(name: string, value: number, min: number, max?: number): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || (max !== undefined && value > max)) {
    const expected = max !== undefined ? `an integer between ${min} and ${max}` : `an integer >= ${min}`;
    throw new TypeError(`Invalid ${name} "${String(value)}": expected ${expected}`);
  }
}

function parseStoredCursor(raw: string | null): bigint | null {
  if (raw === null) return null;
  if (typeof raw !== "string" || !STORED_CURSOR_PATTERN.test(raw)) {
    throw new EventValidationError(
      `Invalid stored feed cursor "${String(raw)}": expected null or a non-negative decimal integer string`,
    );
  }
  return BigInt(raw);
}

function parseFeedSequence(item: unknown, currentCursor: bigint | null): { sequence: string; sequenceValue: bigint } {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new EventValidationError("Invalid feed event: expected an object");
  }

  const sequence = (item as { sequence?: unknown }).sequence;
  if (typeof sequence !== "string" || !POSITIVE_SEQUENCE_PATTERN.test(sequence)) {
    throw new EventValidationError(
      `Invalid feed event sequence "${String(sequence)}": expected a positive decimal integer string without leading zeros`,
    );
  }

  const sequenceValue = BigInt(sequence);
  if (currentCursor !== null && sequenceValue <= currentCursor) {
    throw new EventValidationError(
      `Non-increasing feed event sequence "${sequence}": expected > "${currentCursor.toString()}"`,
    );
  }

  return { sequence, sequenceValue };
}

/**
 * Creates a pull-based poller for the Core numbered event feed.
 *
 * Concurrent `runOnce()` calls on the same poller instance share the run in progress (single flight).
 * Each event is passed in feed order to `consumer.handle` and its `sequence` is saved to `cursor` immediately
 * afterwards, so a failed event halts the run and is retried from the last saved cursor on the next run.
 */
export function createEventFeedPoller(options: EventFeedPollerOptions): EventFeedPoller {
  const {
    consumer,
    fetchPage,
    cursor,
    limit = DEFAULT_LIMIT,
    maxPagesPerRun = DEFAULT_MAX_PAGES_PER_RUN,
    intervalMs = DEFAULT_INTERVAL_MS,
    onError,
  } = options;

  if (!consumer || typeof consumer.handle !== "function") {
    throw new TypeError("Invalid consumer: expected an EventConsumer with a handle() method");
  }
  if (typeof fetchPage !== "function") {
    throw new TypeError("Invalid fetchPage: expected a function");
  }
  if (!cursor || typeof cursor.load !== "function" || typeof cursor.save !== "function") {
    throw new TypeError("Invalid cursor: expected a FeedCursorStore with load() and save() methods");
  }
  assertIntegerInRange("limit", limit, 1, MAX_LIMIT);
  assertIntegerInRange("maxPagesPerRun", maxPagesPerRun, 1);
  assertIntegerInRange("intervalMs", intervalMs, MIN_INTERVAL_MS);
  if (onError !== undefined && typeof onError !== "function") {
    throw new TypeError("Invalid onError: expected a function");
  }

  const handleError = onError ?? (() => {});
  let inFlight: Promise<EventFeedRunSummary> | null = null;

  async function execute(): Promise<EventFeedRunSummary> {
    let currentCursor = await cursor.load();
    let currentCursorBigInt = parseStoredCursor(currentCursor);

    const counts: Record<EventHandleResult, number> = {
      processed: 0,
      duplicate: 0,
      stale: 0,
      ignored: 0,
    };
    let pages = 0;
    let caughtUp = false;

    for (let pageIndex = 0; pageIndex < maxPagesPerRun; pageIndex += 1) {
      const page = await fetchPage(currentCursor, limit);
      if (!page || !Array.isArray(page.items)) {
        throw new EventValidationError("Invalid feed page: expected an object with an items array");
      }

      pages += 1;
      caughtUp = page.nextCursor === null;

      if (page.items.length === 0) {
        break;
      }

      for (const item of page.items) {
        const { sequence, sequenceValue } = parseFeedSequence(item, currentCursorBigInt);
        const { sequence: _stripped, ...envelope } = item;
        const outcome = await consumer.handle(envelope);
        await cursor.save(sequence);
        currentCursor = sequence;
        currentCursorBigInt = sequenceValue;
        counts[outcome] += 1;
      }

      if (page.nextCursor === null) {
        break;
      }
    }

    return {
      ...counts,
      pages,
      cursor: currentCursor,
      caughtUp,
    };
  }

  function runOnce(): Promise<EventFeedRunSummary> {
    if (inFlight) return inFlight;
    const run = (async () => {
      try {
        return await execute();
      } finally {
        inFlight = null;
      }
    })();
    inFlight = run;
    return run;
  }

  return {
    runOnce,

    start(): () => void {
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const scheduleNext = () => {
        if (stopped) return;
        timer = setTimeout(() => {
          timer = undefined;
          void tick();
        }, intervalMs);
      };

      const tick = async () => {
        if (stopped) return;
        try {
          await runOnce();
        } catch (error) {
          try {
            handleError(error);
          } catch {
            // Ignore errors thrown by onError so the polling loop continues without unhandled rejections.
          }
        }
        scheduleNext();
      };

      void tick();

      return () => {
        stopped = true;
        if (timer !== undefined) {
          clearTimeout(timer);
          timer = undefined;
        }
      };
    },
  };
}
