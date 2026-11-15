import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * TESTING_STRATEGY §6: the browser bundle must not contain server env names or values. Runs after the
 * production build that webServer performs. Values come from .env.example (placeholders) and CI.
 */
const STATIC_DIR = fileURLToPath(new URL("../.next/static", import.meta.url));
const FORBIDDEN = [
  "ALGOHUB_DATABASE_URL",
  "ALGOHUB_TEST_DATABASE_URL",
  "POSTGRES_PASSWORD",
  "postgresql+psycopg",
  "local-dev-only-change-me",
  "ci-only-not-a-secret",
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

test("client bundle contains no server env names or values", ({ isMobile }) => {
  test.skip(isMobile, "bundle is the same for every viewport");
  const js = files(STATIC_DIR).filter((f) => f.endsWith(".js"));
  expect(js.length).toBeGreaterThan(0);
  const leaks = js.flatMap((f) => {
    const text = readFileSync(f, "utf8");
    return FORBIDDEN.filter((needle) => text.includes(needle)).map((needle) => `${needle} in ${f}`);
  });
  expect(leaks).toEqual([]);
});
