import { z } from "zod";

/** Pojedyncze naruszenie kontraktu produktu wykryte przez funkcję sprawdzającą. */
export interface ContractViolation {
  /** Krótki identyfikator reguły (np. `auth.missing_token`, `openapi.operation_id`). */
  readonly rule: string;
  /** Czego dotyczy naruszenie (np. `GET /api/v1/time/entries` lub `paths./v1/items.get`). */
  readonly target: string;
  /** Czytelny opis wykrytego problemu. */
  readonly message: string;
  /** Opcjonalne dane diagnostyczne (np. otrzymany kod HTTP albo kod błędu). */
  readonly details?: Readonly<Record<string, unknown>>;
}

/** Wynik pojedynczego sprawdzenia kontraktu. */
export interface ContractCheckResult {
  readonly passed: boolean;
  readonly violations: readonly ContractViolation[];
}

export const errorDetailSchema = z.object({
  field: z.string().optional(),
  message: z.string(),
});

/** Schemat standardowej koperty błędu API Monorise (ADR-0044). */
export const errorEnvelopeSchema = z.object({
  data: z.null(),
  meta: z.object({
    requestId: z.string().min(1),
  }),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.array(errorDetailSchema),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export interface CheckErrorEnvelopeOptions {
  /** Oczekiwany kod statusu HTTP (np. `401` albo `403`). */
  expectedStatus?: number;
  /** Oczekiwany kod błędu (lub lista dopuszczalnych kodów), np. `"UNAUTHENTICATED"`. */
  expectedCode?: string | readonly string[];
  /** Czy wymagać pustej tablicy `error.details` (`[]`). Domyślnie `false`. */
  requireEmptyDetails?: boolean;
  /** Etykieta żądania umieszczana w `violation.target` (domyślnie `"response"`). */
  target?: string;
  /** Prefiks identyfikatora reguły w naruszeniach (domyślnie `"envelope"`). */
  rulePrefix?: string;
}

export type ErrorEnvelopeInput =
  | Response
  | {
      status: number;
      body: unknown;
    };

/** Formatuje naruszenia kontraktu w czytelny opis do komunikatów błędów w testach. */
export function formatViolations(violations: readonly ContractViolation[]): string {
  return violations.map((v) => `[${v.rule}] ${v.target}: ${v.message}`).join("\n");
}

function makeResult(violations: ContractViolation[]): ContractCheckResult {
  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Sprawdza, czy odpowiedź błędu spełnia standard koperty Monorise (ADR-0044):
 * `{ data: null, meta: { requestId: string }, error: { code, message, details: [...] } }`
 * oraz opcjonalnie oczekiwany status HTTP i kod błędu.
 */
export async function checkErrorEnvelope(
  response: ErrorEnvelopeInput,
  options: CheckErrorEnvelopeOptions = {},
): Promise<ContractCheckResult> {
  const target = options.target ?? "response";
  const prefix = options.rulePrefix ?? "envelope";
  const violations: ContractViolation[] = [];

  const status = response.status;
  if (options.expectedStatus !== undefined && status !== options.expectedStatus) {
    violations.push({
      rule: `${prefix}.status`,
      target,
      message: `Oczekiwano statusu HTTP ${options.expectedStatus}, otrzymano ${status}.`,
      details: { expectedStatus: options.expectedStatus, actualStatus: status },
    });
  }

  let body: unknown;
  if (response instanceof Response) {
    const cloned = response.clone();
    const raw = await cloned.text();
    if (raw.trim().length === 0) {
      violations.push({
        rule: `${prefix}.empty_body`,
        target,
        message: "Odpowiedź błędu ma puste ciało zamiast JSON w formacie koperty Monorise.",
        details: { status },
      });
      return makeResult(violations);
    }
    try {
      body = JSON.parse(raw);
    } catch {
      violations.push({
        rule: `${prefix}.invalid_json`,
        target,
        message: "Odpowiedź błędu nie jest poprawnym dokumentem JSON.",
        details: { status },
      });
      return makeResult(violations);
    }
  } else {
    body = response.body;
  }

  const parsed = errorEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    const summary = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    violations.push({
      rule: `${prefix}.format`,
      target,
      message: `Niepoprawna koperta błędu { data: null, meta: { requestId }, error: { code, message, details } }: ${summary}`,
      details: { status, issues: parsed.error.issues },
    });
    return makeResult(violations);
  }

  const envelope = parsed.data;
  if (envelope.meta.requestId.trim().length === 0) {
    violations.push({
      rule: `${prefix}.request_id`,
      target,
      message: "Pole meta.requestId w kopercie błędu nie może być puste.",
    });
  }

  if (options.expectedCode !== undefined) {
    const allowedCodes = typeof options.expectedCode === "string" ? [options.expectedCode] : [...options.expectedCode];
    if (!allowedCodes.includes(envelope.error.code)) {
      violations.push({
        rule: `${prefix}.error_code`,
        target,
        message: `Oczekiwano kodu błędu ${allowedCodes.join(" lub ")}, otrzymano "${envelope.error.code}".`,
        details: { expectedCode: allowedCodes, actualCode: envelope.error.code },
      });
    }
  }

  if (options.requireEmptyDetails && envelope.error.details.length > 0) {
    violations.push({
      rule: `${prefix}.details`,
      target,
      message: `Oczekiwano pustej tablicy error.details [], otrzymano ${envelope.error.details.length} elementów.`,
      details: { detailsCount: envelope.error.details.length },
    });
  }

  return makeResult(violations);
}
