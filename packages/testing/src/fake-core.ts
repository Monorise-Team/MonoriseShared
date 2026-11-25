import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  parsePermissionKey,
  permissionKeySchema,
  permissionManifestSchema,
  permissionSnapshotSchema,
  productNameSchema,
  type PermissionGrant,
  type PermissionManifestEntry,
  type PermissionSnapshot,
} from "@monorise-team/permissions";
import { jwtVerify } from "jose";
import { z } from "zod";
import {
  applyOrganizationSpec,
  createOrganizationBuilder,
  createOrganizationData,
  type CreateOrganizationInput,
  type DeclarativeOrganizationSpec,
  type FakeEntitlementRecord,
  type FakeOrganizationBuilder,
  type FakeOrganizationData,
  type OrganizationUserTokenOptions,
  type SeededOrganization,
} from "./builders.js";
import { createTestIssuer, type TestIssuer } from "./issuer.js";

export const CORE_PERMISSIONS_REGISTER_SCOPE = "core:permissions.register";
export const CORE_PERMISSIONS_READ_SCOPE = "core:permissions.read";
export const CORE_DIRECTORY_READ_SCOPE = "core:directory.read";

const FAKE_CORE_OPERATIONS = [
  "jwks",
  "token",
  "health",
  "me",
  "permissionSnapshot",
  "directoryUnitMembers",
  "directoryEmployees",
  "registerPermissions",
  "registerRoleTemplates",
] as const;

export type FakeCoreOperation = (typeof FAKE_CORE_OPERATIONS)[number];

export type FakeCoreFault =
  | { readonly status: 500 | 502 | 503 | 504 }
  | { readonly status: 429; readonly retryAfterSeconds: number }
  | { readonly delayMs: number }
  | { readonly networkError: true };

export interface FailNextOptions {
  /** Liczba kolejnych wywołań operacji, dla których zadziała wstrzyknięta awaria (domyślnie `1`). */
  times?: number;
}

export type FakeCoreCalls = ((operation: FakeCoreOperation) => number) & Record<FakeCoreOperation, number>;

const HTTP_FAULT_DEFAULTS: Record<500 | 502 | 503 | 504, { code: string; message: string }> = {
  500: { code: "INTERNAL", message: "Wewnętrzny błąd serwera" },
  502: { code: "SERVICE_UNAVAILABLE", message: "Błąd bramy serwera" },
  503: { code: "SERVICE_UNAVAILABLE", message: "Usługa tymczasowo niedostępna" },
  504: { code: "SERVICE_UNAVAILABLE", message: "Przekroczono czas oczekiwania bramy" },
};

const DEFAULT_MACHINE_SCOPES = [
  CORE_PERMISSIONS_REGISTER_SCOPE,
  CORE_PERMISSIONS_READ_SCOPE,
  CORE_DIRECTORY_READ_SCOPE,
] as const;

const MAX_PERMISSION_MANIFEST_ENTRIES = 500;
const MAX_ROLE_TEMPLATE_ENTRIES = 100;
const MAX_ROLE_PERMISSIONS = 200;
const MAX_DIRECTORY_FILTER_IDS = 100;
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;
const ROLE_TEMPLATE_KEY_REGEX = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

const AccessTokenClaimsSchema = z.object({
  iss: z.string(),
  sub: z.uuid(),
  aud: z.union([z.string(), z.array(z.string())]),
  org_id: z.uuid(),
  employee_id: z.uuid(),
  authz_rev: z.number().int().nonnegative(),
  iat: z.number(),
  exp: z.number(),
});

const MachineTokenClaimsSchema = z.object({
  iss: z.string(),
  sub: z.string().min(1).optional(),
  aud: z.union([z.string(), z.array(z.string())]),
  client_id: z.string().min(1),
  scope: z.string().default(""),
  org_id: z.never().optional(),
  iat: z.number(),
  exp: z.number(),
});

const PermissionSnapshotQuerySchema = z.object({
  organizationId: z.uuid(),
  accountId: z.uuid(),
});

const PageLimitSchema = z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT);
const PageCursorSchema = z.string().min(1).max(256);
const UuidSchema = z.uuid();

const RegisterPermissionsRequestSchema = permissionManifestSchema.max(
  MAX_PERMISSION_MANIFEST_ENTRIES,
  `Manifest uprawnień może zawierać co najwyżej ${MAX_PERMISSION_MANIFEST_ENTRIES} pozycji`,
);

const UniqueRolePermissionKeysSchema = z
  .array(permissionKeySchema)
  .min(1, "Rola musi zawierać co najmniej jedno uprawnienie")
  .max(MAX_ROLE_PERMISSIONS, `Rola może zawierać co najwyżej ${MAX_ROLE_PERMISSIONS} uprawnień`)
  .superRefine((keys, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: [i],
          message: `Zduplikowany klucz uprawnienia: "${key}"`,
        });
      } else {
        seen.add(key);
      }
    }
  });

const RoleTemplateEntrySchema = z.object({
  key: z.string().regex(ROLE_TEMPLATE_KEY_REGEX, "Nieprawidłowy klucz szablonu roli"),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500).nullable().optional(),
  permissions: UniqueRolePermissionKeysSchema,
});

export type RoleTemplateManifestEntry = z.infer<typeof RoleTemplateEntrySchema>;

const RegisterRoleTemplatesRequestSchema = z
  .array(RoleTemplateEntrySchema)
  .max(
    MAX_ROLE_TEMPLATE_ENTRIES,
    `Manifest szablonów ról może zawierać co najwyżej ${MAX_ROLE_TEMPLATE_ENTRIES} pozycji`,
  )
  .superRefine((entries, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      if (seen.has(entry.key)) {
        ctx.addIssue({
          code: "custom",
          path: [i, "key"],
          message: `Zduplikowany klucz szablonu roli: "${entry.key}"`,
        });
      } else {
        seen.add(entry.key);
      }
    }
  });

export interface FakeCoreProductConfig {
  /** Klucz produktu, np. `"timotime"`. */
  key: string;
  /** Nazwa produktu (opcjonalna). */
  name?: string;
  /** Identyfikator poufnego klienta OAuth (np. `"timotime-web"`). */
  clientId: string;
  /** Sekret klienta OAuth do przepływu `client_credentials`. */
  clientSecret: string;
  /** Dozwolone zakresy maszynowe (domyślnie `core:permissions.register`, `core:permissions.read`, `core:directory.read`). */
  scopes?: readonly string[];
}

export interface CreateFakeCoreOptions {
  /** Adres serwera logowania Core (pole `iss`), domyślnie `https://auth.monorise.test`. */
  issuer?: string;
  /** Adres Core API (pole `aud`/`resource`), domyślnie równy `issuer` lub `https://api.monorise.test`. */
  coreApiUrl?: string;
  /** Opcjonalny gotowy wystawca kluczy i tokenów. */
  testIssuer?: TestIssuer;
  /** Zarejestrowane produkty i ich poufni klienci OAuth. */
  products?: readonly FakeCoreProductConfig[];
  /** Opcjonalna funkcja zwracająca bieżący czas (np. do deterministycznych testów wygasania). */
  now?: () => Date;
  /** Maksymalny rozmiar strony dla katalogu (`directory/employees` i `directory/unit-members`). */
  directoryPageSize?: number;
}

export interface RecordedPermissionsRegistration {
  readonly productKey: string;
  readonly clientId: string;
  readonly manifest: readonly PermissionManifestEntry[];
  readonly receivedAt: Date;
}

export interface RecordedRoleTemplatesRegistration {
  readonly productKey: string;
  readonly clientId: string;
  readonly templates: readonly RoleTemplateManifestEntry[];
  readonly receivedAt: Date;
}

export interface FakeCoreServerHandle {
  /** Pełny adres uruchomionego serwera, np. `http://127.0.0.1:54321`. */
  readonly url: string;
  readonly port: number;
  readonly server: Server;
  close(): Promise<void>;
}

export interface ListenOptions {
  host?: string;
  port?: number;
  /**
   * Czy zsynchronizować `issuer` i `coreApiUrl` z adresem uruchomionego serwera HTTP.
   * Domyślnie `true`, gdy `issuer` nie został jawnie podany w `createFakeCore`, w przeciwnym razie `false`.
   */
  syncUrls?: boolean;
}

interface StoredPermission {
  key: string;
  description: string;
  deprecatedAt: Date | null;
}

interface StoredRoleTemplate {
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  archivedAt: Date | null;
}

interface RegisteredProduct {
  key: string;
  name: string;
  clientId: string;
  clientSecret: string;
  scopes: Set<string>;
  permissions: Map<string, StoredPermission>;
  roleTemplates: Map<string, StoredRoleTemplate>;
}

class FakeCoreApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: { field?: string; message: string }[] = [],
  ) {
    super(message);
  }
}

class FakeCoreNetworkError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "TypeError";
  }
}

export interface FakeCore {
  /** Aktywny wystawca kluczy i tokenów JWT. */
  readonly issuer: TestIssuer;
  /** Adres serwera logowania Core (`iss`). */
  readonly issuerUrl: string;
  /** Adres Core API (`aud` / `resource`). */
  readonly coreApiUrl: string;
  /** Zarejestrowane produkty. */
  registerProduct(product: FakeCoreProductConfig): void;
  /** Oznacza uprawnienie produktu jako wycofane (`deprecatedAt`), przez co znika z migawek. */
  deprecatePermission(productKey: string, permissionKey: string): void;
  /** Tworzy firmę w atrapie Core i zwraca płynnego budowniczego. */
  organization(input: CreateOrganizationInput): FakeOrganizationBuilder;
  /** Zasila atrapę Core firmą opisaną deklaratywnym obiektem. */
  seedOrganization(spec: DeclarativeOrganizationSpec): SeededOrganization;
  /** Zwraca budowniczego istniejącej firmy po jej identyfikatorze. */
  getOrganization(organizationId: string): FakeOrganizationBuilder | undefined;
  /** Podpisuje token użytkownika dla dowolnego konta zarejestrowanego w atrapie Core. */
  signUserToken(accountId: string, options: OrganizationUserTokenOptions): Promise<string>;
  /** Oblicza i waliduje migawkę uprawnień dokładnie według reguł Core (bez wywołania HTTP). */
  buildPermissionSnapshot(productKey: string, organizationId: string, accountId: string): PermissionSnapshot;
  /** Historia wywołań rejestracji uprawnień i szablonów ról przesłanych przez produkty. */
  readonly registrations: {
    readonly permissions: readonly RecordedPermissionsRegistration[];
    readonly roleTemplates: readonly RecordedRoleTemplatesRegistration[];
  };
  /**
   * Liczniki wywołań poszczególnych endpointów atrapy Core (łącznie z wywołaniami z wstrzykniętą awarią).
   * Działa zarówno jako funkcja `calls(operation)`, jak i obiekt z polami `calls.<operation>`.
   */
  readonly calls: FakeCoreCalls;
  /** Kolejkuje awarię dla wskazanej operacji (domyślnie dla 1 kolejnego wywołania). */
  failNext(operation: FakeCoreOperation, fault: FakeCoreFault, options?: FailNextOptions): void;
  /** Usuwa wszystkie zakolejkowane awarie dla wszystkich operacji. */
  clearFaults(): void;
  /** Zeruje liczniki wywołań wszystkich operacji. */
  resetCalls(): void;
  /** Ustawia lub usuwa maksymalny rozmiar strony dla katalogu (`directory/employees` i `directory/unit-members`). */
  setDirectoryPageSize(pageSize: number | undefined): void;
  /** Handler zgodny z `fetch` do bezpośredniego podpięcia np. w `@monorise-team/sdk`. */
  readonly fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  /** Uruchamia lokalny serwer HTTP na losowym porcie dla produktów wywołujących Core po adresie URL. */
  listen(options?: ListenOptions): Promise<FakeCoreServerHandle>;
  /** Czyści dane firm, historię rejestracji, wstrzyknięte awarie i liczniki wywołań (produkty i klucze pozostają). */
  reset(): void;
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function validateDirectoryPageSize(pageSize: number | undefined): number | undefined {
  if (pageSize === undefined) return undefined;
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new RangeError("Rozmiar strony katalogu (directoryPageSize) musi być dodatnią liczbą całkowitą");
  }
  return pageSize;
}

function makeRequestId(): string {
  return `req_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function jsonResponse(status: number, body: unknown, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function successEnvelope(data: unknown, status = 200): Response {
  return jsonResponse(status, {
    data,
    meta: { requestId: makeRequestId() },
    error: null,
  });
}

function listEnvelope(data: unknown[], nextCursor: string | null): Response {
  return jsonResponse(200, {
    data,
    meta: { requestId: makeRequestId(), nextCursor },
    error: null,
  });
}

function errorEnvelope(
  status: number,
  code: string,
  message: string,
  details: { field?: string; message: string }[] = [],
  extraHeaders?: Record<string, string>,
): Response {
  return jsonResponse(
    status,
    {
      data: null,
      meta: { requestId: makeRequestId() },
      error: { code, message, details },
    },
    extraHeaders,
  );
}

function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): string {
  if (!BASE64URL_RE.test(cursor)) {
    throw new FakeCoreApiError(422, "VALIDATION_FAILED", "Błędne dane wejściowe", [
      { field: "cursor", message: "Nieprawidłowy kursor stronicowania" },
    ]);
  }
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  if (!UuidSchema.safeParse(decoded).success || encodeCursor(decoded) !== cursor) {
    throw new FakeCoreApiError(422, "VALIDATION_FAILED", "Błędne dane wejściowe", [
      { field: "cursor", message: "Nieprawidłowy kursor stronicowania" },
    ]);
  }
  return decoded;
}

function parseOrFail<T>(schema: z.ZodType<T>, value: unknown, message = "Błędne dane wejściowe"): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      ...(issue.path.length > 0 ? { field: issue.path.map(String).join(".") } : {}),
      message: issue.message,
    }));
    throw new FakeCoreApiError(422, "VALIDATION_FAILED", message, details);
  }
  return result.data;
}

function isEntitlementActive(entitlement: FakeEntitlementRecord, now: Date): boolean {
  const nowMs = now.getTime();
  return (
    entitlement.status === "ACTIVE" &&
    entitlement.startsAt.getTime() <= nowMs &&
    (entitlement.endsAt === null || entitlement.endsAt.getTime() > nowMs)
  );
}

function parseBearerHeader(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    throw new FakeCoreApiError(401, "UNAUTHENTICATED", "Brak tokenu dostępu");
  }
  const token = header.slice(7).trim();
  if (!token) {
    throw new FakeCoreApiError(401, "UNAUTHENTICATED", "Brak tokenu dostępu");
  }
  return token;
}

function extractClientCredentials(
  request: Request,
  form: URLSearchParams,
): { clientId: string; clientSecret: string } | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader && /^Basic\s+/i.test(authHeader)) {
    const raw = Buffer.from(authHeader.replace(/^Basic\s+/i, "").trim(), "base64").toString("utf8");
    const separator = raw.indexOf(":");
    if (separator !== -1) {
      return {
        clientId: decodeURIComponent(raw.slice(0, separator)),
        clientSecret: decodeURIComponent(raw.slice(separator + 1)),
      };
    }
  }
  const clientId = form.get("client_id");
  const clientSecret = form.get("client_secret");
  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }
  return null;
}

function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((item) => setA.has(item));
}

function readNodeRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parsePageAndRepeatableFilter(
  searchParams: URLSearchParams,
  filterParamName: string,
): {
  organizationId: string;
  filterIds?: string[];
  limit: number;
  afterId?: string;
} {
  const organizationId = parseOrFail(z.object({ organizationId: z.uuid() }), {
    organizationId: searchParams.get("organizationId") ?? undefined,
  }).organizationId;

  const limitRaw = searchParams.get("limit");
  const limit = parseOrFail(z.object({ limit: PageLimitSchema }), limitRaw !== null ? { limit: limitRaw } : {}).limit;

  const cursorRaw = searchParams.get("cursor");
  let afterId: string | undefined;
  if (cursorRaw !== null) {
    const validatedCursor = parseOrFail(z.object({ cursor: PageCursorSchema }), { cursor: cursorRaw }).cursor;
    afterId = decodeCursor(validatedCursor);
  }

  const rawFilterValues = searchParams.getAll(filterParamName);
  let filterIds: string[] | undefined;
  if (rawFilterValues.length > 0) {
    const validated = parseOrFail(z.object({ [filterParamName]: z.array(z.uuid()).max(MAX_DIRECTORY_FILTER_IDS) }), {
      [filterParamName]: rawFilterValues,
    })[filterParamName] as string[];
    filterIds = [...new Set(validated)];
  }

  return {
    organizationId,
    ...(filterIds !== undefined ? { filterIds } : {}),
    limit,
    ...(afterId !== undefined ? { afterId } : {}),
  };
}

function paginateById<T extends { id: string }>(
  rows: readonly T[],
  limit: number,
  afterId?: string,
): { items: T[]; nextCursor: string | null } {
  const sorted = [...rows]
    .filter((row) => (afterId !== undefined ? row.id > afterId : true))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const hasMore = sorted.length > limit;
  const items = hasMore ? sorted.slice(0, limit) : sorted;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.id) : null,
  };
}

/**
 * Tworzy atrapę MonoriseCore (Auth JWKS + OAuth `client_credentials` + Core API `/core/v1/*`)
 * zgodną z prawdziwym zachowaniem Core (`server.ts`, `authorization.ts`, `permissions-registry.ts`).
 */
export async function createFakeCore(options: CreateFakeCoreOptions = {}): Promise<FakeCore> {
  const hasExplicitIssuer = options.issuer !== undefined || options.testIssuer !== undefined;
  let activeIssuerUrl = normalizeUrl(options.testIssuer?.issuer ?? options.issuer ?? "https://auth.monorise.test");
  let activeCoreApiUrl = normalizeUrl(
    options.coreApiUrl ?? options.testIssuer?.issuer ?? options.issuer ?? "https://api.monorise.test",
  );
  let activeIssuer: TestIssuer = options.testIssuer ?? (await createTestIssuer({ issuer: activeIssuerUrl }));
  const getNow = options.now ?? (() => new Date());
  let directoryPageSize = validateDirectoryPageSize(options.directoryPageSize);

  const products = new Map<string, RegisteredProduct>();
  const organizations = new Map<string, FakeOrganizationData>();
  const permissionRegistrations: RecordedPermissionsRegistration[] = [];
  const roleTemplateRegistrations: RecordedRoleTemplatesRegistration[] = [];
  const faultQueues = new Map<FakeCoreOperation, FakeCoreFault[]>();

  const callCounts: Record<FakeCoreOperation, number> = {
    jwks: 0,
    token: 0,
    health: 0,
    me: 0,
    permissionSnapshot: 0,
    directoryUnitMembers: 0,
    directoryEmployees: 0,
    registerPermissions: 0,
    registerRoleTemplates: 0,
  };

  const calls = ((operation: FakeCoreOperation): number => callCounts[operation]) as FakeCoreCalls;
  for (const op of FAKE_CORE_OPERATIONS) {
    Object.defineProperty(calls, op, {
      enumerable: true,
      get: () => callCounts[op],
      set: (value: number) => {
        callCounts[op] = value;
      },
    });
  }

  function failNext(operation: FakeCoreOperation, fault: FakeCoreFault, failOptions: FailNextOptions = {}): void {
    const times = failOptions.times ?? 1;
    if (!Number.isInteger(times) || times < 1) {
      throw new RangeError("Parametr times w failNext musi być dodatnią liczbą całkowitą");
    }
    if ("delayMs" in fault && (!Number.isFinite(fault.delayMs) || fault.delayMs < 0)) {
      throw new RangeError("Opóźnienie delayMs w failNext musi być nieujemną liczbą");
    }
    if (
      "status" in fault &&
      fault.status === 429 &&
      (!Number.isFinite(fault.retryAfterSeconds) || fault.retryAfterSeconds < 0)
    ) {
      throw new RangeError("Parametr retryAfterSeconds w failNext musi być nieujemną liczbą");
    }
    const queue = faultQueues.get(operation) ?? [];
    for (let i = 0; i < times; i++) {
      queue.push(fault);
    }
    faultQueues.set(operation, queue);
  }

  function clearFaults(): void {
    faultQueues.clear();
  }

  function resetCalls(): void {
    for (const op of FAKE_CORE_OPERATIONS) {
      callCounts[op] = 0;
    }
  }

  function setDirectoryPageSize(pageSize: number | undefined): void {
    directoryPageSize = validateDirectoryPageSize(pageSize);
  }

  async function applyOperationHook(operation: FakeCoreOperation): Promise<Response | null> {
    callCounts[operation] += 1;
    const queue = faultQueues.get(operation);
    const fault = queue?.shift();
    if (!fault) return null;
    if (queue && queue.length === 0) {
      faultQueues.delete(operation);
    }
    if ("networkError" in fault) {
      throw new FakeCoreNetworkError(`Symulowany błąd sieci dla operacji "${operation}"`);
    }
    if ("delayMs" in fault) {
      if (fault.delayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, fault.delayMs));
      }
      return null;
    }
    if (fault.status === 429) {
      return errorEnvelope(429, "RATE_LIMITED", "Przekroczono limit żądań", [], {
        "Retry-After": String(fault.retryAfterSeconds),
      });
    }
    const { code, message } = HTTP_FAULT_DEFAULTS[fault.status];
    return errorEnvelope(fault.status, code, message);
  }

  function registerProduct(config: FakeCoreProductConfig): void {
    const key = productNameSchema.parse(config.key);
    products.set(key, {
      key,
      name: config.name ?? key,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      scopes: new Set(config.scopes ?? DEFAULT_MACHINE_SCOPES),
      permissions: new Map(),
      roleTemplates: new Map(),
    });
  }

  for (const product of options.products ?? []) {
    registerProduct(product);
  }

  function deprecatePermission(productKey: string, permissionKey: string): void {
    const product = products.get(productKey);
    if (!product) {
      throw new Error(`Nieznany produkt "${productKey}" w atrapie Core`);
    }
    const existing = product.permissions.get(permissionKey);
    if (existing) {
      existing.deprecatedAt = getNow();
    } else {
      product.permissions.set(permissionKey, {
        key: permissionKey,
        description: permissionKey,
        deprecatedAt: getNow(),
      });
    }
  }

  function findAccountLocation(accountId: string): { org: FakeOrganizationData } | undefined {
    for (const org of organizations.values()) {
      if (org.accounts.has(accountId)) {
        return { org };
      }
    }
    return undefined;
  }

  function hasActiveEntitlement(org: FakeOrganizationData, productKey: string, now: Date): boolean {
    for (const ent of org.entitlements.values()) {
      if (ent.productKey === productKey && isEntitlementActive(ent, now)) {
        return true;
      }
    }
    return false;
  }

  function hasActiveAppAccess(org: FakeOrganizationData, accountId: string, productKey: string): boolean {
    for (const access of org.appAccesses.values()) {
      if (access.accountId === accountId && access.productKey === productKey && access.status === "ACTIVE") {
        return true;
      }
    }
    return false;
  }

  function isPermissionDeprecated(productKey: string, permissionKey: string): boolean {
    const product = products.get(productKey);
    const stored = product?.permissions.get(permissionKey);
    return stored !== undefined && stored.deprecatedAt !== null;
  }

  function computePermissionSnapshot(
    productKey: string,
    organizationId: string,
    accountId: string,
  ): PermissionSnapshot {
    const org = organizations.get(organizationId);
    const account = org?.accounts.get(accountId);
    if (!org || !account) {
      throw new FakeCoreApiError(404, "NOT_FOUND", "Nie znaleziono konta w firmie");
    }

    // Zwracamy wszystkie jednostki firmy, łącznie z ARCHIVED (zgodnie z Core authorization.ts).
    const units = [...org.units.values()].map((unit) => ({
      id: unit.id,
      parentId: unit.parentId,
    }));
    const isOwner = org.ownerAccountId === account.id;

    if (account.status !== "ACTIVE") {
      return permissionSnapshotSchema.parse({
        accountId: account.id,
        organizationId: org.id,
        authzRevision: account.authzRevision,
        isOwner,
        products: [],
        grants: [],
        units,
      });
    }

    const now = getNow();
    const entitled = hasActiveEntitlement(org, productKey, now);
    const hasProductAccess = entitled && (isOwner || hasActiveAppAccess(org, account.id, productKey));

    const grants: PermissionGrant[] = [];
    for (const assignment of org.roleAssignments.values()) {
      if (assignment.accountId !== account.id) continue;
      const role = org.roles.get(assignment.roleId);
      if (!role || role.archivedAt !== null) continue;
      if (role.productKey !== productKey) continue;

      const validFrom = assignment.validFrom ? assignment.validFrom.toISOString() : null;
      const validUntil = assignment.validUntil ? assignment.validUntil.toISOString() : null;

      for (const permKey of role.permissions) {
        if (isPermissionDeprecated(productKey, permKey)) continue;
        // Odsiewamy klucze nienależące do produktu (np. nigdy `core.*`).
        const parsedKey = parsePermissionKey(permKey);
        if (parsedKey.product !== productKey) continue;
        grants.push({
          permission: permKey,
          scope: assignment.scope,
          validFrom,
          validUntil,
        });
      }
    }

    return permissionSnapshotSchema.parse({
      accountId: account.id,
      organizationId: org.id,
      authzRevision: account.authzRevision,
      isOwner,
      products: hasProductAccess ? [productKey] : [],
      grants,
      units,
    });
  }

  async function verifyUserCaller(request: Request) {
    const token = parseBearerHeader(request);
    let claims: z.infer<typeof AccessTokenClaimsSchema>;
    try {
      const { payload } = await jwtVerify(token, activeIssuer.localJWKSet, {
        issuer: activeIssuerUrl,
        audience: activeCoreApiUrl,
        algorithms: ["EdDSA"],
        currentDate: getNow(),
      });
      claims = AccessTokenClaimsSchema.parse(payload);
    } catch {
      throw new FakeCoreApiError(401, "UNAUTHENTICATED", "Token jest nieważny albo wygasł");
    }

    const org = organizations.get(claims.org_id);
    const account = org?.accounts.get(claims.sub);
    if (!org || !account || account.employeeId !== claims.employee_id) {
      throw new FakeCoreApiError(401, "UNAUTHENTICATED", "Token jest nieważny albo wygasł");
    }
    if (account.status === "DEACTIVATED") {
      throw new FakeCoreApiError(401, "ACCOUNT_DEACTIVATED", "Konto jest wyłączone");
    }
    if (account.status !== "ACTIVE") {
      throw new FakeCoreApiError(401, "UNAUTHENTICATED", "Konto nie jest aktywne");
    }
    return { org, account };
  }

  async function verifyMachineCaller(request: Request, requiredScope: string) {
    const token = parseBearerHeader(request);
    let claims: z.infer<typeof MachineTokenClaimsSchema>;
    try {
      const { payload } = await jwtVerify(token, activeIssuer.localJWKSet, {
        issuer: activeIssuerUrl,
        audience: activeCoreApiUrl,
        algorithms: ["EdDSA"],
        currentDate: getNow(),
      });
      claims = MachineTokenClaimsSchema.parse(payload);
    } catch {
      throw new FakeCoreApiError(401, "UNAUTHENTICATED", "Token jest nieważny albo wygasł");
    }

    const scopes = new Set(claims.scope.split(" ").filter(Boolean));
    if (!scopes.has(requiredScope)) {
      throw new FakeCoreApiError(403, "PERMISSION_DENIED", "Token nie ma wymaganego zakresu uprawnień");
    }
    return { clientId: claims.client_id, scopes };
  }

  function requireProductForMachine(rawProductKey: string, clientId: string, deniedMessage: string): RegisteredProduct {
    const productKey = parseOrFail(z.object({ productKey: productNameSchema }), {
      productKey: rawProductKey,
    }).productKey;
    const product = products.get(productKey);
    if (!product) {
      throw new FakeCoreApiError(404, "NOT_FOUND", "Nie znaleziono produktu");
    }
    if (product.clientId !== clientId) {
      throw new FakeCoreApiError(403, "PERMISSION_DENIED", deniedMessage);
    }
    return product;
  }

  function requireOrgWithActiveEntitlement(organizationId: string, productKey: string): FakeOrganizationData {
    const org = organizations.get(organizationId);
    if (!org) {
      throw new FakeCoreApiError(404, "NOT_FOUND", "Nie znaleziono firmy");
    }
    if (!hasActiveEntitlement(org, productKey, getNow())) {
      throw new FakeCoreApiError(403, "PERMISSION_DENIED", "Firma nie ma aktywnego dostępu do tego produktu");
    }
    return org;
  }

  async function readJsonBody(request: Request): Promise<unknown> {
    const raw = await request.text();
    if (raw.trim().length === 0) {
      throw new FakeCoreApiError(422, "VALIDATION_FAILED", "Nieprawidłowa treść żądania");
    }
    try {
      return JSON.parse(raw);
    } catch {
      throw new FakeCoreApiError(422, "VALIDATION_FAILED", "Nieprawidłowa treść żądania");
    }
  }

  async function handleOAuthToken(request: Request): Promise<Response> {
    const rawBody = await request.text();
    const form = new URLSearchParams(rawBody);

    const grantType = form.get("grant_type");
    if (grantType !== "client_credentials") {
      return jsonResponse(400, {
        error: "unsupported_grant_type",
        error_description: "Obsługiwany jest wyłącznie grant_type=client_credentials",
      });
    }

    const credentials = extractClientCredentials(request, form);
    if (!credentials) {
      return jsonResponse(401, {
        error: "invalid_client",
        error_description: "Brak danych uwierzytelniających klienta",
      });
    }

    const product = [...products.values()].find(
      (entry) => entry.clientId === credentials.clientId && entry.clientSecret === credentials.clientSecret,
    );
    if (!product) {
      return jsonResponse(401, {
        error: "invalid_client",
        error_description: "Nieznany klient lub nieprawidłowy sekret",
      });
    }

    const requestedResource = form.get("resource");
    const audience = requestedResource ? normalizeUrl(requestedResource) : activeCoreApiUrl;
    if (audience !== activeCoreApiUrl) {
      return jsonResponse(400, {
        error: "invalid_target",
        error_description: `Nieprawidłowy zasób docelowy (resource): oczekiwano ${activeCoreApiUrl}`,
      });
    }

    const requestedScopeRaw = (form.get("scope") ?? "").trim();
    const requestedScopes = requestedScopeRaw ? requestedScopeRaw.split(/\s+/).filter(Boolean) : [];
    if (requestedScopes.length === 0) {
      return jsonResponse(400, {
        error: "invalid_scope",
        error_description: "Wymagany jest co najmniej jeden zakres (scope)",
      });
    }
    const disallowed = requestedScopes.filter((scope) => !product.scopes.has(scope));
    if (disallowed.length > 0) {
      return jsonResponse(400, {
        error: "invalid_scope",
        error_description: `Niedozwolony zakres: ${disallowed.join(", ")}`,
      });
    }

    const grantedScope = requestedScopes.join(" ");
    const accessToken = await activeIssuer.signMachineToken({
      clientId: product.clientId,
      audience,
      scope: grantedScope,
      expiresIn: 300,
      now: getNow(),
    });

    return jsonResponse(200, {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 300,
      scope: grantedScope,
    });
  }

  async function handleRegisterPermissions(request: Request, productKeyParam: string): Promise<Response> {
    const machine = await verifyMachineCaller(request, CORE_PERMISSIONS_REGISTER_SCOPE);
    const product = requireProductForMachine(
      productKeyParam,
      machine.clientId,
      "Ten klient nie może rejestrować uprawnień wskazanego produktu",
    );

    const body = await readJsonBody(request);
    const manifest = parseOrFail(RegisterPermissionsRequestSchema, body, "Błędny manifest uprawnień");

    const prefixIssues: { field?: string; message: string }[] = [];
    for (let i = 0; i < manifest.length; i++) {
      const entry = manifest[i]!;
      const parsedKey = parsePermissionKey(entry.key);
      if (parsedKey.product !== product.key) {
        prefixIssues.push({
          field: `${i}.key`,
          message: `Klucz uprawnienia "${entry.key}" musi zaczynać się od prefiksu "${product.key}."`,
        });
      }
    }
    if (prefixIssues.length > 0) {
      throw new FakeCoreApiError(422, "VALIDATION_FAILED", "Błędny prefiks klucza uprawnienia", prefixIssues);
    }

    const incomingKeys = new Set<string>();
    const added: string[] = [];
    const updated: string[] = [];
    const deprecated: string[] = [];
    const restored: string[] = [];
    let unchanged = 0;

    for (const entry of manifest) {
      incomingKeys.add(entry.key);
      const current = product.permissions.get(entry.key);
      if (!current) {
        product.permissions.set(entry.key, {
          key: entry.key,
          description: entry.description,
          deprecatedAt: null,
        });
        added.push(entry.key);
      } else if (current.deprecatedAt !== null) {
        current.description = entry.description;
        current.deprecatedAt = null;
        restored.push(entry.key);
      } else if (current.description !== entry.description) {
        current.description = entry.description;
        updated.push(entry.key);
      } else {
        unchanged += 1;
      }
    }

    const now = getNow();
    for (const current of product.permissions.values()) {
      if (!incomingKeys.has(current.key) && current.deprecatedAt === null) {
        current.deprecatedAt = now;
        deprecated.push(current.key);
      }
    }

    added.sort();
    updated.sort();
    deprecated.sort();
    restored.sort();

    permissionRegistrations.push({
      productKey: product.key,
      clientId: machine.clientId,
      manifest: manifest.map((entry) => ({ ...entry })),
      receivedAt: now,
    });

    return successEnvelope({ added, updated, deprecated, restored, unchanged });
  }

  async function handleRegisterRoleTemplates(request: Request, productKeyParam: string): Promise<Response> {
    const machine = await verifyMachineCaller(request, CORE_PERMISSIONS_REGISTER_SCOPE);
    const product = requireProductForMachine(
      productKeyParam,
      machine.clientId,
      "Ten klient nie może rejestrować szablonów ról wskazanego produktu",
    );

    const body = await readJsonBody(request);
    const templates = parseOrFail(RegisterRoleTemplatesRequestSchema, body, "Błędny manifest szablonów ról");

    const prefixIssues: { field?: string; message: string }[] = [];
    for (let i = 0; i < templates.length; i++) {
      const entry = templates[i]!;
      if (!entry.key.startsWith(`${product.key}.`)) {
        prefixIssues.push({
          field: `${i}.key`,
          message: `Klucz szablonu roli "${entry.key}" musi zaczynać się od prefiksu "${product.key}."`,
        });
      }
    }
    if (prefixIssues.length > 0) {
      throw new FakeCoreApiError(422, "VALIDATION_FAILED", "Błędny prefiks klucza szablonu roli", prefixIssues);
    }

    const activePermissions = new Set(
      [...product.permissions.values()].filter((p) => p.deprecatedAt === null).map((p) => p.key),
    );
    const permIssues: { field?: string; message: string }[] = [];
    for (let i = 0; i < templates.length; i++) {
      const entry = templates[i]!;
      for (let j = 0; j < entry.permissions.length; j++) {
        const permKey = entry.permissions[j]!;
        if (!activePermissions.has(permKey)) {
          permIssues.push({
            field: `${i}.permissions.${j}`,
            message: `Uprawnienie "${permKey}" nie jest zarejestrowanym, aktywnym uprawnieniem produktu "${product.key}"`,
          });
        }
      }
    }
    if (permIssues.length > 0) {
      throw new FakeCoreApiError(
        422,
        "VALIDATION_FAILED",
        "Nieznane lub wycofane uprawnienie w szablonie roli",
        permIssues,
      );
    }

    const incomingKeys = new Set<string>();
    const added: string[] = [];
    const updated: string[] = [];
    const archived: string[] = [];
    const restored: string[] = [];
    let unchanged = 0;

    for (const entry of templates) {
      incomingKeys.add(entry.key);
      const description = entry.description ?? null;
      const current = product.roleTemplates.get(entry.key);
      if (!current) {
        product.roleTemplates.set(entry.key, {
          key: entry.key,
          name: entry.name,
          description,
          permissions: [...entry.permissions],
          archivedAt: null,
        });
        added.push(entry.key);
      } else if (current.archivedAt !== null) {
        current.name = entry.name;
        current.description = description;
        current.permissions = [...entry.permissions];
        current.archivedAt = null;
        restored.push(entry.key);
      } else if (
        current.name !== entry.name ||
        current.description !== description ||
        !sameStringSet(current.permissions, entry.permissions)
      ) {
        current.name = entry.name;
        current.description = description;
        current.permissions = [...entry.permissions];
        updated.push(entry.key);
      } else {
        unchanged += 1;
      }
    }

    const now = getNow();
    for (const current of product.roleTemplates.values()) {
      if (!incomingKeys.has(current.key) && current.archivedAt === null) {
        current.archivedAt = now;
        archived.push(current.key);
      }
    }

    added.sort();
    updated.sort();
    archived.sort();
    restored.sort();

    roleTemplateRegistrations.push({
      productKey: product.key,
      clientId: machine.clientId,
      templates: templates.map((entry) => ({ ...entry, permissions: [...entry.permissions] })),
      receivedAt: now,
    });

    return successEnvelope({ added, updated, archived, restored, unchanged });
  }

  async function handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const pathname = url.pathname;

    try {
      if (method === "GET" && pathname === "/api/auth/jwks") {
        const fault = await applyOperationHook("jwks");
        if (fault) return fault;
        return jsonResponse(200, activeIssuer.jwks);
      }

      if (method === "POST" && pathname === "/api/auth/oauth2/token") {
        const fault = await applyOperationHook("token");
        if (fault) return fault;
        return await handleOAuthToken(request);
      }

      if (method === "GET" && pathname === "/core/v1/health") {
        const fault = await applyOperationHook("health");
        if (fault) return fault;
        return successEnvelope({ status: "ok" });
      }

      if (method === "GET" && pathname === "/core/v1/me") {
        const fault = await applyOperationHook("me");
        if (fault) return fault;
        const { org, account } = await verifyUserCaller(request);
        const employee = org.employees.get(account.employeeId);
        if (!employee) {
          throw new FakeCoreApiError(401, "UNAUTHENTICATED", "Token jest nieważny albo wygasł");
        }
        return successEnvelope({
          account: {
            id: account.id,
            email: account.email,
            status: account.status,
            isOwner: org.ownerAccountId === account.id,
          },
          employee: {
            id: employee.id,
            accountId: account.id,
            accountStatus: account.status,
            firstName: employee.firstName,
            lastName: employee.lastName,
            workEmail: employee.workEmail,
            jobTitle: employee.jobTitle,
            status: employee.status,
          },
          organization: {
            id: org.id,
            name: org.name,
            status: org.status,
          },
        });
      }

      const snapshotMatch = /^\/core\/v1\/products\/([^/]+)\/permission-snapshot$/.exec(pathname);
      if (method === "GET" && snapshotMatch) {
        const fault = await applyOperationHook("permissionSnapshot");
        if (fault) return fault;
        const machine = await verifyMachineCaller(request, CORE_PERMISSIONS_READ_SCOPE);
        const productKeyParam = decodeURIComponent(snapshotMatch[1]!);
        const query = parseOrFail(PermissionSnapshotQuerySchema, {
          organizationId: url.searchParams.get("organizationId") ?? undefined,
          accountId: url.searchParams.get("accountId") ?? undefined,
        });
        const product = requireProductForMachine(
          productKeyParam,
          machine.clientId,
          "Ten klient nie może odczytywać migawki uprawnień wskazanego produktu",
        );
        const snapshot = computePermissionSnapshot(product.key, query.organizationId, query.accountId);
        return successEnvelope(snapshot);
      }

      const unitMembersMatch = /^\/core\/v1\/products\/([^/]+)\/directory\/unit-members$/.exec(pathname);
      if (method === "GET" && unitMembersMatch) {
        const fault = await applyOperationHook("directoryUnitMembers");
        if (fault) return fault;
        const machine = await verifyMachineCaller(request, CORE_DIRECTORY_READ_SCOPE);
        const productKeyParam = decodeURIComponent(unitMembersMatch[1]!);
        const page = parsePageAndRepeatableFilter(url.searchParams, "unitId");
        const product = requireProductForMachine(
          productKeyParam,
          machine.clientId,
          "Ten klient nie może odczytywać katalogu wskazanego produktu",
        );
        const org = requireOrgWithActiveEntitlement(page.organizationId, product.key);

        const unitIdSet = page.filterIds ? new Set(page.filterIds) : null;
        const matching = [...org.unitMemberships.values()].filter((m) => (unitIdSet ? unitIdSet.has(m.unitId) : true));
        const effectiveLimit = directoryPageSize !== undefined ? Math.min(page.limit, directoryPageSize) : page.limit;
        const { items, nextCursor } = paginateById(matching, effectiveLimit, page.afterId);
        return listEnvelope(
          items.map((item) => {
            const employee = org.employees.get(item.employeeId);
            return {
              unitId: item.unitId,
              employeeId: item.employeeId,
              accountId: employee?.accountId ?? null,
              role: item.role,
            };
          }),
          nextCursor,
        );
      }

      const employeesMatch = /^\/core\/v1\/products\/([^/]+)\/directory\/employees$/.exec(pathname);
      if (method === "GET" && employeesMatch) {
        const fault = await applyOperationHook("directoryEmployees");
        if (fault) return fault;
        const machine = await verifyMachineCaller(request, CORE_DIRECTORY_READ_SCOPE);
        const productKeyParam = decodeURIComponent(employeesMatch[1]!);
        const page = parsePageAndRepeatableFilter(url.searchParams, "employeeId");
        const product = requireProductForMachine(
          productKeyParam,
          machine.clientId,
          "Ten klient nie może odczytywać katalogu wskazanego produktu",
        );
        const org = requireOrgWithActiveEntitlement(page.organizationId, product.key);

        const employeeIdSet = page.filterIds ? new Set(page.filterIds) : null;
        const matching = [...org.employees.values()].filter((e) => (employeeIdSet ? employeeIdSet.has(e.id) : true));
        const effectiveLimit = directoryPageSize !== undefined ? Math.min(page.limit, directoryPageSize) : page.limit;
        const { items, nextCursor } = paginateById(matching, effectiveLimit, page.afterId);
        return listEnvelope(
          items.map((employee) => ({
            id: employee.id,
            accountId: employee.accountId,
            firstName: employee.firstName,
            lastName: employee.lastName,
            status: employee.status,
          })),
          nextCursor,
        );
      }

      const permissionsMatch = /^\/core\/v1\/products\/([^/]+)\/permissions$/.exec(pathname);
      if (method === "PUT" && permissionsMatch) {
        const fault = await applyOperationHook("registerPermissions");
        if (fault) return fault;
        return await handleRegisterPermissions(request, decodeURIComponent(permissionsMatch[1]!));
      }

      const roleTemplatesMatch = /^\/core\/v1\/products\/([^/]+)\/role-templates$/.exec(pathname);
      if (method === "PUT" && roleTemplatesMatch) {
        const fault = await applyOperationHook("registerRoleTemplates");
        if (fault) return fault;
        return await handleRegisterRoleTemplates(request, decodeURIComponent(roleTemplatesMatch[1]!));
      }

      return errorEnvelope(404, "NOT_FOUND", "Nie ma takiego zasobu");
    } catch (error) {
      if (error instanceof FakeCoreNetworkError) {
        throw error;
      }
      if (error instanceof FakeCoreApiError) {
        return errorEnvelope(error.status, error.code, error.message, error.details);
      }
      return errorEnvelope(500, "INTERNAL", "Wewnętrzny błąd serwera");
    }
  }

  const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? (init ? new Request(input, init) : input) : new Request(input, init);
    return handleRequest(request);
  };

  async function listen(listenOptions: ListenOptions = {}): Promise<FakeCoreServerHandle> {
    const host = listenOptions.host ?? "127.0.0.1";
    const port = listenOptions.port ?? 0;

    let boundUrl = "";
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      void (async () => {
        try {
          const method = (req.method ?? "GET").toUpperCase();
          const url = new URL(req.url ?? "/", boundUrl);
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (Array.isArray(value)) {
              for (const item of value) headers.append(key, item);
            } else if (value !== undefined) {
              headers.set(key, value);
            }
          }

          const hasBody = method !== "GET" && method !== "HEAD";
          const bodyBuffer = hasBody ? await readNodeRequestBody(req) : undefined;
          const requestInit: RequestInit = { method, headers };
          if (bodyBuffer && bodyBuffer.length > 0) {
            requestInit.body = new Uint8Array(bodyBuffer);
          }

          const response = await handleRequest(new Request(url, requestInit));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });
          const payload = Buffer.from(await response.arrayBuffer());
          res.end(payload);
        } catch (error) {
          if (error instanceof FakeCoreNetworkError) {
            if (req.socket && typeof req.socket.destroy === "function") {
              req.socket.destroy();
            } else if (res.socket && typeof res.socket.destroy === "function") {
              res.socket.destroy();
            } else if (typeof res.destroy === "function") {
              res.destroy();
            }
            return;
          }
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              data: null,
              meta: { requestId: makeRequestId() },
              error: { code: "INTERNAL", message: "Wewnętrzny błąd serwera", details: [] },
            }),
          );
        }
      })();
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.off("error", reject);
        resolve();
      });
    });

    const address = server.address() as AddressInfo;
    boundUrl = `http://${host}:${address.port}`;

    const shouldSyncUrls = listenOptions.syncUrls ?? !hasExplicitIssuer;
    if (shouldSyncUrls) {
      activeIssuerUrl = boundUrl;
      activeCoreApiUrl = boundUrl;
      activeIssuer = await createTestIssuer({
        issuer: boundUrl,
        kid: activeIssuer.kid,
        keyPair: {
          publicKey: activeIssuer.publicKey,
          privateKey: activeIssuer.privateKey,
        },
      });
    }

    return {
      url: boundUrl,
      port: address.port,
      server,
      close: () =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        }),
    };
  }

  function organization(input: CreateOrganizationInput): FakeOrganizationBuilder {
    const data = createOrganizationData(input);
    organizations.set(data.id, data);
    return createOrganizationBuilder(data, (tokenInput) => activeIssuer.signUserToken(tokenInput));
  }

  function seedOrganization(spec: DeclarativeOrganizationSpec): SeededOrganization {
    const org = organization({
      ...(spec.id !== undefined ? { id: spec.id } : {}),
      name: spec.name,
      ...(spec.status !== undefined ? { status: spec.status } : {}),
      ...(spec.domain !== undefined ? { domain: spec.domain } : {}),
    });
    return applyOrganizationSpec(org, spec);
  }

  function getOrganization(organizationId: string): FakeOrganizationBuilder | undefined {
    const data = organizations.get(organizationId);
    if (!data) return undefined;
    return createOrganizationBuilder(data, (tokenInput) => activeIssuer.signUserToken(tokenInput));
  }

  function signUserToken(accountId: string, tokenOptions: OrganizationUserTokenOptions): Promise<string> {
    const found = findAccountLocation(accountId);
    if (!found) {
      throw new Error(`Nieznane konto "${accountId}" w atrapie Core`);
    }
    const builder = createOrganizationBuilder(found.org, (tokenInput) => activeIssuer.signUserToken(tokenInput));
    return builder.signUserToken(accountId, tokenOptions);
  }

  function reset(): void {
    organizations.clear();
    permissionRegistrations.length = 0;
    roleTemplateRegistrations.length = 0;
    for (const product of products.values()) {
      product.permissions.clear();
      product.roleTemplates.clear();
    }
    clearFaults();
    resetCalls();
  }

  return {
    get issuer() {
      return activeIssuer;
    },
    get issuerUrl() {
      return activeIssuerUrl;
    },
    get coreApiUrl() {
      return activeCoreApiUrl;
    },
    registerProduct,
    deprecatePermission,
    organization,
    seedOrganization,
    getOrganization,
    signUserToken,
    buildPermissionSnapshot: computePermissionSnapshot,
    registrations: {
      permissions: permissionRegistrations,
      roleTemplates: roleTemplateRegistrations,
    },
    calls,
    failNext,
    clearFaults,
    resetCalls,
    setDirectoryPageSize,
    fetch: fakeFetch,
    listen,
    reset,
  };
}
