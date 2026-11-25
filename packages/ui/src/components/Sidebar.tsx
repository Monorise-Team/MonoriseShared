import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../lib/cn.js";
import { Badge } from "./Badge.js";

/** Nawigacja w karcie bocznej: sekcje z nagłówkami i pozycjami. */
export function SidebarNav({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <nav className={cn("flex flex-col gap-0.5", className)} {...rest} />;
}

export interface SidebarSectionProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  action?: ReactNode;
}

export function SidebarSection({ title, action, className, children, ...rest }: SidebarSectionProps) {
  return (
    <div className={cn("flex flex-col gap-0.5 pt-3 first:pt-0", className)} {...rest}>
      {title ? (
        <div className="flex h-6 items-center justify-between px-2 text-[11px] font-semibold tracking-wide text-text-tertiary uppercase">
          <span>{title}</span>
          {action}
        </div>
      ) : null}
      {children}
    </div>
  );
}

interface ItemContent {
  icon?: ReactNode;
  label: ReactNode;
  /** Np. liczba nieprzeczytanych. */
  count?: number;
  active?: boolean;
}

const itemClass = (active: boolean | undefined) =>
  cn(
    "mr-row mr-press mr-nav-indicator flex h-8 w-full items-center gap-2.5 px-2 text-left text-sm outline-none [&_svg]:size-4 [&_svg]:shrink-0",
    active
      ? "bg-bg-selected font-medium text-accent-strong [&_svg]:text-accent-strong"
      : "text-sidebar-text hover:bg-sidebar-hover [&_svg]:text-text-tertiary",
  );

function Content({ icon, label, count, active }: ItemContent) {
  return (
    <>
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count ? <Badge tone={active ? "accent" : "neutral"}>{count > 999 ? "999+" : count}</Badge> : null}
    </>
  );
}

export type SidebarItemProps = ItemContent &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { ref?: Ref<HTMLButtonElement> };

/** Pozycja nawigacji jako przycisk (zmiana widoku w aplikacji). */
export function SidebarItem({ icon, label, count, active, className, ...rest }: SidebarItemProps) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      data-active={active || undefined}
      className={cn(itemClass(active), className)}
      {...rest}
    >
      <Content icon={icon} label={label} count={count} active={active} />
    </button>
  );
}

export type SidebarLinkProps = ItemContent &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & { ref?: Ref<HTMLAnchorElement> };

/** Pozycja nawigacji jako link. */
export function SidebarLink({ icon, label, count, active, className, ...rest }: SidebarLinkProps) {
  return (
    <a
      aria-current={active ? "page" : undefined}
      data-active={active || undefined}
      className={cn(itemClass(active), className)}
      {...rest}
    >
      <Content icon={icon} label={label} count={count} active={active} />
    </a>
  );
}
