"use client";

import { Check } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { Kbd } from "./Kbd.js";

/** Menu rozwijane (Radix DropdownMenu) w szkle menu: Menu > MenuTrigger + MenuContent > MenuItem. */
export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuGroup = DropdownMenu.Group;

export function MenuContent({ className, sideOffset = 6, ...rest }: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        sideOffset={sideOffset}
        className={cn("mr-menu mr-animate-menu z-50 min-w-44 p-1 text-sm text-text-primary", className)}
        {...rest}
      />
    </DropdownMenu.Portal>
  );
}

const itemClass =
  "mr-row flex h-8 cursor-default items-center gap-2 px-2 outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-bg-hover [&_svg]:size-4 [&_svg]:text-text-tertiary";

export interface MenuItemProps extends ComponentProps<typeof DropdownMenu.Item> {
  icon?: ReactNode;
  shortcut?: ReactNode;
  danger?: boolean;
}

export function MenuItem({ icon, shortcut, danger, className, children, ...rest }: MenuItemProps) {
  return (
    <DropdownMenu.Item className={cn(itemClass, danger && "text-danger [&_svg]:text-danger", className)} {...rest}>
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {shortcut ? <Kbd>{shortcut}</Kbd> : null}
    </DropdownMenu.Item>
  );
}

export function MenuCheckboxItem({ className, children, ...rest }: ComponentProps<typeof DropdownMenu.CheckboxItem>) {
  return (
    <DropdownMenu.CheckboxItem className={cn(itemClass, className)} {...rest}>
      <span className="flex size-4 items-center justify-center">
        <DropdownMenu.ItemIndicator>
          <Check aria-hidden />
        </DropdownMenu.ItemIndicator>
      </span>
      <span className="flex-1 truncate">{children}</span>
    </DropdownMenu.CheckboxItem>
  );
}

export function MenuLabel({ className, ...rest }: ComponentProps<typeof DropdownMenu.Label>) {
  return (
    <DropdownMenu.Label
      className={cn("px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-text-tertiary uppercase", className)}
      {...rest}
    />
  );
}

export function MenuSeparator({ className, ...rest }: ComponentProps<typeof DropdownMenu.Separator>) {
  return <DropdownMenu.Separator className={cn("my-1 h-px bg-border-secondary", className)} {...rest} />;
}
