/**
 * Public (browser-visible) configuration. Only NEXT_PUBLIC_* values, inlined at build time.
 * One default for every consumer, so the CSP `connect-src` (middleware.ts) and the API client always agree.
 */
export const DEFAULT_API_BASE_URL = "http://localhost:8000";

export const apiBaseUrl = (): string => process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;
