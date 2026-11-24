/* eslint-disable */
/**
 * Generated from packages/sdk/openapi/core-api.json. Do not edit by hand.
 * Regenerate with: pnpm --filter @monorise-team/sdk generate
 * Sync from MonoriseCore: pnpm --filter @monorise-team/sdk sync
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface OperationDefinition {
  readonly operationId: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly pathParams: readonly string[];
  readonly queryParams: readonly string[];
  readonly hasBody: boolean;
  readonly requiresAuth: boolean;
  readonly enveloped: boolean;
}

export const CORE_OPERATIONS = {
  getHealth: {
    operationId: "getHealth",
    method: "GET",
    path: "/core/v1/health",
    pathParams: [],
    queryParams: [],
    hasBody: false,
    requiresAuth: false,
    enveloped: true,
  },
  getMe: {
    operationId: "getMe",
    method: "GET",
    path: "/core/v1/me",
    pathParams: [],
    queryParams: [],
    hasBody: false,
    requiresAuth: true,
    enveloped: true,
  },
  getOpenApi: {
    operationId: "getOpenApi",
    method: "GET",
    path: "/core/v1/openapi.json",
    pathParams: [],
    queryParams: [],
    hasBody: false,
    requiresAuth: false,
    enveloped: false,
  },
  getOrganization: {
    operationId: "getOrganization",
    method: "GET",
    path: "/core/v1/organization",
    pathParams: [],
    queryParams: [],
    hasBody: false,
    requiresAuth: true,
    enveloped: true,
  },
} as const satisfies Record<string, OperationDefinition>;

export type CoreOperationId = keyof typeof CORE_OPERATIONS;
