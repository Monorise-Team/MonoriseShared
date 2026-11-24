import { definePermissions, type PermissionGrant, type PermissionSnapshot, type SnapshotUnit } from "../src/index.js";

/** Deklaracja uprawnień przykładowego produktu TimoTime (z dokumentacji 03-organization/roles-permissions.md). */
export const timotime = definePermissions("timotime", {
  "entries.approve": "Zatwierdzanie godzin pracy",
  "entries.read": "Podgląd godzin pracy",
  "reports.export": "Eksport raportów czasu pracy",
});

export const kivotasks = definePermissions("kivotasks", {
  "projects.read": "Podgląd projektów",
  "projects.manage": "Zarządzanie projektami",
});

export const ACME_ORG_ID = "01936f4e-7d10-7a2b-8c3d-4e5f6a7b8c9d";
export const BETA_ORG_ID = "01936f4e-7d10-7a2b-8c3d-4e5f6a7b8c9e";

export const JAN_ACCOUNT_ID = "01936f4e-8a1b-7c3d-9e2f-0a1b2c3d4e51";
export const ANNA_ACCOUNT_ID = "01936f4e-8a1b-7c3d-9e2f-0a1b2c3d4e52";
export const OWNER_ACCOUNT_ID = "01936f4e-8a1b-7c3d-9e2f-0a1b2c3d4e53";
export const PIOTR_ACCOUNT_ID = "01936f4e-8a1b-7c3d-9e2f-0a1b2c3d4e54";

/** Stałe UUID jednostek organizacyjnych firmy Acme. */
export const UNITS = {
  KRAKOW: "01936f4e-1000-7000-8000-000000000001",
  HR_KRAKOW: "01936f4e-1000-7000-8000-000000000002",
  ZESPOL_KRAKOW_A: "01936f4e-1000-7000-8000-000000000003",
  WARSZAWA: "01936f4e-1000-7000-8000-000000000004",
  ZESPOL_WARSZAWA: "01936f4e-1000-7000-8000-000000000005",
  KSIEGOWOSC: "01936f4e-1000-7000-8000-000000000006",
  ZESPOL_KRAKOW_B: "01936f4e-1000-7000-8000-000000000007",
  FOREIGN_UNIT: "01936f4e-9999-7000-8000-000000000099",
} as const;

/** Podstawowe drzewo jednostek firmy Acme z dokumentacji. */
export const ACME_UNITS: readonly SnapshotUnit[] = [
  { id: UNITS.KRAKOW, parentId: null },
  { id: UNITS.HR_KRAKOW, parentId: UNITS.KRAKOW },
  { id: UNITS.ZESPOL_KRAKOW_A, parentId: UNITS.HR_KRAKOW },
  { id: UNITS.WARSZAWA, parentId: null },
  { id: UNITS.ZESPOL_WARSZAWA, parentId: UNITS.WARSZAWA },
  { id: UNITS.KSIEGOWOSC, parentId: null },
];

export function makeSnapshot(overrides: Partial<PermissionSnapshot> = {}): PermissionSnapshot {
  return {
    accountId: JAN_ACCOUNT_ID,
    organizationId: ACME_ORG_ID,
    authzRevision: 1,
    isOwner: false,
    products: ["timotime"],
    grants: [],
    units: ACME_UNITS.map((unit) => ({ ...unit })),
    ...overrides,
  };
}

/** Jan: Administrator HR z uprawnieniem `timotime.entries.approve` na Oddział Kraków. */
export function janSnapshot(overrides: Partial<PermissionSnapshot> = {}): PermissionSnapshot {
  const defaultGrants: PermissionGrant[] = [
    {
      permission: timotime.keys["entries.approve"],
      scope: { type: "UNIT", unitId: UNITS.KRAKOW },
    },
  ];

  return makeSnapshot({
    accountId: JAN_ACCOUNT_ID,
    grants: defaultGrants,
    ...overrides,
  });
}

export function ownerSnapshot(overrides: Partial<PermissionSnapshot> = {}): PermissionSnapshot {
  return makeSnapshot({
    accountId: OWNER_ACCOUNT_ID,
    isOwner: true,
    ...overrides,
  });
}
