import {
  defaultDensity,
  defaultFontScale,
  defaultMode,
  defaultTheme,
  densityNames,
  fontScaleNames,
  themeNames,
  type Density,
  type FontScale,
  type ThemeName,
} from "@monorise-team/tokens";

/** Tryb wybrany przez użytkownika; „system” idzie za ustawieniem systemu. */
export type ModePreference = "light" | "dark" | "system";

/** Rodzaj tła aplikacji: tapeta motywu albo zastępczy gradient CSS. */
export type BackdropMode = "wallpaper" | "gradient";

export const backdropModes = ["wallpaper", "gradient"] as const satisfies readonly BackdropMode[];
export const defaultBackdrop: BackdropMode = "wallpaper";
export const WALLPAPER_DIM_MAX = 80;
export const WALLPAPER_BLUR_MAX = 24;

export type { Density, FontScale };

export interface Appearance {
  mode: ModePreference;
  theme: ThemeName;
  /** Tło pod kartami: tapeta motywu (domyślnie) albo zastępczy gradient CSS. */
  backdrop: BackdropMode;
  /** Przyciemnienie (w ciemnym trybie) albo rozjaśnienie (w jasnym) tapety w procentach (0–80). */
  wallpaperDim: number;
  /** Rozmycie tapety w pikselach (0–24). */
  wallpaperBlur: number;
  /** Skala rozmiaru tekstu na `<html>`. */
  fontScale: FontScale;
  /** Gęstość wierszy list. */
  density: Density;
  /** Ogranicz ruch niezależnie od systemu. */
  reduceMotion: boolean;
  /** Wyłącz szkło (backdrop-filter) na słabszych komputerach. */
  glass: boolean;
}

export const APPEARANCE_STORAGE_KEY = "monorise-appearance";

export const defaultAppearance: Appearance = {
  mode: defaultMode,
  theme: defaultTheme,
  backdrop: defaultBackdrop,
  wallpaperDim: 0,
  wallpaperBlur: 0,
  fontScale: defaultFontScale,
  density: defaultDensity,
  reduceMotion: false,
  glass: true,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/** Uzupełnia brakujące lub błędne pola wyglądu wartościami domyślnymi (zgodność ze starszym zapisem). */
export function normalizeAppearance(parsed: Partial<Appearance>): Appearance {
  return {
    mode: parsed.mode === "light" || parsed.mode === "dark" || parsed.mode === "system" ? parsed.mode : defaultMode,
    theme: themeNames.includes(parsed.theme as ThemeName) ? (parsed.theme as ThemeName) : defaultTheme,
    backdrop: parsed.backdrop === "gradient" || parsed.backdrop === "wallpaper" ? parsed.backdrop : defaultBackdrop,
    wallpaperDim: clampInt(parsed.wallpaperDim, 0, WALLPAPER_DIM_MAX, defaultAppearance.wallpaperDim),
    wallpaperBlur: clampInt(parsed.wallpaperBlur, 0, WALLPAPER_BLUR_MAX, defaultAppearance.wallpaperBlur),
    fontScale: fontScaleNames.includes(parsed.fontScale as FontScale)
      ? (parsed.fontScale as FontScale)
      : defaultFontScale,
    density: densityNames.includes(parsed.density as Density) ? (parsed.density as Density) : defaultDensity,
    reduceMotion: parsed.reduceMotion === true,
    glass: parsed.glass !== false,
  };
}

/** Czyta zapisany wygląd; uszkodzony albo niedostępny zapis daje wygląd domyślny. */
export function readAppearance(storage: Pick<Storage, "getItem"> | undefined): Appearance {
  try {
    const raw = storage?.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return defaultAppearance;
    const parsed = JSON.parse(raw) as Partial<Appearance>;
    if (!parsed || typeof parsed !== "object") return defaultAppearance;
    return normalizeAppearance(parsed);
  } catch {
    return defaultAppearance;
  }
}

export function resolveMode(mode: ModePreference, systemDark: boolean): "light" | "dark" {
  return mode === "system" ? (systemDark ? "dark" : "light") : mode;
}

/** Ustawia klasy i atrybuty na <html>: `dark`, `data-theme`, `data-backdrop`, `data-font-scale`, `data-density`, `reduce-motion`, `no-glass`. */
export function applyAppearance(
  root: HTMLElement,
  appearance: Pick<Appearance, "mode" | "theme" | "reduceMotion" | "glass"> & Partial<Appearance>,
  systemDark: boolean,
): void {
  const normalized = normalizeAppearance(appearance);
  const dark = resolveMode(normalized.mode, systemDark) === "dark";
  root.classList.toggle("dark", dark);
  root.classList.toggle("reduce-motion", normalized.reduceMotion);
  root.classList.toggle("no-glass", !normalized.glass);
  root.dataset.theme = normalized.theme;
  root.dataset.backdrop = normalized.backdrop;
  root.dataset.fontScale = normalized.fontScale;
  root.dataset.density = normalized.density;
}

/**
 * Skrypt do wstawienia w <head> przed pierwszym malowaniem (np. w layout.tsx Next.js), żeby strona nie
 * mignęła złym trybem ani rozmiarem tekstu. Robi to samo co applyAppearance, bez Reacta.
 */
export const appearanceInitScript = `(function(){try{var a=JSON.parse(localStorage.getItem(${JSON.stringify(
  APPEARANCE_STORAGE_KEY,
)})||"{}")}catch(e){a={}}if(!a||typeof a!=="object")a={};var m=a.mode||${JSON.stringify(defaultMode)};var d=m==="system"?matchMedia("(prefers-color-scheme: dark)").matches:m==="dark";var r=document.documentElement;r.classList.toggle("dark",d);r.classList.toggle("reduce-motion",a.reduceMotion===true);r.classList.toggle("no-glass",a.glass===false);r.dataset.theme=${JSON.stringify(
  themeNames,
)}.indexOf(a.theme)>=0?a.theme:${JSON.stringify(defaultTheme)};r.dataset.backdrop=a.backdrop==="gradient"?"gradient":"wallpaper";r.dataset.fontScale=${JSON.stringify(
  fontScaleNames,
)}.indexOf(a.fontScale)>=0?a.fontScale:${JSON.stringify(defaultFontScale)};r.dataset.density=${JSON.stringify(
  densityNames,
)}.indexOf(a.density)>=0?a.density:${JSON.stringify(defaultDensity)};})();`;
