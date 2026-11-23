import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

const PALETTE = ["#0e7490", "#7c3aed", "#047857", "#b45309", "#be123c", "#1d4ed8", "#4d7c0f", "#a21caf"];

/** Stały kolor dla tej samej osoby: z sumy kodów znaków adresu albo imienia. */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (const char of seed.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length] ?? PALETTE[0]!;
}

export function initials(name: string): string {
  const words = name
    .replace(/<.*>/, "")
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  const letters = words.length > 1 ? [words[0]![0], words[words.length - 1]![0]] : [words[0]?.[0], words[0]?.[1]];
  return letters.filter(Boolean).join("").toUpperCase() || "?";
}

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  name: string;
  /** Adres e-mail albo inny stały klucz koloru. */
  seed?: string;
  src?: string;
  size?: "sm" | "md" | "lg";
}

const sizes = { sm: "size-6 text-[10px]", md: "size-8 text-xs", lg: "size-10 text-sm" };

/** Avatar z inicjałami w stałym kolorze albo ze zdjęciem. */
export function Avatar({ name, seed, src, size = "md", className, style, ...rest }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        "mr-no-text-shadow inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white",
        sizes[size],
        className,
      )}
      style={{ backgroundColor: avatarColor(seed ?? name), ...style }}
      {...rest}
    >
      {src ? <img src={src} alt="" className="size-full object-cover" /> : initials(name)}
    </span>
  );
}
