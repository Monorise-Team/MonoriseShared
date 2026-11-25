import { coreEvents, uuidv7 } from "@monorise-team/events";
import { describe, expect, it } from "vitest";
import {
  buildPermissionsChangedEvent,
  checkErrorEnvelope,
  checkTenantIsolation,
  defineTenantIsolationTests,
} from "../src/index.js";

describe("buildPermissionsChangedEvent", () => {
  it("buduje kopertę organization.permissions.changed zgodną z katalogiem @monorise-team/events", () => {
    const organizationId = uuidv7();
    const accountId = uuidv7();
    const occurredAt = new Date("2026-11-25T12:00:00.000Z");

    const event = buildPermissionsChangedEvent({
      organizationId,
      accountId,
      authzRevision: 7,
      occurredAt,
    });

    expect(event).toMatchObject({
      type: "organization.permissions.changed",
      version: 1,
      source: "core",
      organizationId,
      resourceType: "account",
      resourceId: accountId,
      resourceVersion: 7,
      occurredAt: "2026-11-25T12:00:00.000Z",
      data: { authzRevision: 7 },
    });

    const parsed = coreEvents.parse(event);
    expect(parsed.status).toBe("known");
    if (parsed.status === "known") {
      expect(parsed.event.data.authzRevision).toBe(7);
    }
  });
});

describe("checkErrorEnvelope", () => {
  it("przepuszcza poprawną kopertę błędu i odrzuca brak pól lub błędny kod", async () => {
    const good = new Response(
      JSON.stringify({
        data: null,
        meta: { requestId: "req_123" },
        error: { code: "UNAUTHENTICATED", message: "Brak tokenu", details: [] },
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );

    const okResult = await checkErrorEnvelope(good, {
      expectedStatus: 401,
      expectedCode: "UNAUTHENTICATED",
      requireEmptyDetails: true,
    });
    expect(okResult.passed).toBe(true);

    const bad = new Response(
      JSON.stringify({
        error: "Brak tokenu",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );

    const badResult = await checkErrorEnvelope(bad, {
      expectedStatus: 401,
      expectedCode: "UNAUTHENTICATED",
    });
    expect(badResult.passed).toBe(false);
    expect(badResult.violations.map((v) => v.rule)).toEqual(["envelope.status", "envelope.format"]);
  });
});

describe("checkTenantIsolation", () => {
  it("przechodzi, gdy firma B nie widzi wierszy firmy A, i wywołuje cleanup", async () => {
    const store = new Map<string, string[]>();
    let cleaned = false;

    const result = await checkTenantIsolation({
      seedAsTenant: (tenantId) => {
        store.set(tenantId, ["wpis-1"]);
      },
      readAsTenant: (tenantId) => store.get(tenantId) ?? [],
      cleanup: ({ tenantAId, tenantBId }) => {
        cleaned = true;
        store.delete(tenantAId);
        store.delete(tenantBId);
      },
    });

    expect(result.passed).toBe(true);
    expect(cleaned).toBe(true);
  });

  it("wykrywa wyciek wierszy między firmami oraz pusty zapis firmy A", async () => {
    const leakyStore: string[] = [];
    const leakResult = await checkTenantIsolation({
      seedAsTenant: () => {
        leakyStore.push("sekret-firmy-A");
      },
      readAsTenant: () => leakyStore,
    });

    expect(leakResult.passed).toBe(false);
    expect(leakResult.violations.map((v) => v.rule)).toEqual(["tenant_isolation.cross_tenant_read"]);

    const emptyResult = await checkTenantIsolation({
      seedAsTenant: () => undefined,
      readAsTenant: () => [],
    });
    expect(emptyResult.passed).toBe(false);
    expect(emptyResult.violations.map((v) => v.rule)).toEqual(["tenant_isolation.seed_not_visible"]);
  });
});

// Wrapper Vitest dla izolacji firm
const isolatedRows = new Map<string, string[]>();
await defineTenantIsolationTests({
  suiteName: "defineTenantIsolationTests (wrapper Vitest)",
  seedAsTenant: (tenantId) => {
    isolatedRows.set(tenantId, ["rekord-A"]);
  },
  readAsTenant: (tenantId) => isolatedRows.get(tenantId) ?? [],
  cleanup: ({ tenantAId, tenantBId }) => {
    isolatedRows.delete(tenantAId);
    isolatedRows.delete(tenantBId);
  },
});
