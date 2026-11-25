import { describe, expect, it } from "vitest";
import { checkOpenApiDocument } from "../src/index.js";

function validOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: { title: "TimoTime API", version: "1.0.0" },
    paths: {
      "/api/v1/health": {
        get: {
          operationId: "getHealth",
          responses: {
            "200": {
              description: "Stan usługi",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HealthResponse" },
                },
              },
            },
          },
        },
      },
      "/api/v1/openapi.json": {
        get: {
          operationId: "getOpenApi",
          responses: {
            "200": {
              description: "Surowy opis OpenAPI",
              content: {
                "application/json": {
                  schema: { type: "object" },
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
            { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100 } },
            { name: "cursor", in: "query", required: false, schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "Strona wpisów",
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
              description: "Brak uprawnień",
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
              description: "Utworzony wpis",
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
          },
        },
      },
      "/api/v1/entries/{entryId}": {
        delete: {
          operationId: "deleteEntry",
          security: [{ bearerAuth: [] }],
          responses: {
            "204": { description: "Usunięto" },
            "401": {
              description: "Brak tokenu",
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
        ApiMeta: {
          type: "object",
          properties: { requestId: { type: "string" } },
        },
        ApiListMeta: {
          type: "object",
          properties: {
            requestId: { type: "string" },
            nextCursor: { type: ["string", "null"] },
          },
        },
        ApiErrorBody: {
          type: "object",
          properties: {
            code: { type: "string" },
            message: { type: "string" },
            details: { type: "array", items: { type: "object" } },
          },
        },
        ApiErrorResponse: {
          type: "object",
          properties: {
            data: { type: "null" },
            meta: { $ref: "#/components/schemas/ApiMeta" },
            error: { $ref: "#/components/schemas/ApiErrorBody" },
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
        Entry: {
          type: "object",
          properties: { id: { type: "string" } },
        },
        EntryResponse: {
          type: "object",
          properties: {
            data: { $ref: "#/components/schemas/Entry" },
            meta: { $ref: "#/components/schemas/ApiMeta" },
            error: { type: "null" },
          },
        },
        EntryListResponse: {
          type: "object",
          properties: {
            data: { type: "array", items: { $ref: "#/components/schemas/Entry" } },
            meta: { $ref: "#/components/schemas/ApiListMeta" },
            error: { type: "null" },
          },
        },
      },
    },
  };
}

describe("checkOpenApiDocument — obowiązek 7", () => {
  it("przepuszcza poprawny dokument OpenAPI 3.1.0 (również z funkcji ładującej)", async () => {
    const direct = await checkOpenApiDocument(validOpenApiDocument());
    expect(direct.passed).toBe(true);
    expect(direct.violations).toEqual([]);

    const fromLoader = await checkOpenApiDocument(async () => validOpenApiDocument());
    expect(fromLoader.passed).toBe(true);
  });

  it("wykrywa błędną wersję, brak operationId, brak security, brak koperty, niespójny schemat błędu i brak stronicowania", async () => {
    const broken = {
      openapi: "3.0.3",
      info: { title: "Zepsute API", version: "0.1.0" },
      paths: {
        "/api/v1/items": {
          get: {
            // brak operationId, brak security, brak limit/cursor
            responses: {
              "200": {
                description: "Lista bez koperty",
                content: {
                  "application/json": {
                    schema: { type: "array", items: { type: "string" } },
                  },
                },
              },
              "401": {
                description: "Inline error bez $ref",
                content: {
                  "application/json": {
                    schema: { type: "object", properties: { msg: { type: "string" } } },
                  },
                },
              },
            },
          },
          post: {
            operationId: "createItem",
            security: [{ bearerAuth: [] }],
            responses: {
              "201": {
                description: "Koperta bez requestId",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        data: { type: "object" },
                        meta: { type: "object", properties: {} },
                        error: { type: "null" },
                      },
                    },
                  },
                },
              },
              "403": {
                description: "Błąd z brakującym polem message",
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/BrokenError" },
                  },
                },
              },
            },
          },
        },
        "/api/v1/list-without-pagination": {
          get: {
            operationId: "createItem", // duplikat operationId
            security: [{ bearerAuth: [] }],
            responses: {
              "200": {
                description: "Lista w kopercie, ale bez limit, cursor i nextCursor",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        data: { type: "array", items: { type: "string" } },
                        meta: { type: "object", properties: { requestId: { type: "string" } } },
                        error: { type: "null" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer" },
        },
        schemas: {
          BrokenError: {
            type: "object",
            properties: {
              data: { type: "null" },
              meta: { type: "object", properties: { requestId: { type: "string" } } },
              error: { type: "object", properties: { code: { type: "string" } } },
            },
          },
        },
      },
    };

    const result = await checkOpenApiDocument(broken);
    expect(result.passed).toBe(false);

    const rules = new Set(result.violations.map((v) => v.rule));
    expect(rules.has("openapi.version")).toBe(true);
    expect(rules.has("openapi.operation_id")).toBe(true);
    expect(rules.has("openapi.duplicate_operation_id")).toBe(true);
    expect(rules.has("openapi.security")).toBe(true);
    expect(rules.has("openapi.success_envelope")).toBe(true);
    expect(rules.has("openapi.meta_request_id")).toBe(true);
    expect(rules.has("openapi.error_schema_ref")).toBe(true);
    expect(rules.has("openapi.error_schema_fields")).toBe(true);
    expect(rules.has("openapi.list_pagination")).toBe(true);
  });
});
