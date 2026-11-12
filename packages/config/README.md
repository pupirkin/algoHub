# @algohub/config

Shared TypeScript presets. ESLint and Prettier are configured once at the repository root
(`eslint.config.js`, `.prettierrc.json`) so that `eslint-plugin-boundaries` sees the whole monorepo.

- `tsconfig.base.json` — strict base (no emit; packages are consumed as TS source).
- `tsconfig.library.json` — Node-side libraries and tools.
- `tsconfig.react.json` — React component packages (`@algohub/ui`, `products/*/web`).
- `tsconfig.nextjs.json` — `apps/portal-web`.
