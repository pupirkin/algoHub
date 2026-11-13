import { expect, expectNoSeriousA11yViolations, test } from "./fixtures";

const WAITLIST = "**/api/v1/platform/waitlist";

test.describe("home / catalog", () => {
  test("renders the catalog with honest statuses and security headers", async ({ page, consoleErrors }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    const h = response!.headers();
    expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).not.toContain("unsafe-inline");
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");

    await expect(page.getByRole("heading", { level: 1, name: "AlgoHub" })).toBeVisible();
    const cards = page.getByTestId("catalog-list").getByRole("listitem");
    await expect(cards).toHaveCount(32);
    await expect(page.getByText("Готово к использованию: 0 из 32.")).toBeVisible();
    // Statuses come from registry.ts: P15 is in progress, everything else not started.
    await expect(page.getByTestId("catalog-list").getByText("Не начат")).toHaveCount(31);
    await expect(page.getByTestId("catalog-list").getByText("В разработке")).toHaveCount(1);
    await expectNoSeriousA11yViolations(page);
    expect(consoleErrors).toEqual([]);
  });

  test("client-side search filters, reports counts and recovers", async ({ page, consoleErrors }) => {
    await page.goto("/");
    const search = page.getByLabel("Поиск по продуктам");
    const cards = page.getByTestId("catalog-list").getByRole("listitem");

    await search.fill("смены");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("ShiftFair");
    await expect(page.getByRole("status")).toHaveText("Найден 1 продукт");

    await search.fill("голосование");
    await expect(cards.first()).toContainText("NoMoreDebate");

    await search.fill("zzzqqq");
    await expect(cards).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("Ничего не найдено");
    await expectNoSeriousA11yViolations(page);

    await page.getByRole("button", { name: "Сбросить поиск" }).click();
    await expect(cards).toHaveCount(32);
    expect(consoleErrors).toEqual([]);
  });

  test("keyboard: skip link moves focus to main content", async ({ page, isMobile, consoleErrors }) => {
    test.skip(isMobile, "keyboard navigation is checked on desktop");
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Перейти к содержимому" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeFocused();
    expect(consoleErrors).toEqual([]);
  });

  test("a card opens the product landing", async ({ page, consoleErrors }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Подробнее о NoMoreDebate" }).click();
    await expect(page).toHaveURL(/\/p\/nomoredebate$/);
    await expect(page.getByRole("heading", { level: 1, name: "NoMoreDebate" })).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });
});

test.describe("product landing /p/<slug>", () => {
  test("is honest about status and accessible", async ({ page, consoleErrors }) => {
    const response = await page.goto("/p/nomoredebate");
    expect(response?.status()).toBe(200);
    expect(response!.headers()["content-security-policy"]).toContain("connect-src 'self' http://127.0.0.1:8000");
    await expect(page.getByText("Этого продукта пока нет")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Какую задачу решает" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Как будет работать" })).toBeVisible();
    await expect(page.getByText("ranked choice, minimax regret")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    expect(consoleErrors).toEqual([]);
  });

  test("waitlist: accepted sign-up (API intercepted)", async ({ page, consoleErrors }) => {
    let sent: unknown = null;
    await page.route(WAITLIST, async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ status: "accepted" }),
      });
    });
    await page.goto("/p/nomoredebate");
    await page.getByLabel("Email").fill("user@example.com");
    await page.getByRole("button", { name: "Сообщить, когда готово" }).click();
    await expect(page.getByRole("status")).toHaveText("Готово! Напишем, когда NoMoreDebate запустится.");
    expect(sent).toEqual({ product_id: "P15", email: "user@example.com" });
    await expectNoSeriousA11yViolations(page);
    expect(consoleErrors).toEqual([]);
  });

  test("waitlist: invalid email is caught before the network", async ({ page, consoleErrors }) => {
    let calls = 0;
    await page.route(WAITLIST, async (route) => {
      calls += 1;
      await route.abort();
    });
    await page.goto("/p/shiftfair");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "Сообщить, когда готово" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("опечатка");
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
    expect(calls).toBe(0);
    await expectNoSeriousA11yViolations(page);
    expect(consoleErrors).toEqual([]);
  });

  test("waitlist: rate limit from the API is explained", async ({ page }) => {
    await page.route(WAITLIST, (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ error: { code: "rate_limited", message: "x", request_id: "r" } }),
      }),
    );
    await page.goto("/p/shiftfair");
    await page.getByLabel("Email").fill("user@example.com");
    await page.getByRole("button", { name: "Сообщить, когда готово" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Слишком много попыток");
  });

  test("unknown product and sub-paths are 404", async ({ page }) => {
    for (const path of ["/p/does-not-exist", "/p/nomoredebate/room/1"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page.getByRole("heading", { level: 1, name: "Страница не найдена" })).toBeVisible();
    }
  });
});

test.describe("waitlist without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("a pre-hydration submit cannot put the email into the URL", async ({ page }) => {
    const leaked: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("example.com") || r.url().includes("email=")) leaked.push(r.url());
    });
    await page.goto("/p/nomoredebate");
    const input = page.getByLabel("Email");
    await input.fill("user@example.com");
    await input.press("Enter");
    await page.getByRole("button", { name: "Сообщить, когда готово" }).click({ force: true });
    await page.waitForLoadState("networkidle");
    expect(leaked).toEqual([]);
    await expect(page).toHaveURL(/\/p\/nomoredebate$/);
    expect(page.url()).not.toContain("email");
    expect(page.url()).not.toContain("example.com");
  });
});
