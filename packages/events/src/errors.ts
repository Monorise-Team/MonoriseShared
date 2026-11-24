import type { z } from "zod";

/** Single validation issue produced by Zod when parsing an event envelope or its `data`. */
export type EventValidationIssue = z.ZodError["issues"][number];

/**
 * Raised when an event envelope, its `data`, an outbox record, or a queue message body fails validation.
 * Error messages intentionally omit `data` values so personal data cannot leak into logs.
 */
export class EventValidationError extends Error {
  readonly issues: readonly EventValidationIssue[];

  constructor(message: string, options?: { issues?: readonly EventValidationIssue[]; cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "EventValidationError";
    this.issues = Object.freeze([...(options?.issues ?? [])]);
  }
}

/**
 * Raised when a catalog recognizes the event `type` but does not support its `version`.
 * Consumers must not silently ignore this error: the message should be retried and routed to the dead-letter queue
 * until the consumer is updated to handle the newer schema version.
 */
export class UnsupportedEventVersionError extends Error {
  constructor(
    readonly type: string,
    readonly version: number,
    options?: { cause?: unknown },
  ) {
    super(`Unsupported version ${version} for event type "${type}"`, options);
    this.name = "UnsupportedEventVersionError";
  }
}

/**
 * Formats a concise, value-free summary of Zod issues so error messages never leak `data` contents.
 */
export function formatValidationSummary(prefix: string, issues: readonly EventValidationIssue[]): string {
  if (issues.length === 0) return prefix;
  const parts = issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.map(String).join(".") : "<root>";
    return `${path} (${issue.code})`;
  });
  return `${prefix}: ${parts.join(", ")}`;
}
