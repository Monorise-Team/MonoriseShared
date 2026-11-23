"use client";

import { createContext, use, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  APPEARANCE_STORAGE_KEY,
  applyAppearance,
  defaultAppearance,
  readAppearance,
  resolveMode,
  type Appearance,
} from "./appearance.js";

interface ThemeContextValue {
  appearance: Appearance;
  /** Tryb po rozstrzygnięciu „system”. */
  resolvedMode: "light" | "dark";
  setAppearance: (change: Partial<Appearance>) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(DARK_QUERY).matches
    : true;
}

function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Wygląd aplikacji: tryb (jasny, ciemny, systemowy), motyw, ograniczony ruch i szkło. Zapisuje wybór
 * w localStorage i ustawia klasy na <html>. Jedna instancja na aplikację.
 */
export function ThemeProvider({ children, initial }: { children: ReactNode; initial?: Partial<Appearance> }) {
  const [appearance, setState] = useState<Appearance>(() => ({ ...readAppearance(storage()), ...initial }));
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = () => setSystemDark(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    applyAppearance(document.documentElement, appearance, systemDark);
  }, [appearance, systemDark]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      appearance,
      resolvedMode: resolveMode(appearance.mode, systemDark),
      setAppearance: (change) =>
        setState((current) => {
          const next = { ...current, ...change };
          try {
            storage()?.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(next));
          } catch {
            // Brak dostępu do localStorage (np. tryb prywatny): wygląd działa do końca sesji
          }
          return next;
        }),
    }),
    [appearance, systemDark],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const context = use(ThemeContext);
  if (!context) {
    return { appearance: defaultAppearance, resolvedMode: "dark", setAppearance: () => {} };
  }
  return context;
}
