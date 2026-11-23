"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn.js";

/** Zakładki (Radix Tabs): Tabs > TabsList > TabsTrigger oraz TabsContent. */
export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...rest }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("inline-flex items-center gap-1 rounded-control bg-bg-tertiary p-0.5", className)}
      {...rest}
    />
  );
}

export function TabsTrigger({ className, ...rest }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "mr-press h-7 rounded-[6px] px-3 text-xs font-medium text-text-tertiary hover:text-text-primary data-[state=active]:bg-bg-primary data-[state=active]:text-text-primary data-[state=active]:shadow-sm",
        className,
      )}
      {...rest}
    />
  );
}

export function TabsContent({ className, ...rest }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("outline-none", className)} {...rest} />;
}
