import { z } from "zod";

/**
 * Pola tokenu dostępu wydanego przez MonoriseCore (ADR-0023). Uprawnień w tokenie nie ma: serwer pobiera je
 * z Core, a inny `authz_rev` oznacza, że trzeba je pobrać ponownie.
 *
 * W tokenach OAuth dla produktów `sid` dokłada sam serwer OAuth (znika, gdy sesja Core już nie istnieje),
 * a `amr` na razie nie występuje: biblioteka logowania w Core traktuje je jako pole zastrzeżone.
 */
export const AccessTokenClaims = z.object({
  iss: z.string(),
  sub: z.uuid(),
  aud: z.union([z.string(), z.array(z.string())]),
  org_id: z.uuid(),
  employee_id: z.uuid(),
  sid: z.string().optional(),
  amr: z.array(z.string()).default([]),
  authz_rev: z.number().int().nonnegative(),
  client_id: z.string().optional(),
  scope: z.string().optional(),
  iat: z.number(),
  exp: z.number(),
});
export type AccessTokenClaims = z.infer<typeof AccessTokenClaims>;

/**
 * Kto wykonuje żądanie. Konto, firma i pracownik pochodzą zawsze z tokenu albo sesji, nigdy z treści
 * żądania, adresu ani formularza (ADR-0037).
 */
export interface AuthContext {
  /** Konto Monorise (`sub`). */
  accountId: string;
  /** Firma (`org_id`): każde zapytanie o dane firmy idzie z tą wartością. */
  organizationId: string;
  /** Pracownik powiązany z kontem (`employee_id`). */
  employeeId: string;
  /** Sesja logowania w Core (`sid`), jeśli jeszcze istnieje. */
  sessionId: string | null;
  /** Wersja uprawnień konta (`authz_rev`). */
  authzRevision: number;
  /** Metody logowania (`amr`), np. hasło i MFA; w tokenach OAuth na razie pusta lista. */
  methods: string[];
  /** Aplikacja, której wydano token (`client_id`). */
  clientId: string | null;
  /** Zakresy OAuth (`scope`). */
  scopes: string[];
  /** Koniec ważności tokenu. */
  expiresAt: Date;
}

export function toAuthContext(claims: AccessTokenClaims): AuthContext {
  return {
    accountId: claims.sub,
    organizationId: claims.org_id,
    employeeId: claims.employee_id,
    sessionId: claims.sid ?? null,
    authzRevision: claims.authz_rev,
    methods: claims.amr,
    clientId: claims.client_id ?? null,
    scopes: claims.scope ? claims.scope.split(" ").filter(Boolean) : [],
    expiresAt: new Date(claims.exp * 1000),
  };
}
