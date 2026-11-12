import { describe, expect, it } from "vitest";
import { DOC_FILES, parseArgs, planProduct } from "./plan.ts";

describe("parseArgs", () => {
  it("parses id, slug, profile and dry-run", () => {
    expect(parseArgs(["p17", "fairteams", "--profile", "client", "--dry-run"])).toEqual({
      ok: true,
      value: { id: "P17", slug: "fairteams", profiles: ["CLIENT"], dryRun: true },
    });
    expect(parseArgs(["P01", "jinal", "--profile=DATA+ROOM"])).toMatchObject({
      ok: true,
      value: { profiles: ["DATA", "ROOM"] },
    });
  });

  it.each([
    [["P17", "fairteams"]],
    [["P00", "x", "--profile", "CLIENT"]],
    [["P17", "Fair_Teams", "--profile", "CLIENT"]],
    [["P17", "fairteams", "--profile", "SERVER"]],
    [["P17", "fairteams", "extra", "--profile", "CLIENT"]],
  ])("rejects %j", (argv) => {
    expect(parseArgs(argv).ok).toBe(false);
  });
});

describe("planProduct", () => {
  it("creates all seven docs and the scenarios dir under products/<id>-<slug>", () => {
    const files = planProduct({ id: "P17", slug: "fairteams", profiles: ["CLIENT"], dryRun: false }, "2026-11-12");
    expect(files.map((f) => f.path)).toEqual([
      ...DOC_FILES.map((d) => `products/p17-fairteams/docs/${d}`),
      "products/p17-fairteams/scenarios/.gitkeep",
    ]);
    const status = files.find((f) => f.path.endsWith("STATUS.md"));
    expect(status?.content).toContain("Status: NOT_STARTED");
    expect(status?.content).toContain("Updated: 2026-11-12");
  });
});
