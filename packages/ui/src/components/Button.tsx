import { Slot } from "radix-ui";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../lib/cn.js";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ikona przed tekstem (np. z lucide-react). */
  icon?: ReactNode;
  /** Sam przycisk z ikoną: podaj też `aria-label`. */
  iconOnly?: boolean;
  /** Wyrenderuj dziecko (np. link) z wyglądem przycisku. */
  asChild?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
  ghost: "text-text-tertiary hover:bg-bg-hover hover:text-text-primary",
  danger: "bg-danger-solid text-white hover:bg-danger-solid-hover",
  outline: "border border-border-primary text-text-primary hover:bg-bg-hover",
};

const sizes: Record<ButtonSize, string> = {
  xs: "h-6 gap-1 px-2 text-xs",
  sm: "h-7 gap-1.5 px-3 text-xs",
  md: "h-8 gap-2 px-3.5 text-sm",
  lg: "h-10 gap-2 px-5 text-sm",
};

const iconSizes: Record<ButtonSize, string> = { xs: "size-6", sm: "size-7", md: "size-8", lg: "size-10" };

/** Przycisk: wypełniony akcentem (primary), spokojny (secondary, ghost), obrys albo niebezpieczny (danger). */
export function Button({
  variant = "secondary",
  size = "sm",
  icon,
  iconOnly = false,
  asChild = false,
  className,
  children,
  type,
  ...rest
}: ButtonProps) {
  const Component = asChild ? Slot.Root : "button";
  return (
    <Component
      type={asChild ? undefined : (type ?? "button")}
      className={cn(
        "mr-press mr-no-text-shadow inline-flex shrink-0 items-center justify-center rounded-control font-medium whitespace-nowrap select-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        variants[variant],
        iconOnly ? cn(iconSizes[size], "p-0") : sizes[size],
        className,
      )}
      {...rest}
    >
      {asChild ? (
        children
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </Component>
  );
}
