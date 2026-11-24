import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkGeneratedFiles, writeGeneratedFiles } from "../scripts/generate-lib.mjs";
import { CORE_OPERATIONS } from "../src/index.js";

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

  it("contains only the operations declared in Core's OpenAPI document", () => {
    expect(Object.keys(CORE_OPERATIONS).sort()).toEqual(["getHealth", "getMe", "getOpenApi", "getOrganization"]);
    expect(CORE_OPERATIONS.getHealth).toMatchObject({
      method: "GET",
      path: "/core/v1/health",
      requiresAuth: false,
      enveloped: true,
      noContent: false,
    });
    expect(CORE_OPERATIONS.getOpenApi).toMatchObject({
      method: "GET",
      path: "/core/v1/openapi.json",
      requiresAuth: false,
      enveloped: false,
      noContent: false,
    });
    expect(CORE_OPERATIONS.getMe).toMatchObject({
      method: "GET",
      path: "/core/v1/me",
      requiresAuth: true,
      enveloped: true,
      noContent: false,
    });
    expect(CORE_OPERATIONS.getOrganization).toMatchObject({
      method: "GET",
      path: "/core/v1/organization",
      requiresAuth: true,
      enveloped: true,
      noContent: false,
    });
  });
});
