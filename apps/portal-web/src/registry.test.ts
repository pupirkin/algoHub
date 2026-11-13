import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isProductProfile, isProductStatus } from "@algohub/core";
import { describe, expect, it } from "vitest";
import { findProductBySlug, isLaunched, PRODUCT_TAGS, products } from "./registry";

const catalog = readFileSync(fileURLToPath(new URL("../../../PROJECT_CATALOG.md", import.meta.url)), "utf8");
const catalogRow = (id: string): string[] => {
  const line = catalog.split("\n").find((l) => l.startsWith(`| ${id} |`));
  if (line === undefined) throw new Error(`${id} not found in PROJECT_CATALOG.md`);
  return line.split("|").map((c) => c.trim());
};

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

  it("uses only known statuses, profiles and tags", () => {
    for (const p of products) {
      expect(isProductStatus(p.status)).toBe(true);
      expect(p.profiles.length).toBeGreaterThan(0);
      for (const prof of p.profiles) expect(isProductProfile(prof)).toBe(true);
      expect(p.tags.length).toBeGreaterThan(0);
      for (const tag of p.tags) expect(PRODUCT_TAGS).toContain(tag);
    }
  });

  it("every tag is used by at least one product", () => {
    for (const tag of PRODUCT_TAGS) expect(products.some((p) => p.tags.includes(tag))).toBe(true);
  });

  it("has short non-empty taglines and a core for every product", () => {
    for (const p of products) {
      expect(p.tagline.length, p.id).toBeGreaterThan(10);
      expect(p.tagline.length, p.id).toBeLessThanOrEqual(60);
      expect(p.core.length, p.id).toBeGreaterThan(0);
    }
  });

  it("purpose and algorithmic core match PROJECT_CATALOG.md (no drift)", () => {
    for (const p of products) {
      const [, , name, purpose, core] = catalogRow(p.id);
      expect(name, p.id).toContain(p.title);
      expect(purpose, p.id).toBe(p.purpose);
      for (const term of p.core) expect(core, `${p.id}: ${term}`).toContain(term);
    }
  });

  it("no product claims a dod-gated status while no product directory exists", () => {
    for (const p of products) expect(["MVP_READY", "LIVE"]).not.toContain(p.status);
  });

  it("finds products by slug and knows which are launched", () => {
    expect(findProductBySlug("nomoredebate")?.id).toBe("P15");
    expect(findProductBySlug("nope")).toBeUndefined();
    expect(isLaunched({ status: "NOT_STARTED" })).toBe(false);
    expect(isLaunched({ status: "IN_PROGRESS" })).toBe(false);
    expect(isLaunched({ status: "MVP_READY" })).toBe(true);
    expect(isLaunched({ status: "LIVE" })).toBe(true);
  });
});
