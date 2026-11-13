import createClient, { type Client } from "openapi-fetch";
import type { components, paths } from "./schema.gen";

/**
 * Typed client for algo-api (ARCHITECTURE_PLAN D8). Types are generated from the committed OpenAPI snapshot;
 * `client.test.ts` fails when they drift. Products import the `Schemas` they need instead of re-declaring them.
 */
export type { components, paths };
export type Schemas = components["schemas"];
export type ApiClient = Client<paths>;

export interface ApiClientOptions {
  /** Origin of algo-api, e.g. http://localhost:8000 (NEXT_PUBLIC_API_BASE_URL in the portal). */
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
  /** Per-request timeout; the UI never waits forever. */
  readonly timeoutMs?: number;
}

export function createApiClient({ baseUrl, fetch: fetchImpl, timeoutMs = 10_000 }: ApiClientOptions): ApiClient {
  const base = fetchImpl ?? globalThis.fetch;
  return createClient<paths>({
    baseUrl: baseUrl.replace(/\/$/, ""),
    fetch: (input: Request) => base(new Request(input, { signal: AbortSignal.timeout(timeoutMs) })),
  });
}

/** Error envelope of every non-2xx response (`shared_kernel.errors`). */
export type ApiErrorBody = Schemas["ErrorEnvelope"]["error"];

export function errorCode(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const err = (body as { error?: { code?: unknown } }).error;
  return typeof err?.code === "string" ? err.code : undefined;
}
