import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-bg-tertiary text-text-secondary",
  accent: "bg-accent text-accent-fg",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

/** Mała etykieta: licznik nieprzeczytanych, stan, kategoria. */
export function Badge({ tone = "neutral", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "mr-no-text-shadow inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-none font-semibold tabular-nums",
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}
