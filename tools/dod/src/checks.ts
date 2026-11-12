import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type Outcome = "PASS" | "FAIL" | "NOT_RUN";
export interface CheckResult {
  readonly name: string;
  readonly outcome: Outcome;
  readonly detail: string;
}

export const REQUIRED_DOCS = [
  "README.md",
  "PRD.md",
  "ARCHITECTURE.md",
  "VALIDATION.md",
  "STATUS.md",
  "DECISIONS.md",
  "CHANGELOG.md",
] as const;

const pass = (name: string, detail: string): CheckResult => ({ name, outcome: "PASS", detail });
const fail = (name: string, detail: string): CheckResult => ({ name, outcome: "FAIL", detail });
const notRun = (name: string, detail: string): CheckResult => ({ name, outcome: "NOT_RUN", detail });

/** Finds `products/<id>-<slug>` for an id like "P15" (case-insensitive). */
export function findProductDir(root: string, id: string): string | undefined {
  const productsDir = join(root, "products");
  if (!existsSync(productsDir)) return undefined;
  const prefix = `${id.toLowerCase()}-`;
  const match = readdirSync(productsDir).find(
    (d) => d.startsWith(prefix) && statSync(join(productsDir, d)).isDirectory(),
  );
  return match === undefined ? undefined : join(productsDir, match);
}

export function checkDocs(productDir: string): CheckResult {
  const missing = REQUIRED_DOCS.filter((d) => !existsSync(join(productDir, "docs", d)));
  return missing.length === 0
    ? pass("docs", `${REQUIRED_DOCS.length}/${REQUIRED_DOCS.length} present`)
    : fail("docs", `missing: ${missing.join(", ")}`);
}

export function checkScenarios(productDir: string, minimum = 3): CheckResult {
  const dir = join(productDir, "scenarios");
  if (!existsSync(dir)) return fail("golden scenarios", "scenarios/ missing");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const invalid: string[] = [];
  for (const f of files) {
    try {
      const data = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>;
      if (typeof data.name !== "string" || !("input" in data) || !("expected" in data)) invalid.push(f);
    } catch {
      invalid.push(f);
    }
  }
  if (invalid.length > 0) return fail("golden scenarios", `invalid (need name/input/expected): ${invalid.join(", ")}`);
  return files.length >= minimum
    ? pass("golden scenarios", `${files.length} valid`)
    : fail("golden scenarios", `${files.length} < ${minimum}`);
}

export function checkStatusDoc(productDir: string, todayIso: string, maxAgeDays = 14): CheckResult {
  const path = join(productDir, "docs", "STATUS.md");
  if (!existsSync(path)) return fail("STATUS.md fresh", "missing");
  const m = /^Updated:\s*(\d{4}-\d{2}-\d{2})/m.exec(readFileSync(path, "utf8"));
  if (m?.[1] === undefined) return fail("STATUS.md fresh", "no `Updated: YYYY-MM-DD` line");
  const ageDays = (Date.parse(todayIso) - Date.parse(m[1])) / 86_400_000;
  return ageDays <= maxAgeDays
    ? pass("STATUS.md fresh", `updated ${m[1]}`)
    : fail("STATUS.md fresh", `updated ${m[1]} (${Math.round(ageDays)} days ago > ${maxAgeDays})`);
}

export function checkRegistry(registrySource: string, id: string): CheckResult {
  return registrySource.includes(`id: "${id.toUpperCase()}"`)
    ? pass("registry entry", `${id.toUpperCase()} present in registry.ts`)
    : fail("registry entry", `${id.toUpperCase()} missing in registry.ts`);
}

export function checkEnvExample(root: string): CheckResult {
  return existsSync(join(root, ".env.example"))
    ? pass(".env.example", "present at repo root")
    : fail(".env.example", "missing at repo root");
}

/**
 * Checks that need to run toolchains (lint/typecheck/tests/contract/e2e/axe). In the Phase 0 skeleton
 * they are reported honestly as NOT_RUN; Phase 2 (P15) wires them to `just test <ID>` / `just e2e <ID>`.
 */
export const PENDING_EXECUTION_CHECKS = [
  "lint + typecheck",
  "unit + property tests",
  "algorithm tests (oracle/props/golden/budget)",
  "contract snapshot current",
  "integration with real Postgres",
  "Playwright happy path vs compose",
  "axe on happy-path screens",
] as const;

export function pendingExecutionChecks(): CheckResult[] {
  return PENDING_EXECUTION_CHECKS.map((n) => notRun(n, "not wired yet (dod skeleton, Phase 0)"));
}

export type Verdict = "GREEN" | "RED" | "INCOMPLETE";

export function verdict(results: readonly CheckResult[]): Verdict {
  if (results.some((r) => r.outcome === "FAIL")) return "RED";
  if (results.some((r) => r.outcome === "NOT_RUN")) return "INCOMPLETE";
  return "GREEN";
}

const ICON: Record<Outcome, string> = { PASS: "✅", FAIL: "❌", NOT_RUN: "⏸ NOT RUN" };

export function renderTable(id: string, results: readonly CheckResult[]): string {
  const lines = [`DoD report for ${id.toUpperCase()}`, "", "| Check | Result | Detail |", "|---|---|---|"];
  for (const r of results) lines.push(`| ${r.name} | ${ICON[r.outcome]} | ${r.detail} |`);
  lines.push("", `Verdict: ${verdict(results)} (MVP_READY may be set only when GREEN)`);
  return lines.join("\n");
}
