import type { components } from "./generated/openapi.js";

/** Error codes declared in Core API's OpenAPI document. */
export type KnownCoreErrorCode = components["schemas"]["ErrorCode"];

/**
 * Error code returned by Core API. Includes all known codes from the OpenAPI document
 * while allowing newer server codes added before the SDK is regenerated.
 */
export type CoreErrorCode = KnownCoreErrorCode | (string & {});

/** Single field-level detail item inside Core API's error envelope. */
export type CoreErrorDetail = components["schemas"]["ApiErrorDetail"];

export interface CoreApiErrorOptions {
  readonly status: number;
  readonly code: CoreErrorCode;
  readonly message: string;
  readonly details?: readonly CoreErrorDetail[];
  readonly requestId: string;
  readonly cause?: unknown;
}

/**
 * Raised when Core API responds with an error envelope (`{ data: null, meta: { requestId }, error }`).
 * Applications map `code` to user-facing messages; `message` is intended for developers and logs.
 */
export class CoreApiError extends Error {
  readonly status: number;
  readonly code: CoreErrorCode;
  readonly details: readonly CoreErrorDetail[];
  readonly requestId: string;

  constructor(options: CoreApiErrorOptions) {
    super(options.message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "CoreApiError";
    this.status = options.status;
    this.code = options.code;
    this.details = Object.freeze((options.details ?? []).map((detail) => Object.freeze({ ...detail })));
    this.requestId = options.requestId;
  }
}

/**
 * Raised when Core API cannot be reached due to a network failure, DNS error, or aborted fetch.
 * This is not an authentication denial; callers should treat it as temporary unavailability.
 */
export class CoreApiUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "CoreApiUnavailableError";
  }
}

/**
 * Raised when Core API returns a response that violates the OpenAPI contract
 * (for example non-JSON output from a gateway or a missing `{ data, meta, error }` envelope).
 */
export class CoreApiProtocolError extends Error {
  readonly status: number;

  constructor(message: string, options: { status: number; cause?: unknown }) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "CoreApiProtocolError";
    this.status = options.status;
  }
}

/**
 * Raised before sending a request when an operation requires a bearer token,
 * but `getAccessToken` was omitted or returned an empty value.
 */
export class CoreApiMissingTokenError extends Error {
  readonly operationId: string;

  constructor(operationId: string) {
    super(`Access token is required for Core API operation "${operationId}"`);
    this.name = "CoreApiMissingTokenError";
    this.operationId = operationId;
  }
}
