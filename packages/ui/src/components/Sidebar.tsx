"use client";

import { ChevronDown, ChevronUp, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  Children,
  createContext,
  use,
  useCallback,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { cn } from "../lib/cn.js";
import { Badge } from "./Badge.js";
import type { Surface } from "./Card.js";
import { Tooltip, TooltipProvider } from "./Tooltip.js";

const DEFAULT_AUTO_COLLAPSE_QUERY = "(max-width: 760px)";

interface SidebarContextValue {
  collapsed: boolean;
  compact: boolean;
  inShell: boolean;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  compact: false,
  inShell: false,
  toggle: () => {},
});

/** Stan paska bocznego z najbliższego `SidebarShell`. */
export function useSidebar(): SidebarContextValue {
  return use(SidebarContext);
}

const shellSurfaces: Record<Surface, string> = {
  side: "mr-card mr-side",
  middle: "mr-card mr-middle",
  reading: "mr-card mr-reading",
  strong: "mr-card mr-strong",
  float: "mr-float rounded-card",
};

function useMediaMatches(query: string | false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!query || typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return () => {};
      }
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (!query || typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export interface SidebarShellProps extends HTMLAttributes<HTMLElement> {
  /** Kontrolowany stan zwinięcia paska bocznego. */
  collapsed?: boolean;
  /** Domyślny stan zwinięcia w trybie niekontrolowanym. */
  defaultCollapsed?: boolean;
  /** Wywoływane po kliknięciu przycisku zwijania/rozwijania. */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Zapytanie mediów do automatycznego zwijania (domyślnie poniżej 760 px). Ustaw `false`, aby wyłączyć. */
  autoCollapseQuery?: string | false;
  /** Powierzchnia szklanej karty (domyślnie `"side"`). */
  surface?: Surface;
  /** Dolna belka paska bocznego (np. ustawienia i przycisk zwijania). */
  footer?: ReactNode;
  ref?: Ref<HTMLElement>;
}

/**
 * Szklana karta paska bocznego: płynnie przechodzi między `w-60` (240 px) a `w-16` (64 px)
 * i automatycznie zwija się na wąskich ekranach (`max-width: 760px`), ukrywając przełącznik.
 */
export function SidebarShell({
  collapsed: collapsedProp,
  defaultCollapsed = false,
  onCollapsedChange,
  autoCollapseQuery = DEFAULT_AUTO_COLLAPSE_QUERY,
  surface = "side",
  footer,
  className,
  children,
  ...rest
}: SidebarShellProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const compact = useMediaMatches(autoCollapseQuery);
  const userCollapsed = collapsedProp !== undefined ? collapsedProp : internalCollapsed;
  const effectiveCollapsed = compact || userCollapsed;

  const toggle = useCallback(() => {
    const next = !userCollapsed;
    if (collapsedProp === undefined) setInternalCollapsed(next);
    onCollapsedChange?.(next);
  }, [collapsedProp, onCollapsedChange, userCollapsed]);

  const contextValue = useMemo<SidebarContextValue>(
    () => ({
      collapsed: effectiveCollapsed,
      compact,
      inShell: true,
      toggle,
    }),
    [effectiveCollapsed, compact, toggle],
  );

  return (
    <SidebarContext value={contextValue}>
      <TooltipProvider>
        <aside
          data-collapsed={effectiveCollapsed ? "true" : undefined}
          data-compact={compact ? "true" : undefined}
          className={cn(
            shellSurfaces[surface],
            "mr-sidebar-shell flex min-h-0 shrink-0 flex-col text-sidebar-text select-none",
            effectiveCollapsed ? "w-16" : "w-60",
            className,
          )}
          {...rest}
        >
          {children}
          {footer ? (
            <div
              className={cn(
                "mt-auto flex border-t border-border-primary py-2",
                effectiveCollapsed ? "flex-col items-center gap-1 px-2" : "items-center gap-1 px-3",
              )}
            >
              {footer}
            </div>
          ) : null}
        </aside>
      </TooltipProvider>
    </SidebarContext>
  );
}

export interface SidebarCollapseButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Ręczne nadpisanie stanu zwinięcia poza `SidebarShell`. */
  collapsed?: boolean;
  /** Etykieta, gdy pasek jest zwinięty. */
  expandLabel?: string;
  /** Etykieta, gdy pasek jest rozwinięty. */
  collapseLabel?: string;
  ref?: Ref<HTMLButtonElement>;
}

/** Przycisk zwijania/rozwijania paska bocznego; ukrywa się przy automatycznym zwinięciu okna. */
export function SidebarCollapseButton({
  collapsed: collapsedProp,
  expandLabel = "Rozwiń pasek boczny",
  collapseLabel = "Zwiń pasek boczny",
  onClick,
  className,
  ...rest
}: SidebarCollapseButtonProps) {
  const ctx = useSidebar();
  if (ctx.compact) return null;

  const isCollapsed = collapsedProp ?? ctx.collapsed;
  const label = isCollapsed ? expandLabel : collapseLabel;

  const button = (
    <button
      type="button"
      aria-label={label}
      aria-expanded={!isCollapsed}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && collapsedProp === undefined) {
          ctx.toggle();
        }
      }}
      className={cn(
        "mr-row mr-press flex size-8 shrink-0 items-center justify-center text-sidebar-text/70 transition-colors hover:bg-sidebar-hover hover:text-sidebar-text",
        className,
      )}
      {...rest}
    >
      {isCollapsed ? (
        <PanelLeftOpen className="size-4" aria-hidden />
      ) : (
        <PanelLeftClose className="size-4" aria-hidden />
      )}
    </button>
  );

  return ctx.inShell ? (
    <Tooltip content={label} side="right">
      {button}
    </Tooltip>
  ) : (
    button
  );
}

/** Nawigacja w karcie bocznej: sekcje z nagłówkami i pozycjami. */
export function SidebarNav({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  const { inShell } = useSidebar();
  return (
    <nav
      className={cn(
        "flex flex-col gap-0.5",
        inShell && "mr-hide-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2",
        className,
      )}
      {...rest}
    />
  );
}

export interface SidebarSectionProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  action?: ReactNode;
}

export function SidebarSection({ title, action, className, children, ...rest }: SidebarSectionProps) {
  const { collapsed } = useSidebar();
  return (
    <div className={cn("flex flex-col gap-0.5 pt-3 first:pt-0", className)} {...rest}>
      {title && !collapsed ? (
        <div className="flex h-6 items-center justify-between px-2 text-[11px] font-semibold tracking-wide text-text-tertiary uppercase">
          <span>{title}</span>
          {action}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export interface SidebarAccordionProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Nagłówek sekcji. */
  title: ReactNode;
  /** Dodatkowa akcja po prawej stronie nagłówka (np. przycisk dodania etykiety). */
  action?: ReactNode;
  /** Kontrolowany stan rozwinięcia sekcji (lub dodatkowych pozycji przy `visibleCount`). */
  open?: boolean;
  /** Domyślny stan rozwinięcia (domyślnie `true` dla całej sekcji, a `false` przy `visibleCount`). */
  defaultOpen?: boolean;
  /** Wywoływane po kliknięciu przycisku rozwijania. */
  onOpenChange?: (open: boolean) => void;
  /** Ile pierwszych pozycji pokazać od razu; pozostałe rozwijają się przyciskiem „Pokaż więcej”. */
  visibleCount?: number;
  /** Etykieta przycisku pokazania ukrytych pozycji. */
  moreLabel?: ReactNode | ((hiddenCount: number) => ReactNode);
  /** Etykieta przycisku zwinięcia dodatkowych pozycji. */
  lessLabel?: ReactNode;
}

/**
 * Zwijana sekcja paska bocznego z animacją `grid-rows-[0fr]` / `grid-rows-[1fr]`.
 * Obsługuje zwijanie całej sekcji nagłówkiem albo skracanie listy do N pierwszych pozycji z przyciskiem „Pokaż więcej”.
 */
export function SidebarAccordion({
  title,
  action,
  open: openProp,
  defaultOpen,
  onOpenChange,
  visibleCount,
  moreLabel = "Pokaż więcej",
  lessLabel = "Pokaż mniej",
  className,
  children,
  ...rest
}: SidebarAccordionProps) {
  const { collapsed } = useSidebar();
  const panelId = useId();
  const hasVisibleLimit = visibleCount !== undefined;
  const [internalOpen, setInternalOpen] = useState(() => defaultOpen ?? !hasVisibleLimit);
  const [sectionOpen, setSectionOpen] = useState(true);
  const isOpen = openProp !== undefined ? openProp : internalOpen;

  const toggle = () => {
    const next = !isOpen;
    if (openProp === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  if (hasVisibleLimit) {
    const items = Children.toArray(children);
    const limit = Math.max(0, visibleCount);
    const alwaysVisible = items.slice(0, limit);
    const hiddenItems = items.slice(limit);
    const overflowOpen = !collapsed && isOpen;

    return (
      <div className={cn("flex flex-col gap-0.5 pt-3 first:pt-0", className)} {...rest}>
        {!collapsed ? (
          <div className="flex h-6 items-center justify-between gap-1 px-2">
            <button
              type="button"
              aria-expanded={sectionOpen}
              onClick={() => setSectionOpen((prev) => !prev)}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px] font-semibold tracking-wide text-text-tertiary uppercase transition-colors hover:text-sidebar-text"
            >
              <ChevronDown
                className={cn("mr-accordion-chevron size-3 shrink-0", !sectionOpen && "-rotate-90")}
                aria-hidden
              />
              <span className="truncate">{title}</span>
            </button>
            {action}
          </div>
        ) : null}

        {sectionOpen || collapsed ? (
          <>
            {alwaysVisible}
            {hiddenItems.length > 0 ? (
              <>
                <div
                  id={panelId}
                  className={cn("mr-accordion-panel grid", overflowOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
                >
                  <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden" inert={!overflowOpen || undefined}>
                    {hiddenItems}
                  </div>
                </div>
                {!collapsed ? (
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={toggle}
                    className="mr-row mr-press flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-sidebar-text/70 transition-colors hover:bg-sidebar-hover hover:text-sidebar-text"
                  >
                    {isOpen ? (
                      <>
                        <ChevronUp className="size-3 shrink-0" aria-hidden />
                        <span>{lessLabel}</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="size-3 shrink-0" aria-hidden />
                        <span>{typeof moreLabel === "function" ? moreLabel(hiddenItems.length) : moreLabel}</span>
                      </>
                    )}
                  </button>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-0.5 pt-3 first:pt-0", className)} {...rest}>
      {!collapsed ? (
        <div className="flex h-6 items-center justify-between gap-1 px-2">
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={panelId}
            onClick={toggle}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px] font-semibold tracking-wide text-text-tertiary uppercase transition-colors hover:text-sidebar-text"
          >
            <ChevronDown className={cn("mr-accordion-chevron size-3 shrink-0", !isOpen && "-rotate-90")} aria-hidden />
            <span className="truncate">{title}</span>
          </button>
          {action}
        </div>
      ) : null}
      <div id={panelId} className={cn("mr-accordion-panel grid", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden" inert={!isOpen || undefined}>
          {children}
        </div>
      </div>
    </div>
  );
}

interface ItemContent {
  icon?: ReactNode;
  label: ReactNode;
  /** Np. liczba nieprzeczytanych. */
  count?: number;
  active?: boolean;
  /** Nadpisuje tryb zwinięty poza `SidebarShell`. */
  collapsed?: boolean;
}

const itemClass = (active: boolean | undefined, collapsed: boolean) =>
  cn(
    "mr-row mr-press mr-nav-indicator flex h-8 w-full items-center text-sm outline-none [&_svg]:size-4 [&_svg]:shrink-0",
    collapsed ? "justify-center px-0" : "gap-2.5 px-2 text-left",
    active
      ? "bg-bg-selected font-medium text-accent-strong [&_svg]:text-accent-strong"
      : "text-sidebar-text hover:bg-sidebar-hover [&_svg]:text-text-tertiary",
  );

function Content({ icon, label, count, active, collapsed }: ItemContent & { collapsed: boolean }) {
  return (
    <>
      {icon}
      <span className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate"}>{label}</span>
      {!collapsed && count ? <Badge tone={active ? "accent" : "neutral"}>{count > 999 ? "999+" : count}</Badge> : null}
    </>
  );
}

function CollapsedItemTooltip({
  collapsed,
  inShell,
  label,
  children,
}: {
  collapsed: boolean;
  inShell: boolean;
  label: ReactNode;
  children: ReactNode;
}) {
  if (!collapsed) return <>{children}</>;
  const tip = (
    <Tooltip content={label} side="right">
      {children}
    </Tooltip>
  );
  return inShell ? tip : <TooltipProvider>{tip}</TooltipProvider>;
}

export type SidebarItemProps = ItemContent &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { ref?: Ref<HTMLButtonElement> };

/** Pozycja nawigacji jako przycisk (zmiana widoku w aplikacji). */
export function SidebarItem({
  icon,
  label,
  count,
  active,
  collapsed: collapsedProp,
  className,
  ...rest
}: SidebarItemProps) {
  const ctx = useSidebar();
  const isCollapsed = collapsedProp ?? ctx.collapsed;
  return (
    <CollapsedItemTooltip collapsed={isCollapsed} inShell={ctx.inShell} label={label}>
      <button
        type="button"
        aria-current={active ? "page" : undefined}
        data-active={active || undefined}
        className={cn(itemClass(active, isCollapsed), className)}
        {...rest}
      >
        <Content icon={icon} label={label} count={count} active={active} collapsed={isCollapsed} />
      </button>
    </CollapsedItemTooltip>
  );
}

export type SidebarLinkProps = ItemContent &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & { ref?: Ref<HTMLAnchorElement> };

/** Pozycja nawigacji jako link. */
export function SidebarLink({
  icon,
  label,
  count,
  active,
  collapsed: collapsedProp,
  className,
  ...rest
}: SidebarLinkProps) {
  const ctx = useSidebar();
  const isCollapsed = collapsedProp ?? ctx.collapsed;
  return (
    <CollapsedItemTooltip collapsed={isCollapsed} inShell={ctx.inShell} label={label}>
      <a
        aria-current={active ? "page" : undefined}
        data-active={active || undefined}
        className={cn(itemClass(active, isCollapsed), className)}
        {...rest}
      >
        <Content icon={icon} label={label} count={count} active={active} collapsed={isCollapsed} />
      </a>
    </CollapsedItemTooltip>
  );
}
