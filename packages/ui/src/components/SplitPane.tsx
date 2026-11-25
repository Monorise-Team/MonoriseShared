"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type Ref,
} from "react";
import { cn } from "../lib/cn.js";

const KEYBOARD_STEP = 16;

function clamp(value: number, min: number, max: number): number {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  if (!Number.isFinite(value)) return low;
  return Math.max(low, Math.min(high, Math.round(value)));
}

function readStoredSize(storageKey: string | undefined, fallback: number, min: number, max: number): number {
  const clampedFallback = clamp(fallback, min, max);
  if (!storageKey || typeof window === "undefined") return clampedFallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw == null) return clampedFallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clamp(parsed, min, max) : clampedFallback;
  } catch {
    return clampedFallback;
  }
}

function writeStoredSize(storageKey: string | undefined, size: number): void {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, String(size));
  } catch {
    // Brak dostępu do localStorage (np. tryb prywatny): rozmiar działa w pamięci do końca sesji
  }
}

export interface ResizableSplitPaneProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Główny panel (lewy w układzie poziomym, górny w pionowym). */
  primary: ReactNode;
  /** Drugi panel wypełniający resztę miejsca. */
  secondary: ReactNode;
  /** Układ paneli: `"horizontal"` (obok siebie, domyślnie) albo `"vertical"` (jeden nad drugim). */
  orientation?: "horizontal" | "vertical";
  /** Domyślny rozmiar głównego panelu w pikselach (domyślnie 320). */
  defaultSize?: number;
  /** Kontrolowany rozmiar głównego panelu w pikselach. */
  size?: number;
  /** Wywoływane po zmianie rozmiaru myszą lub klawiaturą. */
  onSizeChange?: (size: number) => void;
  /** Minimalny rozmiar głównego panelu w px (domyślnie 240). */
  minSize?: number;
  /** Maksymalny rozmiar głównego panelu w px (domyślnie 800). */
  maxSize?: number;
  /** Opcjonalny klucz w `localStorage` do zapamiętania szerokości lub wysokości. */
  storageKey?: string;
  /** Etykieta separatora dla czytników ekranu. */
  separatorLabel?: string;
  /** Dodatkowa klasa kontenera pierwszego panelu. */
  primaryClassName?: string;
  /** Dodatkowa klasa kontenera drugiego panelu. */
  secondaryClassName?: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Dwa panele z uchwytem zmiany rozmiaru w odstępie między kartami (`--mr-card-gap`, 10 px).
 * Obsługuje przeciąganie myszą, strzałki klawiatury (±16 px) oraz podwójne kliknięcie resetujące rozmiar.
 */
export function ResizableSplitPane({
  primary,
  secondary,
  orientation = "horizontal",
  defaultSize = 320,
  size: controlledSize,
  onSizeChange,
  minSize = 240,
  maxSize = 800,
  storageKey,
  separatorLabel = "Zmień rozmiar panelu",
  primaryClassName,
  secondaryClassName,
  className,
  ...rest
}: ResizableSplitPaneProps) {
  const isVertical = orientation === "vertical";
  const [uncontrolledSize, setUncontrolledSize] = useState(() =>
    readStoredSize(storageKey, defaultSize, minSize, maxSize),
  );
  const activeSize = clamp(controlledSize ?? uncontrolledSize, minSize, maxSize);

  const primaryRef = useRef<HTMLDivElement>(null);
  const separatorRef = useRef<HTMLDivElement>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
    };
  }, []);

  const commitSize = useCallback(
    (nextRaw: number) => {
      const next = clamp(nextRaw, minSize, maxSize);
      if (controlledSize === undefined) {
        setUncontrolledSize(next);
      }
      writeStoredSize(storageKey, next);
      onSizeChange?.(next);
    },
    [controlledSize, maxSize, minSize, onSizeChange, storageKey],
  );

  const handleMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      dragCleanupRef.current?.();

      const startPos = isVertical ? event.clientY : event.clientX;
      const measured = primaryRef.current
        ? isVertical
          ? primaryRef.current.offsetHeight
          : primaryRef.current.offsetWidth
        : 0;
      const startSize = measured > 0 ? measured : activeSize;

      const applyPreview = (clientPos: number) => {
        const next = clamp(startSize + (clientPos - startPos), minSize, maxSize);
        if (primaryRef.current) {
          if (isVertical) primaryRef.current.style.height = `${next}px`;
          else primaryRef.current.style.width = `${next}px`;
        }
        separatorRef.current?.setAttribute("aria-valuenow", String(next));
        return next;
      };

      const onMouseMove = (moveEvent: MouseEvent) => {
        applyPreview(isVertical ? moveEvent.clientY : moveEvent.clientX);
      };

      const cleanup = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        dragCleanupRef.current = null;
      };

      const onMouseUp = (upEvent: MouseEvent) => {
        cleanup();
        const finalSize = applyPreview(isVertical ? upEvent.clientY : upEvent.clientX);
        commitSize(finalSize);
      };

      dragCleanupRef.current = cleanup;
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = isVertical ? "row-resize" : "col-resize";
      document.body.style.userSelect = "none";
    },
    [activeSize, commitSize, isVertical, maxSize, minSize],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const decreaseKey = isVertical ? "ArrowUp" : "ArrowLeft";
      const increaseKey = isVertical ? "ArrowDown" : "ArrowRight";

      if (event.key === increaseKey) {
        event.preventDefault();
        commitSize(activeSize + KEYBOARD_STEP);
      } else if (event.key === decreaseKey) {
        event.preventDefault();
        commitSize(activeSize - KEYBOARD_STEP);
      } else if (event.key === "Home") {
        event.preventDefault();
        commitSize(minSize);
      } else if (event.key === "End") {
        event.preventDefault();
        commitSize(maxSize);
      }
    },
    [activeSize, commitSize, isVertical, maxSize, minSize],
  );

  const handleDoubleClick = useCallback(() => {
    commitSize(defaultSize);
  }, [commitSize, defaultSize]);

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1", isVertical ? "flex-col" : "flex-row", className)} {...rest}>
      <div
        ref={primaryRef}
        style={isVertical ? { height: activeSize } : { width: activeSize }}
        className={cn("flex min-h-0 min-w-0 shrink-0 flex-col [&>*:only-child]:flex-1", primaryClassName)}
      >
        {primary}
      </div>

      <div
        ref={separatorRef}
        role="separator"
        tabIndex={0}
        aria-orientation={isVertical ? "horizontal" : "vertical"}
        aria-label={separatorLabel}
        aria-valuenow={activeSize}
        aria-valuemin={Math.min(minSize, maxSize)}
        aria-valuemax={Math.max(minSize, maxSize)}
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
        onDoubleClick={handleDoubleClick}
        className={cn(
          "group flex shrink-0 items-center justify-center outline-none",
          isVertical
            ? "h-[var(--mr-card-gap)] w-full cursor-row-resize"
            : "w-[var(--mr-card-gap)] self-stretch cursor-col-resize",
        )}
      >
        <div
          className={cn(
            "rounded-full bg-transparent transition-colors group-hover:bg-accent/70 group-focus-visible:bg-accent/70 group-active:bg-accent",
            isVertical ? "h-[3px] w-10" : "h-10 w-[3px]",
          )}
        />
      </div>

      <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col [&>*:only-child]:flex-1", secondaryClassName)}>
        {secondary}
      </div>
    </div>
  );
}
