import type { z } from "zod";
import type { AnyEventDefinition, EventCatalog, EventDefinition } from "./define.js";
import { eventEnvelopeSchema, type EventEnvelope } from "./envelope.js";

export const CONSUMER_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Context passed alongside the typed event envelope to each handler. */
export interface EventHandlerContext<TTx> {
  readonly tx: TTx;
  readonly consumer: string;
}

/** Async handler invoked for a recognized event type. */
export type EventHandler<TEvent extends EventEnvelope = EventEnvelope, TTx = undefined> = (
  event: TEvent,
  context: EventHandlerContext<TTx>,
) => Promise<void>;

type EventForType<TDefinitions extends readonly AnyEventDefinition[], TType extends string> =
  Extract<TDefinitions[number], { readonly type: TType }> extends infer TDef
    ? TDef extends EventDefinition<infer T, infer V, infer S>
      ? EventEnvelope<T, z.output<S>, V>
      : never
    : never;

/** Map of event types from the catalog to their typed handlers. */
export type EventHandlers<TDefinitions extends readonly AnyEventDefinition[], TTx> = {
  [TType in TDefinitions[number]["type"]]?: EventHandler<EventForType<TDefinitions, TType>, TTx>;
};

/** Store abstraction for the `ProcessedEvent` table (`05-integration/events.md`). */
export interface ProcessedEventStore<TTx> {
  isProcessed(tx: TTx, consumer: string, eventId: string): Promise<boolean>;
  markProcessed(tx: TTx, consumer: string, eventId: string, processedAt: Date): Promise<void>;
}

/** Lookup for the latest `resourceVersion` already applied by this consumer for a resource. */
export interface ResourceVersionStore<TTx> {
  get(tx: TTx, resourceType: string, resourceId: string): Promise<number | null>;
}

/** Transaction wrapper that keeps deduplication, domain state updates, and `markProcessed` atomic. */
export type TransactionRunner<TTx> = <R>(work: (tx: TTx) => Promise<R>) => Promise<R>;

/** Outcome returned by `consumer.handle(raw)`. */
export type EventHandleResult = "processed" | "duplicate" | "stale" | "ignored";

/** Configuration for `createEventConsumer(...)`. */
export interface EventConsumerOptions<TDefinitions extends readonly AnyEventDefinition[], TTx> {
  consumer: string;
  catalog: EventCatalog<TDefinitions>;
  handlers: EventHandlers<TDefinitions, TTx>;
  processed: ProcessedEventStore<TTx>;
  resourceVersions?: ResourceVersionStore<TTx>;
  transaction?: TransactionRunner<TTx>;
  now?: () => Date;
}

/** Idempotent consumer that tolerates duplicate, delayed, and out-of-order deliveries. */
export interface EventConsumer {
  handle(raw: unknown): Promise<EventHandleResult>;
}

/**
 * Helper for typing a single handler against an event definition when composing handler maps separately.
 */
export function on<
  TType extends string,
  TVersion extends number,
  TDataSchema extends z.ZodObject<z.ZodRawShape>,
  TTx = undefined,
>(
  _definition: EventDefinition<TType, TVersion, TDataSchema>,
  handler: EventHandler<EventEnvelope<TType, z.output<TDataSchema>, TVersion>, TTx>,
): EventHandler<EventEnvelope<TType, z.output<TDataSchema>, TVersion>, TTx> {
  return handler;
}

/**
 * Creates an idempotent event consumer following ADR-0045 and `05-integration/events.md`.
 *
 * Consumers must never assume exactly-once delivery or strict ordering:
 * - Duplicate deliveries are detected by `(consumer, eventId)` in `ProcessedEvent`.
 * - Out-of-order deliveries are detected by comparing `resourceVersion` against `resourceVersions`.
 * - All store checks, handler execution, and `markProcessed` run inside a single `transaction` call so products
 *   can make state updates and deduplication atomic.
 * - If a handler throws, the event is not marked processed and the error is rethrown so SQS retries and eventually
 *   routes the message to the dead-letter queue.
 */
export function createEventConsumer<
  TTx = undefined,
  TDefinitions extends readonly AnyEventDefinition[] = readonly AnyEventDefinition[],
>(options: EventConsumerOptions<TDefinitions, TTx>): EventConsumer {
  const { consumer, catalog, handlers, processed, resourceVersions, transaction, now = () => new Date() } = options;

  if (typeof consumer !== "string" || !CONSUMER_NAME_PATTERN.test(consumer)) {
    throw new TypeError(`Invalid consumer name "${String(consumer)}": expected lowercase letters, digits, and hyphens`);
  }

  const runInTransaction: TransactionRunner<TTx> =
    transaction ?? (async <R>(work: (tx: TTx) => Promise<R>) => work(undefined as TTx));

  return {
    async handle(raw: unknown): Promise<EventHandleResult> {
      // A consumer without a handler for this type ignores it, even in a version the catalog does not know.
      // Invalid envelopes still go to catalog.parse below, which throws.
      const peek = eventEnvelopeSchema.safeParse(raw);
      if (peek.success && !Object.hasOwn(handlers, peek.data.type)) {
        return "ignored";
      }

      const parsed = catalog.parse(raw);
      if (parsed.status === "unknown") {
        return "ignored";
      }

      const { event } = parsed;
      if (!Object.hasOwn(handlers, event.type)) {
        return "ignored";
      }

      const handler = handlers[event.type as keyof typeof handlers] as EventHandler<EventEnvelope, TTx> | undefined;
      if (!handler) {
        return "ignored";
      }

      return runInTransaction(async (tx) => {
        if (await processed.isProcessed(tx, consumer, event.id)) {
          return "duplicate";
        }

        if (resourceVersions) {
          const knownVersion = await resourceVersions.get(tx, event.resourceType, event.resourceId);
          if (knownVersion !== null && knownVersion >= event.resourceVersion) {
            await processed.markProcessed(tx, consumer, event.id, now());
            return "stale";
          }
        }

        await handler(event, { tx, consumer });
        await processed.markProcessed(tx, consumer, event.id, now());
        return "processed";
      });
    },
  };
}
