import type { HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../lib/cn.js";

/** Tło pod szklanymi kartami, pod całym widokiem. */
export function AppBackdrop({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("mr-backdrop", className)} {...rest} />;
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

export interface TitleBarProps extends HTMLAttributes<HTMLDivElement> {
  /** Miejsce na systemowe przyciski okna (macOS: z lewej). */
  insetStart?: number;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Pasek tytułu wprost na tle. W Tauri przeciąga okno (`data-tauri-drag-region`); elementy klikalne w środku
 * działają normalnie.
 */
export function TitleBar({ insetStart = 0, className, style, ...rest }: TitleBarProps) {
  return (
    <div
      data-tauri-drag-region
      className={cn(
        "mr-backdrop-text flex h-9 shrink-0 items-center gap-2 px-3 text-xs font-medium tracking-wide select-none",
        className,
      )}
      style={{ paddingInlineStart: insetStart || undefined, ...style }}
      {...rest}
    />
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
