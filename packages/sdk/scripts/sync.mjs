#!/usr/bin/env node
/**
 * Downloads the latest `openapi/core-api.json` from MonoriseCore (`dev` or `prod` branch),
 * saves it to `packages/sdk/openapi/core-api.json`, and regenerates `src/generated/`.
 *
 * Usage:
 *   pnpm --filter @monorise-team/sdk sync
 *   pnpm --filter @monorise-team/sdk sync -- --ref prod
 */
import { writeFile } from "node:fs/promises";
import { OPENAPI_PATH, writeGeneratedFiles } from "./generate-lib.mjs";

const ALLOWED_REFS = new Set(["dev", "prod"]);

function parseRef(argv) {
  let ref = "dev";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      continue;
    }
    if (arg === "--ref") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --ref (expected dev or prod)");
      }
      ref = value;
      i += 1;
    } else if (arg.startsWith("--ref=")) {
      ref = arg.slice("--ref=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!ALLOWED_REFS.has(ref)) {
    throw new Error(`Invalid --ref "${ref}": expected "dev" or "prod"`);
  }
  return ref;
}

const ref = parseRef(process.argv.slice(2));
const url = `https://raw.githubusercontent.com/Monorise-Team/MonoriseCore/${ref}/openapi/core-api.json`;

const response = await fetch(url, {
  headers: { accept: "application/json" },
});

if (!response.ok) {
  throw new Error(`Failed to fetch Core OpenAPI document from ${url} (HTTP ${response.status})`);
}

const rawText = await response.text();
let parsed;
try {
  parsed = JSON.parse(rawText);
} catch (cause) {
  throw new Error(`Downloaded Core OpenAPI document from ${url} is not valid JSON`, { cause });
}

if (!parsed || typeof parsed !== "object" || typeof parsed.openapi !== "string" || typeof parsed.paths !== "object") {
  throw new Error(`Downloaded document from ${url} does not look like an OpenAPI specification`);
}

await writeFile(OPENAPI_PATH, rawText, "utf8");
const files = await writeGeneratedFiles();
console.log(`Synced openapi/core-api.json from MonoriseCore@${ref} and generated ${files.join(", ")}.`);
