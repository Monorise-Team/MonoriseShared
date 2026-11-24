import { describe, expect, expectTypeOf, it } from "vitest";
import {
  definePermissions,
  parsePermissionKey,
  permissionKeySchema,
  permissionManifestSchema,
  permissionSnapshotSchema,
  type PermissionKeyOf,
} from "../src/index.js";
import { janSnapshot, timotime, UNITS } from "./fixtures.js";

describe("definePermissions", () => {
  it("tworzy typowane klucze i zamrożony manifest produktu", () => {
    const product = definePermissions("timotime", {
      "entries.approve": "Zatwierdzanie godzin pracy",
      "entries.read": "  Podgląd godzin pracy  ",
      "time_off.requests.approve": "Zatwierdzanie wniosków urlopowych",
    });

    expect(product.product).toBe("timotime");
    expect(product.keys["entries.approve"]).toBe("timotime.entries.approve");
    expect(product.keys["entries.read"]).toBe("timotime.entries.read");
    expect(product.keys["time_off.requests.approve"]).toBe("timotime.time_off.requests.approve");

    expect(product.manifest).toEqual([
      { key: "timotime.entries.approve", description: "Zatwierdzanie godzin pracy" },
      { key: "timotime.entries.read", description: "Podgląd godzin pracy" },
      { key: "timotime.time_off.requests.approve", description: "Zatwierdzanie wniosków urlopowych" },
    ]);

    expectTypeOf(product.product).toEqualTypeOf<"timotime">();
    expectTypeOf(product.keys["entries.approve"]).toEqualTypeOf<"timotime.entries.approve">();
    type Keys = PermissionKeyOf<typeof product>;
    expectTypeOf<Keys>().toEqualTypeOf<
      "timotime.entries.approve" | "timotime.entries.read" | "timotime.time_off.requests.approve"
    >();

    expect(Object.isFrozen(product)).toBe(true);
    expect(Object.isFrozen(product.keys)).toBe(true);
    expect(Object.isFrozen(product.manifest)).toBe(true);
    for (const item of product.manifest) {
      expect(Object.isFrozen(item)).toBe(true);
    }

    expect(permissionManifestSchema.parse(product.manifest)).toEqual(product.manifest);
  });

  it("odrzuca niepoprawną nazwę produktu błędem TypeError", () => {
    for (const badProduct of ["", "TimoTime", "timo_time", "timo-time", "1timo", "timo.time", " timotime"]) {
      expect(() => definePermissions(badProduct, { "entries.read": "Podgląd" })).toThrow(TypeError);
    }
  });

  it("odrzuca puste definicje i niepoprawne nazwy uprawnień", () => {
    expect(() => definePermissions("timotime", {})).toThrow(TypeError);

    for (const badName of [
      "",
      "entries",
      "entries.",
      ".entries.read",
      "entries..read",
      "Entries.read",
      "entries.read-all",
      "1entries.read",
      "entries.1read",
      "entries.read ",
    ]) {
      expect(() => definePermissions("timotime", { [badName]: "Opis" })).toThrow(TypeError);
    }
  });

  it("odrzuca pusty albo złożony ze spacji opis uprawnienia", () => {
    expect(() => definePermissions("timotime", { "entries.read": "" })).toThrow(TypeError);
    expect(() => definePermissions("timotime", { "entries.read": "   \t\n " })).toThrow(TypeError);
  });
});

describe("parsePermissionKey i schematy kluczy", () => {
  it("rozbija poprawne klucze na produkt i część lokalną", () => {
    expect(parsePermissionKey("timotime.entries.approve")).toEqual({
      product: "timotime",
      name: "entries.approve",
    });
    expect(parsePermissionKey("hirahr2.payroll_runs.details.read")).toEqual({
      product: "hirahr2",
      name: "payroll_runs.details.read",
    });
  });

  it("rzuca TypeError dla niepoprawnych kluczy", () => {
    for (const badKey of ["", "timotime", "timotime.entries", "Timo.entries.read", "timo_time.entries.read", "a.b."]) {
      expect(() => parsePermissionKey(badKey)).toThrow(TypeError);
      expect(permissionKeySchema.safeParse(badKey).success).toBe(false);
    }
  });

  it("waliduje manifest uprawnień pod kątem unikalności i wspólnego prefiksu produktu", () => {
    expect(permissionManifestSchema.safeParse(timotime.manifest).success).toBe(true);

    // Pusta tablica
    expect(permissionManifestSchema.safeParse([]).success).toBe(false);

    // Duplikat klucza
    expect(
      permissionManifestSchema.safeParse([
        { key: "timotime.entries.read", description: "Podgląd" },
        { key: "timotime.entries.read", description: "Podgląd ponownie" },
      ]).success,
    ).toBe(false);

    // Różne produkty w jednym manifeście
    expect(
      permissionManifestSchema.safeParse([
        { key: "timotime.entries.read", description: "Podgląd" },
        { key: "kivotasks.projects.read", description: "Projekty" },
      ]).success,
    ).toBe(false);

    // Pusty opis po przycięciu
    expect(permissionManifestSchema.safeParse([{ key: "timotime.entries.read", description: "   " }]).success).toBe(
      false,
    );
  });
});

describe("permissionSnapshotSchema", () => {
  it("przyjmuje poprawną migawkę po serializacji JSON (z UTC i przesunięciem strefowym)", () => {
    const raw = janSnapshot({
      grants: [
        {
          permission: timotime.keys["entries.approve"],
          scope: { type: "UNIT", unitId: UNITS.KRAKOW },
          validFrom: "2026-11-01T00:00:00Z",
          validUntil: "2026-12-01T00:00:00+01:00",
        },
        {
          permission: timotime.keys["entries.read"],
          scope: { type: "RESOURCE", resourceId: "project-42" },
          validFrom: null,
          validUntil: null,
        },
        {
          permission: timotime.keys["reports.export"],
          scope: { type: "ORGANIZATION" },
        },
      ],
    });

    const roundTripped: unknown = JSON.parse(JSON.stringify(raw));
    expect(permissionSnapshotSchema.parse(roundTripped)).toEqual(raw);
  });

  it("odrzuca niepoprawne pola migawki", () => {
    const base = janSnapshot();

    expect(permissionSnapshotSchema.safeParse({ ...base, accountId: "not-a-uuid" }).success).toBe(false);
    expect(permissionSnapshotSchema.safeParse({ ...base, organizationId: "not-a-uuid" }).success).toBe(false);
    expect(permissionSnapshotSchema.safeParse({ ...base, authzRevision: -1 }).success).toBe(false);
    expect(permissionSnapshotSchema.safeParse({ ...base, authzRevision: 1.5 }).success).toBe(false);
    expect(permissionSnapshotSchema.safeParse({ ...base, products: ["Bad_Product"] }).success).toBe(false);
    expect(
      permissionSnapshotSchema.safeParse({
        ...base,
        grants: [{ permission: "bad", scope: { type: "ORGANIZATION" } }],
      }).success,
    ).toBe(false);
    expect(
      permissionSnapshotSchema.safeParse({
        ...base,
        grants: [
          {
            permission: timotime.keys["entries.read"],
            scope: { type: "RESOURCE", resourceId: "   " },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      permissionSnapshotSchema.safeParse({
        ...base,
        grants: [
          {
            permission: timotime.keys["entries.read"],
            scope: { type: "ORGANIZATION" },
            validUntil: "2026-11-24T10:00:00", // brak strefy czasowej
          },
        ],
      }).success,
    ).toBe(false);
  });
});
