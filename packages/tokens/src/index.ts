export * from "./values.js";

import { defaultMode, defaultTheme, effects, semantic, themes } from "./values.js";
import type { Accent, Mode, ThemeName, Tint } from "./values.js";

/** Nazwy zmiennych CSS mają przedrostek `--mr-` (Monorise). */
export const cssVar = (name: string): string => `--mr-${name}`;

const TINT_VARS: Record<keyof Tint, string> = {
  light: "tint-light",
  lightHi: "tint-light-hi",
  lightDeep: "tint-light-deep",
  dark: "tint-dark",
  darkHi: "tint-dark-hi",
};

const ACCENT_VARS: Record<keyof Accent, string> = {
  accent: "accent",
  accentHover: "accent-hover",
  accentLight: "accent-light",
  accentFg: "accent-fg",
  selected: "selected",
  link: "link",
};

/** Zmienne CSS odcienia motywu (`--mr-tint-light` → `"238 247 250"`). */
export function tintVariables(theme: ThemeName): Record<string, string> {
  const tint = themes[theme].tint;
  return Object.fromEntries(
    (Object.keys(TINT_VARS) as (keyof Tint)[]).map((key) => [cssVar(TINT_VARS[key]), tint[key]]),
  );
}

/** Zmienne CSS akcentu motywu w danym trybie. */
export function accentVariables(theme: ThemeName, mode: Mode): Record<string, string> {
  const accent = themes[theme].accent[mode];
  return Object.fromEntries(
    (Object.keys(ACCENT_VARS) as (keyof Accent)[]).map((key) => [cssVar(ACCENT_VARS[key]), accent[key]]),
  );
}

/** Wszystkie zmienne CSS trybu (kolory i efekty), bez odcienia i akcentu motywu. */
export function modeVariables(mode: Mode): Record<string, string> {
  return Object.fromEntries(
    Object.entries({ ...semantic[mode], ...effects[mode] }).map(([name, value]) => [cssVar(name), value]),
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/**
 * Konkretne kolory dla miejsc bez zmiennych CSS (Expo, React Native): podstawia odcień i akcent motywu
 * w miejsce `var(--mr-…)`, a `color-mix(… X%, transparent)` zamienia na kolor z przezroczystością.
 *
 * @example resolveColors("dark", "moonlight")["bg-primary"] // "rgba(10, 22, 34, 0.96)"
 */
export function resolveColors(mode: Mode = defaultMode, theme: ThemeName = defaultTheme): Record<string, string> {
  const vars: Record<string, string> = {
    ...tintVariables(theme),
    ...accentVariables(theme, mode),
  };
  const lookup = (name: string): string => {
    const value = vars[`--mr-${name}`];
    if (value === undefined) throw new Error(`Nieznana zmienna --mr-${name}`);
    return value;
  };
  const resolve = (value: string): string =>
    value
      .replace(/rgb\(var\(--mr-([a-z-]+)\) \/ ([\d.]+)\)/g, (_, name: string, alpha: string) => {
        const [r, g, b] = lookup(name).split(" ");
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      })
      .replace(/color-mix\(in srgb, var\(--mr-([a-z-]+)\) (\d+)%, transparent\)/g, (_, name: string, pct: string) => {
        const [r, g, b] = hexToRgb(lookup(name));
        return `rgba(${r}, ${g}, ${b}, ${Number(pct) / 100})`;
      })
      .replace(/var\(--mr-([a-z-]+)\)/g, (_, name: string) => lookup(name));

  const accent = themes[theme].accent[mode];
  return {
    ...Object.fromEntries(Object.entries(semantic[mode]).map(([name, value]) => [name, resolve(value)])),
    accent: accent.accent,
    "accent-hover": accent.accentHover,
    "accent-light": accent.accentLight,
    "accent-fg": accent.accentFg,
    link: accent.link,
  };
}
