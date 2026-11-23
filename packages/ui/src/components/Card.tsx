import type { HTMLAttributes, Ref } from "react";
import { cn } from "../lib/cn.js";

export type Surface = "side" | "middle" | "reading" | "strong" | "float";

const surfaces: Record<Surface, string> = {
  side: "mr-card mr-side",
  middle: "mr-card mr-middle",
  reading: "mr-card mr-reading",
  strong: "mr-card mr-strong",
  float: "mr-float rounded-card",
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Rodzaj szkła: side (pasek boczny), middle (lista), reading (treść), strong (narzędzia), float (okno). */
  surface?: Surface;
  ref?: Ref<HTMLDivElement>;
}

/** Pływająca szklana karta, podstawowy panel aplikacji. */
export function Card({ surface = "reading", className, ...rest }: CardProps) {
  return <div className={cn(surfaces[surface], "text-text-primary", className)} {...rest} />;
}

/** Nagłówek karty z dolną linią. */
export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex min-h-12 items-center gap-3 border-b border-border-secondary px-4 py-2", className)}
      {...rest}
    />
  );
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("min-w-0 truncate text-base font-semibold text-text-primary", className)} {...rest} />;
}
