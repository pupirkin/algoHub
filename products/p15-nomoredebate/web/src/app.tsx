"use client";

import { NextIntlClientProvider, useLocale, useNow, useTimeZone } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import messages from "../messages/ru.json";
import { createP15Api, type P15Api } from "./api";
import { P15Context, type P15Env } from "./context";
import { matchRoute } from "./routes";
import { CreateRoom } from "./screens/create-room";
import { OrganizerRoom } from "./screens/organizer-room";
import { ParticipantRoom } from "./screens/participant-room";
import { ResultView } from "./screens/result-view";

export interface P15AppProps {
  /** Catch-all segments after /p/nomoredebate (validated by the portal with `matchRoute`). */
  readonly path: readonly string[];
  /** algo-api origin (NEXT_PUBLIC_API_BASE_URL). */
  readonly apiBaseUrl: string;
  /** Test seams; the portal leaves them unset. */
  readonly api?: P15Api;
  readonly pollMs?: number;
}

/** Entry component loaded by the portal through `registry.load()` (ARCHITECTURE_PLAN §4). */
export function P15App({ path, apiBaseUrl, api, pollMs = 3000 }: P15AppProps) {
  const router = useRouter();
  const locale = useLocale();
  const timeZone = useTimeZone();
  const now = useNow();
  const env = useMemo<P15Env>(
    () => ({
      api: api ?? createP15Api(apiBaseUrl),
      navigate: (href) => router.push(href),
      origin: () => window.location.origin,
      pollMs,
    }),
    [api, apiBaseUrl, router, pollMs],
  );
  const route = matchRoute(path);
  // The portal's global next-intl typing describes only portal messages; ours are typed by `useT` (i18n.ts).
  const ownMessages = messages as never;
  return (
    <NextIntlClientProvider
      locale={locale}
      {...(timeZone === undefined ? {} : { timeZone })}
      now={now}
      messages={ownMessages}
    >
      <P15Context value={env}>
        {route === null ? null : route.screen === "create" ? (
          <CreateRoom />
        ) : route.screen === "room" ? (
          <ParticipantRoom roomId={route.roomId} />
        ) : route.screen === "organizer" ? (
          <OrganizerRoom roomId={route.roomId} />
        ) : (
          <ResultView roomId={route.roomId} />
        )}
      </P15Context>
    </NextIntlClientProvider>
  );
}
