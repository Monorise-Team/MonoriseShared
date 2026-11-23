#!/usr/bin/env node
/**
 * Pisze dist/tokens.css (zmienne CSS trybów i motywów) i dist/tailwind.css (mapowanie na klasy Tailwind CSS 4)
 * z wartości w src/values.ts, skompilowanych wcześniej do dist/ przez tsc. Jedno źródło: CSS i Expo nie mogą
 * się rozjechać (ADR-0087, ADR-0091).
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = join(dirname(fileURLToPath(import.meta.url)), "../dist");
const tokens = await import(join(dist, "index.js"));
const {
  accentVariables,
  defaultTheme,
  fonts,
  modeVariables,
  motion,
  semantic,
  shape,
  themeNames,
  themes,
  tintVariables,
} = tokens;

const HEADER =
  "/* @monorise-team/tokens: wygenerowane z src/values.ts przez scripts/generate-css.mjs. Nie edytuj ręcznie. */";
const block = (selector, vars) =>
  `${selector} {\n${Object.entries(vars)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n")}\n}`;

const base = {
  "--mr-font-sans": fonts.sans,
  "--mr-font-display": fonts.display,
  "--mr-font-mono": fonts.mono,
  ...Object.fromEntries(Object.entries(shape).map(([name, px]) => [`--mr-${name}`, `${px}px`])),
  "--mr-anim-fast": `${motion.duration.fast}ms`,
  "--mr-anim-normal": `${motion.duration.normal}ms`,
  "--mr-anim-slow": `${motion.duration.slow}ms`,
  "--mr-anim-enter": `${motion.duration.enter}ms`,
  "--mr-anim-exit": `${motion.duration.exit}ms`,
  "--mr-anim-stagger-step": `${motion.duration.staggerStep}ms`,
  "--mr-anim-rise": `${motion.rise}px`,
  "--mr-ease-out": motion.easing.out,
  "--mr-ease-in": motion.easing.in,
  "--mr-ease-standard": motion.easing.standard,
};
const noMotion = {
  "--mr-anim-fast": "0ms",
  "--mr-anim-normal": "0ms",
  "--mr-anim-slow": "0ms",
  "--mr-anim-enter": "0ms",
  "--mr-anim-exit": "0ms",
  "--mr-anim-stagger-step": "0ms",
  "--mr-anim-rise": "0px",
};

const css = [
  HEADER,
  "",
  "/* Tryb jasny i motyw domyślny. Tryb ciemny: klasa `dark` na <html>; motyw: atrybut data-theme na <html>. */",
  block(":root", {
    "color-scheme": "light",
    ...base,
    ...tintVariables(defaultTheme),
    ...accentVariables(defaultTheme, "light"),
    ...modeVariables("light"),
    "--mr-backdrop": themes[defaultTheme].backdrop.light,
  }),
  "",
  block(":root.dark", {
    "color-scheme": "dark",
    ...accentVariables(defaultTheme, "dark"),
    ...modeVariables("dark"),
    "--mr-backdrop": themes[defaultTheme].backdrop.dark,
  }),
  ...themeNames.flatMap((name) => [
    "",
    block(`:root[data-theme="${name}"]`, {
      ...tintVariables(name),
      ...accentVariables(name, "light"),
      "--mr-backdrop": themes[name].backdrop.light,
    }),
    "",
    block(`:root.dark[data-theme="${name}"]`, {
      ...accentVariables(name, "dark"),
      "--mr-backdrop": themes[name].backdrop.dark,
    }),
  ]),
  "",
  "/* Ograniczony ruch: z ustawień systemu albo klasy `reduce-motion` na <html>. */",
  `@media (prefers-reduced-motion: reduce) {\n${block(":root", noMotion).replace(/^/gm, "  ")}\n}`,
  "",
  block(":root.reduce-motion", noMotion),
  "",
].join("\n");

const colorNames = Object.keys(semantic.light);
const tailwind = [
  HEADER,
  "/* Mapowanie tokenów na klasy Tailwind CSS 4, np. bg-bg-primary, text-text-secondary, border-border-primary,",
  '   bg-accent text-accent-fg, rounded-card, gap-card, shadow-card. Importuj po `@import "tailwindcss";`. */',
  "",
  "@custom-variant dark (&:where(.dark, .dark *));",
  "",
  block("@theme inline", {
    ...Object.fromEntries(colorNames.map((name) => [`--color-${name}`, `var(--mr-${name})`])),
    "--color-accent": "var(--mr-accent)",
    "--color-accent-hover": "var(--mr-accent-hover)",
    "--color-accent-light": "var(--mr-accent-light)",
    "--color-accent-fg": "var(--mr-accent-fg)",
    "--color-link": "var(--mr-link)",
    "--radius-card": "var(--mr-card-radius)",
    "--radius-menu": "var(--mr-menu-radius)",
    "--radius-row": "var(--mr-row-radius)",
    "--radius-control": "var(--mr-control-radius)",
    "--spacing-card": "var(--mr-card-gap)",
    "--shadow-card": "var(--mr-card-shadow)",
    "--shadow-glass": "var(--mr-glass-shadow)",
    "--shadow-elevated": "var(--mr-glass-shadow-elevated)",
    "--font-sans": "var(--mr-font-sans)",
    "--font-display": "var(--mr-font-display)",
    "--font-mono": "var(--mr-font-mono)",
    "--ease-out": "var(--mr-ease-out)",
    "--ease-in": "var(--mr-ease-in)",
    "--default-transition-duration": "var(--mr-anim-fast)",
    "--default-transition-timing-function": "var(--mr-ease-standard)",
  }),
  "",
].join("\n");

writeFileSync(join(dist, "tokens.css"), css);
writeFileSync(join(dist, "tailwind.css"), tailwind);
console.log(`tokens.css i tailwind.css: ${themeNames.length} motywy, ${colorNames.length} kolorów na tryb`);
