#!/usr/bin/env node
/**
 * Generates TypeScript types and the operation table in `src/generated/` from the committed
 * `openapi/core-api.json` copy (no network access).
 *
 * Usage:
 *   node scripts/generate.mjs          write generated files
 *   node scripts/generate.mjs --check  exit with code 1 if generated files are out of date
 */
import { checkGeneratedFiles, writeGeneratedFiles } from "./generate-lib.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

for (const arg of args) {
  if (arg !== "--check") {
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  }
}

if (checkOnly) {
  const result = await checkGeneratedFiles();
  if (!result.ok) {
    console.error(
      `Generated SDK files are out of date with openapi/core-api.json:\n- ${result.mismatches.join("\n- ")}\nRun: pnpm --filter @monorise-team/sdk generate`,
    );
    process.exit(1);
  }
  console.log("Generated SDK files are up to date with openapi/core-api.json.");
} else {
  const files = await writeGeneratedFiles();
  console.log(`Generated ${files.join(", ")} from openapi/core-api.json.`);
}
