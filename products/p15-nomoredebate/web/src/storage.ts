/**
 * Per-browser memory of capability tokens and ranking drafts (localStorage). Every access is guarded:
 * private mode or blocked storage must never break the page — the user then just re-enters.
 */
export interface ParticipantSession {
  readonly token: string;
  readonly name: string;
}

const keys = {
  organizer: (roomId: string) => `p15:organizer:${roomId}`,
  participant: (roomId: string) => `p15:participant:${roomId}`,
  draft: (roomId: string) => `p15:draft:${roomId}`,
};

// In-memory mirror: once localStorage fails (private mode, quota, blocked), this tab keeps working from memory.
const memory = new Map<string, string>();
const listeners = new Set<() => void>();
let degraded = false;

function read(key: string): string | null {
  if (!degraded) {
    try {
      const ls = globalThis.localStorage;
      if (ls !== undefined) return ls.getItem(key);
    } catch {
      degraded = true;
    }
  }
  return memory.get(key) ?? null;
}

function write(key: string, value: string | null): void {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  if (!degraded) {
    try {
      if (value === null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
    } catch {
      degraded = true; // from now on this tab reads the in-memory mirror
    }
  }
  for (const l of listeners) l();
}

/** Test hook: forget the degraded mode and the in-memory mirror. */
export function resetStorageForTests(): void {
  degraded = false;
  memory.clear();
}

/** For useSyncExternalStore: re-render when this tab writes or another tab changes storage. */
export function subscribeStorage(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = () => listener();
  globalThis.addEventListener?.("storage", onStorage);
  return () => {
    listeners.delete(listener);
    globalThis.removeEventListener?.("storage", onStorage);
  };
}

export const storage = {
  /** Raw snapshot of a room's participant session (a string, so useSyncExternalStore can compare it). */
  participantRaw: (roomId: string): string | null => read(keys.participant(roomId)),
  organizerToken: (roomId: string): string | null => read(keys.organizer(roomId)),
  setOrganizerToken: (roomId: string, token: string | null) => write(keys.organizer(roomId), token),

  participant(roomId: string): ParticipantSession | null {
    return parseParticipant(read(keys.participant(roomId)));
  },
  setParticipant: (roomId: string, s: ParticipantSession | null) =>
    write(keys.participant(roomId), s === null ? null : JSON.stringify(s)),

  draft(roomId: string, optionCount: number): number[] | null {
    const raw = read(keys.draft(roomId));
    if (raw === null) return null;
    try {
      const v: unknown = JSON.parse(raw);
      return isPermutation(v, optionCount) ? v : null;
    } catch {
      return null;
    }
  },
  setDraft: (roomId: string, order: readonly number[] | null) =>
    write(keys.draft(roomId), order === null ? null : JSON.stringify(order)),
};

export function parseParticipant(raw: string | null): ParticipantSession | null {
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw) as Partial<ParticipantSession>;
    return typeof v.token === "string" && typeof v.name === "string" ? { token: v.token, name: v.name } : null;
  } catch {
    return null;
  }
}

export function isPermutation(v: unknown, n: number): v is number[] {
  if (!Array.isArray(v) || v.length !== n) return false;
  const seen = new Set<number>();
  for (const x of v) {
    if (typeof x !== "number" || !Number.isInteger(x) || x < 0 || x >= n || seen.has(x)) return false;
    seen.add(x);
  }
  return true;
}

/**
 * Reads `#t=<token>` from the URL fragment. The fragment is never sent to servers, proxies or Referer, so the
 * organizer link can carry its capability; it stays in the address bar so the organizer can bookmark it.
 */
export function tokenFromFragment(hash: string): string | null {
  const m = /(?:^#|&)t=([A-Za-z0-9_-]{16,64})(?:&|$)/.exec(hash);
  return m?.[1] ?? null;
}
