"use client";

import { Button, Input } from "@algohub/ui";
import { useT } from "../i18n";
import { useId, useRef, useState, type FormEvent } from "react";
import type { Method } from "../api";
import { useP15 } from "../context";
import { storage } from "../storage";

export const METHODS: readonly Method[] = ["condorcet_borda", "borda", "irv", "minimax_regret"];
const DEADLINES = [null, 30, 60, 1440, 4320] as const;
const MAX_PARTICIPANTS = [5, 10, 20, 30, 50] as const;
export const MAX_OPTIONS = 10;

type FormError = "question" | "options" | "invalid" | "rateLimited" | "unavailable";

const fold = (s: string) => s.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();

/** Mirrors the API rules so most mistakes are caught before a round trip (the API stays authoritative). */
export function validateDraft(question: string, options: readonly string[]): "question" | "options" | null {
  const q = question.trim();
  if (q.length === 0 || q.length > 200) return "question";
  const labels = options.map((o) => o.trim()).filter((o) => o.length > 0);
  if (labels.length < 2 || labels.length > MAX_OPTIONS || labels.some((o) => o.length > 80)) return "options";
  if (new Set(labels.map(fold)).size !== labels.length) return "options";
  return null;
}

export function CreateRoom() {
  const t = useT("create");
  const tm = useT("method");
  const th = useT("methodHelp");
  const tc = useT("common");
  const { api, navigate } = useP15();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [method, setMethod] = useState<Method>("condorcet_borda");
  const [deadline, setDeadline] = useState<(typeof DEADLINES)[number]>(null);
  const [maxParticipants, setMaxParticipants] = useState<number>(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ key: FormError; attempt: number } | null>(null);
  const attempts = useRef(0);
  const optionRefs = useRef<(HTMLInputElement | null)[]>([]);
  const ids = { question: useId(), error: useId(), deadline: useId(), method: useId(), max: useId() };

  function updateOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, j) => (j === i ? value : o)));
  }

  function addOption() {
    setOptions((prev) => [...prev, ""]);
    requestAnimationFrame(() => optionRefs.current[options.length]?.focus());
  }

  function removeOption(i: number) {
    setOptions((prev) => prev.filter((_, j) => j !== i));
    requestAnimationFrame(() => optionRefs.current[Math.max(0, i - 1)]?.focus());
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    attempts.current += 1;
    const invalid = validateDraft(question, options);
    if (invalid !== null) {
      setError({ key: invalid, attempt: attempts.current });
      return;
    }
    setBusy(true);
    setError(null);
    const res = await api.createRoom({
      question: question.trim(),
      options: options.map((o) => o.trim()).filter((o) => o.length > 0),
      method,
      deadline_minutes: deadline,
      max_participants: maxParticipants,
    });
    if (res.ok) {
      const { room, organizer_token: token, organizer_path: organizerPath } = res.value;
      storage.setOrganizerToken(room.id, token);
      navigate(`${organizerPath}#t=${token}`);
      return;
    }
    setBusy(false);
    const f = res.error;
    const key: FormError =
      f.kind === "http" && f.status === 422
        ? "invalid"
        : f.kind === "http" && f.status === 429
          ? "rateLimited"
          : "unavailable";
    setError({ key, attempt: attempts.current });
  }

  const errorText =
    error === null
      ? ""
      : error.key === "rateLimited" || error.key === "unavailable"
        ? tc(error.key)
        : t(`errors.${error.key}`);

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-bold tracking-tight">{t("heading")}</h1>
      <p className="mt-2 text-muted-foreground">{t("intro")}</p>
      <form noValidate onSubmit={onSubmit} className="mt-6 flex flex-col gap-6" aria-describedby={ids.error}>
        <div className="flex flex-col gap-2">
          <label htmlFor={ids.question} className="text-sm font-medium">
            {t("question")}
          </label>
          <Input
            id={ids.question}
            value={question}
            maxLength={200}
            placeholder={t("questionPlaceholder")}
            aria-invalid={error?.key === "question"}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{t("options")}</legend>
          {options.map((value, i) => (
            <div key={i} className="flex gap-2">
              <Input
                ref={(el) => {
                  optionRefs.current[i] = el;
                }}
                aria-label={t("optionLabel", { n: i + 1 })}
                value={value}
                maxLength={80}
                aria-invalid={error?.key === "options"}
                onChange={(e) => updateOption(i, e.target.value)}
              />
              {options.length > 2 ? (
                <Button variant="ghost" aria-label={t("removeOption", { n: i + 1 })} onClick={() => removeOption(i)}>
                  <span aria-hidden="true">✕</span>
                </Button>
              ) : null}
            </div>
          ))}
          {options.length < MAX_OPTIONS ? (
            <Button variant="outline" className="self-start" onClick={addOption}>
              {t("addOption")}
            </Button>
          ) : null}
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium">{t("methodLegend")}</legend>
          {METHODS.map((m) => (
            <div key={m} className="flex gap-3 rounded-md border border-border p-3">
              <input
                id={`${ids.method}-${m}`}
                type="radio"
                name="p15-method"
                value={m}
                checked={method === m}
                aria-describedby={`${ids.method}-${m}-help`}
                onChange={() => setMethod(m)}
                className="mt-1"
              />
              <div>
                <label htmlFor={`${ids.method}-${m}`} className="cursor-pointer font-medium">
                  {tm(m)}
                </label>
                <p id={`${ids.method}-${m}-help`} className="text-sm text-muted-foreground">
                  {th(m)}
                </p>
              </div>
            </div>
          ))}
        </fieldset>

        <div className="flex flex-col gap-2">
          <label htmlFor={ids.deadline} className="text-sm font-medium">
            {t("deadline")}
          </label>
          <select
            id={ids.deadline}
            value={deadline ?? ""}
            onChange={(e) => setDeadline(e.target.value === "" ? null : (Number(e.target.value) as 30))}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          >
            {DEADLINES.map((d) => (
              <option key={d ?? "none"} value={d ?? ""}>
                {d === null ? t("deadlineNone") : t(`deadline${d}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={ids.max} className="text-sm font-medium">
            {t("maxParticipants")}
          </label>
          <select
            id={ids.max}
            value={maxParticipants}
            onChange={(e) => setMaxParticipants(Number(e.target.value))}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          >
            {MAX_PARTICIPANTS.map((n) => (
              <option key={n} value={n}>
                {t("upTo", { n })}
              </option>
            ))}
          </select>
        </div>

        <p key={error?.attempt ?? 0} id={ids.error} role="alert" className="min-h-5 text-sm text-destructive">
          {errorText}
        </p>
        <Button type="submit" size="lg" aria-disabled={busy}>
          {busy ? t("submitting") : t("submit")}
        </Button>
      </form>
    </div>
  );
}
