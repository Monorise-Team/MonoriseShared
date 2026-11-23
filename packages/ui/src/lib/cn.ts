import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Łączy klasy i rozwiązuje konflikty Tailwinda (późniejsza klasa wygrywa). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
