import { z } from "zod";
import { permissionKeySchema, productNameSchema } from "./keys.js";

const isoDatetimeSchema = z.iso.datetime({ offset: true });

/** Zakres pojedynczego nadania uprawnienia (ADR-0033). */
export const grantScopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ORGANIZATION") }),
  z.object({ type: z.literal("UNIT"), unitId: z.uuid() }),
  z.object({
    type: z.literal("RESOURCE"),
    resourceId: z
      .string()
      .min(1, "Resource ID must not be empty")
      .refine((value) => value.trim().length > 0, "Resource ID must not be blank"),
  }),
]);
export type GrantScope = z.infer<typeof grantScopeSchema>;

/** Spłaszczone przez Core pojedyncze nadanie uprawnienia z zakresem i opcjonalnym okresem ważności. */
export const permissionGrantSchema = z.object({
  permission: permissionKeySchema,
  scope: grantScopeSchema,
  validFrom: isoDatetimeSchema.nullish(),
  validUntil: isoDatetimeSchema.nullish(),
});
export type PermissionGrant = z.infer<typeof permissionGrantSchema>;

/** Węzeł drzewa jednostek organizacyjnych firmy (ADR-0032). */
export const snapshotUnitSchema = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
});
export type SnapshotUnit = z.infer<typeof snapshotUnitSchema>;

/**
 * Migawka uprawnień konta dostarczana przez Core (format przyjazny JSON i pamięci podręcznej).
 * Zawiera aktywne dla firmy i konta produkty, spłaszczone nadania uprawnień oraz pełne drzewo jednostek firmy.
 */
export const permissionSnapshotSchema = z.object({
  accountId: z.uuid(),
  organizationId: z.uuid(),
  authzRevision: z.number().int().nonnegative(),
  isOwner: z.boolean(),
  products: z.array(productNameSchema),
  grants: z.array(permissionGrantSchema),
  units: z.array(snapshotUnitSchema),
});
export type PermissionSnapshot = z.infer<typeof permissionSnapshotSchema>;

/** Cel operacji sprawdzanej w `can` i `assertCan`. */
export interface PermissionTarget {
  /** Jednostki organizacyjne, do których należy cel (np. zespoły pracownika). Wystarczy pokrycie jednej z nich. */
  readonly unitIds?: readonly string[];
  /** Identyfikator pojedynczego zasobu produktu (dla zakresu `RESOURCE`). */
  readonly resourceId?: string;
}
