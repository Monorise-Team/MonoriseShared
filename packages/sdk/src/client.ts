import {
  CoreApiError,
  CoreApiMissingTokenError,
  CoreApiProtocolError,
  CoreApiUnavailableError,
  type CoreErrorDetail,
} from "./errors.js";
import type { operations } from "./generated/openapi.js";
import { CORE_OPERATIONS, type OperationDefinition } from "./generated/operations.js";

/** Portable fetch signature compatible with browsers, Node.js 24, and Expo. */
export type FetchFunction = (input: string, init?: RequestInit) => Promise<Response>;

/** Returns the bearer access token for authenticated Core API operations. */
export type AccessTokenProvider = () => string | null | undefined | Promise<string | null | undefined>;

export interface CoreClientOptions {
  /** Server origin (for example `http://localhost:3200` or `https://api.monorise.studio`). Operation paths already include `/core/v1`. */
  readonly baseUrl: string;
  /** Provides the bearer token (user JWT or product machine token) for operations that declare security in the OpenAPI document. */
  readonly getAccessToken?: AccessTokenProvider;
  /** Custom `fetch` implementation (defaults to `globalThis.fetch`). */
  readonly fetch?: FetchFunction;
  /** Default headers sent with every request (`Authorization` is stripped on public operations). */
  readonly headers?: HeadersInit;
}

export interface CoreRequestOptions {
  readonly signal?: AbortSignal;
  readonly headers?: HeadersInit;
}

/** Single page returned by a cursor-paginated Core API list operation. */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
}

/** Input shape accepted by a cursor-paginated Core API operation. */
export interface PaginatedOperationInput extends CoreRequestOptions {
  readonly query?: {
    readonly cursor?: string;
    readonly limit?: number;
  };
}

type HasRequiredKeys<T> = {
  [K in keyof T]-?: Record<never, never> extends Pick<T, K> ? never : K;
}[keyof T] extends never
  ? false
  : true;

type OperationPathParams<Op> = Op extends { parameters: { path?: infer P } }
  ? [Exclude<P, undefined>] extends [never]
    ? never
    : Exclude<P, undefined>
  : never;

type OperationQueryParams<Op> = Op extends { parameters: { query?: infer Q } }
  ? [Exclude<Q, undefined>] extends [never]
    ? never
    : Exclude<Q, undefined>
  : never;

type OperationBody<Op> = Op extends { requestBody?: infer R }
  ? NonNullable<R> extends { content: { "application/json": infer B } }
    ? B
    : never
  : never;

type IsBodyRequired<Op> = Op extends { requestBody: { content: { "application/json": unknown } } } ? true : false;

type PathPart<Op> = [OperationPathParams<Op>] extends [never] ? unknown : { readonly path: OperationPathParams<Op> };

type QueryPart<Op> = [OperationQueryParams<Op>] extends [never]
  ? unknown
  : HasRequiredKeys<OperationQueryParams<Op>> extends true
    ? { readonly query: OperationQueryParams<Op> }
    : { readonly query?: OperationQueryParams<Op> };

type BodyPart<Op> = [OperationBody<Op>] extends [never]
  ? unknown
  : IsBodyRequired<Op> extends true
    ? { readonly body: OperationBody<Op> }
    : { readonly body?: OperationBody<Op> };

export type OperationInput<Op> = CoreRequestOptions & PathPart<Op> & QueryPart<Op> & BodyPart<Op>;

type SuccessResponseKey<Responses> = 200 extends keyof Responses
  ? 200
  : 201 extends keyof Responses
    ? 201
    : 202 extends keyof Responses
      ? 202
      : Extract<keyof Responses, 200 | 201 | 202 | 203 | 204 | 205 | 206>;

type SuccessJsonPayload<Op> = Op extends { responses: infer R }
  ? SuccessResponseKey<R> extends keyof R
    ? R[SuccessResponseKey<R>] extends { content: { "application/json": infer Payload } }
      ? Payload
      : void
    : unknown
  : unknown;

type UnwrapEnvelope<Payload, Enveloped extends boolean, Paginated extends boolean> = Enveloped extends true
  ? Paginated extends true
    ? Payload extends { data: Array<infer Item>; meta: { nextCursor: string | null }; error: null }
      ? PaginatedResult<Item>
      : Payload
    : Payload extends { data: infer Data; meta: unknown; error: null }
      ? Data
      : Payload
  : Payload;

export type OperationResult<Op, Def extends OperationDefinition> = Def["noContent"] extends true
  ? SuccessJsonPayload<Op> extends void
    ? void
    : UnwrapEnvelope<SuccessJsonPayload<Op>, Def["enveloped"], Def["paginated"]> | undefined
  : UnwrapEnvelope<SuccessJsonPayload<Op>, Def["enveloped"], Def["paginated"]>;

type OperationMethod<Op, Def extends OperationDefinition> =
  HasRequiredKeys<OperationInput<Op>> extends true
    ? (input: OperationInput<Op>) => Promise<OperationResult<Op, Def>>
    : (input?: OperationInput<Op>) => Promise<OperationResult<Op, Def>>;

export type OperationsClient<
  TOperations extends Record<keyof TDefs & string, unknown>,
  TDefs extends Record<string, OperationDefinition>,
> = {
  readonly [K in keyof TDefs & string]: OperationMethod<TOperations[K], TDefs[K]>;
};

/** Typed client with one method per Core API operation declared in `openapi/core-api.json`. */
export type CoreClient = OperationsClient<operations, typeof CORE_OPERATIONS>;

interface RuntimeCallInput extends CoreRequestOptions {
  readonly path?: Readonly<Record<string, unknown>>;
  readonly query?: Readonly<Record<string, unknown>>;
  readonly body?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBaseUrl(baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch (cause) {
    throw new Error("Invalid Core API baseUrl", { cause });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Core API baseUrl must use http or https protocol");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Core API baseUrl must not include credentials");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("Core API baseUrl must not contain query parameters or a hash");
  }
  return baseUrl.replace(/\/+$/, "");
}

function buildOperationUrl(
  baseUrl: string,
  operation: OperationDefinition,
  pathParams?: Readonly<Record<string, unknown>>,
  queryParams?: Readonly<Record<string, unknown>>,
): string {
  const resolvedPath = operation.path.replace(/\{([^}]+)\}/g, (_match, rawName: string) => {
    const value = pathParams?.[rawName];
    if (value === undefined || value === null || String(value).length === 0) {
      throw new Error(`Missing required path parameter "${rawName}" for Core API operation "${operation.operationId}"`);
    }
    return encodeURIComponent(String(value));
  });

  if (!queryParams) {
    return `${baseUrl}${resolvedPath}`;
  }

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(queryParams)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined) {
          searchParams.append(key, String(item));
        }
      }
    } else {
      searchParams.set(key, String(value));
    }
  }

  const queryString = searchParams.toString();
  return queryString.length > 0 ? `${baseUrl}${resolvedPath}?${queryString}` : `${baseUrl}${resolvedPath}`;
}

function parseErrorDetails(value: unknown): CoreErrorDetail[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const details: CoreErrorDetail[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.message !== "string") {
      return null;
    }
    if (item.field !== undefined && typeof item.field !== "string") {
      return null;
    }
    details.push(item.field !== undefined ? { field: item.field, message: item.message } : { message: item.message });
  }
  return details;
}

function parseErrorEnvelope(
  payload: unknown,
): { code: string; message: string; details: CoreErrorDetail[]; requestId: string } | null {
  if (!isRecord(payload)) {
    return null;
  }
  if (payload.data !== null || !isRecord(payload.meta) || !isRecord(payload.error)) {
    return null;
  }
  const requestId = payload.meta.requestId;
  const { code, message, details } = payload.error;
  if (typeof requestId !== "string" || typeof code !== "string" || code.length === 0 || typeof message !== "string") {
    return null;
  }
  const parsedDetails = parseErrorDetails(details);
  if (!parsedDetails) {
    return null;
  }
  return { code, message, details: parsedDetails, requestId };
}

function parseSuccessEnvelope(payload: unknown): { data: unknown; meta: Record<string, unknown> } | null {
  if (!isRecord(payload)) {
    return null;
  }
  if (!("data" in payload) || payload.error !== null || !isRecord(payload.meta)) {
    return null;
  }
  if (typeof payload.meta.requestId !== "string") {
    return null;
  }
  return { data: payload.data, meta: payload.meta };
}

async function executeOperation(
  baseUrl: string,
  fetchFn: FetchFunction,
  options: CoreClientOptions,
  operation: OperationDefinition,
  input?: RuntimeCallInput,
): Promise<unknown> {
  const url = buildOperationUrl(baseUrl, operation, input?.path, input?.query);

  const headers = new Headers(options.headers);
  if (input?.headers) {
    const callHeaders = new Headers(input.headers);
    callHeaders.forEach((value, key) => {
      headers.set(key, value);
    });
  }
  if (!headers.has("accept")) {
    headers.set("accept", "application/json");
  }

  if (operation.requiresAuth) {
    const rawToken = options.getAccessToken ? await options.getAccessToken() : undefined;
    const token = typeof rawToken === "string" ? rawToken.trim() : "";
    if (token.length === 0) {
      throw new CoreApiMissingTokenError(operation.operationId);
    }
    if (/[\r\n]/.test(token)) {
      throw new Error(`Access token for Core API operation "${operation.operationId}" contains invalid characters`);
    }
    headers.set("authorization", `Bearer ${token}`);
  } else {
    headers.delete("authorization");
  }

  let body: string | undefined;
  if (operation.hasBody && input?.body !== undefined) {
    body = JSON.stringify(input.body);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  }

  const init: RequestInit = {
    method: operation.method,
    headers,
  };
  if (body !== undefined) {
    init.body = body;
  }
  if (input?.signal !== undefined) {
    init.signal = input.signal;
  }

  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch (cause) {
    throw new CoreApiUnavailableError(
      `Core API request ${operation.method} ${operation.path} failed: service unavailable`,
      { cause },
    );
  }

  if (response.status === 204) {
    if (!operation.noContent) {
      throw new CoreApiProtocolError(
        `Core API returned unexpected 204 No Content for ${operation.method} ${operation.path}`,
        { status: response.status },
      );
    }
    return undefined;
  }

  const rawBody = await response.text();
  if (rawBody.trim().length === 0) {
    if (response.ok && operation.noContent) {
      return undefined;
    }
    throw new CoreApiProtocolError(
      `Core API returned an empty response body for ${operation.method} ${operation.path} (status ${response.status})`,
      { status: response.status },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch (cause) {
    throw new CoreApiProtocolError(
      `Core API returned invalid JSON for ${operation.method} ${operation.path} (status ${response.status})`,
      { status: response.status, cause },
    );
  }

  if (!response.ok) {
    const errorEnvelope = parseErrorEnvelope(payload);
    if (!errorEnvelope) {
      throw new CoreApiProtocolError(
        `Core API returned an unexpected error response for ${operation.method} ${operation.path} (status ${response.status})`,
        { status: response.status },
      );
    }
    throw new CoreApiError({
      status: response.status,
      code: errorEnvelope.code,
      message: errorEnvelope.message,
      details: errorEnvelope.details,
      requestId: errorEnvelope.requestId,
    });
  }

  if (operation.enveloped) {
    const successEnvelope = parseSuccessEnvelope(payload);
    if (!successEnvelope) {
      throw new CoreApiProtocolError(
        `Core API returned an unexpected response envelope for ${operation.method} ${operation.path} (status ${response.status})`,
        { status: response.status },
      );
    }
    if (operation.paginated) {
      const { nextCursor } = successEnvelope.meta;
      if (!Array.isArray(successEnvelope.data) || (nextCursor !== null && typeof nextCursor !== "string")) {
        throw new CoreApiProtocolError(
          `Core API returned an unexpected paginated response for ${operation.method} ${operation.path} (status ${response.status})`,
          { status: response.status },
        );
      }
      return {
        items: successEnvelope.data,
        nextCursor,
      } satisfies PaginatedResult<unknown>;
    }
    return successEnvelope.data;
  }

  if (!isRecord(payload)) {
    throw new CoreApiProtocolError(
      `Core API returned an unexpected response body for ${operation.method} ${operation.path} (status ${response.status})`,
      { status: response.status },
    );
  }
  return payload;
}

/**
 * Internal builder shared by `createCoreClient` and unit tests that exercise
 * path/query/body operations against fixture operation tables.
 */
export function createOperationsClient<
  TOperations extends Record<keyof TDefs & string, unknown>,
  TDefs extends Record<string, OperationDefinition>,
>(definitions: TDefs, options: CoreClientOptions): OperationsClient<TOperations, TDefs> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchFn: FetchFunction =
    options.fetch ??
    ((input, init) => {
      if (typeof globalThis.fetch !== "function") {
        throw new Error("No fetch implementation available; pass options.fetch to createCoreClient");
      }
      return globalThis.fetch(input, init);
    });

  const client: Record<string, (input?: RuntimeCallInput) => Promise<unknown>> = {};
  for (const [operationId, definition] of Object.entries(definitions)) {
    client[operationId] = (input?: RuntimeCallInput) => executeOperation(baseUrl, fetchFn, options, definition, input);
  }

  return Object.freeze(client) as OperationsClient<TOperations, TDefs>;
}

/**
 * Creates a typed Core API client backed solely by `fetch` (browser, Node.js 24, Expo).
 * Every method comes directly from the generated OpenAPI operation table.
 */
export function createCoreClient(options: CoreClientOptions): CoreClient {
  return createOperationsClient<operations, typeof CORE_OPERATIONS>(CORE_OPERATIONS, options);
}

/**
 * Iterates through all items of a cursor-paginated Core API operation, following
 * `nextCursor` until the server returns `null`. Preserves `limit`, filters, `path`,
 * `headers`, and `signal` on every page request.
 */
export function paginate<TInput extends PaginatedOperationInput, TItem>(
  operation: (input?: TInput) => Promise<PaginatedResult<TItem>>,
  input?: NoInfer<TInput>,
): AsyncIterableIterator<TItem>;
export function paginate<TInput extends PaginatedOperationInput, TItem>(
  operation: (input: TInput) => Promise<PaginatedResult<TItem>>,
  input: NoInfer<TInput>,
): AsyncIterableIterator<TItem>;
export async function* paginate<TInput extends PaginatedOperationInput, TItem>(
  operation: (input: TInput) => Promise<PaginatedResult<TItem>>,
  input?: TInput,
): AsyncIterableIterator<TItem> {
  let cursor = input?.query?.cursor;

  for (;;) {
    const pageInput =
      cursor !== undefined
        ? ({
            ...input,
            query: {
              ...input?.query,
              cursor,
            },
          } as TInput)
        : (input as TInput);

    const page = await operation(pageInput);
    for (const item of page.items) {
      yield item;
    }

    if (page.nextCursor === null) {
      break;
    }
    cursor = page.nextCursor;
  }
}
