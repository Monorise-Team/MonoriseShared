"use client";

import {
  densityNames,
  fontScaleNames,
  themeNames,
  themes,
  type Density,
  type FontScale,
  type ThemeName,
} from "@monorise-team/tokens";
import { Check, RotateCcw } from "lucide-react";
import type { KeyboardEvent } from "react";
import {
  WALLPAPER_BLUR_MAX,
  WALLPAPER_DIM_MAX,
  defaultAppearance,
  type BackdropMode,
  type ModePreference,
} from "../lib/appearance.js";
import { cn } from "../lib/cn.js";
import { useTheme } from "../lib/ThemeProvider.js";
import { Button } from "./Button.js";
import { Switch } from "./Checkbox.js";
import { WALLPAPER_URLS } from "./Layout.js";
import { Tabs, TabsList, TabsTrigger } from "./Tabs.js";
import { Select } from "./TextField.js";

export interface AppearanceControlsLabels {
  theme: string;
  mode: string;
  modeLight: string;
  modeDark: string;
  modeSystem: string;
  backdrop: string;
  backdropWallpaper: string;
  backdropGradient: string;
  wallpaperDim: string;
  wallpaperBlur: string;
  fontScale: string;
  fontScales: Record<FontScale, string>;
  density: string;
  densities: Record<Density, string>;
  reduceMotion: string;
  reduceMotionDescription: string;
  glass: string;
  glassDescription: string;
  reset: string;
  themes: Partial<Record<ThemeName, string>>;
}

export const defaultAppearanceLabels: AppearanceControlsLabels = {
  theme: "Motyw",
  mode: "Tryb",
  modeLight: "Jasny",
  modeDark: "Ciemny",
  modeSystem: "System",
  backdrop: "Tło",
  backdropWallpaper: "Zdjęcie",
  backdropGradient: "Gradient",
  wallpaperDim: "Przyciemnienie tapety",
  wallpaperBlur: "Rozmycie tapety",
  fontScale: "Skala tekstu",
  fontScales: {
    small: "Mała (82%)",
    default: "Domyślna (100%)",
    large: "Duża (118%)",
    xlarge: "Bardzo duża (136%)",
  },
  density: "Gęstość listy",
  densities: {
    compact: "Zwarta",
    default: "Domyślna",
    spacious: "Wygodna",
  },
  reduceMotion: "Ogranicz animacje",
  reduceMotionDescription: "Wyłącza ruch niezależnie od ustawień systemu.",
  glass: "Szklane panele",
  glassDescription: "Na słabszych komputerach wyłącz rozmycie szkła i tapety.",
  reset: "Przywróć domyślne",
  themes: {},
};

export interface AppearanceControlsProps {
  /** Wariant o mniejszych odstępach (np. do paska nad katalogiem komponentów). */
  compact?: boolean;
  /** Czy pokazać przycisk przywracania domyślnych ustawień (domyślnie `true`). */
  showReset?: boolean;
  /** Nadpisanie domyślnych polskich etykiet. */
  labels?: Partial<AppearanceControlsLabels>;
  className?: string;
}

/**
 * Zestaw kontrolek wyglądu z `useTheme()`: 4 karty motywów ze skrawkami jasnego/ciemnego akcentu,
 * tryb (Jasny/Ciemny/System), tło (Zdjęcie/Gradient), suwaki przyciemnienia i rozmycia, skala tekstu,
 * gęstość list oraz przełączniki ruchu i szkła.
 */
export function AppearanceControls({
  compact = false,
  showReset = true,
  labels: labelsProp,
  className,
}: AppearanceControlsProps) {
  const { appearance, setAppearance } = useTheme();
  const text: AppearanceControlsLabels = {
    ...defaultAppearanceLabels,
    ...labelsProp,
    fontScales: { ...defaultAppearanceLabels.fontScales, ...labelsProp?.fontScales },
    densities: { ...defaultAppearanceLabels.densities, ...labelsProp?.densities },
    themes: { ...defaultAppearanceLabels.themes, ...labelsProp?.themes },
  };

  const handleThemeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (index + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
    buttons[next]?.click();
  };

  return (
    <div className={cn("@container flex min-w-0 flex-col", compact ? "gap-3" : "gap-5", className)}>
      <div className="space-y-2">
        <span className="block text-xs font-medium text-text-secondary">{text.theme}</span>
        <div
          role="radiogroup"
          aria-label={text.theme}
          onKeyDown={handleThemeKeyDown}
          className="grid grid-cols-2 gap-[clamp(0.375rem,1.5cqi,0.75rem)] sm:grid-cols-4"
        >
          {themeNames.map((name) => {
            const themeDef = themes[name];
            const themeLabel = text.themes[name] ?? themeDef.label;
            const selected = appearance.theme === name;
            return (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setAppearance({ theme: name })}
                className={cn(
                  "group min-w-0 overflow-hidden rounded-xl text-left transition-all",
                  selected
                    ? "ring-2 ring-accent ring-offset-2 ring-offset-bg-primary"
                    : "ring-1 ring-border-primary hover:ring-accent/60",
                )}
              >
                <span
                  className={cn("relative block aspect-[2.15/1] bg-cover bg-center", compact ? "max-h-14" : "max-h-20")}
                  style={{
                    backgroundImage: `url("${WALLPAPER_URLS[name]}"), ${themeDef.backdrop.dark}`,
                  }}
                >
                  <span className="absolute inset-x-[10%] bottom-[10%] flex gap-[8%]">
                    <span className="flex h-[clamp(0.625rem,3cqi,1.25rem)] min-w-0 flex-1 items-center rounded-sm bg-white/70 px-[10%]">
                      <span
                        className="h-[30%] w-full rounded-full"
                        style={{ backgroundColor: themeDef.accent.light.accent }}
                      />
                    </span>
                    <span className="flex h-[clamp(0.625rem,3cqi,1.25rem)] min-w-0 flex-1 items-center rounded-sm bg-black/45 px-[10%]">
                      <span
                        className="h-[30%] w-full rounded-full"
                        style={{ backgroundColor: themeDef.accent.dark.accent }}
                      />
                    </span>
                  </span>
                  {selected ? (
                    <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-accent text-accent-fg shadow">
                      <Check className="size-3" aria-hidden />
                    </span>
                  ) : null}
                </span>
                <span className="block truncate bg-bg-secondary px-[clamp(0.375rem,1.5cqi,0.625rem)] py-[clamp(0.3rem,1.2cqi,0.5rem)] text-xs font-medium text-text-primary">
                  {themeLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-text-secondary">{text.mode}</span>
          <Tabs value={appearance.mode} onValueChange={(mode) => setAppearance({ mode: mode as ModePreference })}>
            <TabsList aria-label={text.mode}>
              <TabsTrigger value="light">{text.modeLight}</TabsTrigger>
              <TabsTrigger value="dark">{text.modeDark}</TabsTrigger>
              <TabsTrigger value="system">{text.modeSystem}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-text-secondary">{text.backdrop}</span>
          <Tabs
            value={appearance.backdrop}
            onValueChange={(backdrop) => setAppearance({ backdrop: backdrop as BackdropMode })}
          >
            <TabsList aria-label={text.backdrop}>
              <TabsTrigger value="wallpaper">{text.backdropWallpaper}</TabsTrigger>
              <TabsTrigger value="gradient">{text.backdropGradient}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between text-xs font-medium text-text-secondary">
            <span>{text.wallpaperDim}</span>
            <span className="text-text-tertiary tabular-nums">{appearance.wallpaperDim}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={WALLPAPER_DIM_MAX}
            value={appearance.wallpaperDim}
            onChange={(event) => setAppearance({ wallpaperDim: Number(event.target.value) })}
            className="h-7 w-full accent-[var(--mr-accent)]"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between text-xs font-medium text-text-secondary">
            <span>{text.wallpaperBlur}</span>
            <span className="text-text-tertiary tabular-nums">{appearance.wallpaperBlur} px</span>
          </span>
          <input
            type="range"
            min={0}
            max={WALLPAPER_BLUR_MAX}
            value={appearance.wallpaperBlur}
            onChange={(event) => setAppearance({ wallpaperBlur: Number(event.target.value) })}
            className="h-7 w-full accent-[var(--mr-accent)]"
          />
        </label>

        <Select
          label={text.fontScale}
          value={appearance.fontScale}
          onChange={(event) => setAppearance({ fontScale: event.target.value as FontScale })}
        >
          {fontScaleNames.map((name) => (
            <option key={name} value={name}>
              {text.fontScales[name]}
            </option>
          ))}
        </Select>

        <Select
          label={text.density}
          value={appearance.density}
          onChange={(event) => setAppearance({ density: event.target.value as Density })}
        >
          {densityNames.map((name) => (
            <option key={name} value={name}>
              {text.densities[name]}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Switch
          label={text.reduceMotion}
          description={text.reduceMotionDescription}
          checked={appearance.reduceMotion}
          onCheckedChange={(reduceMotion) => setAppearance({ reduceMotion })}
        />
        <Switch
          label={text.glass}
          description={text.glassDescription}
          checked={appearance.glass}
          onCheckedChange={(glass) => setAppearance({ glass })}
        />
      </div>

      {showReset ? (
        <div>
          <Button variant="outline" size="sm" icon={<RotateCcw />} onClick={() => setAppearance(defaultAppearance)}>
            {text.reset}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
