"use client";

import { createContext, useContext } from "react";
import type { P15Api } from "./api";

export interface P15Env {
  readonly api: P15Api;
  /** Client-side navigation inside the product (next/navigation in the portal; a spy in tests). */
  readonly navigate: (href: string) => void;
  /** Absolute origin of the portal, for share links (window.location.origin in the browser). */
  readonly origin: () => string;
  /** Poll interval for live room state (ARCHITECTURE_PLAN §7: 3 s). */
  readonly pollMs: number;
}

export const P15Context = createContext<P15Env | null>(null);

export function useP15(): P15Env {
  const env = useContext(P15Context);
  if (env === null) throw new Error("P15 screens must be rendered inside <P15App>");
  return env;
}
