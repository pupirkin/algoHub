import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { products } from "../registry";
import { makeDoc, normalize, search, stem, type SearchDoc } from "./search";

const docs: SearchDoc[] = products.map((p) =>
  makeDoc(p.id, [p.id, p.title, p.tagline, p.purpose, ...p.core, ...p.tags]),
);
const allIds: string[] = products.map((p) => p.id);

describe("catalog search — examples", () => {
  it("empty or blank query returns every product in order", () => {
    expect(search(docs, "")).toEqual(allIds);
    expect(search(docs, "   ")).toEqual(allIds);
  });

  it.each([
    ["смены", "P31"],
    ["СМЕНЫ", "P31"],
    ["p15", "P15"],
    ["ranked choice", "P15"],
    ["споров", "P15"],
    ["голосование", "P15"],
    ["покупки", "P21"],
    ["маршрут", "P02"],
    ["парковка", "P09"],
    ["переезд", "P26"],
  ])("query %s finds %s", (query, id) => {
    expect(search(docs, query)).toContain(id);
  });

  it("treats ё as е", () => {
    const d = [makeDoc("X", ["Учёт расходов"])];
    expect(search(d, "учет")).toEqual(["X"]);
    expect(search(d, "учёт")).toEqual(["X"]);
  });

  it("AND semantics across tokens", () => {
    expect(search(docs, "маршрут дедлайн")).toEqual(["P02"]);
  });

  it("returns nothing for nonsense", () => {
    expect(search(docs, "zzzzqqq")).toEqual([]);
  });

  it("stem is a prefix of the token and never shorter than 4 letters for long words", () => {
    expect(stem("смены")).toBe("смен");
    expect(stem("покупки")).toBe("покуп");
    expect(stem("vrp")).toBe("vrp");
  });
});

const queryArb = fc.string({ maxLength: 12 });
const wordArb = fc.constantFrom(...products.flatMap((p) => normalize(`${p.tagline} ${p.purpose}`).split(" ")), "x", "");

describe("catalog search — properties", () => {
  it("result is an order-preserving subset of the catalog", () => {
    fc.assert(
      fc.property(queryArb, (q) => {
        const res = search(docs, q);
        const positions = res.map((id) => allIds.indexOf(id));
        expect(positions.every((p) => p >= 0)).toBe(true);
        expect([...positions].sort((a, b) => a - b)).toEqual(positions);
      }),
    );
  });

  it("adding a token never widens the result (AND)", () => {
    fc.assert(
      fc.property(fc.array(wordArb, { maxLength: 3 }), wordArb, (words, extra) => {
        const base = search(docs, words.join(" "));
        const narrowed = search(docs, [...words, extra].join(" "));
        for (const id of narrowed) expect(base).toContain(id);
      }),
    );
  });

  it("is case-insensitive", () => {
    fc.assert(
      fc.property(fc.array(wordArb, { maxLength: 3 }), (words) => {
        const q = words.join(" ");
        expect(search(docs, q.toUpperCase())).toEqual(search(docs, q));
      }),
    );
  });

  it("every product is found by its own tagline", () => {
    for (const p of products) expect(search(docs, p.tagline)).toContain(p.id);
  });
});
