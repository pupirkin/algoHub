"use client";

import { Button } from "@algohub/ui";
import { useT } from "../i18n";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ResultExplanation } from "../components/result-explanation";
import { Failure, Loading } from "../components/states";
import { useP15 } from "../context";
import { paths } from "../routes";
import { usePolled } from "../use-polled";

export function ResultView({ roomId }: { roomId: string }) {
  const t = useT("result");
  const { api, pollMs } = useP15();
  const load = useCallback(() => api.result(roomId), [api, roomId]);
  const [live, setLive] = useState(true);
  const { state, reload } = usePolled(load, pollMs, live);
  const notReady =
    state.kind === "failed" && state.failure.kind === "http" && state.failure.code === "result_not_ready";

  // Waiting participants see the result appear without reloading; stop polling once it is there.
  // A deleted/unknown room will not get a result either: stop polling for it too.
  const gone = state.kind === "failed" && !notReady && state.failure.kind === "http" && state.failure.status === 404;
  useEffect(() => {
    if ((state.kind === "ready" || gone) && live) queueMicrotask(() => setLive(false));
  }, [state.kind, gone, live]);

  if (state.kind === "loading") return <Loading />;
  if (notReady) {
    return (
      <div className="flex max-w-xl flex-col items-start gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{t("heading")}</h1>
        <p role="status">{t("notReady")}</p>
        <Button asChild variant="outline">
          <Link href={paths.room(roomId)}>{t("toRoom")}</Link>
        </Button>
      </div>
    );
  }
  if (state.kind === "failed") return <Failure failure={state.failure} onRetry={() => void reload()} />;
  const result = state.value;
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-medium text-muted-foreground">{t("heading")}</p>
      <h1 className="mb-6 mt-1 break-words text-3xl font-bold tracking-tight">{result.question}</h1>
      <ResultExplanation result={result} />
    </div>
  );
}
