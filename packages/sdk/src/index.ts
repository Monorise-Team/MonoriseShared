export {
  createCoreClient,
  type AccessTokenProvider,
  type CoreClient,
  type CoreClientOptions,
  type CoreRequestOptions,
  type FetchFunction,
  type OperationInput,
  type OperationResult,
} from "./client.js";
export {
  CoreApiError,
  CoreApiMissingTokenError,
  CoreApiProtocolError,
  CoreApiUnavailableError,
  type CoreApiErrorOptions,
  type CoreErrorCode,
  type CoreErrorDetail,
  type KnownCoreErrorCode,
} from "./errors.js";
export type { components, operations, paths } from "./generated/openapi.js";
export {
  CORE_OPERATIONS,
  type CoreOperationId,
  type HttpMethod,
  type OperationDefinition,
} from "./generated/operations.js";

import type { components } from "./generated/openapi.js";

export type ApiErrorBody = components["schemas"]["ApiErrorBody"];
export type ApiErrorDetail = components["schemas"]["ApiErrorDetail"];
export type ApiErrorResponse = components["schemas"]["ApiErrorResponse"];
export type ApiMeta = components["schemas"]["ApiMeta"];
export type DomainStatus = components["schemas"]["DomainStatus"];
export type Employee = components["schemas"]["Employee"];
export type ErrorCode = components["schemas"]["ErrorCode"];
export type Health = components["schemas"]["Health"];
export type Me = components["schemas"]["Me"];
export type OpenApiDocument = components["schemas"]["OpenApiDocument"];
export type Organization = components["schemas"]["Organization"];
export type OrganizationDomain = components["schemas"]["OrganizationDomain"];
export type OrganizationStatus = components["schemas"]["OrganizationStatus"];
