// @vitest-environment jsdom
import { err, ok, type Result } from "@algohub/core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/ru.json";
import type { WaitlistError } from "./client";
import { WaitlistForm } from "./waitlist-form";

afterEach(cleanup);

function setup(submit: (email: string) => Promise<Result<void, WaitlistError>>) {
  const utils = render(
    <NextIntlClientProvider locale="ru" messages={messages}>
      <WaitlistForm productId="P15" productTitle="NoMoreDebate" submit={submit} />
    </NextIntlClientProvider>,
  );
  const input = screen.getByLabelText("Email");
  const button = screen.getByRole("button", { name: "Сообщить, когда готово" });
  return { ...utils, input, button };
}

async function submitWith(input: HTMLElement, button: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
  await act(async () => {
    fireEvent.click(button);
  });
}

describe("WaitlistForm", () => {
  it("shows success after an accepted submission", async () => {
    const submit = vi.fn(async () => ok(undefined));
    const { input, button } = setup(submit);
    await submitWith(input, button, "  user@example.test ");
    expect(submit).toHaveBeenCalledWith("user@example.test");
    expect(screen.getByRole("status").textContent).toContain("NoMoreDebate");
  });

  it("validates locally and does not call the API for a malformed email", async () => {
    const submit = vi.fn(async () => ok(undefined));
    const { input, button } = setup(submit);
    await submitWith(input, button, "not-an-email");
    expect(submit).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toMatch(/опечатка/);
  });

  it.each([
    ["rateLimited", /Слишком много попыток/],
    ["unavailable", /временно недоступен/],
    ["invalid", /опечатка/],
  ] as const)("renders the %s error from the API", async (error, text) => {
    const { input, button } = setup(async () => err(error));
    await submitWith(input, button, "user@example.test");
    expect(screen.getByRole("alert").textContent).toMatch(text);
  });

  it("marks the button busy while submitting, ignores double submits, then focuses the result", async () => {
    let resolve: (r: Result<void, WaitlistError>) => void = () => undefined;
    const submit = vi.fn(() => new Promise<Result<void, WaitlistError>>((r) => (resolve = r)));
    const { input, button } = setup(submit);
    await submitWith(input, button, "user@example.test");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.textContent).toBe("Отправляем…");
    await act(async () => {
      fireEvent.click(button);
    });
    expect(submit).toHaveBeenCalledTimes(1);
    await act(async () => resolve(ok(undefined)));
    expect(document.activeElement).toBe(screen.getByRole("status"));
  });

  it("returns focus to the input after an error and re-announces a repeated error", async () => {
    const { input, button } = setup(async () => err("unavailable"));
    await submitWith(input, button, "user@example.test");
    const first = screen.getByRole("alert");
    expect(document.activeElement).toBe(input);
    await submitWith(input, button, "user@example.test");
    expect(screen.getByRole("alert")).not.toBe(first);
  });

  it("the email input has no name, so a pre-JS native submit cannot leak it into the URL", () => {
    const { input } = setup(async () => ok(undefined));
    expect(input.hasAttribute("name")).toBe(false);
  });

  it("has no axe violations in the idle and error states", async () => {
    const { container, input, button } = setup(async () => err("unavailable"));
    expect((await axe.run(container)).violations).toEqual([]);
    await submitWith(input, button, "user@example.test");
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
