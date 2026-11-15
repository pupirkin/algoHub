import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Browser, BrowserContext, Page, TestInfo } from "@playwright/test";
import { expect, expectNoSeriousA11yViolations, test } from "../e2e/fixtures";

/**
 * P15 NoMoreDebate happy path (ARCHITECTURE_PLAN §7 acceptance), driven by `ui.steps` of the golden scenarios:
 * organizer creates a room -> each voter opens the share link in their OWN browser context, joins and ranks ->
 * organizer sees who voted and closes -> the explained result matches the scenario. axe on every screen.
 */
interface Scenario {
  name: string;
  input: { question: string; options: string[]; method: string; voters?: string[]; ballots: number[][] };
  expected: {
    outcome: "winner" | "tie" | "no_ballots";
    winner: string | null;
    tied: string[];
    explain_codes: string[];
  };
  ui?: { steps: string[] };
}

const DIR = fileURLToPath(new URL("../../../products/p15-nomoredebate/scenarios/", import.meta.url));
const SCENARIOS: Scenario[] = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(DIR + f, "utf8")) as Scenario)
  .filter((s) => s.ui !== undefined);

const METHOD_LABEL: Record<string, string> = {
  condorcet_borda: "Кондорсе, затем Борда",
  borda: "Борда (баллы за места)",
  irv: "Как на выборах (выбывание)",
  minimax_regret: "Никому не обидно (минимакс сожаления)",
};

/** Every screen has a document title (after client navigation Next sets it asynchronously), then axe. */
async function checkA11y(page: Page) {
  await expect(page).toHaveTitle(/NoMoreDebate/);
  await expectNoSeriousA11yViolations(page);
}

function expectedHeading(sc: Scenario): string {
  if (sc.expected.outcome === "winner") return `Победил вариант «${sc.expected.winner}»`;
  if (sc.expected.outcome === "tie") return `Ничья: ${sc.expected.tied.map((l) => `«${l}»`).join(", ")}`;
  return "Никто не проголосовал — победителя нет.";
}

async function newVoterContext(browser: Browser, info: TestInfo): Promise<BrowserContext> {
  const u = info.project.use;
  return browser.newContext({
    ...(u.viewport ? { viewport: u.viewport } : {}),
    ...(u.isMobile !== undefined ? { isMobile: u.isMobile } : {}),
    ...(u.hasTouch !== undefined ? { hasTouch: u.hasTouch } : {}),
    locale: "ru-RU",
    ...(u.baseURL ? { baseURL: u.baseURL } : {}),
  });
}

function trackErrors(page: Page, sink: string[]) {
  page.on("console", (m) => {
    if (m.type() === "error") sink.push(m.text());
  });
  page.on("pageerror", (e) => sink.push(e.message));
}

/** Reorders the ranking list with the ↑ buttons (the keyboard/touch path) until it equals `labels`. */
async function rank(page: Page, labels: string[]) {
  const rows = page.getByRole("list").first().getByRole("listitem");
  for (let target = 0; target < labels.length; target++) {
    const label = labels[target]!;
    const current = await rows.evaluateAll((els) => els.map((el) => el.querySelector("span.font-medium")?.textContent));
    for (let i = current.indexOf(label); i > target; i--) {
      await page.getByRole("button", { name: `Поднять «${label}»` }).click();
    }
  }
  await expect(rows.locator("span.font-medium")).toHaveText(labels);
}

for (const sc of SCENARIOS) {
  test(`P15 happy path: ${sc.name}`, async ({ page, browser, consoleErrors }, info) => {
    const voters = sc.input.voters ?? sc.input.ballots.map((_, i) => `Voter ${i + 1}`);
    const voterErrors: string[] = [];
    let shareUrl = "";
    let organizerUrl = "";
    let checkedA11y = false;

    for (const step of sc.ui!.steps) {
      const [kind, name] = step.split(":");
      if (kind === "create_room") {
        await page.goto("/p/nomoredebate");
        await expect(page.getByRole("heading", { name: "Новое голосование" })).toBeVisible();
        await expect(page.getByRole("note")).toContainText("Предварительная версия");
        await checkA11y(page);
        await page.getByLabel("Вопрос").fill(sc.input.question);
        for (const [i, label] of sc.input.options.entries()) {
          if (i >= 2) await page.getByRole("button", { name: "Добавить вариант" }).click();
          await page.getByLabel(`Вариант ${i + 1}`, { exact: true }).fill(label);
        }
        await page.getByLabel(METHOD_LABEL[sc.input.method]!).check();
        await page.getByRole("button", { name: "Создать комнату" }).click();
        await expect(page).toHaveURL(/\/p\/nomoredebate\/r\/[0-9a-f-]{36}\/admin#t=[A-Za-z0-9_-]{16,}$/);
        await expect(page.getByRole("heading", { name: sc.input.question })).toBeVisible();
        await checkA11y(page);
        organizerUrl = page.url();
        shareUrl = await page.getByLabel("Ссылка для участников").inputValue();
        expect(shareUrl).not.toContain("#t=");
      } else if (kind === "join" || kind === "vote") {
        // join:<name> and vote:<name> run in that voter's own context (separate storage = separate person).
        if (kind === "vote") continue; // handled together with join below
        const voterIndex = voters.indexOf(name!);
        const ctx = await newVoterContext(browser, info);
        const voter = await ctx.newPage();
        trackErrors(voter, voterErrors);
        await voter.goto(shareUrl);
        await voter.getByLabel("Ваше имя").fill(name!);
        await voter.getByRole("button", { name: "Войти в комнату" }).click();
        await expect(voter.getByRole("heading", { name: "Расставьте варианты по порядку" })).toBeVisible();
        if (sc.ui!.steps.includes(`vote:${name}`)) {
          const ballot = sc.input.ballots[voterIndex]!;
          await rank(
            voter,
            ballot.map((o) => sc.input.options[o]!),
          );
          if (!checkedA11y) {
            await checkA11y(voter);
            checkedA11y = true;
          }
          await voter.getByRole("button", { name: "Отправить голос" }).click();
          await expect(voter.getByText("Голос сохранён.", { exact: false })).toBeVisible();
        }
        await ctx.close();
      } else if (kind === "close") {
        await page.goto(organizerUrl);
        for (const v of voters.filter((v) => sc.ui!.steps.includes(`vote:${v}`))) {
          await expect(page.getByRole("listitem").filter({ hasText: v })).toContainText("проголосовал(а)", {
            timeout: 10_000,
          });
        }
        await page.getByRole("button", { name: "Закрыть голосование" }).click();
        await page.getByRole("button", { name: "Да, закрыть" }).click();
        await expect(page).toHaveURL(/\/result$/);
      } else if (kind === "assert_result") {
        await expect(page.getByRole("heading", { name: expectedHeading(sc) })).toBeVisible();
        await expect(page.getByRole("heading", { level: 2, name: "Почему" })).toBeVisible();
        await expect(
          page.getByRole("heading", { name: "Почему" }).locator("xpath=following-sibling::ul/li"),
        ).toHaveCount(sc.expected.explain_codes.length);
        await checkA11y(page);
      } else {
        throw new Error(`unknown ui step ${step} in ${sc.name}`);
      }
    }

    // Negative path: after closing, the share link no longer accepts votes and points to the result.
    const late = await newVoterContext(browser, info);
    const latePage = await late.newPage();
    trackErrors(latePage, voterErrors);
    await latePage.goto(shareUrl);
    await expect(latePage.getByText("Голосование закрыто — смотрите результат.")).toBeVisible();
    await expect(latePage.getByRole("link", { name: "Открыть результат" })).toBeVisible();
    await late.close();
    expect(voterErrors, "console errors in voter pages").toEqual([]);
    void consoleErrors; // the fixture asserts the organizer page
  });
}

test("P15 organizer page without the organizer link reveals nothing", async ({ browser, page }, info) => {
  await page.goto("/p/nomoredebate");
  await page.getByLabel("Вопрос").fill("Куда идём?");
  await page.getByLabel("Вариант 1", { exact: true }).fill("Кино");
  await page.getByLabel("Вариант 2", { exact: true }).fill("Парк");
  await page.getByRole("button", { name: "Создать комнату" }).click();
  await expect(page).toHaveURL(/\/admin#t=/);
  const adminWithoutToken = page.url().replace(/#.*$/, "");
  const ctx = await newVoterContext(browser, info);
  const stranger = await ctx.newPage();
  await stranger.goto(adminWithoutToken);
  await expect(stranger.getByRole("alert").filter({ hasText: "Это страница организатора" })).toBeVisible();
  await expect(stranger.getByRole("button", { name: "Закрыть голосование" })).toHaveCount(0);
  await ctx.close();
});

test("P15 unknown sub-page is a 404", async ({ page }) => {
  const res = await page.goto("/p/nomoredebate/r/not-a-room");
  expect(res?.status()).toBe(404);
});
