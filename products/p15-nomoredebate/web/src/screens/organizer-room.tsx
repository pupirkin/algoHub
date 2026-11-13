"use client";

import { Button, Input } from "@algohub/ui";
import { useFormatter } from "next-intl";
import { useT } from "../i18n";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { ok } from "@algohub/core";
import { Failure, Loading } from "../components/states";
import { useP15 } from "../context";
import { paths } from "../routes";
import { storage, subscribeStorage, tokenFromFragment } from "../storage";
import { usePolled } from "../use-polled";
import { RoomHeader } from "./participant-room";

type Confirm = "none" | "close" | "delete";
type ActionError = "rateLimited" | "unavailable" | null;

export function OrganizerRoom({ roomId }: { roomId: string }) {
  const t = useT("organizer");
  const tc = useT("common");
  const format = useFormatter();
  const { api, navigate, origin, pollMs } = useP15();
  const token = useSyncExternalStore(
    subscribeStorage,
    () => storage.organizerToken(roomId),
    () => null,
  );
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  // The organizer link carries the token in its fragment (#t=…): remember it in this browser.
  useEffect(() => {
    const fromLink = tokenFromFragment(window.location.hash);
    if (fromLink !== null && fromLink !== storage.organizerToken(roomId)) storage.setOrganizerToken(roomId, fromLink);
  }, [roomId]);

  const [live, setLive] = useState(true);
  const loadRoom = useCallback(() => api.getRoom(roomId), [api, roomId]);
  const loadPeople = useCallback(
    () => (token === null ? Promise.resolve(ok([])) : api.participants(roomId, token)),
    [api, roomId, token],
  );
  const room = usePolled(loadRoom, pollMs, live);
  const people = usePolled(loadPeople, pollMs, live && token !== null);
  const [confirm, setConfirm] = useState<Confirm>("none");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<ActionError>(null);
  const [deleted, setDeleted] = useState(false);
  const [copied, setCopied] = useState<"idle" | "ok" | "failed">("idle");
  const shareId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirm !== "none") confirmRef.current?.focus(); // move focus into the inline confirmation
  }, [confirm]);

  const status = room.state.kind === "ready" ? room.state.value.status : null;
  useEffect(() => {
    if (status === "closed" && live) queueMicrotask(() => setLive(false));
  }, [status, live]);

  if (deleted) {
    return (
      <div role="status" className="flex flex-col items-start gap-3">
        <p>{t("deleted")}</p>
        <Link href={paths.create()} className="underline underline-offset-4">
          {tc("toCreate")}
        </Link>
      </div>
    );
  }
  if (!hydrated || room.state.kind === "loading") return <Loading />;
  if (room.state.kind === "failed") return <Failure failure={room.state.failure} onRetry={() => void room.reload()} />;
  if (token === null) {
    return (
      <p role="alert" className="max-w-xl rounded-md border border-border bg-muted p-4">
        {t("noToken")}
      </p>
    );
  }
  const r = room.state.value;
  const shareUrl = `${origin()}${paths.room(roomId)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
  }

  async function act(kind: "close" | "delete") {
    if (token === null || busy) return;
    setBusy(true);
    setActionError(null);
    const res = kind === "close" ? await api.close(roomId, token) : await api.deleteRoom(roomId, token);
    setBusy(false);
    setConfirm("none");
    if (res.ok) {
      if (kind === "close") navigate(paths.result(roomId));
      else {
        storage.setOrganizerToken(roomId, null);
        setDeleted(true);
      }
      return;
    }
    setActionError(res.error.kind === "http" && res.error.status === 429 ? "rateLimited" : "unavailable");
  }

  return (
    <div className="max-w-xl">
      <p className="mb-2 text-sm font-medium text-muted-foreground">{t("heading")}</p>
      <RoomHeader room={r} />
      {r.deadline_at !== null && r.status === "open" ? (
        <p className="-mt-4 mb-6 text-sm text-muted-foreground">
          {tc("deadline", {
            time: format.dateTime(new Date(r.deadline_at), { dateStyle: "medium", timeStyle: "short" }),
          })}
        </p>
      ) : null}

      <section className="flex flex-col gap-2">
        <label htmlFor={shareId} className="text-sm font-medium">
          {t("shareLabel")}
        </label>
        <div className="flex gap-2">
          <Input id={shareId} readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} />
          <Button variant="outline" onClick={() => void copy()}>
            {t("copy")}
          </Button>
        </div>
        <p role="status" className="min-h-5 text-sm">
          {copied === "ok" ? t("copied") : copied === "failed" ? t("copyFailed") : ""}
        </p>
        <p className="text-sm text-muted-foreground">{t("keepLink")}</p>
      </section>

      <section aria-labelledby="p15-people" className="mt-6">
        <h2 id="p15-people" className="text-xl font-semibold">
          {t("participants")}
        </h2>
        {people.state.kind === "loading" ? (
          <Loading />
        ) : people.state.kind === "failed" ? (
          <Failure failure={people.state.failure} onRetry={() => void people.reload()} />
        ) : people.state.value.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("noParticipants")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {people.state.value.map((p) => (
              <li key={`${p.display_name}-${p.joined_at}`} className="flex items-center justify-between gap-3 p-2">
                <span className="min-w-0 break-words">{p.display_name}</span>
                <span className={p.has_voted ? "text-sm font-medium" : "text-sm text-muted-foreground"}>
                  {p.has_voted ? `✓ ${t("voted")}` : t("notVoted")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={t("close")} className="mt-8 flex flex-col items-start gap-3">
        {r.status === "closed" ? (
          <Button asChild>
            <Link href={paths.result(roomId)}>{t("toResult")}</Link>
          </Button>
        ) : confirm === "close" ? (
          <div role="group" aria-label={t("closeConfirm")} className="flex flex-col gap-2">
            <p>{t("closeConfirm")}</p>
            <div className="flex gap-2">
              <Button ref={confirmRef} onClick={() => void act("close")} aria-disabled={busy}>
                {busy ? t("closing") : t("confirmYes")}
              </Button>
              <Button variant="outline" onClick={() => setConfirm("none")}>
                {t("confirmNo")}
              </Button>
            </div>
          </div>
        ) : (
          <Button size="lg" onClick={() => setConfirm("close")}>
            {t("close")}
          </Button>
        )}

        {confirm === "delete" ? (
          <div role="group" aria-label={t("deleteConfirm")} className="flex flex-col gap-2">
            <p>{t("deleteConfirm")}</p>
            <div className="flex gap-2">
              <Button ref={confirmRef} variant="destructive" onClick={() => void act("delete")} aria-disabled={busy}>
                {t("deleteYes")}
              </Button>
              <Button variant="outline" onClick={() => setConfirm("none")}>
                {t("confirmNo")}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setConfirm("delete")}>
            {t("delete")}
          </Button>
        )}
        <p role="alert" className="min-h-5 text-sm text-destructive">
          {actionError === null ? "" : tc(actionError)}
        </p>
      </section>
    </div>
  );
}

const noopSubscribe = () => () => undefined;
