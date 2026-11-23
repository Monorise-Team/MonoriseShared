import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Wspólna konfiguracja ESLint (flat config) repozytoriów Monorise.
 *
 * @param {{ react?: boolean, ignores?: string[], tsconfigRootDir?: string }} [options]
 *   react: reguły hooków Reacta; ignores: dodatkowe ścieżki do pominięcia;
 *   tsconfigRootDir: katalog pliku konfiguracji (`import.meta.dirname`), wymagany, gdy ESLint działa
 *   na plikach kilku paczek naraz (np. w hooku przed commitem)
 */
export function monorise({ react = false, ignores = [], tsconfigRootDir } = {}) {
  const hooks = reactHooks.configs.flat?.recommended ?? reactHooks.configs["recommended-latest"];
  return defineConfig(
    {
      ignores: [
        "**/dist/**",
        "**/.next/**",
        "**/out/**",
        "**/node_modules/**",
        "**/.turbo/**",
        "**/coverage/**",
        "**/next-env.d.ts",
        ...ignores,
      ],
    },
    js.configs.recommended,
    tseslint.configs.recommended,
    {
      languageOptions: {
        globals: { ...globals.browser, ...globals.node },
        ...(tsconfigRootDir ? { parserOptions: { tsconfigRootDir } } : {}),
      },
      rules: {
        "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
        "@typescript-eslint/consistent-type-imports": "error",
        eqeqeq: ["error", "smart"],
      },
    },
    react ? [hooks] : [],
  );
}

export default monorise();
