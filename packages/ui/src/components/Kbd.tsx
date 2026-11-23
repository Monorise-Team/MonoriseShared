import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

/** Klawisz albo skrót klawiszowy. */
export function Kbd({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "mr-no-text-shadow inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-border-primary bg-bg-tertiary px-1 font-sans text-[11px] font-medium text-text-tertiary",
        className,
      )}
      {...rest}
    />
  );
}
