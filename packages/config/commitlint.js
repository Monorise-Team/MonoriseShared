/**
 * Commity w formacie Conventional Commits (ADR-0086): z nich Release Please liczy wersję i pisze historię zmian.
 * Typy odpowiadają etykietom zgłoszeń i nazwom gałęzi:
 *
 *   etykieta           gałąź                commit
 *   type: ✨ feature    flow/feature/...     feat
 *   type: 🐛 bugfix     flow/bugfix/...      fix
 *   type: ♻️ refactor   flow/refactor/...    refactor
 *   type: ⚡ perf       flow/perf/...        perf
 *   type: 🔧 chore      flow/chore/...       chore
 *   type: 📚 docs       flow/docs/...        docs
 *   type: 🧪 test       flow/test/...        test
 *   type: 🔒 security   flow/security/...    security
 *   type: 🔍 spike      flow/spike/...       spike
 *
 * Do tego `ci` (potoki), `build` (pakowanie, instalatory), `i18n` (tłumaczenia) i `revert`.
 */
export const TYPES = [
  "feat",
  "fix",
  "refactor",
  "perf",
  "chore",
  "docs",
  "test",
  "security",
  "spike",
  "ci",
  "build",
  "i18n",
  "revert",
];

export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [2, "always", TYPES],
    "subject-case": [2, "never", ["upper-case", "pascal-case", "start-case"]],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    "header-max-length": [2, "always", 72],
    "body-max-line-length": [2, "always", 100],
  },
};
