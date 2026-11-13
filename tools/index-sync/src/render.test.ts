import { describe, expect, it } from "vitest";
import { products } from "../../../apps/portal-web/src/registry.ts";
import { renderIndex } from "./render.ts";

describe("renderIndex", () => {
  it("renders one row per product and is deterministic", () => {
    const md = renderIndex(products);
    expect(md).toBe(renderIndex(products));
    expect(md.split("\n").filter((l) => /^\| P\d{2} \|/.test(l))).toHaveLength(32);
    expect(md).toContain(
      "| P15 | NoMoreDebate | Голосование, которое заканчивает спор за минуты | nomoredebate | ROOM | NOT_STARTED | 1 | `products/p15-nomoredebate` |",
    );
    expect(md).toContain("Status summary: NOT_STARTED: 32.");
  });
});
