export {
  createCoreClient,
  paginate,
  type AccessTokenProvider,
  type CoreClient,
  type CoreClientOptions,
  type CoreRequestOptions,
  type CoreRetryConfig,
  type CoreRetryOption,
  type FetchFunction,
  type OperationInput,
  type OperationResult,
  type PaginatedOperationInput,
  type PaginatedResult,
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

export type AccountStatus = components["schemas"]["AccountStatus"];
export type ApiErrorBody = components["schemas"]["ApiErrorBody"];
export type ApiErrorDetail = components["schemas"]["ApiErrorDetail"];
export type ApiErrorResponse = components["schemas"]["ApiErrorResponse"];
export type ApiListMeta = components["schemas"]["ApiListMeta"];
export type ApiMeta = components["schemas"]["ApiMeta"];
export type AppAccess = components["schemas"]["AppAccess"];
export type AppAccessStatus = components["schemas"]["AppAccessStatus"];
export type CopyRole = components["schemas"]["CopyRole"];
export type CreateAppAccess = components["schemas"]["CreateAppAccess"];
export type CreateEmployee = components["schemas"]["CreateEmployee"];
export type CreateInvitation = components["schemas"]["CreateInvitation"];
export type CreateRole = components["schemas"]["CreateRole"];
export type CreateRoleAssignment = components["schemas"]["CreateRoleAssignment"];
export type CreateRoleFromScratch = components["schemas"]["CreateRoleFromScratch"];
export type CreateUnit = components["schemas"]["CreateUnit"];
export type DirectoryEmployee = components["schemas"]["DirectoryEmployee"];
export type DirectoryUnitMember = components["schemas"]["DirectoryUnitMember"];
export type DomainStatus = components["schemas"]["DomainStatus"];
export type Employee = components["schemas"]["Employee"];
export type EmployeeStatus = components["schemas"]["EmployeeStatus"];
export type Entitlement = components["schemas"]["Entitlement"];
export type EntitlementSourceType = components["schemas"]["EntitlementSourceType"];
export type EntitlementStatus = components["schemas"]["EntitlementStatus"];
export type EntitlementSuspendedReason = components["schemas"]["EntitlementSuspendedReason"];
export type ErrorCode = components["schemas"]["ErrorCode"];
export type GrantScope = components["schemas"]["GrantScope"];
export type Health = components["schemas"]["Health"];
export type Invitation = components["schemas"]["Invitation"];
export type InvitationStatus = components["schemas"]["InvitationStatus"];
export type Me = components["schemas"]["Me"];
export type OpenApiDocument = components["schemas"]["OpenApiDocument"];
export type Organization = components["schemas"]["Organization"];
export type OrganizationDomain = components["schemas"]["OrganizationDomain"];
export type OrganizationOwner = components["schemas"]["OrganizationOwner"];
export type OrganizationStatus = components["schemas"]["OrganizationStatus"];
export type Permission = components["schemas"]["Permission"];
export type PermissionGrant = components["schemas"]["PermissionGrant"];
export type PermissionManifestEntry = components["schemas"]["PermissionManifestEntry"];
export type PermissionSnapshot = components["schemas"]["PermissionSnapshot"];
/** Zdarzenie w kanale produktu (ADR-0100): koperta z `@monorise-team/events` plus numer `sequence`. */
export type ProductEvent = components["schemas"]["ProductEventList"][number];
export type ProductKey = components["schemas"]["ProductKey"];
export type PutUnitMember = components["schemas"]["PutUnitMember"];
export type RegisterPermissionsRequest = components["schemas"]["RegisterPermissionsRequest"];
export type RegisterPermissionsResult = components["schemas"]["RegisterPermissionsResult"];
export type RegisterRoleTemplatesRequest = components["schemas"]["RegisterRoleTemplatesRequest"];
export type RegisterRoleTemplatesResult = components["schemas"]["RegisterRoleTemplatesResult"];
export type Role = components["schemas"]["Role"];
export type RoleAssignment = components["schemas"]["RoleAssignment"];
export type RoleTemplateKey = components["schemas"]["RoleTemplateKey"];
export type RoleTemplateManifestEntry = components["schemas"]["RoleTemplateManifestEntry"];
export type ScopeType = components["schemas"]["ScopeType"];
export type SnapshotUnit = components["schemas"]["SnapshotUnit"];
export type TransferOrganizationOwner = components["schemas"]["TransferOrganizationOwner"];
export type Unit = components["schemas"]["Unit"];
export type UnitMember = components["schemas"]["UnitMember"];
export type UnitMembershipRole = components["schemas"]["UnitMembershipRole"];
export type UnitStatus = components["schemas"]["UnitStatus"];
export type UnitType = components["schemas"]["UnitType"];
export type UpdateRole = components["schemas"]["UpdateRole"];
export type UpdateUnit = components["schemas"]["UpdateUnit"];
