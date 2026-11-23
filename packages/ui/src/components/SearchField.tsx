import { Search } from "lucide-react";
import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../lib/cn.js";
import { Kbd } from "./Kbd.js";

export interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type"> {
  /** Skrót klawiszowy pokazany na końcu pola, np. „⌘K”. */
  shortcut?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

/** Pole wyszukiwania z ikoną i podpowiedzią skrótu. */
export function SearchField({ shortcut, className, "aria-label": ariaLabel, placeholder, ...rest }: SearchFieldProps) {
  return (
    <label
      className={cn(
        "mr-no-text-shadow flex h-9 items-center gap-2 rounded-control border border-border-secondary bg-bg-tertiary px-3 text-sm text-text-tertiary transition-colors focus-within:border-accent",
        className,
      )}
    >
      <Search aria-hidden className="size-4 shrink-0" />
      <input
        type="search"
        aria-label={ariaLabel ?? placeholder}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-text-primary outline-none placeholder:text-text-tertiary"
        {...rest}
      />
      {shortcut ? <Kbd>{shortcut}</Kbd> : null}
    </label>
  );
}
