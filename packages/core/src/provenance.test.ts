import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isDemo, parseProvenance, PROVENANCE_SOURCES } from "./provenance";

const isoDate = fc
  .date({ min: new Date("2000-01-01T00:00:00Z"), max: new Date("2100-01-01T00:00:00Z"), noInvalidDate: true })
  .map((d) => d.toISOString());

describe("parseProvenance", () => {
  it("accepts every valid source/timestamp/confidence", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PROVENANCE_SOURCES),
        isoDate,
        fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
        (source, fetched_at, confidence) => {
          const input = confidence === undefined ? { source, fetched_at } : { source, fetched_at, confidence };
          const r = parseProvenance(input);
          expect(r.ok).toBe(true);
          if (r.ok) expect(r.value).toEqual(input);
        },
      ),
    );
  });

  it("rejects unknown sources (demo can never be silently relabeled)", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !(PROVENANCE_SOURCES as readonly string[]).includes(s)),
        isoDate,
        (source, fetched_at) => {
          const r = parseProvenance({ source, fetched_at });
          expect(r).toEqual({ ok: false, error: { kind: "invalid_source", value: source } });
        },
      ),
    );
  });

  it.each([
    [{ source: "live", fetched_at: "yesterday" }, "invalid_timestamp"],
    [{ source: "live", fetched_at: "2026-13-45T99:99:99Z" }, "invalid_timestamp"],
    [{ source: "demo", fetched_at: "2026-11-12T10:00:00Z", confidence: 1.5 }, "invalid_confidence"],
    [{ source: "demo", fetched_at: "2026-11-12T10:00:00Z", confidence: Number.NaN }, "invalid_confidence"],
    [null, "invalid_source"],
    ["live", "invalid_source"],
  ])("rejects %j as %s", (input, kind) => {
    const r = parseProvenance(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe(kind);
  });

  it("isDemo only for demo", () => {
    expect(isDemo({ source: "demo", fetched_at: "2026-11-12T10:00:00Z" })).toBe(true);
    expect(isDemo({ source: "live", fetched_at: "2026-11-12T10:00:00Z" })).toBe(false);
  });
});
