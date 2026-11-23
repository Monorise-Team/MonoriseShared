/** Kody z zestawu błędów API Monorise (ADR-0044). */
export type AuthErrorCode = "UNAUTHENTICATED" | "PERMISSION_DENIED";

const STATUS: Record<AuthErrorCode, 401 | 403> = { UNAUTHENTICATED: 401, PERMISSION_DENIED: 403 };

/**
 * Logowanie odmówiło: brak albo nieważny token czy sesja (401) albo żądanie spoza aplikacji (403).
 * `statusCode` rozumie Fastify, a produkty zamieniają błąd na odpowiedź `{ data, meta, error }`.
 */
export class AuthError extends Error {
  readonly statusCode: 401 | 403;

  constructor(
    readonly code: AuthErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AuthError";
    this.statusCode = STATUS[code];
  }
}

/**
 * Core albo jego klucze (JWKS) są chwilowo nieosiągalne. To nie jest odmowa: aplikacja nie powinna wtedy
 * wylogowywać użytkownika, tylko odpowiedzieć 503 i spróbować ponownie.
 */
export class AuthUnavailableError extends Error {
  readonly statusCode = 503;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AuthUnavailableError";
  }
}

/** Odpowiedź błędu serwera OAuth (RFC 6749 §5.2), np. `invalid_grant` po unieważnieniu tokenu odświeżania. */
export class OAuthError extends Error {
  constructor(
    readonly error: string,
    readonly status: number,
    readonly description?: string,
  ) {
    super(description ? `${error}: ${description}` : error);
    this.name = "OAuthError";
  }
}
