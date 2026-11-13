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

  it("disables the button while submitting", async () => {
    let resolve: (r: Result<void, WaitlistError>) => void = () => undefined;
    const { input, button } = setup(() => new Promise((r) => (resolve = r)));
    await submitWith(input, button, "user@example.test");
    expect(button).toHaveProperty("disabled", true);
    expect(button.textContent).toBe("Отправляем…");
    await act(async () => resolve(ok(undefined)));
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("has no axe violations in the idle and error states", async () => {
    const { container, input, button } = setup(async () => err("unavailable"));
    expect((await axe.run(container)).violations).toEqual([]);
    await submitWith(input, button, "user@example.test");
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
