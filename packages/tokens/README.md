# @monorise-team/tokens

Tokeny wyglądu Monorise: system „Moonlight glass” z desktopowego Aven (ADR-0091). Jedno źródło wartości (`src/values.ts`) dla CSS i dla Expo.

## Przeglądarka i komputer (Tailwind CSS 4)

```css
@import "tailwindcss";
@import "@monorise-team/tokens/tokens.css";
@import "@monorise-team/tokens/tailwind.css";
```

- tryb ciemny: klasa `dark` na `<html>`; motyw: `<html data-theme="moonlight">` (`mono`, `moonlight`, `amethyst`, `emerald`),
- klasy: `bg-bg-primary`, `text-text-secondary`, `border-border-primary`, `bg-accent text-accent-fg`, `rounded-card`, `gap-card`, `shadow-card`,
- ograniczony ruch: ustawienie systemu albo klasa `reduce-motion` na `<html>`.

## Expo i React Native

```ts
import { resolveColors, shape, motion } from "@monorise-team/tokens";

const colors = resolveColors("dark", "moonlight");
// colors["bg-primary"] → "rgba(10, 22, 34, 0.96)"
```
