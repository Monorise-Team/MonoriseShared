"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { formatShortcut } from "../lib/shortcuts.js";
import { useHotkeys } from "../lib/useHotkeys.js";
import { Dialog } from "./Dialog.js";
import { Kbd } from "./Kbd.js";

export interface ShortcutHelpItem {
  id?: string;
  label: string;
  shortcut: string;
}

export interface ShortcutHelpCategory {
  category: string;
  items: readonly ShortcutHelpItem[];
}

export interface ShortcutsHelpProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  categories: readonly ShortcutHelpCategory[];
  title?: ReactNode;
  description?: ReactNode;
  closeLabel?: string;
  /** Opcjonalny skrót otwierający/zamykający okno (np. `true` dla `?` albo własny zapis). */
  bindShortcut?: boolean | string;
  /** Wymuszenie układu Apple lub Windows/Linux przy formatowaniu skrótów. */
  mac?: boolean;
  className?: string;
}

/**
 * Okno dialogowe ze ściągą skrótów klawiszowych podzieloną na kategorie (jak w aven-mail).
 * Może otwierać się automatycznie pod klawiszem `?`, jeśli podano `bindShortcut`.
 */
export function ShortcutsHelp({
  open: controlledOpen,
  onOpenChange,
  categories,
  title = "Skróty klawiszowe",
  description,
  closeLabel = "Zamknij",
  bindShortcut = false,
  mac,
  className,
}: ShortcutsHelpProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const hotkey = typeof bindShortcut === "string" ? bindShortcut : "?";
  useHotkeys(
    bindShortcut
      ? [
          {
            shortcut: hotkey,
            allowInInputs: false,
            handler: () => {
              if (!openRef.current && document.querySelector('[aria-modal="true"]')) return;
              handleOpenChange(!openRef.current);
            },
          },
        ]
      : [],
    {
      disabled: !bindShortcut,
      ...(mac !== undefined ? { mac } : {}),
    },
  );

  return (
    <Dialog
      open={Boolean(open)}
      onOpenChange={handleOpenChange}
      title={title}
      description={description}
      closeLabel={closeLabel}
      className={className ?? "max-w-lg"}
    >
      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
        {categories.map((section) => (
          <section key={section.category}>
            <h3 className="mb-2 text-xs font-semibold tracking-wider text-text-tertiary uppercase">
              {section.category}
            </h3>
            <div className="flex flex-col gap-1">
              {section.items.map((item) => (
                <div
                  key={item.id ?? `${section.category}-${item.label}`}
                  className="flex items-center justify-between gap-4 py-1"
                >
                  <span className="text-sm text-text-secondary">{item.label}</span>
                  <Kbd className="shrink-0 px-1.5">
                    {formatShortcut(item.shortcut, mac !== undefined ? { mac } : undefined)}
                  </Kbd>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
