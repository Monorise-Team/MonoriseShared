"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia?.(QUERY);
  query?.addEventListener("change", onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => {
    query?.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

function snapshot(): boolean {
  return document.documentElement.classList.contains("reduce-motion") || window.matchMedia?.(QUERY).matches === true;
}

/** Czy ograniczyć ruch: ustawienie systemu albo klasa `reduce-motion` na <html>. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
