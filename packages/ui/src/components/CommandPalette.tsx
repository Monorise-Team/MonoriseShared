"use client";

import { CornerDownLeft, Search, SlidersHorizontal } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "../lib/cn.js";
import { formatShortcut, parseShortcut } from "../lib/shortcuts.js";
import { useHotkeys } from "../lib/useHotkeys.js";
import { Checkbox } from "./Checkbox.js";
import { Kbd } from "./Kbd.js";

export interface CommandPaletteItem {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  shortcut?: string;
  keywords?: readonly string[];
  disabled?: boolean;
  onSelect: () => void | Promise<void>;
}

export interface CommandPaletteGroup {
  id: string;
  label: string;
  items: readonly CommandPaletteItem[];
}

export interface CommandPaletteSource {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: readonly CommandPaletteGroup[];
  placeholder?: string;
  emptyText?: string;
  /** Opcjonalne asynchroniczne wyszukiwanie dodatkowych wyników. */
  onSearch?: (
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly CommandPaletteGroup[] | readonly CommandPaletteItem[]>;
  /** Nazwa sekcji, gdy `onSearch` zwraca płaską listę pozycji. */
  searchResultsLabel?: string;
  /** Tekst widoczny podczas ładowania wyników z `onSearch`. */
  loadingText?: string;
  /** Opóźnienie przed wywołaniem `onSearch` w ms (domyślnie `0`). */
  searchDebounceMs?: number;
  /** Zewnętrzne przełączniki źródeł wyszukiwania (np. widoki, polecenia, wiadomości). */
  sources?: readonly CommandPaletteSource[];
  /** Włącza przełącznik widoczności sekcji bez podawania zewnętrznego `sources`. */
  enableSourceToggles?: boolean;
  /** Czy zamykać paletę automatycznie po wybraniu pozycji (domyślnie `true`). */
  closeOnSelect?: boolean;
  /** Stopka palety; domyślnie podpowiedź klawiszy jak w aven-mail. */
  footer?: ReactNode;
  /** Dostępny tytuł okna dialogowego (ukryty wizualnie). */
  title?: string;
  /** Etykieta przycisku zamknięcia dla czytników ekranu. */
  closeLabel?: string;
  /** Wymuszenie wyświetlania skrótów w układzie Apple lub Windows/Linux. */
  mac?: boolean;
  className?: string;
}

export interface UseCommandPaletteOptions {
  /** Początkowy stan otwarcia (domyślnie `false`). */
  defaultOpen?: boolean;
  /** Kontrolowany stan otwarcia. */
  open?: boolean;
  /** Callback zmiany stanu otwarcia. */
  onOpenChange?: (open: boolean) => void;
  /** Czy otwierać paletę również klawiszem `/` poza polami tekstowymi. */
  slash?: boolean;
  /** Skrót otwierający/przełączający paletę (domyślnie `"mod+k"`). */
  shortcut?: string;
  /** Wyłącza rejestrowanie skrótów otwierających. */
  disabled?: boolean;
  /** Wymuszenie układu Apple lub innego niż Apple (przydatne w testach). */
  mac?: boolean;
}

export interface UseCommandPaletteResult {
  open: boolean;
  setOpen: (open: boolean) => void;
  onOpenChange: (open: boolean) => void;
  toggle: () => void;
}

/** Pomocnik otwierający paletę poleceń na `mod+k` oraz opcjonalnie na `/` poza polami tekstowymi. */
export function useCommandPalette(options: UseCommandPaletteOptions = {}): UseCommandPaletteResult {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(options.defaultOpen ?? false);
  const isControlled = options.open !== undefined;
  const open = isControlled ? options.open : uncontrolledOpen;
  const openRef = useRef(open);
  const onOpenChangeRef = useRef(options.onOpenChange);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    onOpenChangeRef.current = options.onOpenChange;
  }, [options.onOpenChange]);

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChangeRef.current?.(next);
    },
    [isControlled],
  );

  const toggle = useCallback(() => {
    setOpen(!openRef.current);
  }, [setOpen]);

  const mainShortcut = options.shortcut ?? "mod+k";
  const mainHasModifier = useMemo(() => {
    try {
      const chord = parseShortcut(mainShortcut).chords[0];
      return Boolean(chord && (chord.mod || chord.ctrl || chord.alt || chord.meta));
    } catch {
      return false;
    }
  }, [mainShortcut]);

  const bindings = useMemo(
    () => [
      {
        shortcut: mainShortcut,
        allowInInputs: mainHasModifier,
        handler: () => {
          if (!openRef.current && document.querySelector('[aria-modal="true"]')) return;
          toggle();
        },
      },
      ...(options.slash
        ? [
            {
              shortcut: "/",
              allowInInputs: false,
              handler: () => {
                if (openRef.current || document.querySelector('[aria-modal="true"]')) return;
                setOpen(true);
              },
            },
          ]
        : []),
    ],
    [mainShortcut, mainHasModifier, options.slash, setOpen, toggle],
  );

  useHotkeys(bindings, {
    disabled: Boolean(options.disabled),
    ...(options.mac !== undefined ? { mac: options.mac } : {}),
  });

  return {
    open: Boolean(open),
    setOpen,
    onOpenChange: setOpen,
    toggle,
  };
}

/** Składa polskie znaki diakrytyczne (łącznie z `ł`/`Ł`) do porównań bez rozróżniania akcentów. */
function foldPolishText(text: string): string {
  return text
    .replace(/[łŁ]/g, "l")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function matchesQuery(item: CommandPaletteItem, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const haystack = foldPolishText([item.label, item.description ?? "", ...(item.keywords ?? [])].join(" "));
  return haystack.includes(normalizedQuery);
}

function isGroupArray(
  value: readonly CommandPaletteGroup[] | readonly CommandPaletteItem[],
): value is readonly CommandPaletteGroup[] {
  const first = value[0];
  return Boolean(first && "items" in first);
}

const DEFAULT_FOOTER = "Strzałki: wybór, Enter: otwórz, Escape: zamknij.";

interface CommandPaletteBodyProps extends Omit<CommandPaletteProps, "open" | "className" | "title"> {
  inputRef: React.RefObject<HTMLInputElement | null>;
}

function CommandPaletteBody({
  onOpenChange,
  groups,
  placeholder = "Szukaj poleceń…",
  emptyText = "Brak wyników",
  onSearch,
  searchResultsLabel = "Wyniki wyszukiwania",
  loadingText = "Wyszukiwanie…",
  searchDebounceMs = 0,
  sources,
  enableSourceToggles = false,
  closeOnSelect = true,
  footer,
  closeLabel = "Zamknij",
  mac,
  inputRef,
}: CommandPaletteBodyProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [configureOpen, setConfigureOpen] = useState(false);
  const [disabledGroups, setDisabledGroups] = useState<ReadonlySet<string>>(() => new Set());
  const [asyncResult, setAsyncResult] = useState<{
    query: string;
    groups: readonly CommandPaletteGroup[];
    error: boolean;
  } | null>(null);

  const activeOptionRef = useRef<HTMLButtonElement>(null);
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;

  const trimmedQuery = query.trim();
  const searchActive = Boolean(onSearch && trimmedQuery.length > 0);

  useEffect(() => {
    if (!searchActive || !onSearch) return;

    const controller = new AbortController();
    let cancelled = false;

    const runSearch = () => {
      Promise.resolve(onSearch(trimmedQuery, controller.signal))
        .then((result) => {
          if (cancelled || controller.signal.aborted) return;
          const nextGroups: readonly CommandPaletteGroup[] =
            result.length === 0
              ? []
              : isGroupArray(result)
                ? result
                : [{ id: "__async_results__", label: searchResultsLabel, items: result }];
          setAsyncResult({ query: trimmedQuery, groups: nextGroups, error: false });
        })
        .catch((err: unknown) => {
          if (cancelled || controller.signal.aborted) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          setAsyncResult({ query: trimmedQuery, groups: [], error: true });
        });
    };

    if (searchDebounceMs > 0) {
      const timer = window.setTimeout(runSearch, searchDebounceMs);
      return () => {
        cancelled = true;
        controller.abort();
        window.clearTimeout(timer);
      };
    }

    runSearch();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [searchActive, trimmedQuery, onSearch, searchDebounceMs, searchResultsLabel]);

  const settled = searchActive && asyncResult?.query === trimmedQuery ? asyncResult : null;
  const loading = searchActive && !settled;
  const searchError = settled?.error ?? false;

  const effectiveSources: readonly CommandPaletteSource[] = useMemo(() => {
    if (sources && sources.length > 0) return sources;
    if (!enableSourceToggles || groups.length === 0) return [];
    return groups.map((group) => ({
      id: group.id,
      label: group.label,
      checked: !disabledGroups.has(group.id),
      onCheckedChange: (checked: boolean) => {
        setDisabledGroups((prev) => {
          const next = new Set(prev);
          if (checked) next.delete(group.id);
          else next.add(group.id);
          return next;
        });
      },
    }));
  }, [sources, enableSourceToggles, groups, disabledGroups]);

  const filteredGroups = useMemo(() => {
    const normalizedQuery = foldPolishText(trimmedQuery);
    const localGroups = groups
      .filter((group) => !enableSourceToggles || !disabledGroups.has(group.id))
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => matchesQuery(item, normalizedQuery)),
      }))
      .filter((group) => group.items.length > 0);

    const extraGroups = settled ? settled.groups.filter((group) => group.items.length > 0) : [];
    return [...extraGroups, ...localGroups];
  }, [groups, trimmedQuery, enableSourceToggles, disabledGroups, settled]);

  const flatSelectableItems = useMemo(
    () =>
      filteredGroups.flatMap((group) =>
        group.items.filter((item) => !item.disabled).map((item) => ({ groupId: group.id, item })),
      ),
    [filteredGroups],
  );

  const clampedIndex =
    flatSelectableItems.length > 0 ? Math.max(0, Math.min(activeIndex, flatSelectableItems.length - 1)) : -1;
  const activeEntry = clampedIndex >= 0 ? flatSelectableItems[clampedIndex] : undefined;
  const activeItem = activeEntry?.item;

  const optionIdFor = (groupId: string, itemId: string) => `${baseId}-option-${groupId}-${itemId}`;

  useEffect(() => {
    if (!activeItem) return;
    activeOptionRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [activeItem]);

  const selectItem = (item: CommandPaletteItem) => {
    if (item.disabled) return;
    if (closeOnSelect) {
      onOpenChange(false);
    }
    Promise.resolve(item.onSelect()).catch(() => {});
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (flatSelectableItems.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => Math.min(flatSelectableItems.length - 1, Math.max(0, prev) + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(0, Math.min(flatSelectableItems.length - 1, prev) - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(flatSelectableItems.length - 1);
    } else if (event.key === "Enter" && activeItem) {
      event.preventDefault();
      selectItem(activeItem);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border-primary px-4 py-3.5">
        <Search aria-hidden className="size-5 shrink-0 text-accent-strong" />
        <input
          ref={inputRef}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={true}
          aria-controls={listboxId}
          aria-activedescendant={activeEntry ? optionIdFor(activeEntry.groupId, activeEntry.item.id) : undefined}
          aria-label={placeholder}
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value.slice(0, 500));
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-base text-text-primary outline-none placeholder:text-text-tertiary"
        />
        {effectiveSources.length > 0 ? (
          <button
            type="button"
            aria-label="Filtruj źródła"
            aria-expanded={configureOpen}
            onClick={() => setConfigureOpen((prev) => !prev)}
            className={cn(
              "mr-press rounded-control p-1.5 text-text-secondary hover:bg-bg-hover hover:text-accent-strong",
              configureOpen && "bg-bg-hover text-accent-strong",
            )}
          >
            <SlidersHorizontal aria-hidden className="size-4" />
          </button>
        ) : null}
        <DialogPrimitive.Close asChild>
          <button
            type="button"
            aria-label={closeLabel}
            className="mr-press mr-no-text-shadow inline-flex h-6 shrink-0 items-center justify-center rounded-[5px] border border-border-primary bg-bg-tertiary px-1.5 font-sans text-xs font-medium text-text-tertiary hover:text-text-primary"
          >
            Esc
          </button>
        </DialogPrimitive.Close>
      </div>

      {configureOpen && effectiveSources.length > 0 ? (
        <div className="border-b border-border-primary bg-bg-secondary/40 px-4 py-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {effectiveSources.map((source) => (
              <Checkbox
                key={source.id}
                label={source.label}
                checked={source.checked}
                onCheckedChange={(checked) => source.onCheckedChange(checked === true)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div
        id={listboxId}
        role="listbox"
        aria-label={searchResultsLabel}
        aria-busy={loading || undefined}
        className="max-h-[min(50dvh,26rem)] overflow-y-auto py-2"
      >
        {filteredGroups.map((group) => {
          const headingId = `${baseId}-group-${group.id}`;
          return (
            <div key={group.id} role="group" aria-labelledby={headingId}>
              <div
                id={headingId}
                role="presentation"
                className="px-4 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-text-tertiary uppercase"
              >
                {group.label}
              </div>
              {group.items.map((item) => {
                const isSelected = activeEntry?.groupId === group.id && activeEntry.item.id === item.id;
                const selectableIdx = flatSelectableItems.findIndex(
                  (candidate) => candidate.groupId === group.id && candidate.item.id === item.id,
                );
                return (
                  <button
                    key={item.id}
                    id={optionIdFor(group.id, item.id)}
                    role="option"
                    type="button"
                    aria-selected={isSelected}
                    aria-disabled={item.disabled || undefined}
                    tabIndex={-1}
                    ref={isSelected ? activeOptionRef : undefined}
                    onMouseEnter={() => {
                      if (!item.disabled && selectableIdx >= 0) setActiveIndex(selectableIdx);
                    }}
                    onClick={() => selectItem(item)}
                    className={cn(
                      "mr-no-text-shadow flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                      item.disabled
                        ? "cursor-not-allowed opacity-50"
                        : isSelected
                          ? "bg-bg-selected"
                          : "hover:bg-bg-hover",
                    )}
                  >
                    {item.icon ? (
                      <span
                        aria-hidden
                        className={cn(
                          "shrink-0 [&_svg]:size-4",
                          isSelected ? "text-accent-strong" : "text-text-tertiary",
                        )}
                      >
                        {item.icon}
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text-primary">{item.label}</span>
                      {item.description ? (
                        <span className="block truncate text-xs text-text-tertiary">{item.description}</span>
                      ) : null}
                    </span>
                    {item.shortcut ? (
                      <Kbd className="shrink-0 px-1.5">
                        {formatShortcut(item.shortcut, mac !== undefined ? { mac } : undefined)}
                      </Kbd>
                    ) : null}
                    {isSelected ? (
                      <CornerDownLeft aria-hidden className="size-3.5 shrink-0 text-accent-strong" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          );
        })}

        {loading && flatSelectableItems.length > 0 ? (
          <p role="status" className="px-4 py-2 text-xs text-text-tertiary">
            {loadingText}
          </p>
        ) : null}

        {filteredGroups.length === 0 ? (
          <p role="status" className="px-4 py-8 text-center text-sm text-text-secondary">
            {loading ? loadingText : searchError ? "Nie udało się pobrać wyników." : emptyText}
          </p>
        ) : null}
      </div>

      <div aria-live="polite" className="border-t border-border-primary px-4 py-2 text-xs text-text-secondary">
        {footer ?? DEFAULT_FOOTER}
      </div>
    </>
  );
}

/**
 * Paleta poleceń na Radix Dialog w mocnym szkle (`mr-float`), wzorowana 1:1 na palecie z aven-mail:
 * grupowanie sekcji, filtrowanie bez polskich znaków, nawigacja klawiaturą i opcjonalne źródła.
 */
export function CommandPalette({
  open,
  onOpenChange,
  title = "Paleta poleceń",
  className,
  ...bodyProps
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="mr-overlay mr-animate-overlay fixed inset-0 z-[var(--mr-z-overlay)]" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
          className={cn(
            "mr-float mr-animate-panel fixed top-1/2 left-1/2 z-[var(--mr-z-modal)] flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[42rem] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl text-text-primary outline-none",
            className,
          )}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Wyszukaj i uruchom polecenie z klawiatury.
          </DialogPrimitive.Description>
          <CommandPaletteBody onOpenChange={onOpenChange} inputRef={inputRef} {...bodyProps} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
