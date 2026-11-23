"use client";

import { Check } from "lucide-react";
import { Checkbox as CheckboxPrimitive, Switch as SwitchPrimitive } from "radix-ui";
import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "../lib/cn.js";

export interface CheckboxProps extends ComponentProps<typeof CheckboxPrimitive.Root> {
  label?: ReactNode;
}

/** Pole wyboru (Radix): klawiatura i czytniki ekranu działają same. */
export function Checkbox({ label, className, id, ...rest }: CheckboxProps) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <CheckboxPrimitive.Root
        id={inputId}
        className="mr-press flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-border-primary bg-bg-tertiary data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-fg"
        {...rest}
      >
        <CheckboxPrimitive.Indicator>
          <Check className="size-3" strokeWidth={3} aria-hidden />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label ? (
        <label htmlFor={inputId} className="text-sm text-text-secondary select-none">
          {label}
        </label>
      ) : null}
    </span>
  );
}

export interface SwitchProps extends ComponentProps<typeof SwitchPrimitive.Root> {
  label?: ReactNode;
  description?: ReactNode;
}

/** Przełącznik włącz/wyłącz z etykietą i opisem po lewej, jak w ustawieniach desktopowego Aven. */
export function Switch({ label, description, className, id, ...rest }: SwitchProps) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <span className={cn("flex items-center justify-between gap-4", className)}>
      {label ? (
        <span className="flex min-w-0 flex-col">
          <label htmlFor={inputId} className="text-sm text-text-primary">
            {label}
          </label>
          {description ? <span className="text-xs text-text-tertiary">{description}</span> : null}
        </span>
      ) : null}
      <SwitchPrimitive.Root
        id={inputId}
        className="mr-press relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-bg-tertiary ring-1 ring-border-primary ring-inset data-[state=checked]:bg-accent data-[state=checked]:ring-transparent"
        {...rest}
      >
        <SwitchPrimitive.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-150 data-[state=checked]:translate-x-[18px]" />
      </SwitchPrimitive.Root>
    </span>
  );
}
