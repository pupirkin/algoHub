"use client";

import type { Result } from "@algohub/core";
import { Button, Input } from "@algohub/ui";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { apiBaseUrl } from "../config/public";
import { joinWaitlist, looksLikeEmail, MAX_EMAIL_LENGTH, type WaitlistError } from "./client";

type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "done" }
  | { kind: "error"; error: WaitlistError; attempt: number };

export interface WaitlistFormProps {
  productId: string;
  productTitle: string;
  /** Injected in tests; defaults to the real API client. */
  submit?: (email: string) => Promise<Result<void, WaitlistError>>;
}

/**
 * Privacy: the input has no `name` and the button stays disabled until hydration, so a native (pre-JS)
 * submission can never put the address into a URL, browser history or access logs.
 */
export function WaitlistForm({ productId, productTitle, submit }: WaitlistFormProps) {
  const t = useTranslations("waitlist");
  const [state, setState] = useState<State>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLParagraphElement>(null);
  const attempts = useRef(0);
  const emailId = useId();
  const errorId = useId();
  const privacyId = useId();
  const hydrated = useHydrated();
  const send = submit ?? ((email: string) => joinWaitlist(apiBaseUrl(), { product_id: productId, email }));

  useEffect(() => {
    if (state.kind === "done") successRef.current?.focus();
    if (state.kind === "error") inputRef.current?.focus();
  }, [state]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state.kind === "submitting") return;
    attempts.current += 1;
    const email = (inputRef.current?.value ?? "").trim();
    if (!looksLikeEmail(email)) {
      setState({ kind: "error", error: "invalid", attempt: attempts.current });
      return;
    }
    setState({ kind: "submitting" });
    const result = await send(email);
    setState(result.ok ? { kind: "done" } : { kind: "error", error: result.error, attempt: attempts.current });
  }

  if (state.kind === "done") {
    return (
      <p
        ref={successRef}
        role="status"
        tabIndex={-1}
        className="rounded-md border border-border bg-muted p-4 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("success", { title: productTitle })}
      </p>
    );
  }

  const error = state.kind === "error" ? state : null;
  const busy = state.kind === "submitting";
  return (
    <form noValidate onSubmit={onSubmit} className="flex max-w-md flex-col gap-3" aria-describedby={privacyId}>
      <label htmlFor={emailId} className="text-sm font-medium">
        {t("emailLabel")}
      </label>
      <Input
        ref={inputRef}
        id={emailId}
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        maxLength={MAX_EMAIL_LENGTH}
        aria-invalid={error?.error === "invalid"}
        aria-describedby={error !== null ? errorId : undefined}
      />
      {/* Keyed by attempt: a repeated identical error is re-mounted and announced again. */}
      <p key={error?.attempt ?? 0} id={errorId} role="alert" className="min-h-5 text-sm text-destructive">
        {error === null ? "" : t(`errors.${error.error}`)}
      </p>
      <Button type="submit" disabled={!hydrated} aria-disabled={busy}>
        {busy ? t("submitting") : t("submit")}
      </Button>
      <p id={privacyId} className="text-xs text-muted-foreground">
        {t("privacy")}
      </p>
    </form>
  );
}

const noopSubscribe = () => () => undefined;

/** false during SSR and hydration, true once React owns the form (no setState-in-effect). */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
