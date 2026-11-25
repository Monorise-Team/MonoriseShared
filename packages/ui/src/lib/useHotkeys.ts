"use client";

import { useEffect, useRef } from "react";
import { SEQUENCE_TIMEOUT_MS, createSequenceTracker } from "./shortcuts.js";

export type HotkeyHandler = (event: KeyboardEvent) => void;

export interface HotkeyBinding {
  shortcut: string;
  handler: HotkeyHandler;
  /** Czy skrót ma działać także w polach tekstowych (`input`, `textarea`, `select`, `contenteditable`). */
  allowInInputs?: boolean;
  /** Czy zablokować domyślną akcję przeglądarki po dopasowaniu (domyślnie `true`). */
  preventDefault?: boolean;
  /** Czy wywoływać akcję przy przytrzymaniu klawisza (`event.repeat`, domyślnie `false`). */
  repeat?: boolean;
  /** Czy pojedyncze wiązanie jest aktywne (domyślnie `true`). */
  enabled?: boolean;
}

export type HotkeyBindings = Readonly<Record<string, HotkeyHandler | undefined>> | readonly HotkeyBinding[];

export interface UseHotkeysOptions {
  /** Czy skróty są włączone (domyślnie `true`). */
  enabled?: boolean;
  /** Wyłącza wszystkie skróty w tym hooku (alternatywa dla `enabled: false`). */
  disabled?: boolean;
  /** Czy zezwalać na skróty w polach tekstowych (domyślnie `false`). */
  allowInInputs?: boolean;
  /** Okno czasowe w ms na drugi krok sekwencji (domyślnie `1000`). */
  sequenceTimeoutMs?: number;
  /** Czy wstrzymać skróty, gdy otwarte jest okno modalne `[aria-modal="true"]` (domyślnie `false`). */
  ignoreWhenModalOpen?: boolean;
  /** Wymuszenie układu Apple lub innego niż Apple (przydatne w testach). */
  mac?: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.matches("input, textarea, select") || target.closest("input, textarea, select")) {
    return true;
  }
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  const editableHost = target.closest("[contenteditable]");
  if (editableHost) {
    return editableHost.getAttribute("contenteditable") !== "false";
  }
  return false;
}

function normalizeBindings(bindings: HotkeyBindings, defaultAllowInInputs: boolean): HotkeyBinding[] {
  if (Array.isArray(bindings)) {
    return bindings.filter((item): item is HotkeyBinding => Boolean(item.shortcut) && item.enabled !== false);
  }
  const result: HotkeyBinding[] = [];
  for (const [shortcut, handler] of Object.entries(bindings)) {
    if (!shortcut || !handler) continue;
    result.push({ shortcut, handler, allowInInputs: defaultAllowInInputs });
  }
  return result;
}

function bindingsSignature(bindings: HotkeyBindings, defaultAllowInInputs: boolean): string {
  return normalizeBindings(bindings, defaultAllowInInputs)
    .map((item) => item.shortcut)
    .join("\u0000");
}

/**
 * Rejestruje skróty klawiszowe i sekwencje na `window`. Ignoruje zdarzenia z pól tekstowych,
 * chyba że ustawiono `allowInInputs`, i automatycznie sprząta po odmontowaniu komponentu.
 */
export function useHotkeys(bindings: HotkeyBindings, options: UseHotkeysOptions = {}): void {
  const isActive = !options.disabled && options.enabled !== false;
  const sequenceTimeoutMs = options.sequenceTimeoutMs ?? SEQUENCE_TIMEOUT_MS;
  const signature = bindingsSignature(bindings, options.allowInInputs === true);
  const bindingsRef = useRef<HotkeyBindings>(bindings);
  const optionsRef = useRef<UseHotkeysOptions>(options);
  const trackerRef = useRef(createSequenceTracker(sequenceTimeoutMs));

  useEffect(() => {
    bindingsRef.current = bindings;
  }, [bindings]);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Czyścimy oczekującą sekwencję dopiero przy zmianie zestawu skrótów lub czasu okna,
  // aby zwykłe przerenderowanie z nowym obiektem nie przerywało sekwencji w trakcie wpisywania.
  useEffect(() => {
    trackerRef.current.reset();
  }, [signature]);

  useEffect(() => {
    trackerRef.current = createSequenceTracker(sequenceTimeoutMs);
  }, [sequenceTimeoutMs]);

  useEffect(() => {
    if (!isActive) {
      trackerRef.current.reset();
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const currentOptions = optionsRef.current;
      if (event.isComposing || event.defaultPrevented) {
        trackerRef.current.reset();
        return;
      }
      if (currentOptions.ignoreWhenModalOpen && document.querySelector('[aria-modal="true"]')) {
        trackerRef.current.reset();
        return;
      }

      const editing = isEditableTarget(event.target);
      const defaultAllowInInputs = currentOptions.allowInInputs === true;
      const list = normalizeBindings(bindingsRef.current, defaultAllowInInputs).filter(
        (item) => !editing || (item.allowInInputs ?? defaultAllowInInputs),
      );

      if (list.length === 0) {
        trackerRef.current.reset();
        return;
      }

      const matchOptions: { mac?: boolean; allowSequences: boolean } = {
        allowSequences: !editing,
        ...(currentOptions.mac !== undefined ? { mac: currentOptions.mac } : {}),
      };
      const result = trackerRef.current.match(event, list, matchOptions);

      if (result.status === "pending") {
        event.preventDefault();
        return;
      }

      if (result.status === "matched") {
        if (result.item.preventDefault !== false) {
          event.preventDefault();
        }
        if (!event.repeat || result.item.repeat) {
          result.item.handler(event);
        }
      }
    };

    const onBlur = () => {
      trackerRef.current.reset();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onBlur);
    return () => {
      trackerRef.current.reset();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onBlur);
    };
  }, [isActive, sequenceTimeoutMs]);
}
