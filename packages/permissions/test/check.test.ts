import { describe, expect, it } from "vitest";
import { assertCan, can, canDelegate, PermissionError, scopeOf, type PermissionSnapshot } from "../src/index.js";
import { ACME_UNITS, janSnapshot, kivotasks, makeSnapshot, ownerSnapshot, timotime, UNITS } from "./fixtures.js";

const APPROVE = timotime.keys["entries.approve"];
const READ = timotime.keys["entries.read"];
const EXPORT = timotime.keys["reports.export"];
const PROJECTS_READ = kivotasks.keys["projects.read"];

describe("can i assertCan — przykłady firmy Acme", () => {
  it("Jan (UNIT Kraków) zatwierdza godziny Anny (Zespół Kraków A), ale nie Piotra (Warszawa) ani Księgowości", () => {
    const jan = janSnapshot();

    expect(can(jan, APPROVE, { unitIds: [UNITS.ZESPOL_KRAKOW_A] })).toBe(true);
    expect(can(jan, APPROVE, { unitIds: [UNITS.HR_KRAKOW] })).toBe(true);
    expect(can(jan, APPROVE, { unitIds: [UNITS.KRAKOW] })).toBe(true);

    expect(can(jan, APPROVE, { unitIds: [UNITS.ZESPOL_WARSZAWA] })).toBe(false);
    expect(can(jan, APPROVE, { unitIds: [UNITS.WARSZAWA] })).toBe(false);
    expect(can(jan, APPROVE, { unitIds: [UNITS.KSIEGOWOSC] })).toBe(false);

    expect(() => assertCan(jan, APPROVE, { unitIds: [UNITS.ZESPOL_KRAKOW_A] })).not.toThrow();

    let caught: unknown;
    try {
      assertCan(jan, APPROVE, { unitIds: [UNITS.ZESPOL_WARSZAWA] });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PermissionError);
    expect(caught).toMatchObject({
      name: "PermissionError",
      code: "PERMISSION_DENIED",
      statusCode: 403,
      permission: APPROVE,
      message: `Permission denied: ${APPROVE}`,
    });
    // Komunikat błędu nigdy nie zawiera danych z migawki (np. identyfikatora konta czy jednostek).
    expect((caught as Error).message).not.toContain(jan.accountId);
    expect((caught as Error).message).not.toContain(jan.organizationId);
  });

  it("nowy zespół utworzony pod Krakowem od razu wchodzi w zakres Jana", () => {
    const janWithNewTeam = janSnapshot({
      units: [...ACME_UNITS, { id: UNITS.ZESPOL_KRAKOW_B, parentId: UNITS.HR_KRAKOW }],
    });

    expect(can(janWithNewTeam, APPROVE, { unitIds: [UNITS.ZESPOL_KRAKOW_B] })).toBe(true);
    const scope = scopeOf(janWithNewTeam, APPROVE);
    expect(scope.type).toBe("LIMITED");
    if (scope.type === "LIMITED") {
      expect(scope.unitIds).toContain(UNITS.ZESPOL_KRAKOW_B);
    }
  });

  it("pracownica przypisana do Krakowa i Warszawy jest widoczna dla Jana (Kraków)", () => {
    const jan = janSnapshot();
    expect(can(jan, APPROVE, { unitIds: [UNITS.ZESPOL_WARSZAWA, UNITS.ZESPOL_KRAKOW_A] })).toBe(true);
  });
});

describe("role czasowe (validFrom i validUntil)", () => {
  const from = "2026-11-10T08:00:00Z";
  const until = "2026-11-20T18:00:00Z";

  const tempJan = janSnapshot({
    grants: [
      {
        permission: APPROVE,
        scope: { type: "UNIT", unitId: UNITS.KRAKOW },
        validFrom: from,
        validUntil: until,
      },
    ],
  });

  it("odmawia przed validFrom, pozwala od validFrom do chwili przed validUntil, odmawia w chwili validUntil i po niej", () => {
    const target = { unitIds: [UNITS.ZESPOL_KRAKOW_A] };

    // Przed rozpoczęciem
    expect(can(tempJan, APPROVE, target, { now: new Date("2026-11-10T07:59:59.999Z") })).toBe(false);
    // Dokładnie w validFrom (początek włączny)
    expect(can(tempJan, APPROVE, target, { now: new Date(from) })).toBe(true);
    // Chwilę przed validUntil
    expect(can(tempJan, APPROVE, target, { now: new Date("2026-11-20T17:59:59.999Z") })).toBe(true);
    // Dokładnie w validUntil (koniec wyłączny)
    expect(can(tempJan, APPROVE, target, { now: new Date(until) })).toBe(false);
    // Po validUntil
    expect(can(tempJan, APPROVE, target, { now: new Date("2026-11-25T12:00:00Z") })).toBe(false);

    expect(scopeOf(tempJan, APPROVE, { now: new Date(until) })).toEqual({ type: "NONE" });
    expect(
      canDelegate(tempJan, APPROVE, { type: "UNIT", unitId: UNITS.ZESPOL_KRAKOW_A }, { now: new Date(until) }),
    ).toBe(false);
  });
});

describe("Owner i dostęp do produktów", () => {
  it("Owner ma każde uprawnienie dostępnego produktu i zakres ORGANIZATION", () => {
    const owner = ownerSnapshot({ products: ["timotime"] });

    expect(can(owner, APPROVE, { unitIds: [UNITS.ZESPOL_WARSZAWA] })).toBe(true);
    expect(can(owner, EXPORT)).toBe(true);
    expect(can(owner, READ, {})).toBe(true);
    expect(scopeOf(owner, APPROVE)).toEqual({ type: "ORGANIZATION" });
  });

  it("Owner firmy bez dostępu do produktu dostaje odmowę", () => {
    const ownerWithoutTimotime = ownerSnapshot({ products: ["kivotasks"] });

    expect(can(ownerWithoutTimotime, APPROVE)).toBe(false);
    expect(can(ownerWithoutTimotime, APPROVE, { unitIds: [UNITS.KRAKOW] })).toBe(false);
    expect(scopeOf(ownerWithoutTimotime, APPROVE)).toEqual({ type: "NONE" });
    expect(canDelegate(ownerWithoutTimotime, APPROVE, { type: "ORGANIZATION" })).toBe(false);
  });

  it("brak produktu w snapshot.products daje odmowę nawet przy pasującym nadaniu", () => {
    const janWithoutApp = janSnapshot({ products: ["kivotasks"] });

    expect(can(janWithoutApp, APPROVE)).toBe(false);
    expect(can(janWithoutApp, APPROVE, { unitIds: [UNITS.ZESPOL_KRAKOW_A] })).toBe(false);
    expect(scopeOf(janWithoutApp, APPROVE)).toEqual({ type: "NONE" });
    expect(canDelegate(janWithoutApp, APPROVE, { type: "UNIT", unitId: UNITS.ZESPOL_KRAKOW_A })).toBe(false);
  });
});

describe("zakres RESOURCE, brak celu i sumowanie uprawnień", () => {
  it("zakres RESOURCE obejmuje tylko wskazany zasób, nie jednostkę ani inne zasoby", () => {
    const snapshot = makeSnapshot({
      products: ["kivotasks"],
      grants: [{ permission: PROJECTS_READ, scope: { type: "RESOURCE", resourceId: "proj-alpha" } }],
    });

    expect(can(snapshot, PROJECTS_READ, { resourceId: "proj-alpha" })).toBe(true);
    expect(can(snapshot, PROJECTS_READ, { resourceId: "proj-beta" })).toBe(false);
    expect(can(snapshot, PROJECTS_READ, { unitIds: [UNITS.KRAKOW] })).toBe(false);
    expect(can(snapshot, PROJECTS_READ, {})).toBe(false);
    // Brak celu (np. wyświetlenie pozycji w menu): wystarczy dowolne ważne nadanie
    expect(can(snapshot, PROJECTS_READ)).toBe(true);
  });

  it("uprawnienia sumują się (UNIT Kraków + RESOURCE proj-x obejmuje oba)", () => {
    const snapshot = makeSnapshot({
      grants: [
        { permission: READ, scope: { type: "UNIT", unitId: UNITS.KRAKOW } },
        { permission: READ, scope: { type: "RESOURCE", resourceId: "entry-99" } },
      ],
    });

    expect(can(snapshot, READ, { unitIds: [UNITS.ZESPOL_KRAKOW_A] })).toBe(true);
    expect(can(snapshot, READ, { resourceId: "entry-99" })).toBe(true);
    expect(can(snapshot, READ, { unitIds: [UNITS.ZESPOL_WARSZAWA], resourceId: "entry-99" })).toBe(true);
    expect(can(snapshot, READ, { unitIds: [UNITS.ZESPOL_WARSZAWA] })).toBe(false);
    expect(can(snapshot, READ, { resourceId: "entry-100" })).toBe(false);

    expect(scopeOf(snapshot, READ)).toEqual({
      type: "LIMITED",
      unitIds: [UNITS.KRAKOW, UNITS.HR_KRAKOW, UNITS.ZESPOL_KRAKOW_A].sort(),
      resourceIds: ["entry-99"],
    });
  });
});

describe("bezpieczne wartości domyślne (fail-closed)", () => {
  it("pusty cel {} i { unitIds: [] } przechodzi tylko dla zakresu ORGANIZATION", () => {
    const jan = janSnapshot();
    expect(can(jan, APPROVE, {})).toBe(false);
    expect(can(jan, APPROVE, { unitIds: [] })).toBe(false);

    const orgAdmin = makeSnapshot({
      grants: [{ permission: APPROVE, scope: { type: "ORGANIZATION" } }],
    });
    expect(can(orgAdmin, APPROVE, {})).toBe(true);
    expect(can(orgAdmin, APPROVE, { unitIds: [] })).toBe(true);
  });

  it("nieznana jednostka celu i nadanie na nieznaną jednostkę zawsze dają odmowę", () => {
    const jan = janSnapshot();
    expect(can(jan, APPROVE, { unitIds: [UNITS.FOREIGN_UNIT] })).toBe(false);

    const ghostGrant = makeSnapshot({
      grants: [{ permission: APPROVE, scope: { type: "UNIT", unitId: UNITS.FOREIGN_UNIT } }],
    });
    expect(can(ghostGrant, APPROVE)).toBe(false);
    expect(can(ghostGrant, APPROVE, { unitIds: [UNITS.FOREIGN_UNIT] })).toBe(false);
    expect(can(ghostGrant, APPROVE, { unitIds: [UNITS.KRAKOW] })).toBe(false);
    expect(scopeOf(ghostGrant, APPROVE)).toEqual({ type: "NONE" });
  });

  it("cykl w parentId nie zawiesza programu i nie daje dostępu poza odwiedzonymi przodkami", () => {
    const cycleA = "01936f4e-2000-7000-8000-000000000001";
    const cycleB = "01936f4e-2000-7000-8000-000000000002";
    const childOfA = "01936f4e-2000-7000-8000-000000000003";
    const unrelated = "01936f4e-2000-7000-8000-000000000004";

    const cyclicSnapshot = makeSnapshot({
      units: [
        { id: cycleA, parentId: cycleB },
        { id: cycleB, parentId: cycleA },
        { id: childOfA, parentId: cycleA },
        { id: unrelated, parentId: null },
      ],
      grants: [{ permission: APPROVE, scope: { type: "UNIT", unitId: cycleB } }],
    });

    expect(can(cyclicSnapshot, APPROVE, { unitIds: [childOfA] })).toBe(true);
    expect(can(cyclicSnapshot, APPROVE, { unitIds: [cycleA] })).toBe(true);
    expect(can(cyclicSnapshot, APPROVE, { unitIds: [cycleB] })).toBe(true);
    expect(can(cyclicSnapshot, APPROVE, { unitIds: [unrelated] })).toBe(false);

    const scope = scopeOf(cyclicSnapshot, APPROVE);
    expect(scope).toEqual({
      type: "LIMITED",
      unitIds: [cycleA, cycleB, childOfA].sort(),
      resourceIds: [],
    });

    // Odwrotna sytuacja: nadanie na unrelated, cel wewnątrz cyklu nie może się zapętlić
    const grantUnrelated = makeSnapshot({
      units: cyclicSnapshot.units,
      grants: [{ permission: APPROVE, scope: { type: "UNIT", unitId: unrelated } }],
    });
    expect(can(grantUnrelated, APPROVE, { unitIds: [childOfA] })).toBe(false);
    expect(can(grantUnrelated, APPROVE, { unitIds: [cycleA] })).toBe(false);
    expect(can(grantUnrelated, APPROVE, { unitIds: [unrelated] })).toBe(true);
  });

  it("niepoprawny klucz uprawnienia daje odmowę bez rzucania wyjątku", () => {
    const owner = ownerSnapshot();
    for (const badKey of ["", "timotime", "timotime.entries", "TIMOTIME.entries.approve", "timotime..approve"]) {
      expect(() => can(owner, badKey)).not.toThrow();
      expect(can(owner, badKey)).toBe(false);
      expect(scopeOf(owner, badKey)).toEqual({ type: "NONE" });
      expect(canDelegate(owner, badKey, { type: "ORGANIZATION" })).toBe(false);
    }
  });
});

describe("scopeOf i zgodność z can", () => {
  function assertScopeAgreesWithCan(snapshot: PermissionSnapshot, permission: string) {
    const scope = scopeOf(snapshot, permission);
    for (const unit of snapshot.units) {
      const allowedByCan = can(snapshot, permission, { unitIds: [unit.id] });
      const allowedByScope =
        scope.type === "ORGANIZATION" || (scope.type === "LIMITED" && scope.unitIds.includes(unit.id));
      expect(allowedByCan).toBe(allowedByScope);
    }
    expect(can(snapshot, permission)).toBe(scope.type !== "NONE");
  }

  it("zgadza się z can dla każdego węzła drzewa w różnych wariantach uprawnień", () => {
    const scenarios: PermissionSnapshot[] = [
      janSnapshot(),
      janSnapshot({
        grants: [
          { permission: APPROVE, scope: { type: "UNIT", unitId: UNITS.HR_KRAKOW } },
          { permission: APPROVE, scope: { type: "UNIT", unitId: UNITS.KSIEGOWOSC } },
        ],
      }),
      janSnapshot({
        grants: [
          { permission: APPROVE, scope: { type: "UNIT", unitId: UNITS.KRAKOW } },
          { permission: APPROVE, scope: { type: "ORGANIZATION" } },
        ],
      }),
      makeSnapshot({
        grants: [{ permission: APPROVE, scope: { type: "RESOURCE", resourceId: "res-1" } }],
      }),
      makeSnapshot({ grants: [] }),
      ownerSnapshot(),
      ownerSnapshot({ products: [] }),
    ];

    for (const snapshot of scenarios) {
      assertScopeAgreesWithCan(snapshot, APPROVE);
    }
  });
});

describe("canDelegate", () => {
  it("Jan może delegować tylko swoje uprawnienie i tylko w poddrzewie Krakowa", () => {
    const jan = janSnapshot();

    expect(canDelegate(jan, APPROVE, { type: "UNIT", unitId: UNITS.KRAKOW })).toBe(true);
    expect(canDelegate(jan, APPROVE, { type: "UNIT", unitId: UNITS.HR_KRAKOW })).toBe(true);
    expect(canDelegate(jan, APPROVE, { type: "UNIT", unitId: UNITS.ZESPOL_KRAKOW_A })).toBe(true);

    // Poza zakresem Jana
    expect(canDelegate(jan, APPROVE, { type: "UNIT", unitId: UNITS.WARSZAWA })).toBe(false);
    expect(canDelegate(jan, APPROVE, { type: "UNIT", unitId: UNITS.ZESPOL_WARSZAWA })).toBe(false);
    expect(canDelegate(jan, APPROVE, { type: "UNIT", unitId: UNITS.KSIEGOWOSC })).toBe(false);
    expect(canDelegate(jan, APPROVE, { type: "UNIT", unitId: UNITS.FOREIGN_UNIT })).toBe(false);
    expect(canDelegate(jan, APPROVE, { type: "ORGANIZATION" })).toBe(false);

    // Uprawnienie, którego Jan nie ma
    expect(canDelegate(jan, EXPORT, { type: "UNIT", unitId: UNITS.ZESPOL_KRAKOW_A })).toBe(false);
  });

  it("Owner może delegować każde uprawnienie dostępnego produktu", () => {
    const owner = ownerSnapshot({ products: ["timotime"] });

    expect(canDelegate(owner, EXPORT, { type: "ORGANIZATION" })).toBe(true);
    expect(canDelegate(owner, EXPORT, { type: "UNIT", unitId: UNITS.ZESPOL_WARSZAWA })).toBe(true);
    expect(canDelegate(owner, EXPORT, { type: "RESOURCE", resourceId: "rep-1" })).toBe(true);
    // Nieznana jednostka spoza drzewa firmy nadal daje odmowę
    expect(canDelegate(owner, EXPORT, { type: "UNIT", unitId: UNITS.FOREIGN_UNIT })).toBe(false);
    // Niedostępny produkt daje odmowę
    expect(canDelegate(owner, PROJECTS_READ, { type: "ORGANIZATION" })).toBe(false);
  });

  it("delegowanie RESOURCE wspiera resourceUnitIds, a samo nadanie RESOURCE nigdy nie pozwala delegować UNIT", () => {
    const jan = janSnapshot();

    // Zasób przypisany do Zespołu Kraków A -> Jan (Kraków) może go delegować
    expect(
      canDelegate(
        jan,
        APPROVE,
        { type: "RESOURCE", resourceId: "entry-1" },
        {
          resourceUnitIds: [UNITS.ZESPOL_KRAKOW_A],
        },
      ),
    ).toBe(true);
    // Zasób w Warszawie -> odmowa
    expect(
      canDelegate(
        jan,
        APPROVE,
        { type: "RESOURCE", resourceId: "entry-2" },
        {
          resourceUnitIds: [UNITS.ZESPOL_WARSZAWA],
        },
      ),
    ).toBe(false);
    // Brak jednostek zasobu -> odmowa (Jan ma tylko UNIT, nie RESOURCE ani ORGANIZATION)
    expect(canDelegate(jan, APPROVE, { type: "RESOURCE", resourceId: "entry-1" })).toBe(false);

    const resourceHolder = makeSnapshot({
      grants: [{ permission: APPROVE, scope: { type: "RESOURCE", resourceId: "entry-1" } }],
    });
    expect(canDelegate(resourceHolder, APPROVE, { type: "RESOURCE", resourceId: "entry-1" })).toBe(true);
    expect(canDelegate(resourceHolder, APPROVE, { type: "RESOURCE", resourceId: "entry-2" })).toBe(false);
    expect(canDelegate(resourceHolder, APPROVE, { type: "UNIT", unitId: UNITS.ZESPOL_KRAKOW_A })).toBe(false);
    expect(canDelegate(resourceHolder, APPROVE, { type: "ORGANIZATION" })).toBe(false);
  });

  it("administrator z zakresem ORGANIZATION może delegować ORGANIZATION i każdą jednostkę firmy", () => {
    const orgAdmin = makeSnapshot({
      grants: [{ permission: APPROVE, scope: { type: "ORGANIZATION" } }],
    });

    expect(canDelegate(orgAdmin, APPROVE, { type: "ORGANIZATION" })).toBe(true);
    expect(canDelegate(orgAdmin, APPROVE, { type: "UNIT", unitId: UNITS.ZESPOL_WARSZAWA })).toBe(true);
    expect(canDelegate(orgAdmin, APPROVE, { type: "RESOURCE", resourceId: "entry-1" })).toBe(true);
    expect(canDelegate(orgAdmin, APPROVE, { type: "UNIT", unitId: UNITS.FOREIGN_UNIT })).toBe(false);
  });
});
