"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { Toast as ToastPrimitive } from "radix-ui";
import {
  createContext,
  isValidElement,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/cn.js";
import { Button } from "./Button.js";

export type ToastTone = "neutral" | "success" | "warning" | "danger";
export type ToastPosition = "bottom-right" | "bottom-center";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  action?: ToastAction;
  /** Czas wyświetlania w ms; `Infinity` wyłącza automatyczne zamykanie. */
  duration?: number;
  /** Pasek odliczania czasu do zamknięcia (jak przy cofaniu wysyłki w Aven). */
  progress?: boolean;
}

export interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  dismiss: (id?: string) => void;
}

interface ToastRecord extends ToastOptions {
  id: string;
  open: boolean;
  tone: ToastTone;
  duration: number;
}

const DEFAULT_DURATION = 5000;
const EXIT_CLEANUP_MS = 300;

const ToastContext = createContext<ToastContextValue | null>(null);

const toastToneBorder: Record<ToastTone, string> = {
  neutral: "",
  success: "border-success/35",
  warning: "border-warning/35",
  danger: "border-danger/35",
};

const toastProgressFill: Record<ToastTone, string> = {
  neutral: "mr-progress-fill",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

function ToastToneIcon({ tone }: { tone: ToastTone }) {
  switch (tone) {
    case "success":
      return <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />;
    case "warning":
      return <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />;
    case "danger":
      return <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />;
    case "neutral":
      return null;
  }
}

const viewportPositions: Record<ToastPosition, string> = {
  "bottom-right": "bottom-5 right-5 w-80 max-w-[calc(100vw-2.5rem)] items-stretch",
  "bottom-center": "bottom-4 left-1/2 w-96 max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center",
};

const subscribeNoop = () => () => {};

function ToastEntry({
  item,
  closeLabel,
  onOpenChange,
}: {
  item: ToastRecord;
  closeLabel: string;
  onOpenChange: (id: string, open: boolean) => void;
}) {
  const [paused, setPaused] = useState(false);
  const showProgress = Boolean(item.progress) && Number.isFinite(item.duration) && item.duration > 0;

  return (
    <ToastPrimitive.Root
      open={item.open}
      duration={item.duration}
      onOpenChange={(open) => onOpenChange(item.id, open)}
      onPause={() => setPaused(true)}
      onResume={() => setPaused(false)}
      className={cn(
        "mr-float mr-animate-toast w-full overflow-hidden rounded-2xl text-text-primary outline-none",
        toastToneBorder[item.tone],
      )}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <ToastToneIcon tone={item.tone} />
        <div className="min-w-0 flex-1">
          <ToastPrimitive.Title className="text-sm font-semibold break-words text-text-primary">
            {item.title}
          </ToastPrimitive.Title>
          {item.description ? (
            <ToastPrimitive.Description className="mt-0.5 text-xs break-words text-text-secondary">
              {item.description}
            </ToastPrimitive.Description>
          ) : null}
        </div>
        {item.action ? (
          <ToastPrimitive.Action altText={item.action.label} asChild>
            <Button
              variant="ghost"
              size="xs"
              onClick={item.action.onClick}
              className="shrink-0 font-semibold text-accent-strong underline underline-offset-2 hover:text-accent-hover"
            >
              {item.action.label}
            </Button>
          </ToastPrimitive.Action>
        ) : null}
        <ToastPrimitive.Close asChild>
          <Button variant="ghost" size="xs" iconOnly aria-label={closeLabel} className="-mr-1 shrink-0">
            <X aria-hidden />
          </Button>
        </ToastPrimitive.Close>
      </div>
      {showProgress ? (
        <div className="mr-progress-track h-[3px] w-full overflow-hidden" data-toast-progress>
          <div
            className={cn("mr-toast-countdown h-full rounded-full", toastProgressFill[item.tone])}
            style={{
              animationDuration: `${item.duration}ms`,
              animationPlayState: paused ? "paused" : "running",
            }}
          />
        </div>
      ) : null}
    </ToastPrimitive.Root>
  );
}

export interface ToastProviderProps {
  children: ReactNode;
  /** Położenie stosu powiadomień: prawy dół (domyślnie) lub dół na środku. */
  position?: ToastPosition;
  /** Domyślny czas wyświetlania w ms (domyślnie 5000). */
  duration?: number;
  /** Etykieta regionu powiadomień dla czytników ekranu. */
  label?: string;
  /** Kierunek przesunięcia zamykającego powiadomienie (domyślnie "right", dla "bottom-center" — "down"). */
  swipeDirection?: "right" | "left" | "up" | "down";
  /** Etykieta przycisku zamknięcia powiadomienia. */
  closeLabel?: string;
}

/**
 * Kontekst i stos powiadomień (Radix Toast) renderowany w portalu na `document.body` ponad kartami
 * i oknami (`--mr-z-toast`).
 */
export function ToastProvider({
  children,
  position = "bottom-right",
  duration = DEFAULT_DURATION,
  label = "Powiadomienia",
  swipeDirection,
  closeLabel = "Zamknij",
}: ToastProviderProps) {
  const resolvedSwipeDirection = swipeDirection ?? (position === "bottom-center" ? "down" : "right");
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextIdRef = useRef(0);
  const cleanupTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const isClient = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  useEffect(() => {
    const timers = cleanupTimersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const scheduleCleanup = useCallback((id: string) => {
    const existing = cleanupTimersRef.current.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      cleanupTimersRef.current.delete(id);
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, EXIT_CLEANUP_MS);
    cleanupTimersRef.current.set(id, timer);
  }, []);

  const dismiss = useCallback(
    (id?: string) => {
      if (id === undefined) {
        setToasts((prev) => {
          for (const item of prev) scheduleCleanup(item.id);
          return prev.map((item) => (item.open ? { ...item, open: false } : item));
        });
        return;
      }
      setToasts((prev) => prev.map((item) => (item.id === id ? { ...item, open: false } : item)));
      scheduleCleanup(id);
    },
    [scheduleCleanup],
  );

  const toast = useCallback(
    (options: ToastOptions): string => {
      nextIdRef.current += 1;
      const id = `mr-toast-${nextIdRef.current}`;
      const record: ToastRecord = {
        ...options,
        id,
        open: true,
        tone: options.tone ?? "neutral",
        duration: options.duration ?? duration,
      };
      setToasts((prev) => [...prev, record]);
      return id;
    },
    [duration],
  );

  const handleOpenChange = useCallback(
    (id: string, open: boolean) => {
      if (!open) dismiss(id);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(() => ({ toast, dismiss }), [toast, dismiss]);

  const viewportLabel = label.includes("{hotkey}") ? label : `${label} ({hotkey})`;

  const viewport = (
    <ToastPrimitive.Viewport
      label={viewportLabel}
      className={cn(
        "fixed z-[var(--mr-z-toast)] flex list-none flex-col gap-2 outline-none",
        viewportPositions[position],
      )}
    />
  );

  return (
    <ToastContext value={value}>
      <ToastPrimitive.Provider duration={duration} label={label} swipeDirection={resolvedSwipeDirection}>
        {children}
        {toasts.map((item) => (
          <ToastEntry key={item.id} item={item} closeLabel={closeLabel} onOpenChange={handleOpenChange} />
        ))}
        {isClient ? createPortal(viewport, document.body) : null}
      </ToastPrimitive.Provider>
    </ToastContext>
  );
}

/** Zwraca funkcje `toast(...)` i `dismiss(id?)` z najbliższego `ToastProvider`. */
export function useToast(): ToastContextValue {
  const context = use(ToastContext);
  if (!context) {
    throw new Error("useToast wymaga użycia wewnątrz ToastProvider.");
  }
  return context;
}

export type BannerTone = "neutral" | "accent" | "success" | "warning" | "danger";

export interface BannerAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface BannerProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: BannerTone;
  /** Ikona paska; podaj `null`, aby ją ukryć. */
  icon?: ReactNode;
  title?: ReactNode;
  message?: ReactNode;
  action?: BannerAction | ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
}

const bannerTones: Record<BannerTone, string> = {
  neutral: "border-border-primary bg-bg-secondary text-text-primary",
  accent: "border-accent/25 bg-accent/10 text-text-primary",
  success: "border-success/25 bg-success/10 text-text-primary",
  warning: "border-warning/30 bg-warning/10 text-text-primary",
  danger: "border-danger/25 bg-danger/10 text-text-primary",
};

const bannerIconTones: Record<BannerTone, string> = {
  neutral: "text-text-tertiary",
  accent: "text-accent-strong",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

function defaultBannerIcon(tone: BannerTone): ReactNode {
  switch (tone) {
    case "success":
      return <CheckCircle2 aria-hidden />;
    case "warning":
      return <AlertTriangle aria-hidden />;
    case "danger":
      return <AlertCircle aria-hidden />;
    case "neutral":
    case "accent":
      return <Info aria-hidden />;
  }
}

function isBannerActionObject(action: BannerProps["action"]): action is BannerAction {
  return (
    typeof action === "object" && action !== null && !isValidElement(action) && "label" in action && "onClick" in action
  );
}

/**
 * Pasek statusu (np. brak połączenia, ponowne logowanie, błąd uwierzytelniania) w stylistyce banerów Aven.
 * Dla tonów `warning` i `danger` ustawia domyślnie `role="alert"`, dla pozostałych `role="status"`.
 */
export function Banner({
  tone = "neutral",
  icon,
  title,
  message,
  action,
  onDismiss,
  dismissLabel = "Zamknij",
  role,
  className,
  children,
  ...rest
}: BannerProps) {
  const resolvedRole = role ?? (tone === "warning" || tone === "danger" ? "alert" : "status");
  const resolvedIcon = icon === undefined ? defaultBannerIcon(tone) : icon;
  const body = message ?? children;
  const hasTitle = title !== undefined && title !== null && title !== false;

  return (
    <div
      role={resolvedRole}
      className={cn(
        "mr-no-text-shadow flex gap-3 rounded-row border px-3.5 py-2.5 text-sm",
        hasTitle ? "items-start" : "items-center",
        bannerTones[tone],
        className,
      )}
      {...rest}
    >
      {resolvedIcon ? (
        <span className={cn("shrink-0 [&_svg]:size-4", hasTitle && "mt-0.5", bannerIconTones[tone])}>
          {resolvedIcon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        {hasTitle ? <p className="font-medium text-text-primary">{title}</p> : null}
        {body ? (
          <div className={cn("text-xs text-text-secondary", hasTitle && "mt-0.5", !hasTitle && "text-sm")}>{body}</div>
        ) : null}
      </div>
      {action ? (
        isBannerActionObject(action) ? (
          <Button
            variant={tone === "danger" ? "danger" : "outline"}
            size="xs"
            onClick={action.onClick}
            disabled={action.disabled}
            className="shrink-0"
          >
            {action.label}
          </Button>
        ) : (
          <div className="shrink-0">{action}</div>
        )
      ) : null}
      {onDismiss ? (
        <Button variant="ghost" size="xs" iconOnly aria-label={dismissLabel} onClick={onDismiss} className="shrink-0">
          <X aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
