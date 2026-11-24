# CLAUDE.md

Zasady pracy w tym repozytorium są wspólne dla wszystkich agentów i opisane w @AGENTS.md.

Dodatkowo dla Claude:

- Rozmawiaj z właścicielem projektu po polsku, prostym językiem i na przykładach. Pytaj tylko o to, czego nie da się ustalić samodzielnie.
- Po każdej zmianie uruchom `pnpm check` i popraw błędy przed commitem.
- Zmiany wyglądu sprawdzaj w katalogu komponentów (`pnpm dev`) w trybie jasnym i ciemnym, we wszystkich motywach i z ograniczonym ruchem.

## Relay Bridge

Use the relay-bridge skill: delegate well-defined work to Gemini, review it, integrate it yourself.

- Zlecaj Gemini pracę dobrze określoną: funkcję, testy, poprawkę ze znaną przyczyną, dokumentację. Architektura, decyzje, przegląd i scalanie zostają po Twojej stronie.
- Najpierw zgłoszenie z formularza. Gałąź zakłada samo zlecenie (`branch: flow/<typ>/<numer>-<opis>`, `base_ref: dev`), więc przy pracy zleconej pomijasz `gh issue develop`. Zlecenie dostaje `push: true` i `open_pull_request: true`.
- `working_directory` to katalog główny tego repozytorium (`git rev-parse --show-toplevel`).
- Przed integracją przejrzyj diff, uruchom `pnpm check` w katalogu roboczym zlecenia i sprawdź `review_checklist` oraz `report_mismatches`.
- Pull request uzupełnij z szablonu (`Closes #<numer>`), oznacz jako gotowy i scal zwykłym scaleniem po zielonym CI. Zmiany w `packages/auth` i `packages/permissions` scalasz dopiero po zgodzie właściciela projektu.
- Po scaleniu usuń katalog roboczy zlecenia (`cleanup_task_worktree`).
- Agent, który dostał zlecenie przez Relay Bridge, nie zleca dalej: wykonuje zadanie i raportuje.
