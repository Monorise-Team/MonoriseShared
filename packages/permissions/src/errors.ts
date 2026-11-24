/**
 * Odmowa dostępu (HTTP 403, kod `PERMISSION_DENIED` ze standardów API Monorise).
 * `statusCode` rozumie Fastify, a produkty zamieniają błąd na odpowiedź `{ data, meta, error }`.
 * Komunikat celowo nigdy nie zawiera zawartości migawki uprawnień.
 */
export class PermissionError extends Error {
  readonly code = "PERMISSION_DENIED" as const;
  readonly statusCode = 403 as const;

  constructor(
    readonly permission: string,
    options?: { cause?: unknown },
  ) {
    super(`Permission denied: ${permission}`, options);
    this.name = "PermissionError";
  }
}
