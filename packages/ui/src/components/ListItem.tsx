import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../lib/cn.js";

export interface ListItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  /** Lewa kolumna, np. Avatar. */
  leading?: ReactNode;
  title: ReactNode;
  /** Prawa strona tytułu, np. godzina. */
  meta?: ReactNode;
  subtitle?: ReactNode;
  preview?: ReactNode;
  selected?: boolean;
  /** Pogrubienie nieprzeczytanego. */
  unread?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/** Wiersz listy (np. wątek poczty): avatar, tytuł z godziną, podtytuł i podgląd. */
export function ListItem({
  leading,
  title,
  meta,
  subtitle,
  preview,
  selected,
  unread,
  className,
  ...rest
}: ListItemProps) {
  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      className={cn(
        "mr-row mr-press flex w-full items-start gap-3 px-3 py-2.5 text-left outline-none",
        selected ? "bg-bg-selected" : "hover:bg-row-hover",
        className,
      )}
      {...rest}
    >
      {leading ? <span className="pt-0.5">{leading}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm",
              unread ? "font-semibold text-text-primary" : "text-text-secondary",
            )}
          >
            {title}
          </span>
          {meta ? <span className="shrink-0 text-xs text-text-tertiary tabular-nums">{meta}</span> : null}
        </span>
        {subtitle ? (
          <span className={cn("truncate text-sm", unread ? "font-medium text-text-primary" : "text-text-secondary")}>
            {subtitle}
          </span>
        ) : null}
        {preview ? <span className="line-clamp-2 text-xs text-text-tertiary">{preview}</span> : null}
      </span>
    </button>
  );
}
