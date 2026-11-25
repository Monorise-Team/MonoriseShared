# @monorise-team/tokens

Tokeny wyglądu Monorise: system „Moonlight glass” z desktopowego Aven (ADR-0091), zgodny 1:1 z wartościami `aven-mail`. Jedno źródło wartości (`src/values.ts`) dla CSS i dla Expo.

## Przeglądarka i komputer (Tailwind CSS 4)

```css
@import "tailwindcss";
@import "@monorise-team/tokens/tokens.css";
@import "@monorise-team/tokens/tailwind.css";
```

- Tryb ciemny: klasa `dark` na `<html>`; motyw: `<html data-theme="moonlight">` (`mono`, `moonlight`, `amethyst`, `emerald`).
- Skala tekstu: atrybut `data-font-scale` (albo klasa `font-scale-*`) na `<html>`: `small` (82%), `default` (100%), `large` (118%), `xlarge` (136%).
- Gęstość wierszy list: `data-density` na `<html>`: `compact`, `default`, `spacious` (zmienne `--mr-row-px`, `--mr-row-py`, `--mr-row-avatar`).
- Kolory: `bg-bg-primary`, `text-text-secondary`, `border-border-primary`, `bg-accent text-accent-fg`, `text-accent-strong`, `hover:bg-sidebar-hover`, `text-sidebar-active`, `rounded-card`, `gap-card`, `shadow-card`.
- Warstwy `z-index`: `--mr-z-base` (0), `--mr-z-sticky` (10), `--mr-z-dropdown` (40), `--mr-z-overlay` (50), `--mr-z-modal` (60), `--mr-z-popover` (70), `--mr-z-toast` (80), `--mr-z-tooltip` (90).
- Ograniczony ruch: ustawienie systemu albo klasa `reduce-motion` na `<html>`.

## Expo i React Native

```ts
import { resolveColors, shape, motion, zIndex, density, fontScale } from "@monorise-team/tokens";

const colors = resolveColors("dark", "moonlight");
// colors["bg-primary"] → "rgba(10, 22, 34, 0.96)"
// colors["accent-strong"] → "#67d5e5"
```
