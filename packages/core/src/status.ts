/** Platform-wide product lifecycle vocabulary (CLAUDE.md rule 3, TESTING_STRATEGY §7). */
export const PRODUCT_STATUSES = [
  "NOT_STARTED",
  "DISCOVERY",
  "DESIGNED",
  "IN_PROGRESS",
  "MVP_READY",
  "VALIDATING",
  "LIVE",
  "BLOCKED",
] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Statuses that may only be set after a green `just dod <ID>`. */
export const DOD_GATED_STATUSES: readonly ProductStatus[] = ["MVP_READY", "LIVE"];

export const PRODUCT_PROFILES = ["CLIENT", "ROOM", "SOLVER", "DATA"] as const;
export type ProductProfile = (typeof PRODUCT_PROFILES)[number];

export const isProductStatus = (v: unknown): v is ProductStatus =>
  typeof v === "string" && (PRODUCT_STATUSES as readonly string[]).includes(v);

export const isProductProfile = (v: unknown): v is ProductProfile =>
  typeof v === "string" && (PRODUCT_PROFILES as readonly string[]).includes(v);
