"use client";

import { Check, ChevronRight } from "lucide-react";
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { Kbd } from "./Kbd.js";

/** Menu kontekstowe pod prawym przyciskiem myszy (Radix ContextMenu) w szkle menu, renderowane w portalu. */
export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export const ContextMenuGroup = ContextMenuPrimitive.Group;
export const ContextMenuSub = ContextMenuPrimitive.Sub;

export function ContextMenuContent({
  className,
  collisionPadding = 4,
  ...rest
}: ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        collisionPadding={collisionPadding}
        className={cn(
          "mr-menu mr-animate-menu z-[var(--mr-z-dropdown)] min-w-48 p-1 text-sm text-text-primary outline-none",
          className,
        )}
        {...rest}
      />
    </ContextMenuPrimitive.Portal>
  );
}

const itemClass =
  "mr-row flex h-8 cursor-default items-center gap-2 px-2 outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-bg-hover [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-text-tertiary";

export interface ContextMenuItemProps extends ComponentProps<typeof ContextMenuPrimitive.Item> {
  icon?: ReactNode;
  shortcut?: ReactNode;
  danger?: boolean;
}

export function ContextMenuItem({ icon, shortcut, danger, className, children, ...rest }: ContextMenuItemProps) {
  return (
    <ContextMenuPrimitive.Item
      className={cn(itemClass, danger && "text-danger [&_svg]:text-danger", className)}
      {...rest}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {shortcut ? <Kbd>{shortcut}</Kbd> : null}
    </ContextMenuPrimitive.Item>
  );
}

export function ContextMenuCheckboxItem({
  className,
  children,
  ...rest
}: ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>) {
  return (
    <ContextMenuPrimitive.CheckboxItem className={cn(itemClass, className)} {...rest}>
      <span className="flex size-4 shrink-0 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <Check aria-hidden />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      <span className="flex-1 truncate">{children}</span>
    </ContextMenuPrimitive.CheckboxItem>
  );
}

export function ContextMenuLabel({ className, ...rest }: ComponentProps<typeof ContextMenuPrimitive.Label>) {
  return (
    <ContextMenuPrimitive.Label
      className={cn("px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-text-tertiary uppercase", className)}
      {...rest}
    />
  );
}

export function ContextMenuSeparator({ className, ...rest }: ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return <ContextMenuPrimitive.Separator className={cn("my-1 h-px bg-border-secondary", className)} {...rest} />;
}

export interface ContextMenuSubTriggerProps extends ComponentProps<typeof ContextMenuPrimitive.SubTrigger> {
  icon?: ReactNode;
}

export function ContextMenuSubTrigger({ icon, className, children, ...rest }: ContextMenuSubTriggerProps) {
  return (
    <ContextMenuPrimitive.SubTrigger className={cn(itemClass, "data-[state=open]:bg-bg-hover", className)} {...rest}>
      {icon}
      <span className="flex-1 truncate">{children}</span>
      <ChevronRight aria-hidden className="ml-auto shrink-0" />
    </ContextMenuPrimitive.SubTrigger>
  );
}

export function ContextMenuSubContent({
  className,
  collisionPadding = 4,
  ...rest
}: ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.SubContent
        collisionPadding={collisionPadding}
        className={cn(
          "mr-menu mr-animate-menu z-[var(--mr-z-dropdown)] min-w-44 p-1 text-sm text-text-primary outline-none",
          className,
        )}
        {...rest}
      />
    </ContextMenuPrimitive.Portal>
  );
}
