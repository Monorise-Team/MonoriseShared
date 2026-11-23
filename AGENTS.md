# AGENTS.md

Instrukcje dla agentów AI (i ludzi) pracujących w repozytorium MonoriseShared.

## Czym jest to repozytorium

Wspólne biblioteki Monorise (`@monorise-team/*`) w przestrzeni roboczej pnpm z Turborepo: `packages/config`, `packages/tokens`, `packages/ui` oraz katalog komponentów `apps/playground`. Decyzje: ADR-0087 (wersje), ADR-0091 (wygląd), ADR-0092 (pnpm i Turborepo) w repozytorium MonoriseDocumentation.

## Polecenia

```bash
pnpm install
pnpm dev            # katalog komponentów: http://127.0.0.1:5180
pnpm check          # obowiązkowo przed pull requestem
pnpm check:versions # jedna wersja wszystkich paczek
```

## Proces pracy (zawsze)

1. **Najpierw zgłoszenie** z formularza (`.github/ISSUE_TEMPLATE/`), po polsku, z sekcjami `### Obszar`, `### Priorytet`, `### Nakład pracy`.
2. **Gałąź** `flow/<typ>/<numer>-<opis>` od aktualnego `dev`, zakładana poleceniem `gh issue develop <numer> --base dev --name <gałąź>`. Typy: `feature`, `bugfix`, `refactor`, `perf`, `chore`, `docs`, `security`, `spike`, `test`; pilna poprawka produkcji `flow/hotfix/<numer>-<opis>` od `prod`. Nigdy `claude/*` ani innych nazw spoza konwencji.
3. **Commity** po angielsku w formacie Conventional Commits (commitlint, nagłówek do 72 znaków). Hooki sprawdzają lint, formatowanie i typy; nigdy `--no-verify`.
4. **Pull request** do `dev` z szablonu (po polsku, sekcja „Dla użytkowników” PL i EN), z `Closes #<numer>`. Scalamy zwykłym scaleniem (merge commit), nigdy przez squash.
5. **Wydanie**: pull request `dev` → `prod`. Release Please liczy wersję, oznacza `vX.Y.Z` i publikuje paczki. Wersji nie zmieniamy ręcznie.
6. Kartę na tablicy „Monorise” przesuwamy do 🛠️ In Progress przy gałęzi i do 👀 Code Review przy pull requeście.

## Zasady kodu

1. **Wygląd z desktopowego Aven** (ADR-0091): semantyczne tokeny (`bg-bg-primary`, `text-text-secondary`, `bg-accent text-accent-fg`), szklane karty (`.mr-card` z `.mr-side`/`.mr-middle`/`.mr-reading`), menu i okna w mocnym szkle (`.mr-menu`, `.mr-float`), 16 px zaokrąglenia kart, 10 px odstępu. Żadnych kolorów wpisanych na sztywno w komponentach.
2. **Jedno źródło wartości**: kolory, kształty i ruch zmieniamy tylko w `packages/tokens/src/values.ts`; CSS powstaje z niego przy buildzie.
3. **Dostępność**: komponenty interaktywne na Radix; każdy przycisk z samą ikoną ma `aria-label`; tekst na akcencie ma kontrast co najmniej 4,5:1 (test w tokens).
4. **Ruch**: tylko przez zmienne `--mr-anim-*`, które zerują się przy ograniczonym ruchu.
5. **Okna i menu w portalu**: szkło (`backdrop-filter`) więzi elementy o stałej pozycji.
6. **Biblioteka jest publiczna**: komponent nie zna produktu, nie ma tekstów jednego produktu ani sekretów.
7. **Importy z rozszerzeniem `.js`** w `packages/*/src` (moduły NodeNext), `"use client"` w plikach z hookami albo Radix.
8. **Nowa paczka** dostaje tę samą wersję co reszta, `publishConfig.registry` GitHub Packages i wpis w `release-please-config.json` (`extra-files`).
