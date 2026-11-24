import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { extractOperations, generateFromOpenApi } from "../scripts/generate-lib.mjs";
import { createOperationsClient, type FetchFunction } from "../src/client.js";
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
    },
    schemas: {
      ApiMeta: {
        type: "object",
        properties: { requestId: { type: "string" } },
        required: ["requestId"],
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
          meta: { $ref: "#/components/schemas/ApiMeta" },
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
  },
};

interface FixtureOperations {
  listEmployees: {
    parameters: {
      query?: { limit?: number; cursor?: string; status?: string[] };
      path?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        content: {
          "application/json": {
            data: Array<{ id: string; firstName: string }>;
            meta: { requestId: string };
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
  },
  listEmployees: {
    operationId: "listEmployees",
    method: "GET",
    path: "/v1/employees",
    pathParams: [],
    queryParams: ["cursor", "limit", "status"],
    hasBody: false,
    requiresAuth: true,
    enveloped: true,
  },
} as const satisfies Record<string, OperationDefinition>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("generated operations with path, query, and body parameters", () => {
  it("extracts path params, query params, body, security, and envelope flags from a fixture OpenAPI document", async () => {
    const extracted = extractOperations(FIXTURE_OPENAPI);
    expect(extracted).toEqual([
      FIXTURE_DEFINITIONS.createEmployee,
      FIXTURE_DEFINITIONS.deleteEmployee,
      FIXTURE_DEFINITIONS.getEmployee,
      FIXTURE_DEFINITIONS.listEmployees,
    ]);

    const files = await generateFromOpenApi(FIXTURE_OPENAPI);
    expect(files["openapi.ts"]).toContain("listEmployees:");
    expect(files["openapi.ts"]).toContain("createEmployee:");
    expect(files["operations.ts"]).toContain('pathParams: ["employeeId"]');
    expect(files["operations.ts"]).toContain('queryParams: ["cursor","limit","status"]');
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

  it("serializes query parameters, skipping undefined values and supporting arrays", async () => {
    const fetchMock = vi.fn<FetchFunction>(async () =>
      jsonResponse({
        data: [{ id: "emp-1", firstName: "Anna" }],
        meta: { requestId: "req_list_1" },
        error: null,
      }),
    );

    const client = createOperationsClient<FixtureOperations, typeof FIXTURE_DEFINITIONS>(FIXTURE_DEFINITIONS, {
      baseUrl: "http://localhost:3200",
      getAccessToken: () => "tok-123",
      fetch: fetchMock,
    });

    const list = await client.listEmployees({
      query: { limit: 25, cursor: undefined, status: ["ACTIVE", "FORMER"] },
    });
    expect(list).toEqual([{ id: "emp-1", firstName: "Anna" }]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:3200/v1/employees?limit=25&status=ACTIVE&status=FORMER",
    );

    await client.listEmployees();
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://localhost:3200/v1/employees");
  });

  it("serializes JSON request bodies and handles 201 enveloped and 204 empty responses", async () => {
    const fetchMock = vi.fn<FetchFunction>(async (_url, init) => {
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
      return new Response(null, { status: 204 });
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

    expectTypeOf(client.getEmployee).returns.resolves.toEqualTypeOf<{
      id: string;
      firstName: string;
    }>();
    expectTypeOf(client.createEmployee).returns.resolves.toEqualTypeOf<{
      id: string;
      firstName: string;
    }>();
    expectTypeOf(client.listEmployees).returns.resolves.toEqualTypeOf<Array<{ id: string; firstName: string }>>();
  });
});
