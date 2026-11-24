import { z } from "zod";

export const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
export const EVENT_SOURCE_PATTERN = /^[a-z][a-z0-9]*$/;
export const RESOURCE_TYPE_PATTERN = /^[a-z][a-z0-9_]*$/;
export const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;

/**
 * Standard Monorise event envelope schema (ADR-0045, `05-integration/events.md`).
 * `occurredAt` is stored as an ISO 8601 string with an explicit timezone offset so envelopes survive JSON round trips.
 */
export const eventEnvelopeSchema = z.object({
  id: z.uuid(),
  type: z.string().regex(EVENT_TYPE_PATTERN),
  version: z.number().int().min(1),
  source: z.string().regex(EVENT_SOURCE_PATTERN),
  organizationId: z.uuid().nullable(),
  resourceType: z.string().regex(RESOURCE_TYPE_PATTERN),
  resourceId: z.string().min(1),
  resourceVersion: z.number().int().nonnegative(),
  occurredAt: z.iso.datetime({ offset: true }),
  traceId: z.string().regex(TRACE_ID_PATTERN).optional(),
  data: z.record(z.string(), z.unknown()),
});

/** Validated Monorise event envelope. */
export interface EventEnvelope<
  TType extends string = string,
  TData extends Record<string, unknown> = Record<string, unknown>,
  TVersion extends number = number,
> {
  id: string;
  type: TType;
  version: TVersion;
  source: string;
  organizationId: string | null;
  resourceType: string;
  resourceId: string;
  resourceVersion: number;
  occurredAt: string;
  traceId?: string;
  data: TData;
}

const HEX = Array.from({ length: 256 }, (_, index) => index.toString(16).padStart(2, "0"));

/**
 * Generates an RFC 9562 UUIDv7 using the current Unix millisecond timestamp and `crypto.getRandomValues`.
 * IDs created in later milliseconds sort lexicographically after earlier ones.
 */
export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const timestamp = BigInt(Date.now());
  bytes[0] = Number((timestamp >> 40n) & 0xffn);
  bytes[1] = Number((timestamp >> 32n) & 0xffn);
  bytes[2] = Number((timestamp >> 24n) & 0xffn);
  bytes[3] = Number((timestamp >> 16n) & 0xffn);
  bytes[4] = Number((timestamp >> 8n) & 0xffn);
  bytes[5] = Number(timestamp & 0xffn);

  // Version 7 (0111) in the top 4 bits of byte 6, RFC 9562 variant (10xx) in the top 2 bits of byte 8.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  return (
    `${HEX[bytes[0]!]!}${HEX[bytes[1]!]!}${HEX[bytes[2]!]!}${HEX[bytes[3]!]!}-` +
    `${HEX[bytes[4]!]!}${HEX[bytes[5]!]!}-` +
    `${HEX[bytes[6]!]!}${HEX[bytes[7]!]!}-` +
    `${HEX[bytes[8]!]!}${HEX[bytes[9]!]!}-` +
    `${HEX[bytes[10]!]!}${HEX[bytes[11]!]!}${HEX[bytes[12]!]!}${HEX[bytes[13]!]!}${HEX[bytes[14]!]!}${HEX[bytes[15]!]!}`
  );
}
