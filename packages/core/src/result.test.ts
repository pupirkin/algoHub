import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { andThen, err, fromPromise, isErr, isOk, map, mapErr, ok, unwrapOr, type Result } from "./result";

const arbResult: fc.Arbitrary<Result<number, string>> = fc.oneof(
  fc.integer().map((n) => ok(n)),
  fc.string().map((s) => err(s)),
);

describe("Result", () => {
  it("narrows with isOk/isErr", () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isErr(err("x"))).toBe(true);
  });

  it("map identity law", () => {
    fc.assert(
      fc.property(arbResult, (r) => {
        expect(map(r, (x) => x)).toEqual(r);
      }),
    );
  });

  it("map composition law", () => {
    const f = (x: number) => x + 1;
    const g = (x: number) => x * 2;
    fc.assert(
      fc.property(arbResult, (r) => {
        expect(map(map(r, f), g)).toEqual(map(r, (x) => g(f(x))));
      }),
    );
  });

  it("andThen left identity: ok(a).andThen(f) == f(a)", () => {
    const f = (x: number): Result<number, string> => (x % 2 === 0 ? ok(x / 2) : err("odd"));
    fc.assert(
      fc.property(fc.integer(), (a) => {
        expect(andThen(ok(a), f)).toEqual(f(a));
      }),
    );
  });

  it("mapErr never touches Ok and unwrapOr returns fallback only for Err", () => {
    fc.assert(
      fc.property(arbResult, fc.integer(), (r, fallback) => {
        expect(isOk(mapErr(r, (e) => e.length))).toBe(r.ok);
        expect(unwrapOr(r, fallback)).toBe(r.ok ? r.value : fallback);
      }),
    );
  });

  it("fromPromise never rejects", async () => {
    await expect(fromPromise(Promise.resolve(3), () => "e")).resolves.toEqual(ok(3));
    await expect(fromPromise(Promise.reject(new Error("boom")), () => "e")).resolves.toEqual(err("e"));
  });
});
