# @monorise-team/ui

Komponenty React w wyglądzie „Moonlight glass” z desktopowego Aven (ADR-0091), zbudowane na Radix i Tailwind CSS 4.

## Użycie w aplikacji

Załaduj style po Tailwind CSS 4 i owiń aplikację w `ThemeProvider`:

```css
@import "tailwindcss";
@import "@monorise-team/ui/styles.css";
```

```tsx
import { AppShell, Button, Card, ThemeProvider, TooltipProvider } from "@monorise-team/ui";
```

Przed pierwszym malowaniem (np. w `<head>`) możesz wstawić `appearanceInitScript`, żeby strona od razu miała właściwy tryb, motyw i skalę tekstu.

## Szklane karty i warstwy

- `AppShell` i `AppBackdrop`: układ pływających kart z odstępem `10 px` nad tłem.
- `Card`: powierzchnie `side` (pasek boczny), `middle` (lista; w trybie ciemnym podnosi kontrast `text-tertiary` do `#b9ccd5`), `reading` (treść), `strong` (narzędzia) oraz `float` (okna i dymki).
- Okna (`Dialog`, `ConfirmDialog`), menu (`Menu`) i dymki (`Tooltip`) renderują się w portalu poza kartami i korzystają ze skali warstw `--mr-z-*` z `@monorise-team/tokens`.

## Wygląd i ustawienia (`ThemeProvider`, `useTheme`)

Ustawienia zapisują się w `localStorage` pod kluczem `monorise-appearance` (starsze zapisy bez nowych pól uzupełniane są wartościami domyślnymi):

- `mode`: `"light" | "dark" | "system"` (domyślnie `"dark"`)
- `theme`: `"mono" | "moonlight" | "amethyst" | "emerald"` (domyślnie `"mono"`)
- `backdrop`: `"wallpaper" | "gradient"` (domyślnie `"wallpaper"`; gradienty CSS służą też jako tło zastępcze podczas ładowania zdjęcia)
- `wallpaperDim`: `0–80` (%) — przyciemnienie w trybie ciemnym albo rozjaśnienie w trybie jasnym (domyślnie `0`)
- `wallpaperBlur`: `0–24` (px) — rozmycie tapety z lekkim powiększeniem `1.06`, żeby krawędzie były ostre (domyślnie `0`)
- `fontScale`: `"small" | "default" | "large" | "xlarge"` (82%, 100%, 118%, 136%; domyślnie `"default"`)
- `density`: `"compact" | "default" | "spacious"` (odstępy wierszy `ListItem`; domyślnie `"default"`)
- `reduceMotion`: wyłącza animacje niezależnie od ustawień systemu
- `glass`: wyłącza rozmycie szkła i tapety (`no-glass`; działa też przy `prefers-reduced-transparency: reduce`)

## Tapety

Paczka zawiera cztery tapety doliny odpowiadające motywom (`@monorise-team/ui/wallpapers/{mono,moonlight,amethyst,emerald}.jpg`). W trybie jasnym zdjęcie jest wypłowione do pastelu pod jasnym szkłem, a w trybie ciemnym ma delikatne przyciemnienie nad księżycem i paskiem tytułu.

Zdjęcia doliny pochodzą z projektu `aven-mail` właściciela i mogą być używane przez aplikacje Monorise (zdjęcia: Monorise Team).
