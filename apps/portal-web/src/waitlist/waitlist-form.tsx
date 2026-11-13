"use client";

import type { Result } from "@algohub/core";
import { Button, Input } from "@algohub/ui";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, type FormEvent } from "react";
import { joinWaitlist, looksLikeEmail, MAX_EMAIL_LENGTH, type WaitlistError } from "./client";

type State = { kind: "idle" } | { kind: "submitting" } | { kind: "done" } | { kind: "error"; error: WaitlistError };

export interface WaitlistFormProps {
  productId: string;
  productTitle: string;
  /** Injected in tests; defaults to the real API client. */
  submit?: (email: string) => Promise<Result<void, WaitlistError>>;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export function WaitlistForm({ productId, productTitle, submit }: WaitlistFormProps) {
  const t = useTranslations("waitlist");
  const [state, setState] = useState<State>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const emailId = useId();
  const errorId = useId();
  const send = submit ?? ((email: string) => joinWaitlist(API_BASE_URL, { product_id: productId, email }));

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = (inputRef.current?.value ?? "").trim();
    if (!looksLikeEmail(email)) {
      setState({ kind: "error", error: "invalid" });
      inputRef.current?.focus();
      return;
    }
    setState({ kind: "submitting" });
    const result = await send(email);
    setState(result.ok ? { kind: "done" } : { kind: "error", error: result.error });
  }

  if (state.kind === "done") {
    return (
      <p role="status" className="rounded-md border border-border bg-muted p-4 font-medium">
        {t("success", { title: productTitle })}
      </p>
    );
  }

  const error = state.kind === "error" ? state.error : null;
  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="flex max-w-md flex-col gap-3"
      aria-describedby={`${emailId}-privacy`}
    >
      <label htmlFor={emailId} className="text-sm font-medium">
        {t("emailLabel")}
      </label>
      <Input
        ref={inputRef}
        id={emailId}
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        maxLength={MAX_EMAIL_LENGTH}
        aria-invalid={error === "invalid"}
        aria-describedby={error !== null ? errorId : undefined}
      />
      <p id={errorId} role="alert" className="min-h-5 text-sm text-destructive">
        {error === null ? "" : t(`errors.${error}`)}
      </p>
      <Button type="submit" disabled={state.kind === "submitting"} aria-disabled={state.kind === "submitting"}>
        {state.kind === "submitting" ? t("submitting") : t("submit")}
      </Button>
      <p id={`${emailId}-privacy`} className="text-xs text-muted-foreground">
        {t("privacy")}
      </p>
    </form>
  );
}
