// Single ESLint flat config for the whole TS monorepo, so eslint-plugin-boundaries sees every element.
import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import prettier from "eslint-config-prettier";
import boundaries from "eslint-plugin-boundaries";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const rootPath = import.meta.dirname;

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/next-env.d.ts",
      ".venv/**",
      "**/playwright-report/**",
      "**/playwright-report-products/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.tsx"],
    plugins: { "jsx-a11y": jsxA11y, "react-hooks": reactHooks },
    rules: {
      ...jsxA11y.flatConfigs.strict.rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: ["apps/portal-web/**/*.{ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    settings: { next: { rootDir: "apps/portal-web" } },
    rules: { ...nextPlugin.configs.recommended.rules, ...nextPlugin.configs["core-web-vitals"].rules },
  },
  {
    // Shared packages are isomorphic and must never read env (ARCHITECTURE_PLAN §5).
    files: ["packages/ui/**/*.{ts,tsx}", "packages/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message: "Shared packages must not read process.env.",
        },
      ],
    },
  },
  {
    // Client modules ("use client") must not read server env: only NEXT_PUBLIC_* reaches the bundle.
    // Server Components / Route Handlers may read server env.
    files: ["apps/portal-web/**/*.{ts,tsx}", "products/*/web/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Program:has(> ExpressionStatement[directive='use client']) MemberExpression[object.type='MemberExpression'][object.object.name='process'][object.property.name='env'][computed=false][property.name!=/^NEXT_PUBLIC_/]",
          message: "Only NEXT_PUBLIC_* env vars may be read in client modules.",
        },
        {
          selector:
            "Program:has(> ExpressionStatement[directive='use client']) MemberExpression[object.type='MemberExpression'][object.object.name='process'][object.property.name='env'][computed=true]",
          message: "Computed process.env access is not allowed in client modules; use process.env.NEXT_PUBLIC_X.",
        },
        {
          selector:
            "Program:has(> ExpressionStatement[directive='use client']) VariableDeclarator[init.type='MemberExpression'][init.object.name='process'][init.property.name='env']",
          message: "Destructuring process.env is not allowed in client modules.",
        },
      ],
    },
  },
  {
    // Architectural boundaries (ARCHITECTURE_PLAN §4). Never disable — fix the design instead.
    files: ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}", "products/**/*.{ts,tsx}", "tools/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/root-path": rootPath,
      "boundaries/include": ["apps/**/*", "packages/**/*", "products/**/*", "tools/**/*"],
      "boundaries/elements": [
        { type: "app", pattern: "apps/*", capture: ["app"] },
        { type: "product", pattern: "products/*/web", capture: ["product"] },
        { type: "package", pattern: "packages/*", capture: ["pkg"] },
        { type: "tool", pattern: "tools/*", capture: ["tool"] },
      ],
      // The portal reaches products ONLY through its registry (dynamic import), never from pages/components.
      "boundaries/files": [{ pattern: "apps/portal-web/src/registry.ts", category: "product-registry" }],
      "import/resolver": {
        typescript: {
          noWarnOnMultipleProjects: true,
          project: [
            "apps/*/tsconfig.json",
            "packages/*/tsconfig.json",
            "products/*/web/tsconfig.json",
            "tools/*/tsconfig.json",
          ],
        },
      },
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            // Packages are product-agnostic: they may only use other packages.
            { from: { element: { type: "package" } }, allow: { to: { element: { type: "package" } } } },
            // A product may use shared packages, never another product or the portal.
            { from: { element: { type: "product" } }, allow: { to: { element: { type: "package" } } } },
            // The portal uses packages; products only via src/registry.ts (dynamic import, Phase 1).
            { from: { element: { type: "app" } }, allow: { to: { element: { type: "package" } } } },
            { from: { file: { categories: "product-registry" } }, allow: { to: { element: { type: "product" } } } },
            // Tools may read the portal registry and packages.
            { from: { element: { type: "tool" } }, allow: { to: { element: { types: ["package", "app"] } } } },
          ],
        },
      ],
    },
  },
  prettier,
);
