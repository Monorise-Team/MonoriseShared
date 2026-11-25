import { uuidv7 } from "@monorise-team/events";
import type { GrantScope } from "@monorise-team/permissions";
import type { SignUserTokenInput } from "./issuer.js";

export type OrganizationStatus = "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "OFFBOARDING" | "DELETED";
export type DomainStatus = "PENDING" | "VERIFIED" | "FAILED" | "REVOKED";
export type UnitType = "BRANCH" | "DEPARTMENT" | "TEAM";
export type UnitStatus = "ACTIVE" | "ARCHIVED";
export type UnitMembershipRole = "MEMBER" | "LEADER";
export type EmployeeStatus = "ACTIVE" | "FORMER" | "ANONYMIZED";
export type AccountStatus = "INVITED" | "ACTIVE" | "DEACTIVATED";
export type EntitlementStatus = "ACTIVE" | "SUSPENDED" | "ENDED";
export type EntitlementSourceType = "CONTRACT" | "SUBSCRIPTION" | "TRIAL" | "MANUAL" | "OFFER" | "PACKAGE";
export type AppAccessStatus = "ACTIVE" | "REVOKED";

export interface FakeDomainRecord {
  domain: string;
  status: DomainStatus;
  isPrimary: boolean;
  verifiedAt: Date | null;
}

export interface FakeUnitRecord {
  id: string;
  organizationId: string;
  parentId: string | null;
  name: string;
  type: UnitType;
  status: UnitStatus;
}

export interface FakeEmployeeRecord {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  workEmail: string | null;
  jobTitle: string | null;
  status: EmployeeStatus;
  accountId: string | null;
}

export interface FakeAccountRecord {
  id: string;
  organizationId: string;
  employeeId: string;
  email: string;
  status: AccountStatus;
  authzRevision: number;
}

export interface FakeUnitMembershipRecord {
  id: string;
  organizationId: string;
  unitId: string;
  employeeId: string;
  role: UnitMembershipRole;
}

export interface FakeEntitlementRecord {
  id: string;
  organizationId: string;
  productKey: string;
  status: EntitlementStatus;
  sourceType: EntitlementSourceType;
  startsAt: Date;
  endsAt: Date | null;
}

export interface FakeAppAccessRecord {
  id: string;
  organizationId: string;
  accountId: string;
  productKey: string;
  status: AppAccessStatus;
  revokedAt: Date | null;
}

export interface FakeRoleRecord {
  id: string;
  organizationId: string | null;
  productKey: string | null;
  name: string;
  permissions: string[];
  archivedAt: Date | null;
}

export interface FakeRoleAssignmentRecord {
  id: string;
  organizationId: string;
  accountId: string;
  roleId: string;
  scope: GrantScope;
  validFrom: Date | null;
  validUntil: Date | null;
}

export interface FakeOrganizationData {
  id: string;
  name: string;
  status: OrganizationStatus;
  ownerAccountId: string | null;
  domains: FakeDomainRecord[];
  units: Map<string, FakeUnitRecord>;
  employees: Map<string, FakeEmployeeRecord>;
  accounts: Map<string, FakeAccountRecord>;
  unitMemberships: Map<string, FakeUnitMembershipRecord>;
  entitlements: Map<string, FakeEntitlementRecord>;
  appAccesses: Map<string, FakeAppAccessRecord>;
  roles: Map<string, FakeRoleRecord>;
  roleAssignments: Map<string, FakeRoleAssignmentRecord>;
}

export interface CreateOrganizationInput {
  id?: string;
  name: string;
  status?: OrganizationStatus;
  /** Skrót dla pojedynczej głównej zweryfikowanej domeny firmy, np. `"acme.test"`. */
  domain?: string;
  domains?: readonly {
    domain: string;
    status?: DomainStatus;
    isPrimary?: boolean;
    verifiedAt?: Date | null;
  }[];
  ownerAccountId?: string | null;
}

export interface AddUnitInput {
  id?: string;
  name: string;
  type?: UnitType;
  parentId?: string | null;
  status?: UnitStatus;
}

export interface AddEmployeeBaseInput {
  id?: string;
  firstName: string;
  lastName: string;
  email?: string;
  workEmail?: string | null;
  jobTitle?: string | null;
  status?: EmployeeStatus;
  unitIds?: readonly string[];
  unitMemberships?: readonly { unitId: string; role?: UnitMembershipRole }[];
}

export interface AddEmployeeWithAccountInput extends AddEmployeeBaseInput {
  createAccount?: true;
  accountId?: string;
  accountStatus?: AccountStatus;
  isOwner?: boolean;
  authzRevision?: number;
  /** Produkty, do których od razu włączany jest aktywny `AppAccess`. */
  products?: readonly string[];
}

export interface AddEmployeeWithoutAccountInput extends AddEmployeeBaseInput {
  createAccount: false;
}

export interface CreatedEmployeeWithAccount extends FakeEmployeeRecord {
  readonly employeeId: string;
  readonly accountId: string;
  readonly account: FakeAccountRecord;
}

export interface CreatedEmployeeWithoutAccount extends FakeEmployeeRecord {
  readonly employeeId: string;
  readonly accountId: null;
  readonly account: null;
}

export interface AddUnitMemberInput {
  id?: string;
  unitId: string;
  employeeId: string;
  role?: UnitMembershipRole;
}

export interface GrantEntitlementOptions {
  id?: string;
  status?: EntitlementStatus;
  sourceType?: EntitlementSourceType;
  startsAt?: Date;
  endsAt?: Date | null;
}

export interface AddRoleInput {
  id?: string;
  name: string;
  /** Klucz produktu (np. `"timotime"`) albo `null` dla roli platformy Core. */
  product: string | null;
  permissions: readonly string[];
  archivedAt?: Date | null;
}

export interface AssignRoleInput {
  id?: string;
  accountId: string;
  roleId: string;
  scope: GrantScope;
  validFrom?: Date | string | null;
  validUntil?: Date | string | null;
}

export type OrganizationUserTokenOptions = Omit<
  SignUserTokenInput,
  "accountId" | "organizationId" | "employeeId" | "authzRevision"
> & {
  authzRevision?: number;
};

/** Płynny budowniczy stanu jednej firmy w atrapie Core. */
export interface FakeOrganizationBuilder {
  readonly id: string;
  readonly name: string;
  readonly data: FakeOrganizationData;
  addDomain(input: { domain: string; status?: DomainStatus; isPrimary?: boolean; verifiedAt?: Date | null }): this;
  addUnit(input: AddUnitInput): FakeUnitRecord;
  archiveUnit(unitId: string): this;
  addEmployee(input: AddEmployeeWithAccountInput): CreatedEmployeeWithAccount;
  addEmployee(input: AddEmployeeWithoutAccountInput): CreatedEmployeeWithoutAccount;
  addUnitMember(input: AddUnitMemberInput): FakeUnitMembershipRecord;
  setOwner(accountId: string | null): this;
  setAccountStatus(accountId: string, status: AccountStatus): this;
  bumpAuthzRevision(accountId: string, nextRevision?: number): number;
  grantEntitlement(productKey: string, options?: GrantEntitlementOptions): FakeEntitlementRecord;
  endEntitlement(productKey: string): this;
  grantAppAccess(accountId: string, productKey: string): FakeAppAccessRecord;
  revokeAppAccess(accountId: string, productKey: string): this;
  addRole(input: AddRoleInput): FakeRoleRecord;
  archiveRole(roleId: string): this;
  assignRole(input: AssignRoleInput): FakeRoleAssignmentRecord;
  revokeRoleAssignment(assignmentId: string): this;
  /** Podpisuje token dostępu użytkownika dla konta z tej firmy (automatycznie uzupełnia `org_id`, `employee_id`, `authz_rev`). */
  signUserToken(accountId: string, options: OrganizationUserTokenOptions): Promise<string>;
}

/** Deklaratywny opis firmy do jednorazowego zasilenia atrapy Core. */
export interface DeclarativeOrganizationSpec {
  id?: string;
  name: string;
  status?: OrganizationStatus;
  domain?: string;
  entitlements?: readonly (string | ({ productKey: string } & GrantEntitlementOptions))[];
  units?: readonly (AddUnitInput & { key: string; parentKey?: string })[];
  employees?: readonly {
    key: string;
    id?: string;
    accountId?: string;
    firstName: string;
    lastName: string;
    email?: string;
    workEmail?: string | null;
    jobTitle?: string | null;
    status?: EmployeeStatus;
    accountStatus?: AccountStatus;
    createAccount?: boolean;
    isOwner?: boolean;
    authzRevision?: number;
    unitKeys?: readonly string[];
    products?: readonly string[];
  }[];
  roles?: readonly (AddRoleInput & { key: string })[];
  assignments?: readonly {
    employeeKey: string;
    roleKey: string;
    scope:
      | { type: "ORGANIZATION" }
      | { type: "UNIT"; unitKey: string }
      | { type: "UNIT"; unitId: string }
      | { type: "RESOURCE"; resourceId: string };
    validFrom?: Date | string | null;
    validUntil?: Date | string | null;
  }[];
}

export interface SeededOrganization {
  readonly organization: FakeOrganizationBuilder;
  readonly units: Readonly<Record<string, FakeUnitRecord>>;
  readonly employees: Readonly<Record<string, CreatedEmployeeWithAccount | CreatedEmployeeWithoutAccount>>;
  readonly roles: Readonly<Record<string, FakeRoleRecord>>;
}

function toNullableDate(value: Date | string | null | undefined): Date | null {
  if (value === undefined || value === null) return null;
  return value instanceof Date ? value : new Date(value);
}

function slugEmail(firstName: string, lastName: string, domain: string): string {
  const clean = (part: string) =>
    part
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "");
  const local = [clean(firstName), clean(lastName)].filter(Boolean).join(".") || "user";
  return `${local}@${domain}`;
}

export function createOrganizationData(input: CreateOrganizationInput): FakeOrganizationData {
  const id = input.id ?? uuidv7();
  const domains: FakeDomainRecord[] = [];
  if (input.domain) {
    domains.push({
      domain: input.domain.toLowerCase(),
      status: "VERIFIED",
      isPrimary: true,
      verifiedAt: new Date("2026-01-01T00:00:00Z"),
    });
  }
  for (const item of input.domains ?? []) {
    const status = item.status ?? "VERIFIED";
    domains.push({
      domain: item.domain.toLowerCase(),
      status,
      isPrimary: item.isPrimary ?? domains.length === 0,
      verifiedAt: item.verifiedAt !== undefined ? item.verifiedAt : status === "VERIFIED" ? new Date() : null,
    });
  }

  return {
    id,
    name: input.name,
    status: input.status ?? "ACTIVE",
    ownerAccountId: input.ownerAccountId ?? null,
    domains,
    units: new Map(),
    employees: new Map(),
    accounts: new Map(),
    unitMemberships: new Map(),
    entitlements: new Map(),
    appAccesses: new Map(),
    roles: new Map(),
    roleAssignments: new Map(),
  };
}

export function createOrganizationBuilder(
  data: FakeOrganizationData,
  signToken: (input: SignUserTokenInput) => Promise<string>,
): FakeOrganizationBuilder {
  const primaryDomain = () => data.domains[0]?.domain ?? "example.test";

  function addUnitMember(input: AddUnitMemberInput): FakeUnitMembershipRecord {
    const unit = data.units.get(input.unitId);
    if (!unit) {
      throw new Error(`Nieznana jednostka "${input.unitId}" w firmie "${data.name}"`);
    }
    const employee = data.employees.get(input.employeeId);
    if (!employee) {
      throw new Error(`Nieznany pracownik "${input.employeeId}" w firmie "${data.name}"`);
    }
    for (const existing of data.unitMemberships.values()) {
      if (existing.unitId === input.unitId && existing.employeeId === input.employeeId) {
        existing.role = input.role ?? existing.role;
        return existing;
      }
    }
    const record: FakeUnitMembershipRecord = {
      id: input.id ?? uuidv7(),
      organizationId: data.id,
      unitId: input.unitId,
      employeeId: input.employeeId,
      role: input.role ?? "MEMBER",
    };
    data.unitMemberships.set(record.id, record);
    return record;
  }

  function grantAppAccess(accountId: string, productKey: string): FakeAppAccessRecord {
    if (!data.accounts.has(accountId)) {
      throw new Error(`Nieznane konto "${accountId}" w firmie "${data.name}"`);
    }
    for (const existing of data.appAccesses.values()) {
      if (existing.accountId === accountId && existing.productKey === productKey && existing.status === "ACTIVE") {
        return existing;
      }
    }
    const record: FakeAppAccessRecord = {
      id: uuidv7(),
      organizationId: data.id,
      accountId,
      productKey,
      status: "ACTIVE",
      revokedAt: null,
    };
    data.appAccesses.set(record.id, record);
    return record;
  }

  function addEmployee(input: AddEmployeeWithAccountInput): CreatedEmployeeWithAccount;
  function addEmployee(input: AddEmployeeWithoutAccountInput): CreatedEmployeeWithoutAccount;
  function addEmployee(
    input: AddEmployeeWithAccountInput | AddEmployeeWithoutAccountInput,
  ): CreatedEmployeeWithAccount | CreatedEmployeeWithoutAccount {
    const employeeId = input.id ?? uuidv7();
    const defaultEmail = input.email ?? slugEmail(input.firstName, input.lastName, primaryDomain());
    const workEmail = input.workEmail !== undefined ? input.workEmail : defaultEmail;

    let account: FakeAccountRecord | null = null;
    if (input.createAccount !== false) {
      const accountId = input.accountId ?? uuidv7();
      account = {
        id: accountId,
        organizationId: data.id,
        employeeId,
        email: defaultEmail,
        status: input.accountStatus ?? "ACTIVE",
        authzRevision: input.authzRevision ?? 0,
      };
      data.accounts.set(accountId, account);
      if (input.isOwner) {
        data.ownerAccountId = accountId;
      }
    }

    const employee: FakeEmployeeRecord = {
      id: employeeId,
      organizationId: data.id,
      firstName: input.firstName,
      lastName: input.lastName,
      workEmail,
      jobTitle: input.jobTitle ?? null,
      status: input.status ?? "ACTIVE",
      accountId: account?.id ?? null,
    };
    data.employees.set(employeeId, employee);

    for (const unitId of input.unitIds ?? []) {
      addUnitMember({ unitId, employeeId, role: "MEMBER" });
    }
    for (const membership of input.unitMemberships ?? []) {
      addUnitMember({ unitId: membership.unitId, employeeId, role: membership.role ?? "MEMBER" });
    }

    if (account && input.createAccount !== false) {
      for (const productKey of input.products ?? []) {
        grantAppAccess(account.id, productKey);
      }
      return {
        ...employee,
        employeeId,
        accountId: account.id,
        account,
      };
    }

    return {
      ...employee,
      employeeId,
      accountId: null,
      account: null,
    };
  }

  const builder: FakeOrganizationBuilder = {
    get id() {
      return data.id;
    },
    get name() {
      return data.name;
    },
    data,

    addDomain(input) {
      const status = input.status ?? "VERIFIED";
      data.domains.push({
        domain: input.domain.toLowerCase(),
        status,
        isPrimary: input.isPrimary ?? data.domains.length === 0,
        verifiedAt: input.verifiedAt !== undefined ? input.verifiedAt : status === "VERIFIED" ? new Date() : null,
      });
      return builder;
    },

    addUnit(input) {
      if (input.parentId !== undefined && input.parentId !== null && !data.units.has(input.parentId)) {
        throw new Error(`Nieznana jednostka nadrzędna "${input.parentId}" w firmie "${data.name}"`);
      }
      const record: FakeUnitRecord = {
        id: input.id ?? uuidv7(),
        organizationId: data.id,
        parentId: input.parentId ?? null,
        name: input.name,
        type: input.type ?? "TEAM",
        status: input.status ?? "ACTIVE",
      };
      data.units.set(record.id, record);
      return record;
    },

    archiveUnit(unitId) {
      const unit = data.units.get(unitId);
      if (!unit) {
        throw new Error(`Nieznana jednostka "${unitId}" w firmie "${data.name}"`);
      }
      unit.status = "ARCHIVED";
      return builder;
    },

    addEmployee,
    addUnitMember,

    setOwner(accountId) {
      if (accountId !== null && !data.accounts.has(accountId)) {
        throw new Error(`Nieznane konto "${accountId}" w firmie "${data.name}"`);
      }
      data.ownerAccountId = accountId;
      return builder;
    },

    setAccountStatus(accountId, status) {
      const account = data.accounts.get(accountId);
      if (!account) {
        throw new Error(`Nieznane konto "${accountId}" w firmie "${data.name}"`);
      }
      account.status = status;
      return builder;
    },

    bumpAuthzRevision(accountId, nextRevision) {
      const account = data.accounts.get(accountId);
      if (!account) {
        throw new Error(`Nieznane konto "${accountId}" w firmie "${data.name}"`);
      }
      account.authzRevision = nextRevision ?? account.authzRevision + 1;
      return account.authzRevision;
    },

    grantEntitlement(productKey, options = {}) {
      for (const existing of data.entitlements.values()) {
        if (existing.productKey === productKey && existing.status !== "ENDED") {
          existing.status = options.status ?? "ACTIVE";
          existing.sourceType = options.sourceType ?? existing.sourceType;
          existing.startsAt = options.startsAt ?? existing.startsAt;
          existing.endsAt = options.endsAt !== undefined ? options.endsAt : existing.endsAt;
          return existing;
        }
      }
      const record: FakeEntitlementRecord = {
        id: options.id ?? uuidv7(),
        organizationId: data.id,
        productKey,
        status: options.status ?? "ACTIVE",
        sourceType: options.sourceType ?? "MANUAL",
        startsAt: options.startsAt ?? new Date(0),
        endsAt: options.endsAt ?? null,
      };
      data.entitlements.set(record.id, record);
      return record;
    },

    endEntitlement(productKey) {
      for (const existing of data.entitlements.values()) {
        if (existing.productKey === productKey && existing.status !== "ENDED") {
          existing.status = "ENDED";
          existing.endsAt = new Date();
        }
      }
      return builder;
    },

    grantAppAccess,

    revokeAppAccess(accountId, productKey) {
      for (const existing of data.appAccesses.values()) {
        if (existing.accountId === accountId && existing.productKey === productKey && existing.status === "ACTIVE") {
          existing.status = "REVOKED";
          existing.revokedAt = new Date();
        }
      }
      return builder;
    },

    addRole(input) {
      const record: FakeRoleRecord = {
        id: input.id ?? uuidv7(),
        organizationId: data.id,
        productKey: input.product,
        name: input.name,
        permissions: [...input.permissions],
        archivedAt: input.archivedAt ?? null,
      };
      data.roles.set(record.id, record);
      return record;
    },

    archiveRole(roleId) {
      const role = data.roles.get(roleId);
      if (!role) {
        throw new Error(`Nieznana rola "${roleId}" w firmie "${data.name}"`);
      }
      role.archivedAt = new Date();
      return builder;
    },

    assignRole(input) {
      if (!data.accounts.has(input.accountId)) {
        throw new Error(`Nieznane konto "${input.accountId}" w firmie "${data.name}"`);
      }
      if (!data.roles.has(input.roleId)) {
        throw new Error(`Nieznana rola "${input.roleId}" w firmie "${data.name}"`);
      }
      const record: FakeRoleAssignmentRecord = {
        id: input.id ?? uuidv7(),
        organizationId: data.id,
        accountId: input.accountId,
        roleId: input.roleId,
        scope: input.scope,
        validFrom: toNullableDate(input.validFrom),
        validUntil: toNullableDate(input.validUntil),
      };
      data.roleAssignments.set(record.id, record);
      return record;
    },

    revokeRoleAssignment(assignmentId) {
      data.roleAssignments.delete(assignmentId);
      return builder;
    },

    signUserToken(accountId, options) {
      const account = data.accounts.get(accountId);
      if (!account) {
        throw new Error(`Nieznane konto "${accountId}" w firmie "${data.name}"`);
      }
      return signToken({
        ...options,
        accountId: account.id,
        organizationId: data.id,
        employeeId: account.employeeId,
        authzRevision: options.authzRevision ?? account.authzRevision,
      });
    },
  };

  return builder;
}

/** Wypełnia firmę na podstawie deklaratywnego obiektu (jednostki, pracownicy, role i przypisania). */
export function applyOrganizationSpec(
  org: FakeOrganizationBuilder,
  spec: DeclarativeOrganizationSpec,
): SeededOrganization {
  const units: Record<string, FakeUnitRecord> = {};
  const employees: Record<string, CreatedEmployeeWithAccount | CreatedEmployeeWithoutAccount> = {};
  const roles: Record<string, FakeRoleRecord> = {};

  for (const entitlement of spec.entitlements ?? []) {
    if (typeof entitlement === "string") {
      org.grantEntitlement(entitlement);
    } else {
      const { productKey, ...opts } = entitlement;
      org.grantEntitlement(productKey, opts);
    }
  }

  for (const unitSpec of spec.units ?? []) {
    const parentId =
      unitSpec.parentId !== undefined
        ? unitSpec.parentId
        : unitSpec.parentKey !== undefined
          ? units[unitSpec.parentKey]?.id
          : null;
    if (unitSpec.parentKey !== undefined && !parentId) {
      throw new Error(`Nieznany parentKey jednostki: "${unitSpec.parentKey}"`);
    }
    units[unitSpec.key] = org.addUnit({
      ...(unitSpec.id !== undefined ? { id: unitSpec.id } : {}),
      name: unitSpec.name,
      ...(unitSpec.type !== undefined ? { type: unitSpec.type } : {}),
      parentId: parentId ?? null,
      ...(unitSpec.status !== undefined ? { status: unitSpec.status } : {}),
    });
  }

  for (const empSpec of spec.employees ?? []) {
    const unitIds = (empSpec.unitKeys ?? []).map((key) => {
      const found = units[key];
      if (!found) throw new Error(`Nieznany klucz jednostki "${key}" dla pracownika "${empSpec.key}"`);
      return found.id;
    });
    if (empSpec.createAccount === false) {
      employees[empSpec.key] = org.addEmployee({
        createAccount: false,
        ...(empSpec.id !== undefined ? { id: empSpec.id } : {}),
        firstName: empSpec.firstName,
        lastName: empSpec.lastName,
        ...(empSpec.email !== undefined ? { email: empSpec.email } : {}),
        ...(empSpec.workEmail !== undefined ? { workEmail: empSpec.workEmail } : {}),
        ...(empSpec.jobTitle !== undefined ? { jobTitle: empSpec.jobTitle } : {}),
        ...(empSpec.status !== undefined ? { status: empSpec.status } : {}),
        unitIds,
      });
    } else {
      employees[empSpec.key] = org.addEmployee({
        ...(empSpec.id !== undefined ? { id: empSpec.id } : {}),
        ...(empSpec.accountId !== undefined ? { accountId: empSpec.accountId } : {}),
        firstName: empSpec.firstName,
        lastName: empSpec.lastName,
        ...(empSpec.email !== undefined ? { email: empSpec.email } : {}),
        ...(empSpec.workEmail !== undefined ? { workEmail: empSpec.workEmail } : {}),
        ...(empSpec.jobTitle !== undefined ? { jobTitle: empSpec.jobTitle } : {}),
        ...(empSpec.status !== undefined ? { status: empSpec.status } : {}),
        ...(empSpec.accountStatus !== undefined ? { accountStatus: empSpec.accountStatus } : {}),
        ...(empSpec.isOwner !== undefined ? { isOwner: empSpec.isOwner } : {}),
        ...(empSpec.authzRevision !== undefined ? { authzRevision: empSpec.authzRevision } : {}),
        unitIds,
        ...(empSpec.products !== undefined ? { products: empSpec.products } : {}),
      });
    }
  }

  for (const roleSpec of spec.roles ?? []) {
    roles[roleSpec.key] = org.addRole({
      ...(roleSpec.id !== undefined ? { id: roleSpec.id } : {}),
      name: roleSpec.name,
      product: roleSpec.product,
      permissions: roleSpec.permissions,
      ...(roleSpec.archivedAt !== undefined ? { archivedAt: roleSpec.archivedAt } : {}),
    });
  }

  for (const assignSpec of spec.assignments ?? []) {
    const emp = employees[assignSpec.employeeKey];
    if (!emp || !emp.accountId) {
      throw new Error(`Nieznane konto pracownika "${assignSpec.employeeKey}" w przypisaniu roli`);
    }
    const role = roles[assignSpec.roleKey];
    if (!role) {
      throw new Error(`Nieznany klucz roli "${assignSpec.roleKey}" w przypisaniu roli`);
    }
    let scope: GrantScope;
    if (assignSpec.scope.type === "ORGANIZATION") {
      scope = { type: "ORGANIZATION" };
    } else if (assignSpec.scope.type === "RESOURCE") {
      scope = { type: "RESOURCE", resourceId: assignSpec.scope.resourceId };
    } else if ("unitKey" in assignSpec.scope) {
      const unit = units[assignSpec.scope.unitKey];
      if (!unit) throw new Error(`Nieznany klucz jednostki "${assignSpec.scope.unitKey}" w przypisaniu roli`);
      scope = { type: "UNIT", unitId: unit.id };
    } else {
      scope = { type: "UNIT", unitId: assignSpec.scope.unitId };
    }

    org.assignRole({
      accountId: emp.accountId,
      roleId: role.id,
      scope,
      ...(assignSpec.validFrom !== undefined ? { validFrom: assignSpec.validFrom } : {}),
      ...(assignSpec.validUntil !== undefined ? { validUntil: assignSpec.validUntil } : {}),
    });
  }

  return { organization: org, units, employees, roles };
}
