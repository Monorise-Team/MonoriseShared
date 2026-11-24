# MonoriseShared

Wspólne biblioteki Monorise publikowane w GitHub Packages pod nazwą `@monorise-team/*` (ADR-0087). Wszystkie paczki mają zawsze tę samą wersję.

| Paczka                                               | Co                                                                                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [`@monorise-team/tokens`](packages/tokens)           | tokeny wyglądu „Moonlight glass” z desktopowego Aven: CSS dla przeglądarki i komputera, wartości dla Expo                     |
| [`@monorise-team/ui`](packages/ui)                   | komponenty React na Radix w tym wyglądzie (przyciski, pola, okna, menu, karty, pasek boczny, listy)                           |
| [`@monorise-team/config`](packages/config)           | ESLint, Prettier, TypeScript i commitlint                                                                                     |
| [`@monorise-team/auth`](packages/auth)               | logowanie produktów przez MonoriseCore: sprawdzanie tokenów, OAuth 2.1 z PKCE, sesje BFF w Next.js, wtyczka Fastify           |
| [`@monorise-team/permissions`](packages/permissions) | deklaracja i sprawdzanie uprawnień, zakresy z dziedziczeniem poddrzewa, delegowanie i pamięć podręczna migawek                |
| [`@monorise-team/events`](packages/events)           | zdarzenia między usługami: koperta komunikatu, definicje i katalog, outbox, odbiorca odporny na duplikaty i zmianę kolejności |
| [`@monorise-team/sdk`](packages/sdk)                 | typowany klient Core API generowany z opisu OpenAPI (działa w przeglądarce, Node.js i Expo, tylko `fetch`)                    |
| [`apps/playground`](apps/playground)                 | katalog komponentów (nie jest publikowany)                                                                                    |

## Uruchomienie

Potrzebne: Node.js 24 (`.nvmrc`) i pnpm 11.

```bash
pnpm install      # instaluje też hooki (commitlint, lint-staged, typy)
pnpm dev          # katalog komponentów na http://127.0.0.1:5180
pnpm check        # formatowanie, wersje, lint, typy, testy i build
```

## Korzystanie w produkcie

```bash
# raz: uprawnienie do paczek w GitHub Packages
gh auth refresh -h github.com -s read:packages
```

```ini
# .npmrc produktu
@monorise-team:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

```css
/* główny plik CSS aplikacji */
@import "tailwindcss";
@import "@monorise-team/ui/styles.css";
```

```tsx
import { Button, Card, ThemeProvider } from "@monorise-team/ui";
```

## Wersje i wydania

- Wersję liczy Release Please z commitów (Conventional Commits); nikt nie zmienia jej ręcznie. `pnpm check:versions` odrzuca paczkę z inną wersją niż reszta.
- Każde wypchnięcie na `dev` publikuje wersje testowe `X.Y.Z-dev.N` (oznaczenie `dev`).
- Pull request `dev` → `prod` to wydanie: Release Please scala swój pull request wersji, oznacza `vX.Y.Z` i publikuje paczki z oznaczeniem `latest`.

Zasady pracy: [CONTRIBUTING.md organizacji](https://github.com/Monorise-Team/.github/blob/main/CONTRIBUTING.md).
