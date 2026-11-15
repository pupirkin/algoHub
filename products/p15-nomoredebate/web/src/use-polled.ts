"use client";

import type { Result } from "@algohub/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiFailure } from "./api";

export type Polled<T> =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly value: T }
  | { readonly kind: "failed"; readonly failure: ApiFailure };

/**
 * Loads a value and refreshes it every `intervalMs` while `live` (paused while the tab is hidden).
 * A failed refresh after a success keeps showing the last value (transient network blips do not blank the page).
 */
export function usePolled<T>(
  load: () => Promise<Result<T, ApiFailure>>,
  intervalMs: number,
  live: boolean,
): { state: Polled<T>; reload: () => Promise<void> } {
  const [state, setState] = useState<Polled<T>>({ kind: "loading" });
  const loadRef = useRef(load);

  const reload = useCallback(async () => {
    const r = await loadRef.current();
    setState((prev) => {
      if (r.ok) return { kind: "ready", value: r.value };
      if (prev.kind === "ready" && r.error.kind === "network") return prev;
      return { kind: "failed", failure: r.error };
    });
  }, []);

  // A new `load` (e.g. the token became known) means new data: fetch it now, not on the next tick.
  useEffect(() => {
    loadRef.current = load;
    void reload();
  }, [load, reload]);

  useEffect(() => {
    if (!live) return undefined;
    const id = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) void reload();
    }, intervalMs);
    return () => clearInterval(id);
  }, [live, intervalMs, reload]);

  return { state, reload };
}
