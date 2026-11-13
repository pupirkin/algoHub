/**
 * Server-only feature flags (ARCHITECTURE_PLAN §5): `ALGOHUB_FLAGS=preview:P15,preview:P31`.
 * `preview:<ID>` opens a product's real UI below MVP_READY (with a visible "preview" notice) — used by e2e
 * against compose and for local work. Never import from a "use client" module (ESLint blocks server env there).
 */
export function parseFlags(raw: string | undefined): ReadonlySet<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((f) => f.trim())
      .filter((f) => f.length > 0),
  );
}

export const isPreviewEnabled = (productId: string, raw: string | undefined = process.env.ALGOHUB_FLAGS): boolean =>
  parseFlags(raw).has(`preview:${productId}`);
