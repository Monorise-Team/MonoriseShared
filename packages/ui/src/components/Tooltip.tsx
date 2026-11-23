"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { Kbd } from "./Kbd.js";

/** Jeden na aplikację, wysoko w drzewie: wspólne opóźnienie dymków. */
export function TooltipProvider({ children, delayDuration = 400 }: { children: ReactNode; delayDuration?: number }) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration}>{children}</TooltipPrimitive.Provider>;
}

export interface TooltipProps {
  content: ReactNode;
  shortcut?: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactNode;
  className?: string;
}

/** Dymek z opisem i opcjonalnym skrótem; dziecko musi przyjmować ref (np. Button). */
export function Tooltip({ content, shortcut, side = "bottom", children, className }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            "mr-float mr-animate-menu z-50 flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-text-primary",
            className,
          )}
        >
          {content}
          {shortcut ? <Kbd>{shortcut}</Kbd> : null}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
