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

## Szkielet aplikacji i ustawienia

- `SidebarShell`, `SidebarCollapseButton`, `SidebarAccordion`: zwijany pasek boczny (`w-60` ↔ `w-16`, automatycznie zwijany poniżej 760 px z ukryciem przycisku zwijania), sekcje z animacją `grid-rows-[0fr]` / `grid-rows-[1fr]` i skracaniem listy do pierwszych `N` pozycji przyciskiem „Pokaż więcej”. Zwinięte `SidebarItem` i `SidebarLink` zachowują etykietę dla czytników ekranu i pokazują ją w dymku.
- `ResizableSplitPane`: dwa panele rozdzielone uchwytem w przerwie `--mr-card-gap` (`10 px`), z obsługą myszy, klawiatury (±16 px), podwójnego kliknięcia (reset), limitów oraz opcjonalnym zapisem w `localStorage` (`storageKey`). Obsługuje `orientation="horizontal"` i `"vertical"`.
- `TitleBar` (`title`) i `WindowControls`: wyśrodkowany tytuł na środku paska tytułu oraz przyciski okna (`46 px`) dla `platform="windows" | "linux"` (na `"mac"` nie renderują się).
- `SettingsLayout`, `SettingSection`, `SettingRow`, `SettingToggleRow`: układ ustawień oparty o `@container` (pionowa nawigacja `w-48` przełącza się w CSS poniżej 640 px na poziomy pasek) oraz wiersze z etykietą, opisem i `Switch`.
- `AppearanceControls`: gotowy zestaw kontrolek oparty o `useTheme()` (karty 4 motywów, tryb Jasny/Ciemny/System, tło Zdjęcie/Gradient, przyciemnienie 0–80%, rozmycie 0–24 px, skala tekstu, gęstość, ruch i szkło) z domyślnymi polskimi napisami i możliwością nadpisania przez `labels`.

```tsx
<AppShell
  titleBar={
    <TitleBar title="Acme · Poczta">
      <WindowControls platform="windows" onMinimize={onMin} onMaximize={onMax} onClose={onClose} />
    </TitleBar>
  }
>
  <SidebarShell footer={<SidebarCollapseButton />}>
    <SidebarNav>
      <SidebarItem icon={<Inbox />} label="Odebrane" count={3} active />
      <SidebarAccordion title="Etykiety" visibleCount={2}>
        <SidebarItem icon={<Tag />} label="Klienci" />
        <SidebarItem icon={<Tag />} label="Faktury" />
        <SidebarItem icon={<Tag />} label="Zespół" />
      </SidebarAccordion>
    </SidebarNav>
  </SidebarShell>
  <ResizableSplitPane storageKey="mail-split" primary={<ListCard />} secondary={<ReadingCard />} />
</AppShell>
```
