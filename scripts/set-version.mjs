#!/usr/bin/env node
/**
 * Ustawia jedną wersję wszystkim paczkom tylko na potrzeby publikacji w CI, bez commitu:
 *
 *   node scripts/set-version.mjs dev 42    -> następna poprawka z dopiskiem, np. 0.1.1-dev.42 (wersja testowa z dev)
 *   node scripts/set-version.mjs release   -> wersja z package.json (wersja stabilna z prod, po Release Please)
 *
 * Wypisuje ustawioną wersję. Wersji w repozytorium nie zmieniamy ręcznie: robi to Release Please.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const [kind, build] = process.argv.slice(2);
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
let target = version;
if (kind === "dev") {
  if (!/^\d+$/.test(build ?? "")) throw new Error("Podaj numer wersji testowej, np. numer przebiegu CI");
  const [major, minor, patch] = version.split(".").map(Number);
  target = `${major}.${minor}.${patch + 1}-dev.${build}`;
} else if (kind !== "release") {
  throw new Error("Użycie: set-version.mjs dev <numer> | release");
}
for (const dir of readdirSync(join(root, "packages"))) {
  const file = join(root, "packages", dir, "package.json");
  // Tylko katalogi paczek (pomija np. .DS_Store z macOS)
  if (!existsSync(file)) continue;
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  pkg.version = target;
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}
console.log(target);
