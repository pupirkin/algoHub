import { defineConfig, devices } from "@playwright/test";

/**
 * Product happy paths (TESTING_STRATEGY §5) against an already running stack — no webServer here:
 * - `just e2e P15`: docker compose (infra/compose/compose.ci.yml) on :3000/:8000 — the MVP_READY gate;
 * - `just e2e-preview P15`: native preview (in-memory API, no Postgres) — a local smoke, NOT the gate.
 * Scenarios come from products/<id>/scenarios/*.json (`ui.steps`).
 */
const channel = process.env.E2E_BROWSER_CHANNEL || undefined;

export default defineConfig({
  testDir: "./e2e-products",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report-products" }]]
    : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    ...(channel ? { channel } : {}),
    locale: "ru-RU",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
    },
  ],
});
