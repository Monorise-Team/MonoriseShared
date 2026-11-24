import type { OperationDefinition } from "../src/generated/operations.js";

export declare const PACKAGE_ROOT: string;
export declare const OPENAPI_PATH: string;
export declare const GENERATED_DIR: string;

export declare function extractOperations(document: Record<string, unknown>): OperationDefinition[];

export declare function generateFromOpenApi(
  document: Record<string, unknown>,
): Promise<Record<"openapi.ts" | "operations.ts", string>>;

export declare function readLocalOpenApiDocument(openApiPath?: string): Promise<Record<string, unknown>>;

export declare function writeGeneratedFiles(options?: {
  openApiPath?: string;
  generatedDir?: string;
}): Promise<string[]>;

export declare function checkGeneratedFiles(options?: {
  openApiPath?: string;
  generatedDir?: string;
}): Promise<{ ok: boolean; mismatches: string[] }>;
