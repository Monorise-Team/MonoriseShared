import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn.js";

/** Szkielet ładowania w kształcie docelowej treści (zamiast kręcącego się kółka). */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("animate-pulse rounded-row bg-bg-tertiary", className)} {...rest} />;
}

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

/** Pusty stan: co tu będzie i jak to zapełnić. */
export function EmptyState({ icon, title, description, action, className, ...rest }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)} {...rest}>
      {icon ? (
        <div className="flex size-12 items-center justify-center rounded-2xl bg-bg-tertiary text-text-tertiary [&_svg]:size-6">
          {icon}
        </div>
      ) : null}
      <div className="flex max-w-xs flex-col gap-1">
        <p className="text-sm font-semibold text-text-primary">{title}</p>
        {description ? <p className="text-sm text-text-tertiary">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  /** 0–100; bez wartości pasek jest nieokreślony (trwa ładowanie). */
  value?: number;
  label: string;
}

/** Pasek postępu z akcentem i lekką poświatą. */
export function ProgressBar({ value, label, className, ...rest }: ProgressBarProps) {
  const determinate = typeof value === "number";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={determinate ? Math.round(value) : undefined}
      className={cn("mr-progress-track h-1 w-full overflow-hidden rounded-full", className)}
      {...rest}
    >
      <div
        className={cn("mr-progress-fill h-full rounded-full", !determinate && "mr-progress-indeterminate w-2/5")}
        style={determinate ? { width: `${Math.min(100, Math.max(0, value))}%` } : undefined}
      />
    </div>
  );
}
