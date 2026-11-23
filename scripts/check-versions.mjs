#!/usr/bin/env node
/**
 * Wszystkie paczki @monorise-team/* mają zawsze tę samą wersję co repozytorium (ADR-0087): wersja z
 * package.json w katalogu głównym, którą Release Please przepisuje do każdej paczki. Paczki repozytorium
 * łączą się przez `workspace:*`, żeby nigdy nie wskazały starszej wersji siebie nawzajem.
 *
 *   node scripts/check-versions.mjs          sprawdza i kończy się błędem przy rozbieżności
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const { version } = read("package.json");
const manifest = read(".release-please-manifest.json")["."];
const problems = [];

if (manifest !== version) problems.push(`.release-please-manifest.json ma ${manifest}, a package.json ${version}`);

const packages = readdirSync(join(root, "packages")).map((dir) => ({ dir, pkg: read(`packages/${dir}/package.json`) }));
const names = new Set(packages.map(({ pkg }) => pkg.name));
for (const { dir, pkg } of packages) {
  if (!pkg.name.startsWith("@monorise-team/")) problems.push(`packages/${dir}: nazwa ${pkg.name} bez @monorise-team/`);
  if (pkg.version !== version) problems.push(`${pkg.name}: wersja ${pkg.version}, a repozytorium ${version}`);
  if (pkg.publishConfig?.registry !== "https://npm.pkg.github.com")
    problems.push(`${pkg.name}: publishConfig.registry musi wskazywać GitHub Packages`);
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    for (const [dep, range] of Object.entries(pkg[field] ?? {})) {
      if (names.has(dep) && range !== "workspace:*")
        problems.push(`${pkg.name}: ${dep} w ${field} ma ${range}, a powinno workspace:*`);
    }
  }
}
for (const dir of readdirSync(join(root, "apps"))) {
  const pkg = read(`apps/${dir}/package.json`);
  if (!pkg.private) problems.push(`apps/${dir}: aplikacja musi mieć "private": true (nie publikujemy jej)`);
}

if (problems.length) {
  console.error(`Wersje się rozjechały:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`Wersje zgodne: ${packages.length} paczek w wersji ${version}`);
