import { z } from "zod";

/** Wzorzec nazwy produktu (pierwszy segment klucza uprawnienia), np. `timotime`. */
export const PRODUCT_NAME_REGEX = /^[a-z][a-z0-9]*$/;

/** Wzorzec lokalnej nazwy uprawnienia (`resource.action` lub więcej segmentów), np. `entries.approve`. */
export const PERMISSION_NAME_REGEX = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

/** Wzorzec pełnego klucza uprawnienia (`<product>.<resource>.<action>`), np. `timotime.entries.approve`. */
export const PERMISSION_KEY_REGEX = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*){2,}$/;

/** Schemat nazwy produktu. */
export const productNameSchema = z.string().regex(PRODUCT_NAME_REGEX, "Invalid product name");

/** Schemat pełnego klucza uprawnienia (`<product>.<resource>.<action>`). */
export const permissionKeySchema = z.string().regex(PERMISSION_KEY_REGEX, "Invalid permission key");

/** Pojedynczy wpis manifestu uprawnień rejestrowanego w Core (ADR-0036). */
export const permissionManifestEntrySchema = z.object({
  key: permissionKeySchema,
  description: z.string().trim().min(1, "Permission description must not be empty"),
});
export type PermissionManifestEntry = Readonly<z.infer<typeof permissionManifestEntrySchema>>;

/**
 * Schemat manifestu uprawnień produktu wysyłanego do rejestracji w Core (ADR-0036).
 * Wymaga co najmniej jednego wpisu, unikalnych kluczy i tego samego prefiksu produktu we wszystkich kluczach.
 */
export const permissionManifestSchema = z
  .array(permissionManifestEntrySchema)
  .min(1, "Permission manifest must contain at least one entry")
  .superRefine((entries, ctx) => {
    const seen = new Set<string>();
    let expectedProduct: string | null = null;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      if (seen.has(entry.key)) {
        ctx.addIssue({
          code: "custom",
          path: [i, "key"],
          message: `Duplicate permission key: "${entry.key}"`,
        });
      } else {
        seen.add(entry.key);
      }

      const parsed = tryParsePermissionKey(entry.key);
      if (parsed === null) continue;

      if (expectedProduct === null) {
        expectedProduct = parsed.product;
      } else if (parsed.product !== expectedProduct) {
        ctx.addIssue({
          code: "custom",
          path: [i, "key"],
          message: `Permission key "${entry.key}" belongs to product "${parsed.product}", expected "${expectedProduct}"`,
        });
      }
    }
  });
export type PermissionManifest = readonly PermissionManifestEntry[];

/** Wynik rozbicia pełnego klucza uprawnienia na produkt i nazwę lokalną. */
export interface ParsedPermissionKey {
  readonly product: string;
  readonly name: string;
}

/** Wewnętrzne parsowanie klucza bez rzucania wyjątku (używane w `can`, `scopeOf`, `canDelegate`). */
export function tryParsePermissionKey(key: string): ParsedPermissionKey | null {
  if (typeof key !== "string" || !PERMISSION_KEY_REGEX.test(key)) {
    return null;
  }
  const dotIndex = key.indexOf(".");
  return {
    product: key.slice(0, dotIndex),
    name: key.slice(dotIndex + 1),
  };
}

/**
 * Rozbija pełny klucz uprawnienia `<product>.<resource>.<action>` na nazwę produktu i część lokalną.
 * Rzuca `TypeError`, jeśli klucz nie spełnia formatu.
 */
export function parsePermissionKey(key: string): ParsedPermissionKey {
  const parsed = tryParsePermissionKey(key);
  if (parsed === null) {
    throw new TypeError(`Invalid permission key: "${String(key)}"`);
  }
  return parsed;
}

/** Zestaw uprawnień zadeklarowanych przez produkt (wynik `definePermissions`). */
export interface ProductPermissions<TProduct extends string, TDefs extends Record<string, string>> {
  readonly product: TProduct;
  readonly keys: { readonly [K in keyof TDefs & string]: `${TProduct}.${K}` };
  readonly manifest: readonly {
    readonly key: `${TProduct}.${keyof TDefs & string}`;
    readonly description: string;
  }[];
}

/** Unia wszystkich pełnych kluczy uprawnień z deklaracji utworzonej przez `definePermissions`. */
export type PermissionKeyOf<T> = T extends { readonly keys: Record<string, infer K extends string> } ? K : never;

/**
 * Deklaruje uprawnienia produktu w kodzie (ADR-0036). Zwraca zamrożony obiekt z nazwą produktu,
 * typowanymi kluczami (`keys`) i manifestem do rejestracji w Core (`manifest`).
 */
export function definePermissions<const TProduct extends string, const TDefs extends Record<string, string>>(
  product: TProduct,
  definitions: TDefs,
): ProductPermissions<TProduct, TDefs> {
  if (typeof product !== "string" || !PRODUCT_NAME_REGEX.test(product)) {
    throw new TypeError(`Invalid product name: "${String(product)}"`);
  }
  if (definitions === null || typeof definitions !== "object" || Array.isArray(definitions)) {
    throw new TypeError(`Permission definitions for product "${product}" must be a plain object`);
  }

  const entries = Object.entries(definitions);
  if (entries.length === 0) {
    throw new TypeError(`Permission definitions for product "${product}" must not be empty`);
  }

  const keys: Record<string, string> = {};
  const manifest: Array<{ readonly key: string; readonly description: string }> = [];

  for (const [name, description] of entries) {
    if (!PERMISSION_NAME_REGEX.test(name)) {
      throw new TypeError(`Invalid permission name "${name}" for product "${product}"`);
    }
    if (typeof description !== "string" || description.trim().length === 0) {
      throw new TypeError(`Invalid description for permission "${product}.${name}": must be a non-empty string`);
    }

    const fullKey = `${product}.${name}`;
    keys[name] = fullKey;
    manifest.push(Object.freeze({ key: fullKey, description: description.trim() }));
  }

  return Object.freeze({
    product,
    keys: Object.freeze(keys) as { readonly [K in keyof TDefs & string]: `${TProduct}.${K}` },
    manifest: Object.freeze(manifest) as readonly {
      readonly key: `${TProduct}.${keyof TDefs & string}`;
      readonly description: string;
    }[],
  });
}
