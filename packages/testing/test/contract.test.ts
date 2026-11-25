import { can, permissionSnapshotSchema } from "@monorise-team/permissions";
import { jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import {
  CORE_PERMISSIONS_READ_SCOPE,
  checkAuthentication,
  checkProductAccess,
  createFakeCore,
  defineProductContractTests,
  type FakeCore,
  type ProductRequestHandler,
} from "../src/index.js";

const ISSUER = "https://auth.example.test";
const CORE_API = "https://api.example.test";
const PRODUCT_KEY = "timotime";
const PRODUCT_AUDIENCE = "https://time.example.test";
const CLIENT_ID = "timotime-web";
const CLIENT_SECRET = "sekret-produktu";

interface ExampleProductBugs {
  skipAuthOnPost?: boolean;
  ignoreAudience?: boolean;
  skipPermissionCheck?: boolean;
  wrongProductAccessCode?: boolean;
  brokenErrorEnvelope?: boolean;
}

/**
 * Minimalny przykładowy handler produktu (kilkanaście linii: `jose` + JWKS atrapy Core +
 * pobranie migawki uprawnień + `can` z `@monorise-team/permissions`). Opcjonalne flagi `bugs`
 * pozwalają celowo zepsuć konkretny punkt kontraktu i sprawdzić, że testy go wykryją.
 */
function createExampleProductHandler(fakeCore: FakeCore, bugs: ExampleProductBugs = {}): ProductRequestHandler {
  const jsonError = (status: number, code: string, message: string) => {
    if (bugs.brokenErrorEnvelope) {
      return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        data: null,
        meta: { requestId: `req_${crypto.randomUUID().slice(0, 8)}` },
        error: { code, message, details: [] },
      }),
      { status, headers: { "Content-Type": "application/json" } },
    );
  };

  async function fetchSnapshot(organizationId: string, accountId: string) {
    const tokenRes = await fakeCore.fetch(`${fakeCore.issuerUrl}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        resource: fakeCore.coreApiUrl,
        scope: CORE_PERMISSIONS_READ_SCOPE,
      }),
    });
    const { access_token: machineToken } = (await tokenRes.json()) as { access_token: string };
    const snapRes = await fakeCore.fetch(
      `${fakeCore.coreApiUrl}/core/v1/products/${PRODUCT_KEY}/permission-snapshot?organizationId=${organizationId}&accountId=${accountId}`,
      { headers: { Authorization: `Bearer ${machineToken}` } },
    );
    const body = (await snapRes.json()) as { data: unknown };
    return permissionSnapshotSchema.parse(body.data);
  }

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (bugs.skipAuthOnPost && method === "POST") {
      return new Response(JSON.stringify({ data: { ok: true }, meta: { requestId: "req_1" }, error: null }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }

    const authHeader = request.headers.get("authorization") ?? "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const sessionCookie = request.headers.get("cookie") ?? "";
    const token = bearer || (sessionCookie.startsWith("session=") ? sessionCookie.slice(8) : "");

    if (!token) {
      return jsonError(401, "UNAUTHENTICATED", "Brak tokenu");
    }

    let accountId: string;
    let organizationId: string;
    try {
      const verified = await jwtVerify(token, fakeCore.issuer.localJWKSet, {
        issuer: fakeCore.issuerUrl,
        ...(bugs.ignoreAudience ? {} : { audience: PRODUCT_AUDIENCE }),
        algorithms: ["EdDSA"],
      });
      if (typeof verified.payload.sub !== "string" || typeof verified.payload.org_id !== "string") {
        return jsonError(401, "UNAUTHENTICATED", "Brak pól konta lub firmy w tokenie");
      }
      accountId = verified.payload.sub;
      organizationId = verified.payload.org_id;
    } catch {
      return jsonError(401, "UNAUTHENTICATED", "Token nieważny lub wygasł");
    }

    const snapshot = await fetchSnapshot(organizationId, accountId);

    if (!snapshot.products.includes(PRODUCT_KEY)) {
      return jsonError(
        403,
        bugs.wrongProductAccessCode ? "PERMISSION_DENIED" : "PRODUCT_ACCESS_REQUIRED",
        "Brak dostępu do produktu",
      );
    }

    const requiredPermission =
      url.pathname === "/api/v1/entries" && method === "POST" ? "timotime.entries.write" : "timotime.entries.read";

    if (!bugs.skipPermissionCheck && !can(snapshot, requiredPermission)) {
      return jsonError(403, "PERMISSION_DENIED", "Brak wymaganego uprawnienia");
    }

    return new Response(
      JSON.stringify({
        data: method === "GET" ? [] : { id: "entry-1" },
        meta: { requestId: "req_ok", ...(method === "GET" ? { nextCursor: null } : {}) },
        error: null,
      }),
      { status: method === "POST" ? 201 : 200, headers: { "Content-Type": "application/json" } },
    );
  };
}

const EXAMPLE_OPENAPI = {
  openapi: "3.1.0",
  info: { title: "Przykładowy produkt TimoTime", version: "1.0.0" },
  paths: {
    "/api/v1/health": {
      get: {
        operationId: "getHealth",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/entries": {
      get: {
        operationId: "listEntries",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer" } },
          { name: "cursor", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Lista wpisów",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/EntryListResponse" },
              },
            },
          },
          "401": {
            description: "Brak tokenu",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiErrorResponse" },
              },
            },
          },
          "403": {
            description: "Brak dostępu lub uprawnień",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiErrorResponse" },
              },
            },
          },
        },
      },
      post: {
        operationId: "createEntry",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": {
            description: "Utworzono",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/EntryResponse" },
              },
            },
          },
          "401": {
            description: "Brak tokenu",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiErrorResponse" },
              },
            },
          },
          "403": {
            description: "Brak uprawnień",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiErrorResponse" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      ApiMeta: { type: "object", properties: { requestId: { type: "string" } } },
      ApiListMeta: {
        type: "object",
        properties: { requestId: { type: "string" }, nextCursor: { type: ["string", "null"] } },
      },
      ApiErrorResponse: {
        type: "object",
        properties: {
          data: { type: "null" },
          meta: { $ref: "#/components/schemas/ApiMeta" },
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: { type: "array", items: { type: "object" } },
            },
          },
        },
      },
      HealthResponse: {
        type: "object",
        properties: {
          data: { type: "object", properties: { status: { type: "string" } } },
          meta: { $ref: "#/components/schemas/ApiMeta" },
          error: { type: "null" },
        },
      },
      EntryResponse: {
        type: "object",
        properties: {
          data: { type: "object", properties: { id: { type: "string" } } },
          meta: { $ref: "#/components/schemas/ApiMeta" },
          error: { type: "null" },
        },
      },
      EntryListResponse: {
        type: "object",
        properties: {
          data: { type: "array", items: { type: "object" } },
          meta: { $ref: "#/components/schemas/ApiListMeta" },
          error: { type: "null" },
        },
      },
    },
  },
};

const compliantCore = await createFakeCore({
  issuer: ISSUER,
  coreApiUrl: CORE_API,
  products: [{ key: PRODUCT_KEY, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }],
});

// 1. Poprawny produkt przechodzi pełny zestaw testów Vitest z defineProductContractTests
await defineProductContractTests({
  suiteName: "E2E: poprawny produkt przechodzi defineProductContractTests (Bearer)",
  productKey: PRODUCT_KEY,
  audience: PRODUCT_AUDIENCE,
  fakeCore: compliantCore,
  handler: createExampleProductHandler(compliantCore),
  routes: [
    { method: "GET", path: "/api/v1/entries" },
    { method: "POST", path: "/api/v1/entries", body: { kind: "WORK" } },
  ],
  openApi: EXAMPLE_OPENAPI,
});

// 2. Poprawny produkt z sesją BFF (ciasteczko zwracane przez createSession) i wywołaniem przez baseUrl + fetch
const bffHandler = createExampleProductHandler(compliantCore);
await defineProductContractTests({
  suiteName: "E2E: poprawny produkt przechodzi defineProductContractTests (sesja BFF + baseUrl)",
  productKey: PRODUCT_KEY,
  audience: PRODUCT_AUDIENCE,
  baseUrl: PRODUCT_AUDIENCE,
  fakeCore: () => compliantCore,
  fetch: ((input: string | URL | Request, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    return bffHandler(req);
  }) as typeof globalThis.fetch,
  createSession: ({ accessToken }) => ({ cookie: `session=${accessToken}` }),
  routes: [
    { method: "GET", path: "/api/v1/entries" },
    { method: "POST", path: "/api/v1/entries", body: { kind: "WORK" } },
  ],
});

// 3. Celowo zepsute produkty — wykrywanie konkretnych naruszeń przez zwykłe funkcje asynchroniczne
describe("E2E: zepsute produkty są wykrywane przez checkAuthentication i checkProductAccess", () => {
  it("wykrywa brak uwierzytelnienia, brak sprawdzania aud, brak sprawdzania uprawnień i złą kopertę błędu", async () => {
    const core = await createFakeCore({
      issuer: ISSUER,
      coreApiUrl: CORE_API,
      products: [{ key: PRODUCT_KEY, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }],
    });

    const routes = [
      { method: "GET", path: "/api/v1/entries" },
      { method: "POST", path: "/api/v1/entries", body: { kind: "WORK" } },
    ] as const;

    // Brak uwierzytelnienia na POST
    const noAuthResult = await checkAuthentication({
      productKey: PRODUCT_KEY,
      audience: PRODUCT_AUDIENCE,
      fakeCore: core,
      handler: createExampleProductHandler(core, { skipAuthOnPost: true }),
      routes,
    });
    expect(noAuthResult.passed).toBe(false);
    expect(noAuthResult.violations.some((v) => v.rule.startsWith("auth.missing_token"))).toBe(true);

    // Ignorowanie pola aud (przepuszcza token innego produktu)
    const wrongAudResult = await checkAuthentication({
      productKey: PRODUCT_KEY,
      audience: PRODUCT_AUDIENCE,
      fakeCore: core,
      handler: createExampleProductHandler(core, { ignoreAudience: true }),
      routes,
    });
    expect(wrongAudResult.passed).toBe(false);
    expect(wrongAudResult.violations.some((v) => v.rule.startsWith("auth.wrong_audience"))).toBe(true);

    // Brak sprawdzenia uprawnień w migawce
    const noPermResult = await checkAuthentication({
      productKey: PRODUCT_KEY,
      audience: PRODUCT_AUDIENCE,
      fakeCore: core,
      handler: createExampleProductHandler(core, { skipPermissionCheck: true }),
      routes,
    });
    expect(noPermResult.passed).toBe(false);
    expect(noPermResult.violations.some((v) => v.rule.startsWith("auth.missing_permission"))).toBe(true);

    // Błędna koperta błędu
    const badEnvelopeResult = await checkAuthentication({
      productKey: PRODUCT_KEY,
      audience: PRODUCT_AUDIENCE,
      fakeCore: core,
      handler: createExampleProductHandler(core, { brokenErrorEnvelope: true }),
      routes,
    });
    expect(badEnvelopeResult.passed).toBe(false);
    expect(badEnvelopeResult.violations.some((v) => v.rule.endsWith(".format"))).toBe(true);
  });

  it("wykrywa błędny kod błędu przy braku dostępu do produktu (obowiązek 6)", async () => {
    const core = await createFakeCore({
      issuer: ISSUER,
      coreApiUrl: CORE_API,
      products: [{ key: PRODUCT_KEY, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }],
    });

    const result = await checkProductAccess({
      productKey: PRODUCT_KEY,
      audience: PRODUCT_AUDIENCE,
      fakeCore: core,
      handler: createExampleProductHandler(core, { wrongProductAccessCode: true }),
      routes: [{ method: "GET", path: "/api/v1/entries" }],
    });

    expect(result.passed).toBe(false);
    expect(result.violations.map((v) => v.rule)).toEqual([
      "product_access.no_entitlement.error_code",
      "product_access.no_app_access.error_code",
    ]);
  });
});
