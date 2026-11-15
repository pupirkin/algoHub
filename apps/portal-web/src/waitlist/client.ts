import { err, ok, type Result } from "@algohub/core";

/**
 * Thin typed client for `POST /api/v1/platform/waitlist` (services/algo-api). Hand-written until
 * `@algohub/api-client` is generated (Phase 2); `client.contract.test.ts` checks it against openapi.json.
 */
export const WAITLIST_PATH = "/api/v1/platform/waitlist";

export interface WaitlistRequest {
  readonly product_id: string;
  readonly email: string;
}

export type WaitlistError = "invalid" | "rateLimited" | "unavailable";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_EMAIL_LENGTH = 254;

export const looksLikeEmail = (s: string): boolean => s.length <= MAX_EMAIL_LENGTH && EMAIL_RE.test(s);

/** A 422 blames the email only if the API says so; anything else (e.g. unknown product) is not the user's typo. */
async function isEmailValidationError(res: Response): Promise<boolean> {
  try {
    const body = (await res.json()) as { error?: { details?: { fields?: { loc?: string[] }[] } } };
    return (body.error?.details?.fields ?? []).some((f) => f.loc?.includes("email") === true);
  } catch {
    return false;
  }
}

export async function joinWaitlist(
  baseUrl: string,
  body: WaitlistRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<void, WaitlistError>> {
  if (!looksLikeEmail(body.email)) return err("invalid");
  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}${WAITLIST_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return err("unavailable");
  }
  if (res.status === 202) return ok(undefined);
  if (res.status === 422) return err((await isEmailValidationError(res)) ? "invalid" : "unavailable");
  if (res.status === 429) return err("rateLimited");
  return err("unavailable");
}
