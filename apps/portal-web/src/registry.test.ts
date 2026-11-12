import { isProductProfile, isProductStatus } from "@algohub/core";
import { describe, expect, it } from "vitest";
import { products } from "./registry";

describe("registry", () => {
  it("lists exactly 32 products P01..P32 in order", () => {
    expect(products.map((p) => p.id)).toEqual(
      Array.from({ length: 32 }, (_, i) => `P${String(i + 1).padStart(2, "0")}`),
    );
  });

  it("has unique url-safe slugs", () => {
    const slugs = products.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("uses only known statuses and profiles", () => {
    for (const p of products) {
      expect(isProductStatus(p.status)).toBe(true);
      expect(p.profiles.length).toBeGreaterThan(0);
      for (const prof of p.profiles) expect(isProductProfile(prof)).toBe(true);
    }
  });

  it("no product claims a dod-gated status while no product directory exists (Phase 0)", () => {
    for (const p of products) expect(["MVP_READY", "LIVE"]).not.toContain(p.status);
  });
});
