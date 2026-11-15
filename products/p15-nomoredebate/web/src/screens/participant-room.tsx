"use client";

import { Badge, Button, Input } from "@algohub/ui";
import { useT } from "../i18n";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import type { Room } from "../api";
import { RankingEditor } from "../components/ranking-editor";
import { Failure, Loading } from "../components/states";
import { useP15 } from "../context";
import { paths } from "../routes";
import { isPermutation, parseParticipant, storage, subscribeStorage, type ParticipantSession } from "../storage";
import { usePolled } from "../use-polled";

export function ParticipantRoom({ roomId }: { roomId: string }) {
  const { api, pollMs } = useP15();
  const load = useCallback(() => api.getRoom(roomId), [api, roomId]);
  const [live, setLive] = useState(true);
  const { state, reload } = usePolled(load, pollMs, live);
  const raw = useSyncExternalStore(
    subscribeStorage,
    () => storage.participantRaw(roomId),
    () => null,
  );
  const session = parseParticipant(raw);

  const room = state.kind === "ready" ? state.value : null;
  useEffect(() => {
    if (room?.status === "closed" && live) queueMicrotask(() => setLive(false));
  }, [room?.status, live]);

  if (state.kind === "loading") return <Loading />;
  if (state.kind === "failed") return <Failure failure={state.failure} onRetry={() => void reload()} />;
  const r = state.value;
  return (
    <div className="max-w-xl">
      <RoomHeader room={r} />
      {r.status === "closed" ? (
        <ClosedNotice roomId={roomId} />
      ) : session === null ? (
        <JoinForm roomId={roomId} onClosed={() => void reload()} />
      ) : (
        <BallotForm room={r} session={session} onClosed={() => void reload()} />
      )}
    </div>
  );
}

export function RoomHeader({ room }: { room: Room }) {
  const t = useT("common");
  const tm = useT("method");
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={room.status === "open" ? "success" : "neutral"}>
          {room.status === "open" ? t("openBadge") : t("closedBadge")}
        </Badge>
        <span className="text-sm text-muted-foreground">{tm(room.method)}</span>
      </div>
      <h1 className="mt-2 break-words text-3xl font-bold tracking-tight">{room.question}</h1>
      <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
        {t("votedCount", { voted: room.ballot_count, joined: room.participant_count })}
      </p>
    </header>
  );
}

function ClosedNotice({ roomId }: { roomId: string }) {
  const t = useT("vote");
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-border bg-muted p-4">
      <p>{t("closed")}</p>
      <Button asChild>
        <Link href={paths.result(roomId)}>{t("toResult")}</Link>
      </Button>
    </div>
  );
}

type JoinError = "name" | "name_taken" | "room_full" | "room_closed" | "rateLimited" | "unavailable";

function JoinForm({ roomId, onClosed }: { roomId: string; onClosed: () => void }) {
  const t = useT("join");
  const tc = useT("common");
  const { api } = useP15();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ key: JoinError; attempt: number } | null>(null);
  const attempts = useRef(0);
  const ids = { name: useId(), error: useId(), intro: useId() };

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    attempts.current += 1;
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 40) {
      setError({ key: "name", attempt: attempts.current });
      return;
    }
    setBusy(true);
    const res = await api.join(roomId, trimmed);
    setBusy(false);
    if (res.ok) {
      storage.setParticipant(roomId, { token: res.value.participant_token, name: res.value.display_name });
      return;
    }
    const f = res.error;
    let key: JoinError = "unavailable";
    if (
      f.kind === "http" &&
      f.status === 409 &&
      (f.code === "name_taken" || f.code === "room_full" || f.code === "room_closed")
    ) {
      key = f.code;
    } else if (f.kind === "http" && f.status === 422) key = "name";
    else if (f.kind === "http" && f.status === 429) key = "rateLimited";
    setError({ key, attempt: attempts.current });
    if (key === "room_closed") onClosed();
  }

  const errorText =
    error === null
      ? ""
      : error.key === "rateLimited" || error.key === "unavailable"
        ? tc(error.key)
        : t(`errors.${error.key}`);
  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3" aria-describedby={ids.intro}>
      <h2 className="text-xl font-semibold">{t("heading")}</h2>
      <p id={ids.intro} className="text-sm text-muted-foreground">
        {t("intro")}
      </p>
      <label htmlFor={ids.name} className="text-sm font-medium">
        {t("name")}
      </label>
      <Input
        id={ids.name}
        value={name}
        maxLength={40}
        autoComplete="nickname"
        aria-invalid={error?.key === "name" || error?.key === "name_taken"}
        aria-describedby={error !== null ? ids.error : undefined}
        onChange={(e) => setName(e.target.value)}
      />
      <p key={error?.attempt ?? 0} id={ids.error} role="alert" className="min-h-5 text-sm text-destructive">
        {errorText}
      </p>
      <Button type="submit" aria-disabled={busy} className="self-start">
        {busy ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}

/** Full order from a stored (possibly partial) ranking: listed options first, the rest in option order. */
export function completeOrder(ranking: readonly number[] | null | undefined, optionCount: number): number[] {
  const listed = (ranking ?? []).filter((o) => o >= 0 && o < optionCount);
  const rest = Array.from({ length: optionCount }, (_, i) => i).filter((i) => !listed.includes(i));
  return [...listed, ...rest];
}

type Saved =
  { kind: "none" } | { kind: "saved"; order: number[] } | { kind: "error"; key: "rateLimited" | "unavailable" };

function BallotForm({ room, session, onClosed }: { room: Room; session: ParticipantSession; onClosed: () => void }) {
  const t = useT("vote");
  const tc = useT("common");
  const { api } = useP15();
  const n = room.options.length;
  const [order, setOrder] = useState<number[] | null>(null);
  const [saved, setSaved] = useState<Saved>({ kind: "none" });
  const [busy, setBusy] = useState(false);
  const helpId = useId();

  // Restore: a local draft wins over the server copy (it is newer by construction); then the server ballot.
  useEffect(() => {
    let cancelled = false;
    void api.myBallot(room.id, session.token).then((res) => {
      if (cancelled) return;
      if (!res.ok && res.error.kind === "http" && (res.error.status === 403 || res.error.status === 401)) {
        storage.setParticipant(room.id, null); // stale token (room recreated or storage edited): join again
        return;
      }
      const server = res.ok && res.value.ranking ? completeOrder(res.value.ranking, n) : null;
      const draft = storage.draft(room.id, n);
      setOrder(draft ?? server ?? completeOrder(null, n));
      if (server !== null) setSaved({ kind: "saved", order: server });
    });
    return () => {
      cancelled = true;
    };
  }, [api, room.id, session.token, n]);

  function change(next: number[]) {
    setOrder(next);
    storage.setDraft(room.id, next);
  }

  async function submit() {
    if (order === null || busy || !isPermutation(order, n)) return;
    setBusy(true);
    const res = await api.vote(room.id, session.token, order);
    setBusy(false);
    if (res.ok) {
      setSaved({ kind: "saved", order });
      storage.setDraft(room.id, null);
      return;
    }
    const f = res.error;
    if (f.kind === "http" && f.status === 409) onClosed();
    else if (f.kind === "http" && (f.status === 401 || f.status === 403)) storage.setParticipant(room.id, null);
    else setSaved({ kind: "error", key: f.kind === "http" && f.status === 429 ? "rateLimited" : "unavailable" });
  }

  if (order === null) return <Loading />;
  const isSaved = saved.kind === "saved" && saved.order.join() === order.join();
  return (
    <section aria-labelledby="p15-vote-heading" className="flex flex-col gap-4">
      <h2 id="p15-vote-heading" className="text-xl font-semibold">
        {t("heading")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("youAre", { name: session.name })}</p>
      <p id={helpId} className="text-sm">
        {t("intro")}
      </p>
      <RankingEditor options={room.options} order={order} onChange={change} disabled={busy} describedBy={helpId} />
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void submit()} aria-disabled={busy}>
          {busy ? t("submitting") : saved.kind === "saved" ? t("update") : t("submit")}
        </Button>
        <p role="status" className="text-sm">
          {saved.kind === "error" ? tc(saved.key) : isSaved ? t("saved") : saved.kind === "saved" ? t("draft") : ""}
        </p>
      </div>
    </section>
  );
}
