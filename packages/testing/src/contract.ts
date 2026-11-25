import { checkErrorEnvelope, formatViolations, type ContractCheckResult, type ContractViolation } from "./envelope.js";
import type { FakeCore } from "./fake-core.js";
import { checkOpenApiDocument, type CheckOpenApiOptions, type OpenApiDocumentInput } from "./openapi.js";

export type MaybeLazy<T> = T | (() => T);

export type ProductRequestHandler = (request: Request) => Promise<Response> | Response;

export interface ProtectedRouteConfig {
  /** Metoda HTTP, np. `"GET"`, `"POST"`, `"PATCH"`, `"DELETE"`. */
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | (string & {});
  /** Ścieżka trasy, np. `"/api/v1/time/entries"`. */
  path: string;
  /** Opcjonalna treść żądania wysyłana jako JSON. */
  body?: unknown;
  /** Opcjonalne dodatkowe nagłówki żądania. */
  headers?: Readonly<Record<string, string>>;
  /** Pomija test 403 `PERMISSION_DENIED` dla tras niewymagających dodatkowego uprawnienia poza dostępem do produktu. */
  skipPermissionCheck?: boolean;
  /** Pomija test 403 `PRODUCT_ACCESS_REQUIRED` (np. dla trasy `/me`). */
  skipProductAccessCheck?: boolean;
}

export interface SessionCredentials {
  /** Nagłówki dokładane do żądania (np. `cookie`, `origin`). */
  headers?: Readonly<Record<string, string>>;
  /** Skrót dla nagłówka `Cookie`, np. `"monorise-session=..."`. */
  cookie?: string;
}

export interface ContractSessionInput {
  readonly accountId: string;
  readonly organizationId: string;
  readonly employeeId: string;
  /** Token dostępu użytkownika podpisany dla API produktu (`audience`). */
  readonly accessToken: string;
  /** Token dostępu użytkownika podpisany dla Core API (`fakeCore.coreApiUrl`). */
  readonly coreAccessToken: string;
  readonly authzRevision: number;
}

/** Opcjonalna fabryka sesji BFF (np. ciasteczka `monorise-session`) dla produktów Next.js. */
export type SessionFactory = (input: ContractSessionInput) => Promise<SessionCredentials> | SessionCredentials;

export interface ProductContractBaseConfig {
  /** Klucz produktu w Core (np. `"timotime"`, `"avenmail"`). */
  productKey: string;
  /** Atrapa Core używana przez produkt (albo funkcja zwracająca ją w czasie wykonania testu). */
  fakeCore: MaybeLazy<FakeCore>;
  /** Lista chronionych tras produktu do sprawdzenia. */
  routes: readonly ProtectedRouteConfig[];
  /** Handler żądań Web Request -> Response (gdy produkt testowany jest bez gniazda sieciowego). */
  handler?: ProductRequestHandler;
  /** Bazowy adres URL uruchomionego produktu (wymagany, gdy nie podano `handler`). */
  baseUrl?: MaybeLazy<string>;
  /** Odbiorca (`aud`) tokenów produktu — domyślnie równy `baseUrl` albo `https://<productKey>.monorise.test`. */
  audience?: MaybeLazy<string>;
  /** Własna funkcja `fetch` używana przy wywołaniach po `baseUrl` (domyślnie `globalThis.fetch`). */
  fetch?: typeof globalThis.fetch;
  /** Opcjonalna funkcja budująca sesję BFF (ciasteczko / nagłówki) dla żądań zalogowanego użytkownika. */
  createSession?: SessionFactory;
  /**
   * Oczekiwany kod błędu przy braku dostępu firmy lub konta do produktu (obowiązek 6).
   * Domyślnie `"PRODUCT_ACCESS_REQUIRED"` zgodnie z kontraktem produktu.
   */
  productAccessErrorCode?: string;
}

export interface ProductContractTestConfig extends ProductContractBaseConfig {
  /** Dokument OpenAPI 3.1 produktu (obiekt lub funkcja ładująca go asynchronicznie). */
  openApi?: OpenApiDocumentInput;
  /** Dodatkowe opcje walidacji dokumentu OpenAPI. */
  openApiOptions?: CheckOpenApiOptions;
  /** Nazwa głównego bloku `describe` w Vitest. */
  suiteName?: string;
}

function resolveLazy<T>(value: MaybeLazy<T>): T {
  return typeof value === "function" ? (value as () => T)() : value;
}

interface ResolvedTarget {
  fakeCore: FakeCore;
  baseUrl: string;
  audience: string;
  send: (request: Request) => Promise<Response>;
}

function resolveTarget(config: ProductContractBaseConfig): ResolvedTarget {
  const fakeCore = resolveLazy(config.fakeCore);
  const handler = config.handler;
  const rawBaseUrl = config.baseUrl ? resolveLazy(config.baseUrl) : undefined;

  if (!handler && !rawBaseUrl) {
    throw new TypeError("Konfiguracja testów kontraktu wymaga podania `handler` albo `baseUrl`.");
  }

  const baseUrl = (rawBaseUrl ?? `https://${config.productKey}.monorise.test`).replace(/\/+$/, "");
  const audience = (config.audience ? resolveLazy(config.audience) : baseUrl).replace(/\/+$/, "");
  const fetchFn = config.fetch ?? globalThis.fetch;

  const send = handler
    ? async (request: Request) => await handler(request)
    : async (request: Request) => await fetchFn(request);

  return { fakeCore, baseUrl, audience, send };
}

function isMutatingMethod(method: string): boolean {
  const upper = method.toUpperCase();
  return upper !== "GET" && upper !== "HEAD" && upper !== "OPTIONS";
}

function buildRouteRequest(
  baseUrl: string,
  route: ProtectedRouteConfig,
  options: {
    bearerToken?: string;
    session?: SessionCredentials;
  } = {},
): Request {
  const normalizedPath = route.path.startsWith("/") ? route.path : `/${route.path}`;
  const url = new URL(`${baseUrl}${normalizedPath}`);
  const headers = new Headers();

  if (route.headers) {
    for (const [key, value] of Object.entries(route.headers)) {
      headers.set(key, value);
    }
  }

  if (options.bearerToken !== undefined) {
    headers.set("authorization", `Bearer ${options.bearerToken}`);
  } else if (options.session) {
    if (options.session.cookie) {
      headers.set("cookie", options.session.cookie);
    }
    if (options.session.headers) {
      for (const [key, value] of Object.entries(options.session.headers)) {
        headers.set(key, value);
      }
    }
  }

  // Dla żądań mutujących bez nagłówka Authorization ustawiamy Origin zgodny z adresem produktu,
  // żeby warstwa BFF (np. ochrona CSRF) przepuściła żądanie do właściwego sprawdzenia logowania/uprawnień.
  if (isMutatingMethod(route.method) && !headers.has("authorization") && !headers.has("origin")) {
    headers.set("origin", url.origin);
  }
  if (!headers.has("host")) {
    headers.set("host", url.host);
  }

  const init: RequestInit = {
    method: route.method.toUpperCase(),
    headers,
  };

  if (route.body !== undefined) {
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    init.body = JSON.stringify(route.body);
  }

  return new Request(url, init);
}

async function resolveUserCredentials(
  config: ProductContractBaseConfig,
  target: ResolvedTarget,
  persona: { accountId: string; organizationId: string; employeeId: string; authzRevision: number },
): Promise<{ bearerToken?: string; session?: SessionCredentials }> {
  const accessToken = await target.fakeCore.issuer.signUserToken({
    accountId: persona.accountId,
    organizationId: persona.organizationId,
    employeeId: persona.employeeId,
    audience: target.audience,
    authzRevision: persona.authzRevision,
  });

  if (config.createSession) {
    const coreAccessToken = await target.fakeCore.issuer.signUserToken({
      accountId: persona.accountId,
      organizationId: persona.organizationId,
      employeeId: persona.employeeId,
      audience: target.fakeCore.coreApiUrl,
      authzRevision: persona.authzRevision,
    });
    const session = await config.createSession({
      accountId: persona.accountId,
      organizationId: persona.organizationId,
      employeeId: persona.employeeId,
      accessToken,
      coreAccessToken,
      authzRevision: persona.authzRevision,
    });
    return { session };
  }

  return { bearerToken: accessToken };
}

/**
 * Sprawdza obowiązek 1 kontraktu produktu (ADR-0046):
 * każda chroniona trasa musi odrzucać:
 * - brak tokenu (`401 UNAUTHENTICATED`),
 * - token dla innego odbiorcy (`401 UNAUTHENTICATED`),
 * - token podpisany obcym kluczem (`401 UNAUTHENTICATED`),
 * - token po terminie (`401 UNAUTHENTICATED`),
 * - token z innym wystawcą (`401 UNAUTHENTICATED`),
 * - poprawny token osoby bez uprawnienia w migawce (`403 PERMISSION_DENIED`),
 * z poprawną kopertą błędu Monorise na każdej odmowie.
 */
export async function checkAuthentication(config: ProductContractBaseConfig): Promise<ContractCheckResult> {
  const target = resolveTarget(config);
  const violations: ContractViolation[] = [];

  // Izolowana firma i osoba z dostępem do produktu, ale bez żadnych ról (puste `grants`).
  const org = target.fakeCore.organization({
    name: `Contract Auth Org ${config.productKey}`,
    domain: `auth-${config.productKey}.test`,
  });
  org.grantEntitlement(config.productKey);
  const personWithoutGrants = org.addEmployee({
    firstName: "Bez",
    lastName: "Uprawnień",
    products: [config.productKey],
  });

  const baseTokenInput = {
    accountId: personWithoutGrants.accountId,
    organizationId: org.id,
    employeeId: personWithoutGrants.employeeId,
    audience: target.audience,
  };

  const invalidCases: readonly { name: string; rule: string; token: string }[] = [
    {
      name: "token dla innego odbiorcy (aud)",
      rule: "auth.wrong_audience",
      token: await target.fakeCore.issuer.invalid.wrongAudience(baseTokenInput),
    },
    {
      name: "token podpisany nieznanym kluczem",
      rule: "auth.foreign_key",
      token: await target.fakeCore.issuer.invalid.foreignKey(baseTokenInput),
    },
    {
      name: "wygasły token",
      rule: "auth.expired_token",
      token: await target.fakeCore.issuer.invalid.expired(baseTokenInput),
    },
    {
      name: "token innego wystawcy (iss)",
      rule: "auth.wrong_issuer",
      token: await target.fakeCore.issuer.invalid.wrongIssuer(baseTokenInput),
    },
    {
      name: "token bez pola org_id",
      rule: "auth.missing_org_id",
      token: await target.fakeCore.issuer.invalid.missingOrgId(baseTokenInput),
    },
  ];

  const validNoPermCredentials = await resolveUserCredentials(config, target, {
    accountId: personWithoutGrants.accountId,
    organizationId: org.id,
    employeeId: personWithoutGrants.employeeId,
    authzRevision: 0,
  });

  for (const route of config.routes) {
    const routeLabel = `${route.method.toUpperCase()} ${route.path}`;

    // 1. Brak tokenu
    const noTokenResponse = await target.send(buildRouteRequest(target.baseUrl, route));
    const noTokenCheck = await checkErrorEnvelope(noTokenResponse, {
      expectedStatus: 401,
      expectedCode: "UNAUTHENTICATED",
      requireEmptyDetails: true,
      target: `${routeLabel} (brak tokenu)`,
      rulePrefix: "auth.missing_token",
    });
    violations.push(...noTokenCheck.violations);

    // 2. Niepoprawne warianty tokenu
    for (const invalidCase of invalidCases) {
      const response = await target.send(buildRouteRequest(target.baseUrl, route, { bearerToken: invalidCase.token }));
      const check = await checkErrorEnvelope(response, {
        expectedStatus: 401,
        expectedCode: "UNAUTHENTICATED",
        requireEmptyDetails: true,
        target: `${routeLabel} (${invalidCase.name})`,
        rulePrefix: invalidCase.rule,
      });
      violations.push(...check.violations);
    }

    // 3. Poprawny token osoby bez uprawnienia w migawce
    if (!route.skipPermissionCheck) {
      const response = await target.send(buildRouteRequest(target.baseUrl, route, validNoPermCredentials));
      const check = await checkErrorEnvelope(response, {
        expectedStatus: 403,
        expectedCode: "PERMISSION_DENIED",
        requireEmptyDetails: true,
        target: `${routeLabel} (brak uprawnienia w migawce)`,
        rulePrefix: "auth.missing_permission",
      });
      violations.push(...check.violations);
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Sprawdza obowiązek 6 kontraktu produktu (ADR-0046, ADR-0051):
 * każda chroniona trasa musi odrzucać z kodem 403 `PRODUCT_ACCESS_REQUIRED` (w kopercie błędu):
 * - osobę z firmy bez aktywnego dostępu firmy do produktu (`Entitlement`),
 * - osobę z firmy z aktywnym dostępem, ale bez włączonej aplikacji na koncie (`AppAccess`).
 */
export async function checkProductAccess(config: ProductContractBaseConfig): Promise<ContractCheckResult> {
  const target = resolveTarget(config);
  const expectedCode = config.productAccessErrorCode ?? "PRODUCT_ACCESS_REQUIRED";
  const violations: ContractViolation[] = [];

  // Scenariusz A: firma bez Entitlement dla tego produktu (nawet Owner nie dostaje produktu w migawce)
  const unentitledOrg = target.fakeCore.organization({
    name: `Contract No Entitlement Org ${config.productKey}`,
    domain: `no-entitlement-${config.productKey}.test`,
  });
  const unentitledOwner = unentitledOrg.addEmployee({
    firstName: "Firma",
    lastName: "BezPlanu",
    isOwner: true,
  });

  // Scenariusz B: firma ma aktywny Entitlement, ale konto pracownika nie ma włączonego AppAccess
  const entitledOrg = target.fakeCore.organization({
    name: `Contract No AppAccess Org ${config.productKey}`,
    domain: `no-app-access-${config.productKey}.test`,
  });
  entitledOrg.grantEntitlement(config.productKey);
  const personWithoutAppAccess = entitledOrg.addEmployee({
    firstName: "Konto",
    lastName: "BezAplikacji",
    products: [],
  });

  const noEntitlementCreds = await resolveUserCredentials(config, target, {
    accountId: unentitledOwner.accountId,
    organizationId: unentitledOrg.id,
    employeeId: unentitledOwner.employeeId,
    authzRevision: 0,
  });

  const noAppAccessCreds = await resolveUserCredentials(config, target, {
    accountId: personWithoutAppAccess.accountId,
    organizationId: entitledOrg.id,
    employeeId: personWithoutAppAccess.employeeId,
    authzRevision: 0,
  });

  for (const route of config.routes) {
    if (route.skipProductAccessCheck) continue;
    const routeLabel = `${route.method.toUpperCase()} ${route.path}`;

    const noEntitlementResponse = await target.send(buildRouteRequest(target.baseUrl, route, noEntitlementCreds));
    const noEntitlementCheck = await checkErrorEnvelope(noEntitlementResponse, {
      expectedStatus: 403,
      expectedCode,
      requireEmptyDetails: true,
      target: `${routeLabel} (firma bez Entitlement)`,
      rulePrefix: "product_access.no_entitlement",
    });
    violations.push(...noEntitlementCheck.violations);

    const noAppAccessResponse = await target.send(buildRouteRequest(target.baseUrl, route, noAppAccessCreds));
    const noAppAccessCheck = await checkErrorEnvelope(noAppAccessResponse, {
      expectedStatus: 403,
      expectedCode,
      requireEmptyDetails: true,
      target: `${routeLabel} (konto bez AppAccess)`,
      rulePrefix: "product_access.no_app_access",
    });
    violations.push(...noAppAccessCheck.violations);
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Rejestruje zestaw testów Vitest sprawdzających kontrakt produktu Monorise (ADR-0046):
 * obowiązek 1 (uwierzytelnienie i brak uprawnienia), obowiązek 6 (dostęp firmy i konta do produktu)
 * oraz obowiązek 7 (dokument OpenAPI 3.1).
 *
 * Moduł `vitest` jest importowany leniwie, dzięki czemu reszta biblioteki działa w projektach bez Vitesta.
 */
export async function defineProductContractTests(config: ProductContractTestConfig): Promise<void> {
  const { describe, expect, it } = await import("vitest");
  const suiteName = config.suiteName ?? `Kontrakt produktu Monorise (${config.productKey})`;

  describe(suiteName, () => {
    it("obowiązek 1: chronione trasy odrzucają brak tokenu, niepoprawne tokeny (401) i brak uprawnienia (403) w kopercie błędu", async () => {
      const result = await checkAuthentication(config);
      expect(result.passed, formatViolations(result.violations)).toBe(true);
    });

    it("obowiązek 6: chronione trasy odrzucają firmę bez dostępu i konto bez włączonej aplikacji (403) w kopercie błędu", async () => {
      const result = await checkProductAccess(config);
      expect(result.passed, formatViolations(result.violations)).toBe(true);
    });

    if (config.openApi !== undefined) {
      it("obowiązek 7: dokument OpenAPI 3.1 spełnia standardy Monorise", async () => {
        const result = await checkOpenApiDocument(config.openApi, config.openApiOptions);
        expect(result.passed, formatViolations(result.violations)).toBe(true);
      });
    }
  });
}

export type { ContractCheckResult, ContractViolation };
