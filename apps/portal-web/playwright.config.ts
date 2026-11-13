import { defineConfig, devices } from "@playwright/test";

/**
 * Portal smoke (TESTING_STRATEGY §5): production build served by `next start`, desktop + mobile (375×812).
 * The API is not started: tests that submit the waitlist intercept the request (`page.route`) and say so.
 * Product happy paths against docker compose arrive with the first product (P15, Phase 2).
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
// Optional: run against an installed browser instead of Playwright's Chromium (e.g. E2E_BROWSER_CHANNEL=chrome
// when the Chromium download is unavailable). CI always uses the bundled Chromium.
const channel = process.env.E2E_BROWSER_CHANNEL || undefined;
export const API_BASE_URL = "http://127.0.0.1:8000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
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
  webServer: {
    command: `pnpm exec next build && pnpm exec next start --hostname 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { NEXT_PUBLIC_API_BASE_URL: API_BASE_URL, NEXT_TELEMETRY_DISABLED: "1" },
  },
});
