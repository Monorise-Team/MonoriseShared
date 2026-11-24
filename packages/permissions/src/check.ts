import { PermissionError } from "./errors.js";
import { tryParsePermissionKey } from "./keys.js";
import type { GrantScope, PermissionGrant, PermissionSnapshot, PermissionTarget } from "./snapshot.js";

/** Opcje oceny uprawnień w `can`, `assertCan` i `scopeOf`. */
export interface CheckOptions {
  /** Czas odniesienia dla ról czasowych (`validFrom`, `validUntil`). Domyślnie `new Date()`. */
  readonly now?: Date;
}

/** Opcje sprawdzania delegowania w `canDelegate`. */
export interface DelegateOptions extends CheckOptions {
  /**
   * Jednostki organizacyjne, do których należy zasób przy delegowaniu zakresu `RESOURCE`.
   * Pozwala sprawdzić, czy administrator z zakresem `UNIT` obejmuje ten zasób.
   */
  readonly resourceUnitIds?: readonly string[];
}

/** Wynik `scopeOf`: efektywny zakres dostępu konta do danego uprawnienia (np. do filtrowania list). */
export type AccessScope =
  | { readonly type: "ORGANIZATION" }
  | { readonly type: "LIMITED"; readonly unitIds: readonly string[]; readonly resourceIds: readonly string[] }
  | { readonly type: "NONE" };

function buildParentMap(snapshot: PermissionSnapshot): Map<string, string | null> {
  const parentById = new Map<string, string | null>();
  for (const unit of snapshot.units) {
    parentById.set(unit.id, unit.parentId);
  }
  return parentById;
}

function isGrantValidAt(grant: PermissionGrant, nowMs: number): boolean {
  if (grant.validFrom !== undefined && grant.validFrom !== null) {
    const fromMs = Date.parse(grant.validFrom);
    if (Number.isNaN(fromMs) || fromMs > nowMs) {
      return false;
    }
  }
  if (grant.validUntil !== undefined && grant.validUntil !== null) {
    const untilMs = Date.parse(grant.validUntil);
    if (Number.isNaN(untilMs) || nowMs >= untilMs) {
      return false;
    }
  }
  return true;
}

/**
 * Sprawdza iteracyjnie (bez rekurencji), czy `targetUnitId` to `grantUnitId` lub jego potomek w drzewie.
 * Chroni przed cyklami w `parentId` za pomocą zbioru odwiedzonych węzłów.
 * Nieznany `targetUnitId` albo nieznany `grantUnitId` zawsze daje `false`.
 */
function isUnitCoveredBy(targetUnitId: string, grantUnitId: string, parentById: Map<string, string | null>): boolean {
  if (!parentById.has(targetUnitId) || !parentById.has(grantUnitId)) {
    return false;
  }

  const visited = new Set<string>();
  let current: string | null = targetUnitId;

  while (current !== null) {
    if (visited.has(current)) {
      return false;
    }
    visited.add(current);

    if (current === grantUnitId) {
      return true;
    }
    if (!parentById.has(current)) {
      return false;
    }
    current = parentById.get(current) ?? null;
  }

  return false;
}

function isNonBlankString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function compareLex(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Sprawdza, czy konto z migawki `snapshot` ma uprawnienie `permission` dla wskazanego `target`.
 * Nigdy nie rzuca wyjątku: niepoprawny klucz, brak produktu, nieznana jednostka czy pusty cel dają `false`.
 */
export function can(
  snapshot: PermissionSnapshot,
  permission: string,
  target?: PermissionTarget,
  options?: CheckOptions,
): boolean {
  const parsed = tryParsePermissionKey(permission);
  if (parsed === null) {
    return false;
  }

  if (!snapshot.products.includes(parsed.product)) {
    return false;
  }

  if (snapshot.isOwner) {
    return true;
  }

  const nowMs = (options?.now ?? new Date()).getTime();
  if (Number.isNaN(nowMs)) {
    return false;
  }

  let parentById: Map<string, string | null> | null = null;
  const getParentMap = () => {
    parentById ??= buildParentMap(snapshot);
    return parentById;
  };

  for (const grant of snapshot.grants) {
    if (grant.permission !== permission || !isGrantValidAt(grant, nowMs)) {
      continue;
    }

    const { scope } = grant;
    if (scope.type === "ORGANIZATION") {
      return true;
    }

    if (target === undefined) {
      if (scope.type === "UNIT") {
        if (getParentMap().has(scope.unitId)) {
          return true;
        }
      } else if (isNonBlankString(scope.resourceId)) {
        return true;
      }
      continue;
    }

    if (scope.type === "UNIT") {
      const targetUnitIds = target.unitIds;
      if (!targetUnitIds || targetUnitIds.length === 0) {
        continue;
      }
      const parents = getParentMap();
      for (const targetUnitId of targetUnitIds) {
        if (isUnitCoveredBy(targetUnitId, scope.unitId, parents)) {
          return true;
        }
      }
      continue;
    }

    if (isNonBlankString(scope.resourceId) && target.resourceId === scope.resourceId) {
      return true;
    }
  }

  return false;
}

/**
 * Jak `can`, ale przy odmowie rzuca `PermissionError` (HTTP 403, `PERMISSION_DENIED`).
 */
export function assertCan(
  snapshot: PermissionSnapshot,
  permission: string,
  target?: PermissionTarget,
  options?: CheckOptions,
): void {
  if (!can(snapshot, permission, target, options)) {
    throw new PermissionError(permission);
  }
}

/**
 * Zwraca efektywny zakres uprawnienia dla filtrowania list (`ORGANIZATION`, `LIMITED` albo `NONE`).
 * W wariancie `LIMITED` rozwija poddrzewa przyznanych jednostek do posortowanej listy unikalnych identyfikatorów.
 */
export function scopeOf(snapshot: PermissionSnapshot, permission: string, options?: CheckOptions): AccessScope {
  const parsed = tryParsePermissionKey(permission);
  if (parsed === null) {
    return { type: "NONE" };
  }

  if (!snapshot.products.includes(parsed.product)) {
    return { type: "NONE" };
  }

  if (snapshot.isOwner) {
    return { type: "ORGANIZATION" };
  }

  const nowMs = (options?.now ?? new Date()).getTime();
  if (Number.isNaN(nowMs)) {
    return { type: "NONE" };
  }

  const grantedUnitIds = new Set<string>();
  const resourceIds = new Set<string>();

  for (const grant of snapshot.grants) {
    if (grant.permission !== permission || !isGrantValidAt(grant, nowMs)) {
      continue;
    }

    const { scope } = grant;
    if (scope.type === "ORGANIZATION") {
      return { type: "ORGANIZATION" };
    }
    if (scope.type === "UNIT") {
      grantedUnitIds.add(scope.unitId);
    } else if (isNonBlankString(scope.resourceId)) {
      resourceIds.add(scope.resourceId);
    }
  }

  const expandedUnitIds = new Set<string>();
  if (grantedUnitIds.size > 0) {
    const parentById = buildParentMap(snapshot);
    const childrenById = new Map<string, string[]>();

    for (const [unitId, parentId] of parentById) {
      if (parentId !== null && parentById.has(parentId)) {
        const siblings = childrenById.get(parentId);
        if (siblings) {
          siblings.push(unitId);
        } else {
          childrenById.set(parentId, [unitId]);
        }
      }
    }

    const stack: string[] = [];
    for (const unitId of grantedUnitIds) {
      if (parentById.has(unitId) && !expandedUnitIds.has(unitId)) {
        expandedUnitIds.add(unitId);
        stack.push(unitId);
      }
    }

    while (stack.length > 0) {
      const current = stack.pop()!;
      const children = childrenById.get(current);
      if (!children) continue;
      for (const childId of children) {
        if (!expandedUnitIds.has(childId)) {
          expandedUnitIds.add(childId);
          stack.push(childId);
        }
      }
    }
  }

  if (expandedUnitIds.size === 0 && resourceIds.size === 0) {
    return { type: "NONE" };
  }

  return {
    type: "LIMITED",
    unitIds: [...expandedUnitIds].sort(compareLex),
    resourceIds: [...resourceIds].sort(compareLex),
  };
}

/**
 * Sprawdza zasadę delegowania (ADR-0035): administrator może nadać innym wyłącznie uprawnienia,
 * które sam posiada, i wyłącznie w granicach własnego zakresu.
 *
 * Ta funkcja weryfikuje wyłącznie regułę „co masz, w swoim zakresie”. To, czy konto w ogóle
 * ma prawo przypisywać role, jest osobnym uprawnieniem sprawdzanym poza tą funkcją.
 */
export function canDelegate(
  snapshot: PermissionSnapshot,
  permission: string,
  scope: GrantScope,
  options?: DelegateOptions,
): boolean {
  const parsed = tryParsePermissionKey(permission);
  if (parsed === null) {
    return false;
  }

  if (!snapshot.products.includes(parsed.product)) {
    return false;
  }

  if (scope.type === "RESOURCE") {
    if (!isNonBlankString(scope.resourceId)) {
      return false;
    }
    return can(
      snapshot,
      permission,
      { resourceId: scope.resourceId, unitIds: options?.resourceUnitIds ?? [] },
      options,
    );
  }

  if (scope.type === "UNIT") {
    const parentById = buildParentMap(snapshot);
    if (!parentById.has(scope.unitId)) {
      return false;
    }
    if (snapshot.isOwner) {
      return true;
    }

    const nowMs = (options?.now ?? new Date()).getTime();
    if (Number.isNaN(nowMs)) {
      return false;
    }

    for (const grant of snapshot.grants) {
      if (grant.permission !== permission || !isGrantValidAt(grant, nowMs)) {
        continue;
      }
      if (grant.scope.type === "ORGANIZATION") {
        return true;
      }
      if (grant.scope.type === "UNIT" && isUnitCoveredBy(scope.unitId, grant.scope.unitId, parentById)) {
        return true;
      }
    }
    return false;
  }

  // scope.type === "ORGANIZATION"
  if (snapshot.isOwner) {
    return true;
  }

  const nowMs = (options?.now ?? new Date()).getTime();
  if (Number.isNaN(nowMs)) {
    return false;
  }

  for (const grant of snapshot.grants) {
    if (grant.permission === permission && grant.scope.type === "ORGANIZATION" && isGrantValidAt(grant, nowMs)) {
      return true;
    }
  }

  return false;
}
