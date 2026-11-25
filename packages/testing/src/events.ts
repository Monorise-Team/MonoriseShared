import { organizationPermissionsChanged, type EventEnvelope } from "@monorise-team/events";

export interface BuildPermissionsChangedEventInput {
  /** Identyfikator firmy (`organizationId`, UUID). */
  organizationId: string;
  /** Identyfikator konta, którego uprawnienia się zmieniły (`resourceId`, UUID). */
  accountId: string;
  /** Nowa wersja uprawnień konta (`data.authzRevision`). */
  authzRevision: number;
  /** Wersja zasobu (domyślnie równa `authzRevision`, jak w Core `accounts.authzRevision`). */
  resourceVersion?: number;
  /** Źródło zdarzenia (domyślnie `"core"`). */
  source?: string;
  /** Opcjonalny jawny identyfikator zdarzenia (domyślnie generowany UUIDv7). */
  id?: string;
  /** Opcjonalna data wystąpienia zdarzenia (domyślnie bieżący czas). */
  occurredAt?: Date;
  /** Opcjonalny 32-znakowy hex `traceId`. */
  traceId?: string;
}

export type PermissionsChangedEvent = EventEnvelope<"organization.permissions.changed", { authzRevision: number }, 1>;

/**
 * Buduje zwalidowaną kopertę zdarzenia `organization.permissions.changed` (v1) z katalogu
 * `@monorise-team/events`, w dokładnie takim formacie jak zapisuje je MonoriseCore do `outbox_events`.
 */
export function buildPermissionsChangedEvent(input: BuildPermissionsChangedEventInput): PermissionsChangedEvent {
  return organizationPermissionsChanged.create({
    source: input.source ?? "core",
    organizationId: input.organizationId,
    resourceType: "account",
    resourceId: input.accountId,
    resourceVersion: input.resourceVersion ?? input.authzRevision,
    data: {
      authzRevision: input.authzRevision,
    },
    ...(input.id !== undefined ? { id: input.id } : {}),
    ...(input.occurredAt !== undefined ? { occurredAt: input.occurredAt } : {}),
    ...(input.traceId !== undefined ? { traceId: input.traceId } : {}),
  });
}
