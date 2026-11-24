import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { extractOperations, generateFromOpenApi } from "../scripts/generate-lib.mjs";
import { createOperationsClient, paginate, type FetchFunction, type PaginatedResult } from "../src/client.js";
import type { OperationDefinition } from "../src/generated/operations.js";

const FIXTURE_OPENAPI = {
  openapi: "3.1.0",
  info: { title: "Fixture Core API", version: "0.0.0" },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
      productOAuth: {
        type: "oauth2",
        flows: {
          clientCredentials: {
            tokenUrl: "https://auth.monorise.studio/api/auth/oauth2/token",
            scopes: {
              "core:directory.read": "Read directory",
            },
          },
        },
      },
    },
    schemas: {
      ApiMeta: {
        type: "object",
        properties: { requestId: { type: "string" } },
        required: ["requestId"],
      },
      ApiListMeta: {
        type: "object",
        properties: {
          requestId: { type: "string" },
          nextCursor: { type: ["string", "null"] },
        },
        required: ["requestId", "nextCursor"],
      },
      Employee: {
        type: "object",
        properties: {
          id: { type: "string" },
          firstName: { type: "string" },
        },
        required: ["id", "firstName"],
      },
      EmployeeEnvelope: {
        type: "object",
        properties: {
          data: { $ref: "#/components/schemas/Employee" },
          meta: { $ref: "#/components/schemas/ApiMeta" },
          error: { type: "null" },
        },
        required: ["data", "meta", "error"],
      },
      EmployeeListEnvelope: {
        type: "object",
        properties: {
          data: { type: "array", items: { $ref: "#/components/schemas/Employee" } },
          meta: { $ref: "#/components/schemas/ApiListMeta" },
          error: { type: "null" },
        },
        required: ["data", "meta", "error"],
      },
    },
  },
  paths: {
    "/v1/employees": {
      get: {
        operationId: "listEmployees",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer" } },
          { name: "cursor", in: "query", required: false, schema: { type: "string" } },
          { name: "includeFormer", in: "query", required: false, schema: { type: "boolean" } },
          { name: "status", in: "query", required: false, schema: { type: "array", items: { type: "string" } } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/EmployeeListEnvelope" } },
            },
          },
        },
      },
      post: {
        operationId: "createEmployee",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { firstName: { type: "string" } },
                required: ["firstName"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/EmployeeEnvelope" } },
            },
          },
        },
      },
    },
    "/v1/employees/{employeeId}": {
      parameters: [{ name: "employeeId", in: "path", required: true, schema: { type: "string" } }],
      get: {
        operationId: "getEmployee",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/EmployeeEnvelope" } },
            },
          },
        },
      },
      delete: {
        operationId: "deleteEmployee",
        security: [{ bearerAuth: [] }],
        responses: {
          "204": { description: "No Content" },
        },
      },
    },
    "/v1/products/{productKey}/employees": {
      get: {
        operationId: "listProductEmployees",
        security: [{ productOAuth: ["core:directory.read"] }],
        parameters: [
          { name: "productKey", in: "path", required: true, schema: { type: "string" } },
          { name: "organizationId", in: "query", required: true, schema: { type: "string" } },
          { name: "cursor", in: "query", required: false, schema: { type: "string" } },
          { name: "limit", in: "query", required: false, schema: { type: "integer" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/EmployeeListEnvelope" } },
            },
          },
        },
      },
    },
  },
};

interface FixtureOperations {
  listEmployees: {
    parameters: {
      query?: { limit?: number; cursor?: string; includeFormer?: boolean; status?: string[] };
      path?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        content: {
          "application/json": {
            data: Array<{ id: string; firstName: string }>;
            meta: { requestId: string; nextCursor: string | null };
            error: null;
          };
        };
      };
    };
  };
  createEmployee: {
    parameters: { query?: never; path?: never };
    requestBody: {
      content: {
        "application/json": { firstName: string };
      };
    };
    responses: {
      201: {
        content: {
          "application/json": {
            data: { id: string; firstName: string };
            meta: { requestId: string };
            error: null;
          };
        };
      };
    };
  };
  getEmployee: {
    parameters: {
      query?: never;
      path: { employeeId: string };
    };
    requestBody?: never;
    responses: {
      200: {
        content: {
          "application/json": {
            data: { id: string; firstName: string };
            meta: { requestId: string };
            error: null;
          };
        };
      };
    };
  };
  deleteEmployee: {
    parameters: {
      query?: never;
      path: { employeeId: string };
    };
    requestBody?: never;
    responses: {
      204: { content?: never };
    };
  };
  listProductEmployees: {
    parameters: {
      query: { organizationId: string; cursor?: string; limit?: number };
      path: { productKey: string };
    };
    requestBody?: never;
    responses: {
      200: {
        content: {
          "application/json": {
            data: Array<{ id: string; firstName: string }>;
            meta: { requestId: string; nextCursor: string | null };
            error: null;
          };
        };
      };
    };
  };
}

const FIXTURE_DEFINITIONS = {
  createEmployee: {
    operationId: "createEmployee",
    method: "POST",
    path: "/v1/employees",
    pathParams: [],
    queryParams: [],
    hasBody: true,
    requiresAuth: true,
    enveloped: true,
    noContent: false,
    paginated: false,
  },
  deleteEmployee: {
    operationId: "deleteEmployee",
    method: "DELETE",
    path: "/v1/employees/{employeeId}",
    pathParams: ["employeeId"],
    queryParams: [],
    hasBody: false,
    requiresAuth: true,
    enveloped: false,
    noContent: true,
    paginated: false,
  },
  getEmployee: {
    operationId: "getEmployee",
    method: "GET",
    path: "/v1/employees/{employeeId}",
    pathParams: ["employeeId"],
    queryParams: [],
    hasBody: false,
    requiresAuth: true,
    enveloped: true,
    noContent: false,
    paginated: false,
  },
  listEmployees: {
    operationId: "listEmployees",
    method: "GET",
    path: "/v1/employees",
    pathParams: [],
    queryParams: ["cursor", "includeFormer", "limit", "status"],
    hasBody: false,
    requiresAuth: true,
    enveloped: true,
    noContent: false,
    paginated: true,
  },
  listProductEmployees: {
    operationId: "listProductEmployees",
    method: "GET",
    path: "/v1/products/{productKey}/employees",
    pathParams: ["productKey"],
    queryParams: ["cursor", "limit", "organizationId"],
    hasBody: false,
    requiresAuth: true,
    enveloped: true,
    noContent: false,
    paginated: true,
  },
} as const satisfies Record<string, OperationDefinition>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("generated operations with path, query, body, OAuth2, and pagination metadata", () => {
  it("extracts path params, query params, body, bearer/OAuth2 security, envelope, and pagination flags", async () => {
    const extracted = extractOperations(FIXTURE_OPENAPI);
    expect(extracted).toEqual([
      FIXTURE_DEFINITIONS.createEmployee,
      FIXTURE_DEFINITIONS.deleteEmployee,
      FIXTURE_DEFINITIONS.getEmployee,
      FIXTURE_DEFINITIONS.listEmployees,
      FIXTURE_DEFINITIONS.listProductEmployees,
    ]);

    const files = await generateFromOpenApi(FIXTURE_OPENAPI);
    expect(files["openapi.ts"]).toContain("listEmployees:");
    expect(files["openapi.ts"]).toContain("createEmployee:");
    expect(files["operations.ts"]).toContain('pathParams: ["employeeId"]');
    expect(files["operations.ts"]).toContain('queryParams: ["cursor","includeFormer","limit","status"]');
    expect(files["operations.ts"]).toContain("paginated: true");
  });

  it("interpolates and URL-encodes path parameters and rejects missing ones before fetch", async () => {
    const fetchMock = vi.fn<FetchFunction>(async () =>
      jsonResponse({
        data: { id: "emp/1 2", firstName: "Anna" },
        meta: { requestId: "req_emp_1" },
        error: null,
      }),
    );

    const client = createOperationsClient<FixtureOperations, typeof FIXTURE_DEFINITIONS>(FIXTURE_DEFINITIONS, {
      baseUrl: "http://localhost:3200",
      getAccessToken: () => "tok-123",
      fetch: fetchMock,
    });

    const employee = await client.getEmployee({ path: { employeeId: "emp/1 2" } });
    expect(employee).toEqual({ id: "emp/1 2", firstName: "Anna" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:3200/v1/employees/emp%2F1%202");

    await expect(client.getEmployee({ path: { employeeId: "" } })).rejects.toThrow(
      /Missing required path parameter "employeeId"/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serializes query parameters including arrays and booleans and returns paginated results", async () => {
    const fetchMock = vi.fn<FetchFunction>(async () =>
      jsonResponse({
        data: [{ id: "emp-1", firstName: "Anna" }],
        meta: { requestId: "req_list_1", nextCursor: "cur_2" },
        error: null,
      }),
    );

    const client = createOperationsClient<FixtureOperations, typeof FIXTURE_DEFINITIONS>(FIXTURE_DEFINITIONS, {
      baseUrl: "http://localhost:3200",
      getAccessToken: () => "tok-123",
      fetch: fetchMock,
    });

    const page = await client.listEmployees({
      query: { limit: 25, cursor: undefined, includeFormer: false, status: ["ACTIVE", "FORMER"] },
    });
    expect(page).toEqual({
      items: [{ id: "emp-1", firstName: "Anna" }],
      nextCursor: "cur_2",
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:3200/v1/employees?limit=25&includeFormer=false&status=ACTIVE&status=FORMER",
    );

    await client.listEmployees();
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://localhost:3200/v1/employees");
  });

  it("serializes JSON request bodies, handles 201/204 responses, and paginates OAuth2 operations", async () => {
    const fetchMock = vi.fn<FetchFunction>(async (url, init) => {
      if (init?.method === "POST") {
        return jsonResponse(
          {
            data: { id: "emp-2", firstName: "Anna" },
            meta: { requestId: "req_create_1" },
            error: null,
          },
          201,
        );
      }
      if (init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      const parsed = new URL(url);
      if (parsed.searchParams.get("cursor") === "cur_2") {
        return jsonResponse({
          data: [{ id: "emp-2", firstName: "Jan" }],
          meta: { requestId: "req_p2", nextCursor: null },
          error: null,
        });
      }
      return jsonResponse({
        data: [{ id: "emp-1", firstName: "Anna" }],
        meta: { requestId: "req_p1", nextCursor: "cur_2" },
        error: null,
      });
    });

    const client = createOperationsClient<FixtureOperations, typeof FIXTURE_DEFINITIONS>(FIXTURE_DEFINITIONS, {
      baseUrl: "http://localhost:3200",
      getAccessToken: () => "tok-123",
      fetch: fetchMock,
    });

    const created = await client.createEmployee({ body: { firstName: "Anna" } });
    expect(created).toEqual({ id: "emp-2", firstName: "Anna" });
    const [, postInit] = fetchMock.mock.calls[0]!;
    expect(postInit?.method).toBe("POST");
    expect(postInit?.body).toBe(JSON.stringify({ firstName: "Anna" }));
    expect(new Headers(postInit?.headers).get("content-type")).toBe("application/json");

    const deleted = await client.deleteEmployee({ path: { employeeId: "emp-2" } });
    expect(deleted).toBeUndefined();
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("DELETE");

    const collected: Array<{ id: string; firstName: string }> = [];
    for await (const item of paginate(client.listProductEmployees, {
      path: { productKey: "timotime" },
      query: { organizationId: "org-1", limit: 1 },
    })) {
      collected.push(item);
    }
    expect(collected).toEqual([
      { id: "emp-1", firstName: "Anna" },
      { id: "emp-2", firstName: "Jan" },
    ]);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "http://localhost:3200/v1/products/timotime/employees?organizationId=org-1&limit=1",
    );
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      "http://localhost:3200/v1/products/timotime/employees?organizationId=org-1&limit=1&cursor=cur_2",
    );

    expectTypeOf(client.getEmployee).returns.resolves.toEqualTypeOf<{
      id: string;
      firstName: string;
    }>();
    expectTypeOf(client.createEmployee).returns.resolves.toEqualTypeOf<{
      id: string;
      firstName: string;
    }>();
    expectTypeOf(client.listEmployees).returns.resolves.toEqualTypeOf<
      PaginatedResult<{ id: string; firstName: string }>
    >();
    expectTypeOf(client.deleteEmployee).returns.resolves.toEqualTypeOf<void>();
  });
});
