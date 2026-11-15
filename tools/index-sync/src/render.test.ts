import { describe, expect, it } from "vitest";
import { products, type ProductEntry } from "../../../apps/portal-web/src/registry.ts";
import { renderIndex } from "./render.ts";

const fixture: readonly ProductEntry[] = [
  {
    id: "P15",
    slug: "nomoredebate",
    title: "NoMoreDebate",
    tagline: "Голосование | без споров",
    purpose: "test",
    core: ["ranked choice"],
    tags: ["groups"],
    profiles: ["ROOM"],
    status: "IN_PROGRESS",
    wave: "1",
  },
  {
    id: "P01",
    slug: "jinal",
    title: "Jinal",
    tagline: "Место встречи",
    purpose: "test",
    core: ["routing"],
    tags: ["groups", "routes"],
    profiles: ["DATA", "ROOM"],
    status: "NOT_STARTED",
    wave: null,
  },
];

describe("renderIndex", () => {
  it("renders exact rows: joined profiles, escaped pipes, missing wave as a dash", () => {
    const md = renderIndex(fixture);
    expect(md).toContain(
      "| P15 | NoMoreDebate | Голосование \\| без споров | nomoredebate | ROOM | IN_PROGRESS | 1 | `products/p15-nomoredebate` |",
    );
    expect(md).toContain(
      "| P01 | Jinal | Место встречи | jinal | DATA+ROOM | NOT_STARTED | — | `products/p01-jinal` |",
    );
    expect(md).toContain("Products: 2.");
    expect(md).toContain("Status summary: IN_PROGRESS: 1, NOT_STARTED: 1.");
  });

  it("renders one row per registry product and is deterministic", () => {
    const md = renderIndex(products);
    expect(md).toBe(renderIndex(products));
    expect(md.split("\n").filter((l) => /^\| P\d{2} \|/.test(l))).toHaveLength(products.length);
    const summary = /Status summary: (.+)\.$/m.exec(md)?.[1] ?? "";
    const total = summary.split(", ").reduce((n, part) => n + Number(part.split(": ")[1]), 0);
    expect(total).toBe(products.length);
  });
});
