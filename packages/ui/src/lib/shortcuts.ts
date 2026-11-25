/** Obsługa skrótów klawiszowych: parsowanie, formatowanie, dopasowanie, sekwencje i wykrywanie konfliktów. */

/** Domyślne okno czasowe (ms) na wciśnięcie drugiego klawisza w sekwencji. */
export const SEQUENCE_TIMEOUT_MS = 1000;

/** Klawisze systemowe i edycyjne, których aplikacja nie powinna nadpisywać domyślnie. */
export const DEFAULT_RESERVED_SHORTCUTS: readonly string[] = [
  "mod+q",
  "mod+w",
  "mod+h",
  "mod+m",
  "mod+c",
  "mod+v",
  "mod+x",
  "mod+z",
  "mod+shift+z",
  "mod+a",
  "mod+space",
  "alt+f4",
  "ctrl+alt+delete",
  "tab",
  "shift+tab",
  "escape",
];

export interface ShortcutChord {
  /** Przenośny główny modyfikator platformy (`⌘` na Apple, `Ctrl` na pozostałych). */
  mod: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  /** Znormalizowana nazwa klawisza (np. `"k"`, `"?"`, `"Space"`, `"ArrowDown"`). */
  key: string;
}

export interface ParsedShortcut {
  chords: readonly ShortcutChord[];
  isSequence: boolean;
  /** Znormalizowany zapis tekstowy, np. `"mod+k"` lub `"g i"`. */
  normalized: string;
}

export type ShortcutKeyboardEvent = Pick<KeyboardEvent, "key"> &
  Partial<Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "getModifierState">>;

export interface ShortcutFormatOptions {
  mac?: boolean;
  emptyLabel?: string;
}

export interface ShortcutConflictOptions {
  /** Identyfikator zmienianego skrótu (pomijany w porównaniu). */
  currentId?: string;
  /** Dodatkowe (lub jedyne przy `includeDefaultReserved: false`) zastrzeżone skróty. */
  reserved?: readonly string[];
  /** Czy uwzględnić domyślną listę skrótów systemowych (domyślnie `true`). */
  includeDefaultReserved?: boolean;
  /** Maksymalna liczba kroków w sekwencji (domyślnie `2`). */
  maxSequenceLength?: number;
}

export type ShortcutIssue =
  | { type: "invalid" }
  | { type: "reserved"; shortcut: string }
  | { type: "conflict"; conflictId: string; conflictLabel?: string; shortcut: string };

const MODIFIER_ORDER = ["mod", "ctrl", "alt", "meta", "shift"] as const;
type ModifierKey = (typeof MODIFIER_ORDER)[number];

const MODIFIER_ALIASES: Record<string, ModifierKey> = {
  mod: "mod",
  cmdorctrl: "mod",
  commandorcontrol: "mod",
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  opt: "alt",
  meta: "meta",
  cmd: "meta",
  command: "meta",
  shift: "shift",
};

const NAMED_KEY_ALIASES: Record<string, string> = {
  esc: "Escape",
  escape: "Escape",
  enter: "Enter",
  return: "Enter",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Delete",
  del: "Delete",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  insert: "Insert",
  space: "Space",
  spacebar: "Space",
  plus: "Plus",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
};

const VALID_NAMED_KEY =
  /^(?:Space|Plus|Escape|Enter|Tab|Backspace|Delete|Home|End|PageUp|PageDown|Insert|Arrow(?:Up|Down|Left|Right)|F(?:[1-9]|1[0-9]|2[0-4]))$/;

/** Sprawdza, czy aplikacja działa na urządzeniu Apple (macOS, iOS, iPadOS). */
export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");
}

function normalizeNamedKey(raw: string): string {
  if (raw === " ") return "Space";
  if (raw === "+") return "Plus";
  const lower = raw.toLowerCase();
  const mapped = NAMED_KEY_ALIASES[lower];
  if (mapped) return mapped;
  if (/^f(?:[1-9]|1[0-9]|2[0-4])$/i.test(raw)) return raw.toUpperCase();
  return raw;
}

function parseChord(rawChord: string): { chord: ShortcutChord; normalized: string } {
  const trimmed = rawChord.trim();
  if (!trimmed) throw new Error("Nieprawidłowy skrót klawiszowy");

  let tokens: string[];
  if (trimmed === "+") {
    tokens = ["+"];
  } else if (trimmed.endsWith("++")) {
    const prefix = trimmed.slice(0, -2);
    tokens = [...(prefix ? prefix.split("+") : []), "+"].map((part) => (part === "" ? " " : part.trim()));
  } else {
    tokens = trimmed.split("+").map((part) => (part === "" ? " " : part.trim()));
  }
  const rawKey = tokens.pop();
  if (!rawKey) throw new Error("Nieprawidłowy skrót klawiszowy");

  const normalizedKey = normalizeNamedKey(rawKey);
  if (normalizedKey.toLowerCase() in MODIFIER_ALIASES) {
    throw new Error("Nieprawidłowy skrót klawiszowy");
  }
  if (normalizedKey.length > 1 && !VALID_NAMED_KEY.test(normalizedKey)) {
    throw new Error("Nieprawidłowy skrót klawiszowy");
  }

  const mods = new Set<ModifierKey>();
  for (const part of tokens) {
    const mod = MODIFIER_ALIASES[part.toLowerCase()];
    if (!mod) throw new Error("Nieprawidłowy skrót klawiszowy");
    mods.add(mod);
  }

  const finalKey = normalizedKey.length === 1 ? normalizedKey.toLowerCase() : normalizedKey;
  const hasNonShiftModifier = mods.has("mod") || mods.has("ctrl") || mods.has("alt") || mods.has("meta");
  // Znak przestankowy wymagający Shift na układzie klawiatury (np. "shift+?" albo "shift+#") zapisujemy bez "shift",
  // chyba że towarzyszy mu mod/ctrl/alt/meta (np. "mod+shift+/").
  if (mods.has("shift") && !hasNonShiftModifier && finalKey.length === 1 && !/[a-z0-9]/i.test(finalKey)) {
    mods.delete("shift");
  }

  const chord: ShortcutChord = {
    mod: mods.has("mod"),
    ctrl: mods.has("ctrl"),
    alt: mods.has("alt"),
    meta: mods.has("meta"),
    shift: mods.has("shift"),
    key: finalKey,
  };

  const orderedMods = MODIFIER_ORDER.filter((m) => chord[m]);
  return {
    chord,
    normalized: [...orderedMods, finalKey].join("+"),
  };
}

function splitChords(value: string): string[] {
  if (value === " ") return ["Space"];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (/\s+then\s+/i.test(trimmed)) {
    return trimmed.split(/\s+then\s+/i).filter(Boolean);
  }
  return trimmed.split(/\s+/).filter(Boolean);
}

/** Parsuje pojedynczy akord (`"mod+k"`, `"shift+?"`) lub sekwencję (`"g i"`, `"g then i"`). */
export function parseShortcut(value: string): ParsedShortcut {
  const rawChords = splitChords(value);
  if (rawChords.length === 0) {
    throw new Error("Nieprawidłowy skrót klawiszowy");
  }

  const parsed = rawChords.map(parseChord);
  return {
    chords: parsed.map((item) => item.chord),
    isSequence: parsed.length > 1,
    normalized: parsed.map((item) => item.normalized).join(" "),
  };
}

/** Normalizuje skrót do kanonicznej postaci lub zwraca `""` dla pustego ciągu. */
export function normalizeShortcut(value: string): string {
  if (value !== " " && !value.trim()) return "";
  return parseShortcut(value).normalized;
}

/** Sprawdza, czy tekst opisuje poprawny skrót lub sekwencję. */
export function isValidShortcut(value: string): boolean {
  if (value !== " " && !value.trim()) return false;
  try {
    parseShortcut(value);
    return true;
  } catch {
    return false;
  }
}

function formatSingleChord(chord: ShortcutChord, mac: boolean): string {
  const keyLabels: Record<string, string> = {
    Space: "␣",
    ArrowDown: "↓",
    ArrowUp: "↑",
    ArrowLeft: "←",
    ArrowRight: "→",
    Escape: "Esc",
    Enter: "↵",
    Plus: "+",
  };

  const modLabels: Record<ModifierKey, string> = {
    mod: mac ? "⌘" : "Ctrl",
    ctrl: mac ? "⌃" : "Ctrl",
    alt: mac ? "⌥" : "Alt",
    meta: mac ? "⌘" : "Meta",
    shift: mac ? "⇧" : "Shift",
  };

  const parts = MODIFIER_ORDER.filter((m) => chord[m]).map((m) => modLabels[m]);
  const keyLabel = keyLabels[chord.key] ?? (chord.key.length === 1 ? chord.key.toUpperCase() : chord.key);
  parts.push(keyLabel);

  return parts.join(mac ? "" : "+");
}

/** Zwraca etykiety kolejnych kroków skrótu (np. `["G", "I"]` lub `["⌘K"]`). */
export function formatShortcutParts(value: string, options: { mac?: boolean } = {}): string[] {
  if (value !== " " && !value.trim()) return [];
  const mac = options.mac ?? isApplePlatform();
  try {
    const parsed = parseShortcut(value);
    return parsed.chords.map((chord) => formatSingleChord(chord, mac));
  } catch {
    return [value];
  }
}

/** Formatuje skrót do postaci przyjaznej użytkownikowi zgodnie z platformą (jak w aven-mail). */
export function formatShortcut(value: string, options: ShortcutFormatOptions = {}): string {
  if (value !== " " && !value.trim()) return options.emptyLabel ?? "-";
  return formatShortcutParts(value, { mac: options.mac }).join(" → ");
}

/** Sprawdza, czy zdarzenie klawiatury odpowiada pojedynczemu akordowi (nie sekwencji). */
export function matchesShortcut(
  event: ShortcutKeyboardEvent,
  shortcut: string,
  options: { mac?: boolean } = {},
): boolean {
  if (!shortcut || (shortcut !== " " && !shortcut.trim())) return false;
  let parsed: ParsedShortcut;
  try {
    parsed = parseShortcut(shortcut);
  } catch {
    return false;
  }
  if (parsed.chords.length !== 1) return false;
  const chord = parsed.chords[0];
  if (!chord) return false;

  if (event.getModifierState?.("AltGraph")) return false;

  const mac = options.mac ?? isApplePlatform();
  const expectedCtrl = chord.ctrl || (!mac && chord.mod);
  const expectedMeta = chord.meta || (mac && chord.mod);

  if (Boolean(event.ctrlKey) !== expectedCtrl) return false;
  if (Boolean(event.metaKey) !== expectedMeta) return false;
  if (Boolean(event.altKey) !== chord.alt) return false;

  const printablePunctuation = chord.key.length === 1 && !/[a-z0-9]/i.test(chord.key);
  if (chord.shift) {
    if (!event.shiftKey) return false;
  } else if (!printablePunctuation && Boolean(event.shiftKey)) {
    return false;
  }

  const targetKey = chord.key === "Space" ? " " : chord.key === "Plus" ? "+" : chord.key;
  if (event.key.toLowerCase() === targetKey.toLowerCase()) return true;

  // Option na macOS zmienia event.key (np. Option+K → "˚"); sprawdzamy też event.code.
  const code = event.code ?? "";
  return (
    (expectedCtrl || expectedMeta || chord.alt) &&
    /^[a-z0-9]$/i.test(chord.key) &&
    code === `${/[0-9]/.test(chord.key) ? "Digit" : "Key"}${chord.key.toUpperCase()}`
  );
}

const IGNORED_RECORD_KEYS = new Set(["Control", "Meta", "Alt", "Shift", "Dead", "Process", "Unidentified"]);

/** Zamienia zdarzenie klawiatury na znormalizowany zapis akordu do nagrywania skrótów. */
export function recordShortcut(event: ShortcutKeyboardEvent, options: { mac?: boolean } = {}): string | null {
  const mac = options.mac ?? isApplePlatform();
  if (event.getModifierState?.("AltGraph") || (mac ? event.ctrlKey : event.metaKey)) return null;
  if (IGNORED_RECORD_KEYS.has(event.key)) return null;

  const mods: string[] = [];
  if (mac ? event.metaKey : event.ctrlKey) mods.push("mod");
  if (event.altKey) mods.push("alt");
  if (event.shiftKey) mods.push("shift");

  const codeMatch = /^(?:Key|Digit)([A-Z0-9])$/.exec(event.code ?? "");
  const key =
    (event.ctrlKey || event.metaKey || event.altKey) && codeMatch?.[1]
      ? codeMatch[1]
      : event.key === " "
        ? "Space"
        : event.key === "+"
          ? "Plus"
          : event.key;

  try {
    return normalizeShortcut([...mods, key].join("+"));
  } catch {
    return null;
  }
}

/** Sprawdza, czy dwa skróty kolidują (identyczne albo jeden jest prefiksem sekwencji drugiego). */
export function shortcutsConflict(first: string, second: string): boolean {
  let a: string;
  let b: string;
  try {
    a = normalizeShortcut(first);
    b = normalizeShortcut(second);
  } catch {
    return false;
  }
  if (!a || !b) return false;
  return a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `);
}

export type ExistingShortcutEntry = { id: string; shortcut: string; label?: string };

/**
 * Sprawdza poprawność skrótu, listę zastrzeżoną oraz kolizje z innymi przypisaniami
 * (w tym konflikty prefiksów sekwencji, np. `"g"` i `"g i"`).
 */
export function validateShortcut(
  value: string,
  existing: Readonly<Record<string, string>> | readonly ExistingShortcutEntry[] = {},
  options: ShortcutConflictOptions = {},
): ShortcutIssue | null {
  if (value !== " " && !value.trim()) return null;

  let parsed: ParsedShortcut;
  try {
    parsed = parseShortcut(value);
  } catch {
    return { type: "invalid" };
  }

  const maxLength = options.maxSequenceLength ?? 2;
  if (parsed.chords.length > maxLength) {
    return { type: "invalid" };
  }

  const reservedSources = [
    ...(options.includeDefaultReserved === false ? [] : DEFAULT_RESERVED_SHORTCUTS),
    ...(options.reserved ?? []),
  ];
  const reservedSet = new Set<string>();
  for (const item of reservedSources) {
    try {
      const normalized = normalizeShortcut(item);
      if (normalized) reservedSet.add(normalized);
    } catch {
      /* Pomijamy nieprawidłowe wpisy w zewnętrznej liście zastrzeżonych. */
    }
  }

  const stepStrings = parsed.normalized.split(" ");
  if (reservedSet.has(parsed.normalized) || stepStrings.some((step) => reservedSet.has(step))) {
    return { type: "reserved", shortcut: parsed.normalized };
  }

  const entries: ExistingShortcutEntry[] = Array.isArray(existing)
    ? existing
    : Object.entries(existing).map(([id, shortcut]) => ({ id, shortcut }));

  for (const entry of entries) {
    if (options.currentId !== undefined && entry.id === options.currentId) continue;
    if (!entry.shortcut) continue;
    if (shortcutsConflict(parsed.normalized, entry.shortcut)) {
      return {
        type: "conflict",
        conflictId: entry.id,
        ...(entry.label !== undefined ? { conflictLabel: entry.label } : {}),
        shortcut: parsed.normalized,
      };
    }
  }

  return null;
}

/** Zwraca identyfikator kolidującego skrótu, `"reserved"`, `"invalid"` albo `null`. */
export function findShortcutConflict(
  value: string,
  existing: Readonly<Record<string, string>> | readonly ExistingShortcutEntry[] = {},
  options: ShortcutConflictOptions = {},
): string | null {
  const issue = validateShortcut(value, existing, options);
  if (!issue) return null;
  if (issue.type === "conflict") return issue.conflictId;
  return issue.type;
}

export type SequenceMatchResult<T> =
  { status: "matched"; item: T; shortcut: string } | { status: "pending"; prefix: string } | { status: "none" };

export interface SequenceTracker {
  /** Przetwarza zdarzenie dla podanej listy kandydatów (najpierw sekwencje, potem pojedyncze akordy). */
  match: <T extends { shortcut: string }>(
    event: ShortcutKeyboardEvent,
    candidates: readonly T[],
    options?: { mac?: boolean; allowSequences?: boolean },
  ) => SequenceMatchResult<T>;
  /** Czyści oczekujący prefiks sekwencji. */
  reset: () => void;
  /** Czy obecnie trwa oczekiwanie na drugi krok sekwencji (w oknie 1 s). */
  hasPending: () => boolean;
}

/** Tworzy automat śledzący sekwencje klawiszy z oknem czasowym (domyślnie 1000 ms). */
export function createSequenceTracker(timeoutMs = SEQUENCE_TIMEOUT_MS): SequenceTracker {
  let pending: { prefix: string; expiresAt: number } | null = null;

  const reset = () => {
    pending = null;
  };

  const hasPending = () => pending !== null && Date.now() < pending.expiresAt;

  const match = <T extends { shortcut: string }>(
    event: ShortcutKeyboardEvent,
    candidates: readonly T[],
    options: { mac?: boolean; allowSequences?: boolean } = {},
  ): SequenceMatchResult<T> => {
    const mac = options.mac ?? isApplePlatform();
    const allowSequences = options.allowSequences !== false;
    const now = Date.now();
    const activePending = pending && now < pending.expiresAt ? pending : null;
    pending = null;

    if (allowSequences && activePending) {
      for (const candidate of candidates) {
        let parsed: ParsedShortcut;
        try {
          parsed = parseShortcut(candidate.shortcut);
        } catch {
          continue;
        }
        if (parsed.chords.length !== 2) continue;
        const [firstStep, secondStep] = parsed.normalized.split(" ");
        if (firstStep === activePending.prefix && secondStep && matchesShortcut(event, secondStep, { mac })) {
          return { status: "matched", item: candidate, shortcut: parsed.normalized };
        }
      }
    }

    for (const candidate of candidates) {
      let parsed: ParsedShortcut;
      try {
        parsed = parseShortcut(candidate.shortcut);
      } catch {
        continue;
      }

      if (parsed.chords.length === 2) {
        if (!allowSequences) continue;
        const [firstStep] = parsed.normalized.split(" ");
        if (firstStep && matchesShortcut(event, firstStep, { mac })) {
          pending = { prefix: firstStep, expiresAt: now + timeoutMs };
          return { status: "pending", prefix: firstStep };
        }
      } else if (parsed.chords.length === 1 && matchesShortcut(event, parsed.normalized, { mac })) {
        return { status: "matched", item: candidate, shortcut: parsed.normalized };
      }
    }

    return { status: "none" };
  };

  return { match, reset, hasPending };
}
