import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, cn, Input, PageShell } from "./index";

afterEach(cleanup);

async function axeViolations(container: HTMLElement) {
  const result = await axe.run(container, {
    resultTypes: ["violations"],
    // jsdom has no layout engine: color-contrast cannot be computed here (checked in Playwright later).
    rules: { "color-contrast": { enabled: false } },
  });
  return result.violations.map((v) => `${v.id}: ${v.help}`);
}

describe("@algohub/ui", () => {
  it("cn resolves tailwind conflicts", () => {
    expect(cn("px-2", false, "px-4")).toBe("px-4");
  });

  it("Button defaults to type=button and supports asChild", () => {
    render(
      <>
        <Button>Создать</Button>
        <Button asChild variant="outline">
          <a href="/catalog">Каталог</a>
        </Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Создать" })).toHaveProperty("type", "button");
    expect(screen.getByRole("link", { name: "Каталог" }).className).toContain("border");
  });

  it("kitchen sink page has no axe violations", async () => {
    const { container } = render(
      <PageShell header={<span>AlgoHub</span>} footer={<span>footer</span>} skipLinkLabel="К содержимому">
        <h1>Заголовок</h1>
        <Card>
          <CardHeader>
            <CardTitle>Карточка</CardTitle>
          </CardHeader>
          <CardContent>
            <label htmlFor="name">Имя</label>
            <Input id="name" placeholder="Аня" />
            <Badge variant="warning">DEMO</Badge>
            <Button>Отправить</Button>
          </CardContent>
        </Card>
      </PageShell>,
    );
    expect(await axeViolations(container)).toEqual([]);
    expect(screen.getByRole("main")).toBeDefined();
    expect(screen.getByRole("link", { name: "К содержимому" }).getAttribute("href")).toBe("#main");
  });

  it("axe catches an unlabeled input (guards the test itself)", async () => {
    const { container } = render(
      <main>
        <Input />
      </main>,
    );
    expect((await axeViolations(container)).some((v) => v.startsWith("label"))).toBe(true);
  });
});
