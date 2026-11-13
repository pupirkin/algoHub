/**
 * Security headers (ARCHITECTURE_PLAN §5, TESTING_STRATEGY §6). Pure functions, unit-tested; wired in
 * `next.config.ts` (static headers) and `middleware.ts` (per-request CSP with nonce).
 */

export interface CspOptions {
  nonce: string;
  /** Origins the browser may call with fetch (the algo-api base URL). */
  connectOrigins: readonly string[];
  /** Next dev server needs eval (React Refresh) and inline styles (error overlay). */
  dev: boolean;
}

export function originOf(url: string | undefined): string | null {
  if (url === undefined || url === "") return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function buildCsp({ nonce, connectOrigins, dev }: CspOptions): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", dev ? "'unsafe-inline'" : `'nonce-${nonce}'`],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...connectOrigins, ...(dev ? ["ws:"] : [])],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

/** Static headers for every response. HSTS is ignored by browsers on plain-http localhost (harmless). */
export const STATIC_SECURITY_HEADERS: readonly { key: string; value: string }[] = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

/** 128-bit random nonce, base64 — works in the Edge runtime (Web Crypto). */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
