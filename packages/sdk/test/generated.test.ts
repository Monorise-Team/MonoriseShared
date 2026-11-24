import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkGeneratedFiles, readLocalOpenApiDocument, writeGeneratedFiles } from "../scripts/generate-lib.mjs";
import { CORE_OPERATIONS } from "../src/index.js";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;

interface RawOperation {
  operationId?: unknown;
  security?: unknown;
}

function collectOpenApiOperations(document: Record<string, unknown>): Map<string, RawOperation> {
  const paths = document.paths as Record<string, Record<string, RawOperation>> | undefined;
  const collected = new Map<string, RawOperation>();
  for (const pathItem of Object.values(paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const op = pathItem?.[method];
      if (op && typeof op.operationId === "string") {
        collected.set(op.operationId, op);
      }
    }
  }
  return collected;
}

describe("generated SDK artifacts", () => {
  it("matches what generate produces from packages/sdk/openapi/core-api.json", async () => {
    const result = await checkGeneratedFiles();
    expect(result).toEqual({ ok: true, mismatches: [] });
  });

  it("detects out-of-date or unexpected generated files", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "monorise-sdk-check-"));
    try {
      await writeGeneratedFiles({ generatedDir: tempDir });
      expect(await checkGeneratedFiles({ generatedDir: tempDir })).toEqual({ ok: true, mismatches: [] });

      await writeFile(join(tempDir, "operations.ts"), "// drifted\n", "utf8");
      const drifted = await checkGeneratedFiles({ generatedDir: tempDir });
      expect(drifted.ok).toBe(false);
      expect(drifted.mismatches).toContain("Out-of-date generated file: operations.ts");

      await writeFile(join(tempDir, "extra.ts"), "// unexpected\n", "utf8");
      const withExtra = await checkGeneratedFiles({ generatedDir: tempDir });
      expect(withExtra.ok).toBe(false);
      expect(withExtra.mismatches).toContain("Unexpected generated file: extra.ts");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("contains every operation declared in Core's OpenAPI document with accurate metadata", async () => {
    const document = await readLocalOpenApiDocument();
    const openApiOps = collectOpenApiOperations(document);
    const expectedIds = [...openApiOps.keys()].sort();

    expect(Object.keys(CORE_OPERATIONS).sort()).toEqual(expectedIds);
    expect(expectedIds.length).toBeGreaterThanOrEqual(30);

    for (const [operationId, rawOp] of openApiOps) {
      const def = CORE_OPERATIONS[operationId as keyof typeof CORE_OPERATIONS];
      const hasSecurity = Array.isArray(rawOp.security) && rawOp.security.length > 0;
      expect(def.requiresAuth, `${operationId}.requiresAuth`).toBe(hasSecurity);
    }

    expect(CORE_OPERATIONS.getHealth).toMatchObject({
      method: "GET",
      path: "/core/v1/health",
      requiresAuth: false,
      enveloped: true,
      noContent: false,
      paginated: false,
    });
    expect(CORE_OPERATIONS.getOpenApi).toMatchObject({
      method: "GET",
      path: "/core/v1/openapi.json",
      requiresAuth: false,
      enveloped: false,
      noContent: false,
      paginated: false,
    });
    expect(CORE_OPERATIONS.getMe).toMatchObject({
      method: "GET",
      path: "/core/v1/me",
      requiresAuth: true,
      enveloped: true,
      noContent: false,
      paginated: false,
    });
    expect(CORE_OPERATIONS.listUnits).toMatchObject({
      method: "GET",
      path: "/core/v1/units",
      queryParams: ["cursor", "limit", "status"],
      requiresAuth: true,
      enveloped: true,
      noContent: false,
      paginated: true,
    });
    expect(CORE_OPERATIONS.createUnit).toMatchObject({
      method: "POST",
      path: "/core/v1/units",
      hasBody: true,
      requiresAuth: true,
      enveloped: true,
      noContent: false,
      paginated: false,
    });
    expect(CORE_OPERATIONS.revokeAppAccess).toMatchObject({
      method: "DELETE",
      path: "/core/v1/app-access/{appAccessId}",
      pathParams: ["appAccessId"],
      hasBody: false,
      requiresAuth: true,
      enveloped: false,
      noContent: true,
      paginated: false,
    });
    expect(CORE_OPERATIONS.deleteRoleAssignment).toMatchObject({
      method: "DELETE",
      path: "/core/v1/role-assignments/{assignmentId}",
      pathParams: ["assignmentId"],
      hasBody: false,
      requiresAuth: true,
      enveloped: false,
      noContent: true,
      paginated: false,
    });
    expect(CORE_OPERATIONS.getProductPermissionSnapshot).toMatchObject({
      method: "GET",
      path: "/core/v1/products/{productKey}/permission-snapshot",
      pathParams: ["productKey"],
      queryParams: ["accountId", "organizationId"],
      requiresAuth: true,
      enveloped: true,
      noContent: false,
      paginated: false,
    });
    expect(CORE_OPERATIONS.listProductDirectoryUnitMembers).toMatchObject({
      method: "GET",
      path: "/core/v1/products/{productKey}/directory/unit-members",
      pathParams: ["productKey"],
      queryParams: ["cursor", "limit", "organizationId", "unitId"],
      requiresAuth: true,
      enveloped: true,
      noContent: false,
      paginated: true,
    });
    expect(CORE_OPERATIONS.registerProductPermissions).toMatchObject({
      method: "PUT",
      path: "/core/v1/products/{productKey}/permissions",
      pathParams: ["productKey"],
      hasBody: true,
      requiresAuth: true,
      enveloped: true,
      noContent: false,
      paginated: false,
    });
  });
});
