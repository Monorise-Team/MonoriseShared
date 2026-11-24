import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

export const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const OPENAPI_PATH = join(PACKAGE_ROOT, "openapi/core-api.json");
export const GENERATED_DIR = join(PACKAGE_ROOT, "src/generated");

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

const GENERATED_HEADER = [
  "/* eslint-disable */",
  "/**",
  " * Generated from packages/sdk/openapi/core-api.json. Do not edit by hand.",
  " * Regenerate with: pnpm --filter @monorise-team/sdk generate",
  " * Sync from MonoriseCore: pnpm --filter @monorise-team/sdk sync",
  " */",
  "",
].join("\n");

function compareCodepoint(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function resolveLocalRef(document, value, seen = new Set()) {
  if (!value || typeof value !== "object" || typeof value.$ref !== "string") {
    return value;
  }
  const ref = value.$ref;
  if (!ref.startsWith("#/")) {
    throw new Error(`Unsupported external $ref in OpenAPI document: ${ref}`);
  }
  if (seen.has(ref)) {
    throw new Error(`Circular $ref detected in OpenAPI document: ${ref}`);
  }
  seen.add(ref);

  const segments = ref
    .slice(2)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));

  let current = document;
  for (const segment of segments) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      throw new Error(`Unresolvable $ref in OpenAPI document: ${ref}`);
    }
    current = current[segment];
  }
  return resolveLocalRef(document, current, seen);
}

function isBearerSecurityScheme(document, schemeName) {
  const raw = document.components?.securitySchemes?.[schemeName];
  const scheme = resolveLocalRef(document, raw);
  return Boolean(
    scheme &&
    typeof scheme === "object" &&
    scheme.type === "http" &&
    typeof scheme.scheme === "string" &&
    scheme.scheme.toLowerCase() === "bearer",
  );
}

function operationRequiresAuth(document, operation) {
  const security = operation.security ?? document.security;
  if (!Array.isArray(security) || security.length === 0) {
    return false;
  }
  // An empty security requirement object (`{}`) means anonymous access is permitted.
  if (
    security.some(
      (requirement) => requirement && typeof requirement === "object" && Object.keys(requirement).length === 0,
    )
  ) {
    return false;
  }
  return security.some(
    (requirement) =>
      requirement &&
      typeof requirement === "object" &&
      Object.keys(requirement).some((schemeName) => isBearerSecurityScheme(document, schemeName)),
  );
}

function extractParameters(document, pathItem, operation) {
  const merged = new Map();
  for (const rawParam of [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]) {
    const param = resolveLocalRef(document, rawParam);
    if (!param || typeof param !== "object" || typeof param.name !== "string" || typeof param.in !== "string") {
      continue;
    }
    merged.set(`${param.in}:${param.name}`, param);
  }

  const pathParams = [];
  const queryParams = [];
  for (const param of merged.values()) {
    if (param.in === "path") {
      pathParams.push(param.name);
    } else if (param.in === "query") {
      queryParams.push(param.name);
    }
  }

  pathParams.sort(compareCodepoint);
  queryParams.sort(compareCodepoint);
  return { pathParams, queryParams };
}

function operationHasJsonBody(document, operation) {
  if (!operation.requestBody) {
    return false;
  }
  const body = resolveLocalRef(document, operation.requestBody);
  return Boolean(body && typeof body === "object" && body.content?.["application/json"]);
}

function collectSchemaProperties(document, rawSchema) {
  const schema = resolveLocalRef(document, rawSchema);
  if (!schema || typeof schema !== "object") {
    return null;
  }
  const properties = {};
  if (schema.properties && typeof schema.properties === "object") {
    Object.assign(properties, schema.properties);
  }
  if (Array.isArray(schema.allOf)) {
    for (const member of schema.allOf) {
      const memberProps = collectSchemaProperties(document, member);
      if (memberProps) {
        Object.assign(properties, memberProps);
      }
    }
  }
  return Object.keys(properties).length > 0 ? properties : null;
}

function operationUsesEnvelope(document, operation) {
  const responses = operation.responses;
  if (!responses || typeof responses !== "object") {
    return false;
  }

  const successKeys = Object.keys(responses)
    .filter((status) => /^2\d\d$/.test(status))
    .sort(compareCodepoint);
  const preferredKey = successKeys.includes("200") ? "200" : successKeys[0];
  if (!preferredKey) {
    return false;
  }

  const response = resolveLocalRef(document, responses[preferredKey]);
  const schema = response?.content?.["application/json"]?.schema;
  if (!schema) {
    return false;
  }

  const properties = collectSchemaProperties(document, schema);
  return Boolean(properties && "data" in properties && "meta" in properties && "error" in properties);
}

function operationAllowsNoContent(document, operation) {
  const responses = operation.responses;
  if (!responses || typeof responses !== "object") {
    return false;
  }

  for (const status of Object.keys(responses)) {
    if (!/^2\d\d$/.test(status)) {
      continue;
    }
    if (status === "204") {
      return true;
    }
    const response = resolveLocalRef(document, responses[status]);
    if (!response || typeof response !== "object") {
      continue;
    }
    const content = response.content;
    if (!content || typeof content !== "object" || Object.keys(content).length === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Extracts a deterministic, sorted list of operations from an OpenAPI 3.1 document.
 */
export function extractOperations(document) {
  if (!document || typeof document !== "object" || !document.paths || typeof document.paths !== "object") {
    throw new Error("Invalid OpenAPI document: missing paths object");
  }

  const operations = [];
  const seenIds = new Set();

  for (const path of Object.keys(document.paths).sort(compareCodepoint)) {
    const pathItem = resolveLocalRef(document, document.paths[path]);
    if (!pathItem || typeof pathItem !== "object") {
      continue;
    }

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation || typeof operation !== "object") {
        continue;
      }

      const operationId = operation.operationId;
      if (typeof operationId !== "string" || operationId.length === 0) {
        throw new Error(`Operation ${method.toUpperCase()} ${path} is missing an operationId`);
      }
      if (seenIds.has(operationId)) {
        throw new Error(`Duplicate operationId "${operationId}" in OpenAPI document`);
      }
      seenIds.add(operationId);

      const { pathParams, queryParams } = extractParameters(document, pathItem, operation);

      operations.push({
        operationId,
        method: method.toUpperCase(),
        path,
        pathParams,
        queryParams,
        hasBody: operationHasJsonBody(document, operation),
        requiresAuth: operationRequiresAuth(document, operation),
        enveloped: operationUsesEnvelope(document, operation),
        noContent: operationAllowsNoContent(document, operation),
      });
    }
  }

  operations.sort((a, b) => compareCodepoint(a.operationId, b.operationId));
  return operations;
}

function renderOperationsModule(operations) {
  const entries = operations.map((operation) => {
    const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(operation.operationId)
      ? operation.operationId
      : JSON.stringify(operation.operationId);
    const lines = [
      `  ${key}: {`,
      `    operationId: ${JSON.stringify(operation.operationId)},`,
      `    method: ${JSON.stringify(operation.method)},`,
      `    path: ${JSON.stringify(operation.path)},`,
      `    pathParams: ${JSON.stringify(operation.pathParams)},`,
      `    queryParams: ${JSON.stringify(operation.queryParams)},`,
      `    hasBody: ${operation.hasBody},`,
      `    requiresAuth: ${operation.requiresAuth},`,
      `    enveloped: ${operation.enveloped},`,
      `    noContent: ${operation.noContent},`,
      `  },`,
    ];
    return lines.join("\n");
  });

  return [
    GENERATED_HEADER,
    'export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";',
    "",
    "export interface OperationDefinition {",
    "  readonly operationId: string;",
    "  readonly method: HttpMethod;",
    "  readonly path: string;",
    "  readonly pathParams: readonly string[];",
    "  readonly queryParams: readonly string[];",
    "  readonly hasBody: boolean;",
    "  readonly requiresAuth: boolean;",
    "  readonly enveloped: boolean;",
    "  readonly noContent: boolean;",
    "}",
    "",
    "export const CORE_OPERATIONS = {",
    ...entries,
    "} as const satisfies Record<string, OperationDefinition>;",
    "",
    "export type CoreOperationId = keyof typeof CORE_OPERATIONS;",
    "",
  ].join("\n");
}

/**
 * Generates deterministic file contents for `src/generated/` from an OpenAPI document object.
 */
export async function generateFromOpenApi(document) {
  const ast = await openapiTS(document, { alphabetize: true });
  const openapiBody = astToString(ast).trimEnd();
  const openapiTs = `${GENERATED_HEADER}${openapiBody}\n`;

  const operations = extractOperations(document);
  const operationsTs = renderOperationsModule(operations);

  return {
    "openapi.ts": openapiTs,
    "operations.ts": operationsTs,
  };
}

export async function readLocalOpenApiDocument(openApiPath = OPENAPI_PATH) {
  const raw = await readFile(openApiPath, "utf8");
  return JSON.parse(raw);
}

/**
 * Writes generated files to `generatedDir`.
 */
export async function writeGeneratedFiles({ openApiPath = OPENAPI_PATH, generatedDir = GENERATED_DIR } = {}) {
  const document = await readLocalOpenApiDocument(openApiPath);
  const expected = await generateFromOpenApi(document);
  await mkdir(generatedDir, { recursive: true });

  const fileNames = Object.keys(expected).sort(compareCodepoint);
  for (const name of fileNames) {
    await writeFile(join(generatedDir, name), expected[name], "utf8");
  }
  return fileNames;
}

/**
 * Verifies that `generatedDir` matches exactly what `generateFromOpenApi` produces from `openApiPath`.
 */
export async function checkGeneratedFiles({ openApiPath = OPENAPI_PATH, generatedDir = GENERATED_DIR } = {}) {
  const document = await readLocalOpenApiDocument(openApiPath);
  const expected = await generateFromOpenApi(document);
  const mismatches = [];

  let existingFiles;
  try {
    existingFiles = (await readdir(generatedDir)).sort(compareCodepoint);
  } catch {
    return {
      ok: false,
      mismatches: [`Missing generated directory: ${generatedDir}`],
    };
  }

  const expectedFiles = Object.keys(expected).sort(compareCodepoint);
  for (const name of existingFiles) {
    if (!expectedFiles.includes(name)) {
      mismatches.push(`Unexpected generated file: ${name}`);
    }
  }

  for (const name of expectedFiles) {
    const filePath = join(generatedDir, name);
    let actual;
    try {
      actual = await readFile(filePath, "utf8");
    } catch {
      mismatches.push(`Missing generated file: ${name}`);
      continue;
    }
    if (actual !== expected[name]) {
      mismatches.push(`Out-of-date generated file: ${name}`);
    }
  }

  return {
    ok: mismatches.length === 0,
    mismatches,
  };
}
