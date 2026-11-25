import { uuidv7 } from "@monorise-team/events";
import { formatViolations, type ContractCheckResult, type ContractViolation } from "./envelope.js";

export interface TenantIsolationOptions<TRow = unknown> {
  /** Zapisuje w bazie wiersz(e) należące do firmy `tenantId` (UUIDv7). */
  seedAsTenant: (tenantId: string) => Promise<unknown> | unknown;
  /** Odczytuje wiersze w kontekście firmy `tenantId` (przez RLS / `withOrganization`). */
  readAsTenant: (tenantId: string) => Promise<readonly TRow[]> | readonly TRow[];
  /** Opcjonalne sprzątanie po sprawdzeniu dla obu identyfikatorów firm. */
  cleanup?: (tenants: { tenantAId: string; tenantBId: string }) => Promise<void> | void;
  /** Opcjonalny jawny identyfikator firmy A (domyślnie generowany UUIDv7). */
  tenantAId?: string;
  /** Opcjonalny jawny identyfikator firmy B (domyślnie generowany UUIDv7). */
  tenantBId?: string;
  /**
   * Czy sprawdzać, że firma A rzeczywiście odczytuje zapisane dla siebie wiersze (zapobiega fałszywym sukcesom).
   * Domyślnie `true`.
   */
  assertSeeded?: boolean;
}

export interface DefineTenantIsolationTestsOptions<TRow = unknown> extends TenantIsolationOptions<TRow> {
  /** Nazwa bloku `describe` w Vitest (domyślnie `"Separacja firm (ADR-0037)"`). */
  suiteName?: string;
}

/**
 * Sprawdza izolację między firmami (ADR-0037): zapisuje dane jako firma A, potwierdza że firma A
 * widzi swoje wiersze oraz weryfikuje, że firma B nigdy nie odczyta wierszy firmy A.
 */
export async function checkTenantIsolation<TRow = unknown>(
  options: TenantIsolationOptions<TRow>,
): Promise<ContractCheckResult> {
  const tenantAId = options.tenantAId ?? uuidv7();
  const tenantBId = options.tenantBId ?? uuidv7();
  const violations: ContractViolation[] = [];

  if (tenantAId === tenantBId) {
    violations.push({
      rule: "tenant_isolation.distinct_tenants",
      target: "tenantIds",
      message: "Identyfikatory firmy A i firmy B muszą być różne.",
      details: { tenantAId, tenantBId },
    });
    return { passed: false, violations };
  }

  try {
    await options.seedAsTenant(tenantAId);

    if (options.assertSeeded !== false) {
      const rowsForA = await options.readAsTenant(tenantAId);
      if (rowsForA.length === 0) {
        violations.push({
          rule: "tenant_isolation.seed_not_visible",
          target: tenantAId,
          message:
            "Firma A nie odczytała żadnych wierszy po seedAsTenant — sprawdź, czy zapis w bazie powiódł się dla firmy A.",
          details: { tenantAId },
        });
      }
    }

    const rowsForB = await options.readAsTenant(tenantBId);
    if (rowsForB.length > 0) {
      violations.push({
        rule: "tenant_isolation.cross_tenant_read",
        target: tenantBId,
        message: `Firma B (${tenantBId}) odczytała ${rowsForB.length} wiersz(y) należących do firmy A (${tenantAId}).`,
        details: { tenantAId, tenantBId, leakedRowCount: rowsForB.length },
      });
    }
  } finally {
    if (options.cleanup) {
      await options.cleanup({ tenantAId, tenantBId });
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Rejestruje blok testów Vitest sprawdzający separację danych firm (ADR-0037).
 * Importuje `vitest` leniwie, więc pozostała część biblioteki działa bez Vitesta.
 */
export async function defineTenantIsolationTests<TRow = unknown>(
  options: DefineTenantIsolationTestsOptions<TRow>,
): Promise<void> {
  const { describe, expect, it } = await import("vitest");
  const suiteName = options.suiteName ?? "Separacja firm (ADR-0037)";

  describe(suiteName, () => {
    it("firma B nigdy nie odczytuje wierszy firmy A", async () => {
      const result = await checkTenantIsolation(options);
      expect(result.passed, formatViolations(result.violations)).toBe(true);
    });
  });
}
