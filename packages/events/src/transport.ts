import type { EventEnvelope } from "./envelope.js";
import { EventValidationError } from "./errors.js";
import type { EventPublisher } from "./outbox.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parses an SQS message body into a raw envelope ready for `catalog.parse` or `consumer.handle`.
 *
 * Accepts either:
 * - an Amazon EventBridge envelope (`{ "detail-type", detail, ... }`), where `detail-type` must match `detail.type`, or
 * - a bare Monorise event envelope JSON object.
 *
 * Throws `EventValidationError` on invalid JSON, non-object bodies, or mismatched `detail-type`.
 */
export function parseQueueMessageBody(body: string): unknown {
  if (typeof body !== "string") {
    throw new EventValidationError("Queue message body must be a JSON string");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (cause) {
    throw new EventValidationError("Invalid JSON in queue message body", { cause });
  }

  if (!isPlainObject(parsed)) {
    throw new EventValidationError("Queue message body must be a JSON object");
  }

  if ("detail-type" in parsed || "detail" in parsed) {
    const detailType = parsed["detail-type"];
    const detail = parsed.detail;
    if (typeof detailType !== "string") {
      throw new EventValidationError('EventBridge message is missing a string "detail-type"');
    }
    if (!isPlainObject(detail)) {
      throw new EventValidationError('EventBridge message is missing an object "detail"');
    }
    if (typeof detail.type !== "string" || detailType !== detail.type) {
      throw new EventValidationError('EventBridge "detail-type" does not match detail "type"');
    }
    return detail;
  }

  return parsed;
}

/** Result of delivering a single envelope to one subscriber on the in-memory bus. */
export interface InMemoryDelivery {
  readonly subscriber: string;
  readonly envelope: EventEnvelope;
  readonly result?: unknown;
  readonly error?: unknown;
}

/** Handler registered on `InMemoryEventBus.subscribe(...)`. */
export type InMemorySubscriber = (raw: unknown) => Promise<unknown> | unknown;

/**
 * In-memory fan-out event bus for tests and local development.
 *
 * Simulates EventBridge fan-out to per-consumer SQS queues:
 * - `publish(envelopes)` serializes each envelope to JSON, records it in `published`, and enqueues it for every
 *   currently subscribed consumer.
 * - `flush()` deterministically drains all subscriber queues in FIFO order, delivering an independent JSON round-trip
 *   copy to each subscriber. Subscriber errors are isolated per subscriber and returned in the delivery log.
 */
export interface InMemoryEventBus extends EventPublisher {
  readonly published: readonly EventEnvelope[];
  subscribe(name: string, handle: InMemorySubscriber): () => void;
  flush(): Promise<readonly InMemoryDelivery[]>;
}

/**
 * Creates a deterministic in-memory event bus implementing `EventPublisher`.
 */
export function createInMemoryEventBus(): InMemoryEventBus {
  const published: EventEnvelope[] = [];
  const subscribers = new Map<string, { handle: InMemorySubscriber; queue: string[] }>();

  return {
    get published(): readonly EventEnvelope[] {
      return published;
    },

    subscribe(name: string, handle: InMemorySubscriber): () => void {
      if (typeof name !== "string" || name.length === 0) {
        throw new TypeError("Subscriber name must be a non-empty string");
      }
      if (subscribers.has(name)) {
        throw new TypeError(`Subscriber "${name}" is already registered`);
      }

      subscribers.set(name, { handle, queue: [] });
      return () => {
        subscribers.delete(name);
      };
    },

    async publish(envelopes: readonly EventEnvelope[]): Promise<void> {
      for (const envelope of envelopes) {
        const serialized = JSON.stringify(envelope);
        published.push(JSON.parse(serialized) as EventEnvelope);
        for (const subscriber of subscribers.values()) {
          subscriber.queue.push(serialized);
        }
      }
    },

    async flush(): Promise<readonly InMemoryDelivery[]> {
      const deliveries: InMemoryDelivery[] = [];

      while (true) {
        let progressed = false;
        for (const [name, entry] of subscribers) {
          if (entry.queue.length === 0) continue;
          const batch = entry.queue.splice(0, entry.queue.length);
          progressed = true;

          for (const serialized of batch) {
            const payload = JSON.parse(serialized) as EventEnvelope;
            const snapshot = JSON.parse(serialized) as EventEnvelope;
            try {
              const result = await entry.handle(payload);
              deliveries.push({ subscriber: name, envelope: snapshot, result });
            } catch (error) {
              deliveries.push({ subscriber: name, envelope: snapshot, error });
            }
          }
        }
        if (!progressed) break;
      }

      return deliveries;
    },
  };
}
