import { EVENT_SOURCE_PATTERN, eventEnvelopeSchema, type EventEnvelope } from "./envelope.js";
import { EventValidationError, formatValidationSummary } from "./errors.js";

/**
 * Row shape mirroring the documented `OutboxEvent` table (`05-integration/events.md`).
 * Intentionally excludes `source` and `traceId`, which are not stored as columns in the outbox table.
 */
export interface OutboxRecord {
  id: string;
  organizationId: string | null;
  type: string;
  version: number;
  resourceType: string;
  resourceId: string;
  resourceVersion: number;
  payload: Record<string, unknown>;
  occurredAt: Date;
  publishedAt: Date | null;
}

/** Context required to reconstruct an `EventEnvelope` from an `OutboxRecord`. */
export interface FromOutboxRecordOptions {
  source: string;
  traceId?: string;
}

/** Return type of `EventPublisher.publish`: `void` means all succeeded, or list ids that failed to publish. */
export type PublishResult = void | { failedIds: readonly string[] };

/** Transport-agnostic publisher contract implemented by EventBridge adapters or `createInMemoryEventBus()`. */
export interface EventPublisher {
  publish(envelopes: readonly EventEnvelope[]): Promise<PublishResult>;
}

/** Record that could not be converted or published during an outbox relay batch. */
export interface OutboxRelayFailure {
  readonly id: string;
  readonly reason: "invalid" | "publish_failed";
  readonly error?: unknown;
}

/** Summary of a single `runOnce()` execution of the outbox relay. */
export interface OutboxRelayResult {
  readonly fetched: number;
  readonly published: number;
  readonly failed: readonly OutboxRelayFailure[];
}

/** Configuration for `createOutboxRelay(...)`. */
export interface OutboxRelayOptions {
  source: string;
  fetchPending(limit: number): Promise<readonly OutboxRecord[]>;
  publish(envelopes: readonly EventEnvelope[]): Promise<PublishResult>;
  markPublished(ids: readonly string[], publishedAt: Date): Promise<void>;
  batchSize?: number;
  now?: () => Date;
}

/** Single-flight outbox relay that reads unpublished rows, publishes them in order, and marks delivered rows. */
export interface OutboxRelay {
  runOnce(): Promise<OutboxRelayResult>;
}

/**
 * Converts a validated event envelope into an unpublished `OutboxRecord` ready to insert in the same database
 * transaction as the domain change (ADR-0045).
 */
export function toOutboxRecord(envelope: EventEnvelope): OutboxRecord {
  const result = eventEnvelopeSchema.safeParse(envelope);
  if (!result.success) {
    throw new EventValidationError(formatValidationSummary("Invalid event envelope", result.error.issues), {
      issues: result.error.issues,
    });
  }

  const parsed = result.data;
  return {
    id: parsed.id,
    organizationId: parsed.organizationId,
    type: parsed.type,
    version: parsed.version,
    resourceType: parsed.resourceType,
    resourceId: parsed.resourceId,
    resourceVersion: parsed.resourceVersion,
    payload: parsed.data,
    occurredAt: new Date(parsed.occurredAt),
    publishedAt: null,
  };
}

/**
 * Reconstructs and validates an `EventEnvelope` from a stored `OutboxRecord`.
 */
export function fromOutboxRecord(record: OutboxRecord, options: FromOutboxRecordOptions): EventEnvelope {
  if (!record || typeof record !== "object") {
    throw new EventValidationError("Invalid outbox record: expected an object");
  }
  if (!(record.occurredAt instanceof Date) || Number.isNaN(record.occurredAt.getTime())) {
    throw new EventValidationError("Invalid outbox record: occurredAt must be a valid Date");
  }

  const candidate: Record<string, unknown> = {
    id: record.id,
    type: record.type,
    version: record.version,
    source: options.source,
    organizationId: record.organizationId,
    resourceType: record.resourceType,
    resourceId: record.resourceId,
    resourceVersion: record.resourceVersion,
    occurredAt: record.occurredAt.toISOString(),
    data: record.payload,
  };
  if (options.traceId !== undefined) {
    candidate.traceId = options.traceId;
  }

  const result = eventEnvelopeSchema.safeParse(candidate);
  if (!result.success) {
    throw new EventValidationError(formatValidationSummary("Invalid outbox record", result.error.issues), {
      issues: result.error.issues,
    });
  }

  return result.data;
}

/**
 * Creates a database-agnostic outbox relay.
 *
 * Concurrent `runOnce()` calls on the same relay instance share the run in progress (single flight).
 * Cross-process coordination is the product's responsibility, for example by locking rows with
 * `FOR UPDATE SKIP LOCKED` inside `fetchPending`.
 */
export function createOutboxRelay(options: OutboxRelayOptions): OutboxRelay {
  const { source, fetchPending, publish, markPublished, batchSize = 100, now = () => new Date() } = options;

  if (typeof source !== "string" || !EVENT_SOURCE_PATTERN.test(source)) {
    throw new TypeError(`Invalid event source "${String(source)}": expected lowercase alphanumeric identifier`);
  }
  if (typeof batchSize !== "number" || !Number.isInteger(batchSize) || batchSize < 1) {
    throw new TypeError(`Invalid batchSize "${String(batchSize)}": expected an integer >= 1`);
  }

  let inFlight: Promise<OutboxRelayResult> | null = null;

  async function execute(): Promise<OutboxRelayResult> {
    const rawRecords = await fetchPending(batchSize);
    const records = rawRecords.slice(0, batchSize);
    if (records.length === 0) {
      return { fetched: 0, published: 0, failed: [] };
    }

    const envelopes: EventEnvelope[] = [];
    const failed: OutboxRelayFailure[] = [];

    for (const record of records) {
      try {
        envelopes.push(fromOutboxRecord(record, { source }));
      } catch (error) {
        const recordId = typeof record?.id === "string" ? record.id : "";
        failed.push({ id: recordId, reason: "invalid", error });
      }
    }

    if (envelopes.length === 0) {
      return { fetched: records.length, published: 0, failed };
    }

    const publishResult = await publish(envelopes);
    const failedIds = new Set(publishResult?.failedIds ?? []);

    const publishedIds: string[] = [];
    for (const envelope of envelopes) {
      if (failedIds.has(envelope.id)) {
        failed.push({ id: envelope.id, reason: "publish_failed" });
      } else {
        publishedIds.push(envelope.id);
      }
    }

    if (publishedIds.length > 0) {
      await markPublished(publishedIds, now());
    }

    return {
      fetched: records.length,
      published: publishedIds.length,
      failed,
    };
  }

  return {
    runOnce() {
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
    },
  };
}
