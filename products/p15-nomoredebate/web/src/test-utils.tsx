import { err, ok } from "@algohub/core";
import { render } from "@testing-library/react";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { vi } from "vitest";
import messages from "../messages/ru.json";
import type { ApiFailure, P15Api, Room, RoomResult } from "./api";
import { P15Context, type P15Env } from "./context";

export const ROOM_ID = "11111111-2222-4333-8444-555555555555";

export function room(overrides: Partial<Room> = {}): Room {
  return {
    id: ROOM_ID,
    question: "Что заказываем?",
    method: "condorcet_borda",
    status: "open",
    deadline_at: null,
    created_at: "2026-11-13T12:00:00Z",
    closed_at: null,
    max_participants: 30,
    participant_count: 2,
    ballot_count: 1,
    options: [
      { id: 0, label: "Pizza" },
      { id: 1, label: "Sushi" },
      { id: 2, label: "Burgers" },
    ],
    ...overrides,
  };
}

export function result(overrides: Partial<RoomResult> = {}): RoomResult {
  return {
    room_id: ROOM_ID,
    question: "Что заказываем?",
    method: "condorcet_borda",
    computed_at: "2026-11-13T12:30:00Z",
    outcome: "winner",
    winner_option_id: 1,
    tied_option_ids: [],
    tiebreak_option_id: null,
    chosen_option_id: 1,
    ballot_count: 3,
    decided_by: "condorcet",
    condorcet_winner_option_id: 1,
    borda_points: [3, 4, 2],
    pairwise_wins: [
      [0, 1, 2],
      [2, 0, 2],
      [1, 1, 0],
    ],
    irv_rounds: null,
    regrets: null,
    reasons: [{ code: "condorcet_winner", option_ids: [1], value: null, round: null }],
    options: room().options,
    provenance: { source: "user", fetched_at: "2026-11-13T12:30:00Z" },
    ...overrides,
  };
}

export const http = (status: number, code?: string): ApiFailure => ({ kind: "http", status, code });

/** An API whose every call fails with "network" unless overridden — tests state exactly what they rely on. */
export function fakeApi(overrides: Partial<P15Api> = {}): P15Api {
  const fail = () => Promise.resolve(err<ApiFailure>({ kind: "network" }));
  return {
    createRoom: vi.fn(fail),
    getRoom: vi.fn(() => Promise.resolve(ok(room()))),
    join: vi.fn(fail),
    myBallot: vi.fn(fail),
    vote: vi.fn(fail),
    participants: vi.fn(() => Promise.resolve(ok([]))),
    close: vi.fn(fail),
    result: vi.fn(fail),
    deleteRoom: vi.fn(fail),
    ...overrides,
  } as P15Api;
}

export function renderWith(ui: ReactNode, env: Partial<P15Env> = {}) {
  const full: P15Env = {
    api: fakeApi(),
    navigate: vi.fn(),
    origin: () => "http://portal.test",
    pollMs: 60_000,
    ...env,
  };
  const utils = render(
    <NextIntlClientProvider
      locale="ru"
      timeZone="Asia/Almaty"
      messages={messages}
      onError={(e) => {
        throw e; // a missing key is a test failure, not a silent fallback
      }}
    >
      <P15Context value={full}>{ui}</P15Context>
    </NextIntlClientProvider>,
  );
  return { ...utils, env: full };
}

export async function axeViolations(container: HTMLElement): Promise<string[]> {
  const res = await axe.run(container, {
    resultTypes: ["violations"],
    rules: { "color-contrast": { enabled: false } }, // jsdom has no layout; contrast is checked in Playwright
  });
  return res.violations.map((v) => `${v.id}: ${v.help}`);
}
