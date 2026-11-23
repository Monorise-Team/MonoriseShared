import { monorise } from "@monorise-team/config/eslint";

// Pliki w katalogu głównym (skrypty, konfiguracje); paczki i aplikacje mają własne eslint.config.js.
export default monorise({ ignores: ["packages/**", "apps/**"], tsconfigRootDir: import.meta.dirname });
