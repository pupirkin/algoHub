import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkDocs,
  checkRegistry,
  checkScenarios,
  checkStatusDoc,
  findProductDir,
  pendingExecutionChecks,
  REQUIRED_DOCS,
  renderTable,
  verdict,
} from "./checks.ts";

function fixture(): { root: string; dir: string } {
  const root = mkdtempSync(join(tmpdir(), "dod-"));
  const dir = join(root, "products", "p99-sample");
  mkdirSync(join(dir, "docs"), { recursive: true });
  mkdirSync(join(dir, "scenarios"), { recursive: true });
  return { root, dir };
}

describe("dod checks", () => {
  it("finds the product dir by id", () => {
    const { root, dir } = fixture();
    expect(findProductDir(root, "P99")).toBe(dir);
    expect(findProductDir(root, "P98")).toBeUndefined();
  });

  it("docs: fails listing missing files, passes when complete", () => {
    const { dir } = fixture();
    expect(checkDocs(dir)).toMatchObject({ outcome: "FAIL" });
    for (const d of REQUIRED_DOCS) writeFileSync(join(dir, "docs", d), "x");
    expect(checkDocs(dir)).toMatchObject({ outcome: "PASS" });
  });

  it("scenarios: requires ≥3 valid files and rejects malformed ones", () => {
    const { dir } = fixture();
    const s = (n: string) => JSON.stringify({ name: n, input: {}, expected: {} });
    writeFileSync(join(dir, "scenarios", "a.json"), s("a"));
    writeFileSync(join(dir, "scenarios", "b.json"), s("b"));
    expect(checkScenarios(dir)).toMatchObject({ outcome: "FAIL", detail: "2 < 3" });
    writeFileSync(join(dir, "scenarios", "c.json"), s("c"));
    expect(checkScenarios(dir)).toMatchObject({ outcome: "PASS" });
    writeFileSync(join(dir, "scenarios", "d.json"), "{not json");
    expect(checkScenarios(dir).outcome).toBe("FAIL");
  });

  it("STATUS.md must be updated within 14 days", () => {
    const { dir } = fixture();
    writeFileSync(join(dir, "docs", "STATUS.md"), "Status: IN_PROGRESS\nUpdated: 2026-11-01\n");
    expect(checkStatusDoc(dir, "2026-11-12").outcome).toBe("PASS");
    expect(checkStatusDoc(dir, "2026-12-12").outcome).toBe("FAIL");
  });

  it("registry check is exact on id", () => {
    expect(checkRegistry('{ id: "P15", slug: "x" }', "p15").outcome).toBe("PASS");
    expect(checkRegistry('{ id: "P15", slug: "x" }', "P1").outcome).toBe("FAIL");
  });

  it("verdict: NOT_RUN never yields GREEN", () => {
    const passing = [{ name: "a", outcome: "PASS" as const, detail: "" }];
    expect(verdict(passing)).toBe("GREEN");
    expect(verdict([...passing, ...pendingExecutionChecks()])).toBe("INCOMPLETE");
    expect(verdict([...passing, { name: "b", outcome: "FAIL", detail: "" }])).toBe("RED");
    expect(renderTable("p15", passing)).toContain("Verdict: GREEN");
  });
});
