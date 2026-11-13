import { describe, expect, it, vi } from "vitest";
import { joinWaitlist, looksLikeEmail, WAITLIST_PATH } from "./client";

const respond = (status: number) => vi.fn<typeof fetch>(async () => new Response(null, { status }));

describe("joinWaitlist", () => {
  const body = { product_id: "P15", email: "user@example.test" };

  it("POSTs JSON to the platform waitlist and maps 202 to ok", async () => {
    const f = respond(202);
    const r = await joinWaitlist("http://api.test/", body, f);
    expect(r.ok).toBe(true);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(`http://api.test${WAITLIST_PATH}`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual(body);
  });

  it.each([
    [422, "invalid"],
    [429, "rateLimited"],
    [500, "unavailable"],
    [503, "unavailable"],
  ] as const)("maps HTTP %i to %s", async (status, expected) => {
    const r = await joinWaitlist("http://api.test", body, respond(status));
    expect(r).toEqual({ ok: false, error: expected });
  });

  it("maps network failure to unavailable and never rejects", async () => {
    const f = vi.fn<typeof fetch>(async () => {
      throw new TypeError("network down");
    });
    expect(await joinWaitlist("http://api.test", body, f)).toEqual({ ok: false, error: "unavailable" });
  });

  it("rejects an invalid email without calling the network", async () => {
    const f = respond(202);
    expect(await joinWaitlist("http://api.test", { ...body, email: "nope" }, f)).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(f).not.toHaveBeenCalled();
  });

  it("looksLikeEmail", () => {
    expect(looksLikeEmail("a@b.co")).toBe(true);
    expect(looksLikeEmail("a@b")).toBe(false);
    expect(looksLikeEmail("a b@c.de")).toBe(false);
    expect(looksLikeEmail(`${"a".repeat(250)}@b.co`)).toBe(false);
  });
});
