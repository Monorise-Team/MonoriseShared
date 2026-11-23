import { defaultMode, defaultTheme, themeNames, type ThemeName } from "@monorise-team/tokens";

/** Tryb wybrany przez użytkownika; „system” idzie za ustawieniem systemu. */
export type ModePreference = "light" | "dark" | "system";

export interface Appearance {
  mode: ModePreference;
  theme: ThemeName;
  /** Ogranicz ruch niezależnie od systemu. */
  reduceMotion: boolean;
  /** Wyłącz szkło (backdrop-filter) na słabszych komputerach. */
  glass: boolean;
}

export const APPEARANCE_STORAGE_KEY = "monorise-appearance";

export const defaultAppearance: Appearance = {
  mode: defaultMode,
  theme: defaultTheme,
  reduceMotion: false,
  glass: true,
};

/** Czyta zapisany wygląd; uszkodzony albo niedostępny zapis daje wygląd domyślny. */
export function readAppearance(storage: Pick<Storage, "getItem"> | undefined): Appearance {
  try {
    const raw = storage?.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return defaultAppearance;
    const parsed = JSON.parse(raw) as Partial<Appearance>;
    return {
      mode: parsed.mode === "light" || parsed.mode === "dark" || parsed.mode === "system" ? parsed.mode : defaultMode,
      theme: themeNames.includes(parsed.theme as ThemeName) ? (parsed.theme as ThemeName) : defaultTheme,
      reduceMotion: parsed.reduceMotion === true,
      glass: parsed.glass !== false,
    };
  } catch {
    return defaultAppearance;
  }
}

export function resolveMode(mode: ModePreference, systemDark: boolean): "light" | "dark" {
  return mode === "system" ? (systemDark ? "dark" : "light") : mode;
}

/** Ustawia klasy i atrybuty na <html>: `dark`, `data-theme`, `reduce-motion`, `no-glass`. */
export function applyAppearance(root: HTMLElement, appearance: Appearance, systemDark: boolean): void {
  const dark = resolveMode(appearance.mode, systemDark) === "dark";
  root.classList.toggle("dark", dark);
  root.classList.toggle("reduce-motion", appearance.reduceMotion);
  root.classList.toggle("no-glass", !appearance.glass);
  root.dataset.theme = appearance.theme;
}

/**
 * Skrypt do wstawienia w <head> przed pierwszym malowaniem (np. w layout.tsx Next.js), żeby strona nie
 * mignęła złym trybem. Robi to samo co applyAppearance, bez Reacta.
 */
export const appearanceInitScript = `(function(){try{var a=JSON.parse(localStorage.getItem(${JSON.stringify(
  APPEARANCE_STORAGE_KEY,
)})||"{}")}catch(e){a={}}var m=a.mode||${JSON.stringify(defaultMode)};var d=m==="system"?matchMedia("(prefers-color-scheme: dark)").matches:m==="dark";var r=document.documentElement;r.classList.toggle("dark",d);r.classList.toggle("reduce-motion",a.reduceMotion===true);r.classList.toggle("no-glass",a.glass===false);r.dataset.theme=${JSON.stringify(
  themeNames,
)}.indexOf(a.theme)>=0?a.theme:${JSON.stringify(defaultTheme)};})();`;
