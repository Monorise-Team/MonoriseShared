import type { ContractCheckResult, ContractViolation } from "./envelope.js";

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"]);

export type OperationMatcher = string | RegExp | { method?: string; path: string };

export interface CheckOpenApiOptions {
  /**
   * Operacje publiczne zwolnione z obowiązku deklaracji `security`.
   * Domyślnie za publiczne uznawane są ścieżki kończące się na `/health` lub `/openapi.json`.
   */
  publicOperations?: readonly OperationMatcher[];
  /**
   * Operacje zwracające surowy JSON zamiast koperty `{ data, meta, error }`.
   * Domyślnie obejmuje ścieżki kończące się na `/openapi.json`.
   */
  rawResponseOperations?: readonly OperationMatcher[];
  /**
   * Dodatkowe operacje traktowane jako listy stronicowane (poza automatycznym wykrywaniem
   * operacji `GET` z tablicowym polem `data`).
   */
  listOperations?: readonly OperationMatcher[];
  /**
   * Operacje z tablicą w `data`, które świadomie nie są stronicowane kursorowo.
   */
  nonPaginatedOperations?: readonly OperationMatcher[];
}

export type OpenApiDocumentInput = unknown | (() => unknown | Promise<unknown>);

type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesOperation(
  matcher: OperationMatcher,
  method: string,
  path: string,
  operationId: string | undefined,
): boolean {
  const upperMethod = method.toUpperCase();
  const full = `${upperMethod} ${path}`;
  if (typeof matcher === "string") {
    return matcher === operationId || matcher === path || matcher.toUpperCase() === full.toUpperCase();
  }
  if (matcher instanceof RegExp) {
    return matcher.test(path) || matcher.test(full) || (operationId !== undefined && matcher.test(operationId));
  }
  if (matcher.method && matcher.method.toUpperCase() !== upperMethod) {
    return false;
  }
  return matcher.path === path;
}

function isDefaultPublicPath(path: string): boolean {
  return path === "/health" || path.endsWith("/health") || path === "/openapi.json" || path.endsWith("/openapi.json");
}

function isDefaultRawResponsePath(path: string): boolean {
  return path === "/openapi.json" || path.endsWith("/openapi.json");
}

function resolveRef(doc: JsonObject, ref: string): { target: JsonObject | null; broken: boolean } {
  if (!ref.startsWith("#/")) {
    return { target: null, broken: false };
  }
  const segments = ref
    .slice(2)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
  let current: unknown = doc;
  for (const segment of segments) {
    if (!isPlainObject(current) || !(segment in current)) {
      return { target: null, broken: true };
    }
    current = current[segment];
  }
  return { target: isPlainObject(current) ? current : null, broken: !isPlainObject(current) };
}

function resolveSchemaObject(
  doc: JsonObject,
  schema: unknown,
  visited = new Set<string>(),
): { schema: JsonObject | null; brokenRef?: string } {
  if (!isPlainObject(schema)) {
    return { schema: null };
  }
  if (typeof schema.$ref === "string") {
    if (visited.has(schema.$ref)) {
      return { schema: null };
    }
    visited.add(schema.$ref);
    const resolved = resolveRef(doc, schema.$ref);
    if (resolved.broken) {
      return { schema: null, brokenRef: schema.$ref };
    }
    return resolveSchemaObject(doc, resolved.target, visited);
  }
  return { schema };
}

/** Zbiera właściwości obiektu JSON Schema z uwzględnieniem `$ref` oraz `allOf`. */
function collectObjectProperties(
  doc: JsonObject,
  schema: unknown,
  visited = new Set<string>(),
): { properties: Record<string, unknown>; brokenRef?: string } {
  const resolved = resolveSchemaObject(doc, schema, new Set(visited));
  if (resolved.brokenRef) {
    return { properties: {}, brokenRef: resolved.brokenRef };
  }
  const obj = resolved.schema;
  if (!obj) {
    return { properties: {} };
  }

  const merged: Record<string, unknown> = {};
  if (Array.isArray(obj.allOf)) {
    for (const part of obj.allOf) {
      const sub = collectObjectProperties(doc, part, new Set(visited));
      if (sub.brokenRef) return sub;
      Object.assign(merged, sub.properties);
    }
  }
  if (isPlainObject(obj.properties)) {
    Object.assign(merged, obj.properties);
  }
  return { properties: merged };
}

function isArraySchema(doc: JsonObject, schema: unknown): boolean {
  const resolved = resolveSchemaObject(doc, schema);
  if (!resolved.schema) return false;
  if (resolved.schema.type === "array") return true;
  if (Array.isArray(resolved.schema.type) && resolved.schema.type.includes("array")) return true;
  return false;
}

function isStringLikeSchema(doc: JsonObject, schema: unknown): boolean {
  const resolved = resolveSchemaObject(doc, schema);
  if (!resolved.schema) return false;
  const type = resolved.schema.type;
  if (type === "string") return true;
  if (Array.isArray(type) && type.includes("string")) return true;
  if (Array.isArray(resolved.schema.enum) && resolved.schema.enum.every((v) => typeof v === "string")) return true;
  if (Array.isArray(resolved.schema.anyOf)) {
    return resolved.schema.anyOf.some((branch) => isStringLikeSchema(doc, branch));
  }
  if (Array.isArray(resolved.schema.oneOf)) {
    return resolved.schema.oneOf.some((branch) => isStringLikeSchema(doc, branch));
  }
  return false;
}

function resolveParameter(doc: JsonObject, param: unknown): JsonObject | null {
  if (!isPlainObject(param)) return null;
  if (typeof param.$ref === "string") {
    const resolved = resolveRef(doc, param.$ref);
    return resolved.target;
  }
  return param;
}

function resolveResponse(doc: JsonObject, response: unknown): { target: JsonObject | null; brokenRef?: string } {
  if (!isPlainObject(response)) return { target: null };
  if (typeof response.$ref === "string") {
    const resolved = resolveRef(doc, response.$ref);
    if (resolved.broken) return { target: null, brokenRef: response.$ref };
    return { target: resolved.target };
  }
  return { target: response };
}

function getJsonSchema(responseObj: JsonObject): unknown {
  if (!isPlainObject(responseObj.content)) return undefined;
  const appJson = responseObj.content["application/json"];
  if (!isPlainObject(appJson)) return undefined;
  return appJson.schema;
}

/**
 * Sprawdza zgodność dokumentu OpenAPI produktu ze standardami Monorise (obowiązek 7, ADR-0044 i ADR-0046):
 * - wersja `openapi` 3.1.x,
 * - unikalne `operationId` na każdej operacji,
 * - deklaracja `security` na operacjach niepublicznych,
 * - koperta `{ data, meta, error }` z `meta.requestId` na odpowiedziach sukcesu (z wyjątkiem 204 i surowego OpenAPI),
 * - wspólny schemat błędu (przez `$ref`) z polami `code` i `message` na odpowiedziach błędów,
 * - stronicowanie `limit`, `cursor` i `meta.nextCursor` na operacjach list.
 */
export async function checkOpenApiDocument(
  documentOrLoader: OpenApiDocumentInput,
  options: CheckOpenApiOptions = {},
): Promise<ContractCheckResult> {
  const rawDoc = typeof documentOrLoader === "function" ? await documentOrLoader() : documentOrLoader;
  const violations: ContractViolation[] = [];

  if (!isPlainObject(rawDoc)) {
    violations.push({
      rule: "openapi.document",
      target: "document",
      message: "Dokument OpenAPI musi być obiektem JSON.",
    });
    return { passed: false, violations };
  }

  const doc = rawDoc;
  if (typeof doc.openapi !== "string" || !/^3\.1\.\d+$/.test(doc.openapi)) {
    violations.push({
      rule: "openapi.version",
      target: "openapi",
      message: `Oczekiwano wersji OpenAPI 3.1.x, otrzymano "${String(doc.openapi ?? "")}".`,
      details: { version: doc.openapi },
    });
  }

  if (!isPlainObject(doc.paths) || Object.keys(doc.paths).length === 0) {
    violations.push({
      rule: "openapi.paths",
      target: "paths",
      message: "Dokument OpenAPI musi zawierać co najmniej jedną ścieżkę w polu paths.",
    });
    return { passed: false, violations };
  }

  const rootSecurity = Array.isArray(doc.security) && doc.security.length > 0 ? doc.security : null;
  const components = isPlainObject(doc.components) ? doc.components : null;
  const securitySchemes = components && isPlainObject(components.securitySchemes) ? components.securitySchemes : null;

  const seenOperationIds = new Map<string, string>();
  const sharedErrorRefs = new Set<string>();
  const errorResponseTargets: { target: string; ref: string }[] = [];

  for (const [path, rawPathItem] of Object.entries(doc.paths)) {
    if (!isPlainObject(rawPathItem)) continue;
    const pathParams = Array.isArray(rawPathItem.parameters) ? rawPathItem.parameters : [];

    for (const [method, rawOperation] of Object.entries(rawPathItem)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      if (!isPlainObject(rawOperation)) continue;

      const opTarget = `${method.toUpperCase()} ${path}`;
      const operationId = typeof rawOperation.operationId === "string" ? rawOperation.operationId.trim() : "";

      // 1. operationId
      if (!operationId) {
        violations.push({
          rule: "openapi.operation_id",
          target: opTarget,
          message: "Operacja nie ma wymaganego pola operationId.",
        });
      } else {
        const previous = seenOperationIds.get(operationId);
        if (previous) {
          violations.push({
            rule: "openapi.duplicate_operation_id",
            target: opTarget,
            message: `Zduplikowane operationId "${operationId}" (wcześniej użyte w ${previous}).`,
            details: { operationId, previous },
          });
        } else {
          seenOperationIds.set(operationId, opTarget);
        }
      }

      // 2. security dla operacji niepublicznych
      const isPublic =
        isDefaultPublicPath(path) ||
        (options.publicOperations?.some((matcher) =>
          matchesOperation(matcher, method, path, operationId || undefined),
        ) ??
          false);

      if (!isPublic) {
        const hasOpSecurity = Array.isArray(rawOperation.security);
        const effectiveSecurity = hasOpSecurity ? (rawOperation.security as unknown[]) : rootSecurity;
        if (!effectiveSecurity || effectiveSecurity.length === 0) {
          violations.push({
            rule: "openapi.security",
            target: opTarget,
            message: "Niepubliczna operacja musi deklarować wymagane uwierzytelnienie w polu security.",
          });
        } else if (securitySchemes) {
          for (const requirement of effectiveSecurity) {
            if (!isPlainObject(requirement)) continue;
            for (const schemeName of Object.keys(requirement)) {
              if (!(schemeName in securitySchemes)) {
                violations.push({
                  rule: "openapi.security_scheme",
                  target: opTarget,
                  message: `Pole security odwołuje się do niezdefiniowanego schematu "${schemeName}".`,
                  details: { schemeName },
                });
              }
            }
          }
        }
      }

      // 3. Odpowiedzi
      if (!isPlainObject(rawOperation.responses)) {
        violations.push({
          rule: "openapi.responses",
          target: opTarget,
          message: "Operacja musi definiować pole responses.",
        });
        continue;
      }

      const isRawResponse =
        isDefaultRawResponsePath(path) ||
        (options.rawResponseOperations?.some((matcher) =>
          matchesOperation(matcher, method, path, operationId || undefined),
        ) ??
          false);

      const mergedParams = [...pathParams, ...(Array.isArray(rawOperation.parameters) ? rawOperation.parameters : [])]
        .map((param) => resolveParameter(doc, param))
        .filter((param): param is JsonObject => param !== null);

      const explicitlyList =
        options.listOperations?.some((matcher) => matchesOperation(matcher, method, path, operationId || undefined)) ??
        false;
      const explicitlyNonPaginated =
        options.nonPaginatedOperations?.some((matcher) =>
          matchesOperation(matcher, method, path, operationId || undefined),
        ) ?? false;

      let checkedAsList = false;

      for (const [statusCode, rawResp] of Object.entries(rawOperation.responses)) {
        const respTarget = `${opTarget} [${statusCode}]`;
        const resolvedResp = resolveResponse(doc, rawResp);
        if (resolvedResp.brokenRef) {
          violations.push({
            rule: "openapi.broken_ref",
            target: respTarget,
            message: `Nieistniejąca referencja odpowiedzi: ${resolvedResp.brokenRef}.`,
          });
          continue;
        }
        const respObj = resolvedResp.target;
        if (!respObj) continue;

        // Odpowiedzi sukcesu 2xx
        if (/^2\d\d$/.test(statusCode)) {
          if (statusCode === "204" || isRawResponse) {
            continue;
          }
          const schema = getJsonSchema(respObj);
          if (!schema) {
            violations.push({
              rule: "openapi.success_envelope",
              target: respTarget,
              message: "Odpowiedź sukcesu musi deklarować schemat application/json w kopercie { data, meta, error }.",
            });
            continue;
          }

          const { properties, brokenRef } = collectObjectProperties(doc, schema);
          if (brokenRef) {
            violations.push({
              rule: "openapi.broken_ref",
              target: respTarget,
              message: `Nieistniejąca referencja schematu odpowiedzi: ${brokenRef}.`,
            });
            continue;
          }

          const missingEnvelopeFields = ["data", "meta", "error"].filter((field) => !(field in properties));
          if (missingEnvelopeFields.length > 0) {
            violations.push({
              rule: "openapi.success_envelope",
              target: respTarget,
              message: `Odpowiedź sukcesu nie używa koperty { data, meta, error } (brakuje: ${missingEnvelopeFields.join(", ")}).`,
              details: { missingEnvelopeFields },
            });
            continue;
          }

          const metaProps = collectObjectProperties(doc, properties.meta);
          if (metaProps.brokenRef) {
            violations.push({
              rule: "openapi.broken_ref",
              target: respTarget,
              message: `Nieistniejąca referencja schematu meta: ${metaProps.brokenRef}.`,
            });
          } else if (
            !("requestId" in metaProps.properties) ||
            !isStringLikeSchema(doc, metaProps.properties.requestId)
          ) {
            violations.push({
              rule: "openapi.meta_request_id",
              target: respTarget,
              message: "Koperta odpowiedzi sukcesu musi zawierać pole tekstowe meta.requestId.",
            });
          }

          // Stronicowanie operacji list
          const autoDetectedList =
            method.toLowerCase() === "get" && !explicitlyNonPaginated && isArraySchema(doc, properties.data);
          if (explicitlyList || autoDetectedList) {
            checkedAsList = true;
            const hasLimit = mergedParams.some((p) => p.in === "query" && p.name === "limit");
            const hasCursor = mergedParams.some((p) => p.in === "query" && p.name === "cursor");
            const hasNextCursor = "nextCursor" in metaProps.properties;

            if (!hasLimit) {
              violations.push({
                rule: "openapi.list_pagination",
                target: opTarget,
                message: "Operacja listy musi dokumentować parametr zapytania `limit`.",
              });
            }
            if (!hasCursor) {
              violations.push({
                rule: "openapi.list_pagination",
                target: opTarget,
                message: "Operacja listy musi dokumentować parametr zapytania `cursor`.",
              });
            }
            if (!hasNextCursor) {
              violations.push({
                rule: "openapi.list_pagination",
                target: respTarget,
                message: "Operacja listy musi dokumentować pole `meta.nextCursor` w odpowiedzi.",
              });
            }
          }
          continue;
        }

        // Odpowiedzi błędów 4xx / 5xx / default
        if (/^[45]\d\d$/.test(statusCode) || statusCode === "default") {
          const schema = getJsonSchema(respObj);
          if (!isPlainObject(schema) || typeof schema.$ref !== "string") {
            violations.push({
              rule: "openapi.error_schema_ref",
              target: respTarget,
              message:
                "Odpowiedź błędu musi odwoływać się przez `$ref` do wspólnego schematu błędu w components.schemas.",
            });
            continue;
          }

          const ref = schema.$ref;
          if (!ref.startsWith("#/components/schemas/")) {
            violations.push({
              rule: "openapi.error_schema_ref",
              target: respTarget,
              message: `Schemat błędu powinien wskazywać na #/components/schemas/... (otrzymano "${ref}").`,
            });
            continue;
          }

          const { properties, brokenRef } = collectObjectProperties(doc, schema);
          if (brokenRef) {
            violations.push({
              rule: "openapi.broken_ref",
              target: respTarget,
              message: `Nieistniejąca referencja schematu błędu: ${brokenRef}.`,
            });
            continue;
          }

          sharedErrorRefs.add(ref);
          errorResponseTargets.push({ target: respTarget, ref });

          // Sprawdzamy kształt koperty błędu oraz pola error.code i error.message
          const missingEnvelopeFields = ["data", "meta", "error"].filter((field) => !(field in properties));
          if (missingEnvelopeFields.length > 0) {
            violations.push({
              rule: "openapi.error_envelope",
              target: respTarget,
              message: `Schemat błędu "${ref}" nie używa koperty { data, meta, error } (brakuje: ${missingEnvelopeFields.join(", ")}).`,
            });
            continue;
          }

          const metaProps = collectObjectProperties(doc, properties.meta);
          if (!("requestId" in metaProps.properties)) {
            violations.push({
              rule: "openapi.error_envelope",
              target: respTarget,
              message: `Schemat błędu "${ref}" musi zawierać pole meta.requestId.`,
            });
          }

          const errorProps = collectObjectProperties(doc, properties.error);
          if (errorProps.brokenRef) {
            violations.push({
              rule: "openapi.broken_ref",
              target: respTarget,
              message: `Nieistniejąca referencja pola error w schemacie błędu: ${errorProps.brokenRef}.`,
            });
          } else {
            const hasCode = "code" in errorProps.properties && isStringLikeSchema(doc, errorProps.properties.code);
            const hasMessage =
              "message" in errorProps.properties && isStringLikeSchema(doc, errorProps.properties.message);
            if (!hasCode || !hasMessage) {
              violations.push({
                rule: "openapi.error_schema_fields",
                target: respTarget,
                message: `Wspólny schemat błędu "${ref}" musi zawierać tekstowe pola error.code oraz error.message.`,
              });
            }
          }
        }
      }

      if (explicitlyList && !checkedAsList) {
        violations.push({
          rule: "openapi.list_pagination",
          target: opTarget,
          message: "Wskazana operacja listy nie posiada poprawnej odpowiedzi sukcesu 2xx z kopertą.",
        });
      }
    }
  }

  if (sharedErrorRefs.size > 1) {
    violations.push({
      rule: "openapi.error_schema_shared",
      target: "components.schemas",
      message: `Odpowiedzi błędów używają wielu różnych schematów (${[...sharedErrorRefs].join(", ")}) zamiast jednego wspólnego schematu błędu.`,
      details: { refs: [...sharedErrorRefs], responses: errorResponseTargets },
    });
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}
