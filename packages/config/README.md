# @monorise-team/config

Wspólne konfiguracje repozytoriów Monorise.

| Import                                  | Co                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `@monorise-team/config/eslint`          | ESLint (flat config): `monorise({ react: true })` albo domyślny eksport bez Reacta |
| `@monorise-team/config/prettier`        | Prettier: szerokość linii 120                                                      |
| `@monorise-team/config/commitlint`      | commitlint: Conventional Commits z typami Monorise                                 |
| `@monorise-team/config/tsconfig/*.json` | TypeScript: `base`, `library`, `react-library`, `vite-app`                         |

```js
// eslint.config.js
import { monorise } from "@monorise-team/config/eslint";
export default monorise({ react: true });
```
