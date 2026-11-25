"use client";

import { createContext, use, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  APPEARANCE_STORAGE_KEY,
  applyAppearance,
  defaultAppearance,
  normalizeAppearance,
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

function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/*
 * Zapisany wygląd jako zewnętrzny magazyn dla useSyncExternalStore. Na serwerze i podczas hydratacji
 * React bierze wygląd domyślny, więc pierwszy render zgadza się z HTML z serwera; zaraz potem renderuje
 * zapisany wygląd. Bez renderowania na serwerze zapisany wygląd jest od razu w pierwszym renderze.
 */
const listeners = new Set<() => void>();
/** Wygląd z tej karty, gdy localStorage jest niedostępny (np. tryb prywatny). */
let memoryAppearance: Appearance | undefined;
let cached: { raw: string | null; appearance: Appearance } | undefined;

function readRaw(): string | null {
  try {
    return storage()?.getItem(APPEARANCE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function getStoredAppearance(): Appearance {
  if (memoryAppearance) return memoryAppearance;
  const raw = readRaw();
  if (cached?.raw !== raw) cached = { raw, appearance: readAppearance({ getItem: () => raw }) };
  return cached.appearance;
}

function getServerAppearance(): Appearance {
  return defaultAppearance;
}

function subscribeAppearance(listener: () => void): () => void {
  listeners.add(listener);
  // Zmiana wyglądu w innej karcie tej samej aplikacji
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === APPEARANCE_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function saveAppearance(next: Appearance): void {
  try {
    const store = storage();
    if (!store) throw new Error("localStorage niedostępny");
    store.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(next));
    memoryAppearance = undefined;
  } catch {
    // Brak dostępu do localStorage: wygląd działa do końca sesji tej karty
    memoryAppearance = next;
  }
  for (const listener of listeners) listener();
}

function subscribeSystemDark(listener: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function getSystemDark(): boolean {
  return typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY).matches : true;
}

function getServerSystemDark(): boolean {
  return true;
}

/**
 * Wygląd aplikacji: tryb (jasny, ciemny, systemowy), motyw, tło, gęstość, skala tekstu, ograniczony ruch
 * i szkło. Zapisuje wybór w localStorage i ustawia klasy i atrybuty na <html>. Jedna instancja na aplikację.
 * `initial` nadpisuje zapisany wygląd do pierwszej zmiany; potem zapisuje się razem z nią.
 *
 * W aplikacjach renderowanych na serwerze wstaw `appearanceInitScript` w <head>: ustawia wygląd przed
 * pierwszym malowaniem, a `AppBackdrop` bierze z niego tapetę, przyciemnienie i rozmycie przez CSS.
 */
export function ThemeProvider({ children, initial }: { children: ReactNode; initial?: Partial<Appearance> }) {
  const stored = useSyncExternalStore(subscribeAppearance, getStoredAppearance, getServerAppearance);
  const systemDark = useSyncExternalStore(subscribeSystemDark, getSystemDark, getServerSystemDark);
  const [override, setOverride] = useState(initial);
  const overrideRef = useRef(initial);

  const appearance = useMemo(
    () => (override ? normalizeAppearance({ ...stored, ...override }) : stored),
    [stored, override],
  );

  useEffect(() => {
    applyAppearance(document.documentElement, appearance, systemDark);
  }, [appearance, systemDark]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      appearance,
      resolvedMode: resolveMode(appearance.mode, systemDark),
      setAppearance: (change) => {
        // Od najnowszego zapisu, żeby kilka zmian w jednym zdarzeniu się nie nadpisało
        const current = getStoredAppearance();
        const base = overrideRef.current ? { ...current, ...overrideRef.current } : current;
        overrideRef.current = undefined;
        saveAppearance(normalizeAppearance({ ...base, ...change }));
        setOverride(undefined);
      },
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
