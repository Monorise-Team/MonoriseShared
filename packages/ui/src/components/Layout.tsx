"use client";

import type { ThemeName } from "@monorise-team/tokens";
import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode, type Ref } from "react";
import { WALLPAPER_BLUR_MAX, WALLPAPER_DIM_MAX, type BackdropMode } from "../lib/appearance.js";
import { cn } from "../lib/cn.js";
import { useTheme } from "../lib/ThemeProvider.js";

/** Ścieżki do wbudowanych tapet doliny dla każdego motywu (z projektu aven-mail). */
export const WALLPAPER_URLS: Record<ThemeName, string> = {
  moonlight: new URL("../../assets/wallpapers/moonlight.jpg", import.meta.url).href,
  amethyst: new URL("../../assets/wallpapers/amethyst.jpg", import.meta.url).href,
  emerald: new URL("../../assets/wallpapers/emerald.jpg", import.meta.url).href,
  mono: new URL("../../assets/wallpapers/mono.jpg", import.meta.url).href,
};

export interface AppBackdropProps extends HTMLAttributes<HTMLDivElement> {
  /** Rodzaj tła: tapeta motywu (domyślnie) albo zastępczy gradient CSS. */
  backdrop?: BackdropMode;
  /** Motyw tapety; domyślnie pobierany z ThemeProvider. */
  theme?: ThemeName;
  /** Przyciemnienie albo rozjaśnienie tapety w procentach (0–80). */
  dim?: number;
  /** Rozmycie tapety w pikselach (0–24). */
  blur?: number;
}

function clamp(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, Math.round(value)));
}

/** Tło pod szklanymi kartami, pod całym widokiem: tapeta motywu z gradientem w tle podczas ładowania. */
export function AppBackdrop({ backdrop, theme, dim, blur, className, style, ...rest }: AppBackdropProps) {
  const { appearance } = useTheme();
  const activeBackdrop = backdrop ?? appearance.backdrop;
  const activeTheme = theme ?? appearance.theme;
  const activeDim = clamp(dim ?? appearance.wallpaperDim, WALLPAPER_DIM_MAX);
  const activeBlur = clamp(blur ?? appearance.wallpaperBlur, WALLPAPER_BLUR_MAX);
  const isGradient = activeBackdrop === "gradient";

  const backdropVars: CSSProperties | undefined =
    activeDim > 0 || activeBlur > 0
      ? ({
          "--mr-wallpaper-dim": activeDim / 100,
          "--mr-wallpaper-blur": `${activeBlur}px`,
          ...style,
        } as CSSProperties)
      : style;

  return (
    <div
      aria-hidden
      data-backdrop={activeBackdrop}
      data-wallpaper={activeTheme}
      className={cn("mr-backdrop", isGradient && "mr-backdrop-gradient", className)}
      style={backdropVars}
      {...rest}
    >
      {!isGradient ? (
        <div
          className={cn("mr-backdrop-image", activeBlur > 0 && "is-blurred")}
          style={{ backgroundImage: `url("${WALLPAPER_URLS[activeTheme]}")` }}
        />
      ) : null}
      {activeDim > 0 ? <div className="mr-backdrop-dim" /> : null}
    </div>
  );
}

export interface AppShellProps extends HTMLAttributes<HTMLDivElement> {
  /** Pasek tytułu nad kartami (np. TitleBar w aplikacji na komputer). */
  titleBar?: ReactNode;
}

/**
 * Układ aplikacji: tło i rząd pływających kart z odstępem 10 px. Dzieci to karty (Card), np. pasek
 * boczny, lista i treść.
 */
export function AppShell({ titleBar, className, children, ...rest }: AppShellProps) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppBackdrop />
      {titleBar}
      <div className={cn("flex min-h-0 flex-1 gap-card p-card", titleBar ? "pt-0" : null, className)} {...rest}>
        {children}
      </div>
    </div>
  );
}

export type WindowPlatform = "windows" | "linux" | "mac";

export interface WindowControlsProps extends HTMLAttributes<HTMLDivElement> {
  /** System okna: na `"mac"` komponent nic nie renderuje (używane są systemowe światła). */
  platform?: WindowPlatform;
  /** Czy okno jest zmaksymalizowane (zmienia ikonę maksymalizacji na przywracanie). */
  maximized?: boolean;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  minimizeLabel?: string;
  maximizeLabel?: string;
  restoreLabel?: string;
  closeLabel?: string;
}

const CAPTION_BUTTON =
  "flex h-full w-[46px] items-center justify-center opacity-85 transition-[opacity,background-color,color] hover:bg-black/[0.07] hover:opacity-100 active:bg-black/[0.04] dark:hover:bg-white/12 dark:active:bg-white/8";

/**
 * Przyciski okna dla Windows i Linuksa (minimalizuj, maksymalizuj/przywróć, zamknij) o szerokości 46 px.
 * Na macOS (`platform="mac"`) nic nie renderuje.
 */
export function WindowControls({
  platform = "windows",
  maximized = false,
  onMinimize,
  onMaximize,
  onClose,
  minimizeLabel = "Minimalizuj",
  maximizeLabel = "Maksymalizuj",
  restoreLabel = "Przywróć",
  closeLabel = "Zamknij",
  className,
  ...rest
}: WindowControlsProps) {
  if (platform === "mac") return null;

  const maxTitle = maximized ? restoreLabel : maximizeLabel;

  return (
    <div className={cn("flex h-full min-h-9 shrink-0 items-stretch", className)} {...rest}>
      <button
        type="button"
        onClick={onMinimize}
        title={minimizeLabel}
        aria-label={minimizeLabel}
        className={CAPTION_BUTTON}
      >
        <Minus size={15} strokeWidth={1.25} aria-hidden />
      </button>
      <button type="button" onClick={onMaximize} title={maxTitle} aria-label={maxTitle} className={CAPTION_BUTTON}>
        {maximized ? (
          <Copy size={12} strokeWidth={1.25} className="-scale-x-100" aria-hidden />
        ) : (
          <Square size={12} strokeWidth={1.25} aria-hidden />
        )}
      </button>
      <button
        type="button"
        onClick={onClose}
        title={closeLabel}
        aria-label={closeLabel}
        className={cn(CAPTION_BUTTON, "hover:bg-danger-solid hover:text-white active:bg-danger-solid-hover")}
      >
        <X size={15} strokeWidth={1.25} aria-hidden />
      </button>
    </div>
  );
}

export interface TitleBarProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Wyśrodkowany tytuł na środku paska (np. nazwa aplikacji i przestrzeni roboczej). */
  title?: ReactNode;
  /** Miejsce na systemowe przyciski okna (macOS: z lewej, np. 80 px). */
  insetStart?: number;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Pasek tytułu wprost na tle. W Tauri przeciąga okno (`data-tauri-drag-region`); elementy klikalne w środku
 * działają normalnie.
 */
export function TitleBar({ title, insetStart = 0, className, style, children, ...rest }: TitleBarProps) {
  const controlsRef = useRef<HTMLDivElement>(null);
  const [controlsWidth, setControlsWidth] = useState(0);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || typeof ResizeObserver === "undefined") return;
    const updateWidth = () => setControlsWidth(controls.getBoundingClientRect().width);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(controls);
    return () => observer.disconnect();
  }, [title]);

  if (title === undefined) {
    return (
      <div
        data-tauri-drag-region
        className={cn(
          "mr-backdrop-text flex h-9 shrink-0 items-center gap-2 px-3 text-xs font-medium tracking-wide select-none",
          className,
        )}
        style={{ paddingInlineStart: insetStart || undefined, ...style }}
        {...rest}
      >
        {children}
      </div>
    );
  }

  const titleInset = Math.max(insetStart, controlsWidth) + 8;

  return (
    <div
      data-tauri-drag-region
      className={cn(
        "mr-backdrop-text relative flex h-9 shrink-0 items-center gap-2 text-xs font-medium tracking-wide select-none",
        className,
      )}
      style={{ paddingInlineStart: insetStart || undefined, ...style }}
      {...rest}
    >
      <div
        data-tauri-drag-region
        style={{ width: `max(0px, calc(100% - ${titleInset * 2}px))` }}
        className="pointer-events-none absolute left-1/2 flex min-w-0 -translate-x-1/2 items-center justify-center overflow-hidden"
      >
        <span
          data-tauri-drag-region
          className="flex min-w-0 items-center gap-2 truncate text-[0.6875rem] font-semibold tracking-[0.12em] uppercase"
        >
          {title}
        </span>
      </div>
      {children ? (
        <div ref={controlsRef} className="ml-auto flex h-full shrink-0 items-center">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Pasek narzędzi w karcie: przyciski w rzędzie, z odstępem. */
export function Toolbar({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div role="toolbar" className={cn("flex items-center gap-1", className)} {...rest} />;
}

export function Separator({ className, vertical = false }: { className?: string; vertical?: boolean }) {
  return (
    <div
      role="separator"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      className={cn(vertical ? "mx-1 h-5 w-px" : "my-1 h-px w-full", "bg-border-secondary", className)}
    />
  );
}
