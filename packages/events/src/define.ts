import { z } from "zod";
import { EVENT_TYPE_PATTERN, eventEnvelopeSchema, uuidv7, type EventEnvelope } from "./envelope.js";
import { EventValidationError, UnsupportedEventVersionError, formatValidationSummary } from "./errors.js";

/** Input accepted by `definition.create(...)`. */
export interface CreateEventInput<TData> {
  source: string;
  organizationId: string | null;
  resourceType: string;
  resourceId: string;
  resourceVersion: number;
  data: TData;
  occurredAt?: Date;
  id?: string;
  traceId?: string;
}

/** Configuration passed to `defineEvent(...)`. */
export interface DefineEventOptions<
  TType extends string,
  TVersion extends number,
  TDataSchema extends z.ZodObject<z.ZodRawShape>,
> {
  type: TType;
  version: TVersion;
  data: TDataSchema;
}

/** Frozen event definition created by `defineEvent(...)`. */
export interface EventDefinition<
  TType extends string = string,
  TVersion extends number = number,
  TDataSchema extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>,
> {
  readonly type: TType;
  readonly version: TVersion;
  readonly dataSchema: TDataSchema;
  create(input: CreateEventInput<z.input<TDataSchema>>): EventEnvelope<TType, z.output<TDataSchema>, TVersion>;
  parse(raw: unknown): EventEnvelope<TType, z.output<TDataSchema>, TVersion>;
  is(envelope: EventEnvelope): envelope is EventEnvelope<TType, z.output<TDataSchema>, TVersion>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyEventDefinition = EventDefinition<string, number, z.ZodObject<any>>;

/** Result of parsing an event against an `EventCatalog` when both `type` and `version` are recognized. */
export type KnownCatalogEvent<TDefinitions extends readonly AnyEventDefinition[]> = {
  [K in keyof TDefinitions]: TDefinitions[K] extends EventDefinition<infer TType, infer TVersion, infer TDataSchema>
    ? {
        readonly status: "known";
        readonly event: EventEnvelope<TType, z.output<TDataSchema>, TVersion>;
        readonly definition: TDefinitions[K];
      }
    : never;
}[number];

/** Result of parsing an event whose `type` is not registered in the catalog. */
export interface UnknownCatalogEvent {
  readonly status: "unknown";
  readonly envelope: EventEnvelope;
}

export type CatalogParseResult<TDefinitions extends readonly AnyEventDefinition[]> =
  KnownCatalogEvent<TDefinitions> | UnknownCatalogEvent;

/** Registry of versioned event definitions used to parse incoming envelopes safely. */
export interface EventCatalog<TDefinitions extends readonly AnyEventDefinition[] = readonly AnyEventDefinition[]> {
  readonly definitions: TDefinitions;
  parse(raw: unknown): CatalogParseResult<TDefinitions>;
}

function parseEnvelopeOrThrow(raw: unknown): EventEnvelope {
  const result = eventEnvelopeSchema.safeParse(raw);
  if (!result.success) {
    throw new EventValidationError(formatValidationSummary("Invalid event envelope", result.error.issues), {
      issues: result.error.issues,
    });
  }
  return result.data;
}

function parseDataOrThrow<TDataSchema extends z.ZodObject<z.ZodRawShape>>(
  type: string,
  version: number,
  schema: TDataSchema,
  rawData: unknown,
): z.output<TDataSchema> {
  const result = schema.safeParse(rawData);
  if (!result.success) {
    throw new EventValidationError(
      formatValidationSummary(`Invalid event data for "${type}" (v${version})`, result.error.issues),
      { issues: result.error.issues },
    );
  }
  return result.data;
}

/**
 * Defines a typed, versioned event with its `data` Zod object schema.
 * Throws `TypeError` immediately if `type`, `version`, or `data` is invalid.
 */
export function defineEvent<
  const TType extends string,
  const TVersion extends number,
  TDataSchema extends z.ZodObject<z.ZodRawShape>,
>(options: DefineEventOptions<TType, TVersion, TDataSchema>): EventDefinition<TType, TVersion, TDataSchema> {
  const { type, version, data: dataSchema } = options;

  if (typeof type !== "string" || !EVENT_TYPE_PATTERN.test(type)) {
    throw new TypeError(`Invalid event type "${String(type)}": expected dot-separated lowercase segments`);
  }
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new TypeError(`Invalid event version "${String(version)}": expected an integer >= 1`);
  }
  if (!(dataSchema instanceof z.ZodObject)) {
    throw new TypeError(`Invalid data schema for event "${type}" (v${version}): expected a Zod object schema`);
  }

  const definition: EventDefinition<TType, TVersion, TDataSchema> = {
    type,
    version,
    dataSchema,

    create(input) {
      const occurredAtDate = input.occurredAt ?? new Date();
      if (!(occurredAtDate instanceof Date) || Number.isNaN(occurredAtDate.getTime())) {
        throw new EventValidationError("Invalid event envelope: occurredAt must be a valid Date");
      }

      const candidate: Record<string, unknown> = {
        id: input.id ?? uuidv7(),
        type,
        version,
        source: input.source,
        organizationId: input.organizationId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        resourceVersion: input.resourceVersion,
        occurredAt: occurredAtDate.toISOString(),
        data: input.data,
      };
      if (input.traceId !== undefined) {
        candidate.traceId = input.traceId;
      }

      const envelope = parseEnvelopeOrThrow(candidate);
      const parsedData = parseDataOrThrow(type, version, dataSchema, envelope.data);
      return { ...envelope, type, version, data: parsedData };
    },

    parse(raw) {
      const envelope = parseEnvelopeOrThrow(raw);
      if (envelope.type !== type || envelope.version !== version) {
        throw new EventValidationError(
          `Expected event "${type}" (v${version}), received "${envelope.type}" (v${envelope.version})`,
        );
      }
      const parsedData = parseDataOrThrow(type, version, dataSchema, envelope.data);
      return { ...envelope, type, version, data: parsedData };
    },

    is(envelope): envelope is EventEnvelope<TType, z.output<TDataSchema>, TVersion> {
      return envelope.type === type && envelope.version === version;
    },
  };

  return Object.freeze(definition);
}

/**
 * Builds a frozen catalog of event definitions indexed by `(type, version)`.
 * Throws `TypeError` on duplicate `(type, version)` pairs.
 */
export function defineEventCatalog<const TDefinitions extends readonly AnyEventDefinition[]>(
  definitions: TDefinitions,
): EventCatalog<TDefinitions> {
  const byType = new Map<string, Map<number, AnyEventDefinition>>();

  for (const definition of definitions) {
    let versions = byType.get(definition.type);
    if (!versions) {
      versions = new Map();
      byType.set(definition.type, versions);
    }
    if (versions.has(definition.version)) {
      throw new TypeError(`Duplicate event definition for "${definition.type}" (v${definition.version})`);
    }
    versions.set(definition.version, definition);
  }

  const frozenDefinitions = Object.freeze([...definitions]) as unknown as TDefinitions;

  const catalog: EventCatalog<TDefinitions> = {
    definitions: frozenDefinitions,

    parse(raw) {
      const envelope = parseEnvelopeOrThrow(raw);
      const versions = byType.get(envelope.type);
      if (!versions) {
        return { status: "unknown", envelope };
      }

      const definition = versions.get(envelope.version);
      if (!definition) {
        throw new UnsupportedEventVersionError(envelope.type, envelope.version);
      }

      const parsedData = parseDataOrThrow(definition.type, definition.version, definition.dataSchema, envelope.data);
      return {
        status: "known",
        event: { ...envelope, data: parsedData },
        definition,
      } as KnownCatalogEvent<TDefinitions>;
    },
  };

  return Object.freeze(catalog);
}
