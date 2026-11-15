import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig keeps `jsx: preserve` for Next; tests need the automatic runtime.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "app/**/*.test.{ts,tsx}"],
    // Component tests opt into jsdom with a `// @vitest-environment jsdom` pragma.
    environment: "node",
  },
});
