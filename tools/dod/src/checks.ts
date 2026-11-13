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

export const ALGORITHM_TEST_KINDS = ["oracle", "props", "golden", "budget"] as const;

function listFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * TESTING_STRATEGY §2: every algorithm has oracle, property, golden and budget tests (`test_*_<kind>.py|ts`).
 * Golden tests must live in the product (they read its scenarios); the other kinds may live with a shared kernel
 * in python/algorithms/tests.
 */
export function checkAlgorithmTests(root: string, productDir: string): CheckResult {
  const name = "algorithm tests present (oracle/props/golden/budget)";
  const re = (kind: string) => new RegExp(`(^|/)test_[a-z0-9_]+_${kind}\\.(py|ts)$`);
  const product = listFiles(productDir);
  const shared = listFiles(join(root, "python", "algorithms", "tests"));
  const missing = ALGORITHM_TEST_KINDS.filter((kind) => {
    const pool = kind === "golden" ? product : [...product, ...shared];
    return !pool.some((f) => re(kind).test(f.replaceAll("\\", "/")));
  });
  return missing.length === 0
    ? pass(name, ALGORITHM_TEST_KINDS.join(", ") + " found")
    : fail(name, `missing: ${missing.join(", ")}`);
}

/** registry.ts status must equal the `Status:` line of the product's STATUS.md (ARCHITECTURE_PLAN §10 drift). */
export function checkStatusConsistency(registrySource: string, id: string, productDir: string): CheckResult {
  const name = "status: registry.ts == STATUS.md";
  const block = new RegExp(`id: "${id.toUpperCase()}"[\\s\\S]*?status: "([A-Z_]+)"`).exec(registrySource);
  const path = join(productDir, "docs", "STATUS.md");
  const doc = existsSync(path) ? /^Status:\s*([A-Z_]+)/m.exec(readFileSync(path, "utf8")) : null;
  if (block?.[1] === undefined || doc?.[1] === undefined)
    return fail(name, "status not found in registry.ts or STATUS.md");
  return block[1] === doc[1] ? pass(name, block[1]) : fail(name, `registry ${block[1]} != STATUS.md ${doc[1]}`);
}

/** A check that runs commands from the repo root; `needsDocker` ones are NOT_RUN without a Docker daemon. */
export interface ExecCheck {
  readonly name: string;
  readonly commands: readonly (readonly string[])[];
  readonly needsDocker: boolean;
  /** Reuse another check's outcome instead of running anything (e.g. axe runs inside the e2e spec). */
  readonly sameAs?: string;
}

export function executionPlan(id: string): ExecCheck[] {
  const pid = id.toUpperCase();
  return [
    {
      name: "lint + typecheck",
      commands: [
        ["just", "lint"],
        ["just", "typecheck"],
      ],
      needsDocker: false,
    },
    { name: "unit + property tests (product)", commands: [["just", "test", pid]], needsDocker: false },
    {
      name: "algorithm suites (python/algorithms)",
      commands: [["uv", "run", "pytest", "python/algorithms", "-q"]],
      needsDocker: false,
    },
    {
      name: "contract snapshot + api-client current",
      commands: [
        ["uv", "run", "python", "-m", "algo_api.export_openapi", "--check"],
        ["pnpm", "--silent", "--filter", "@algohub/api-client", "exec", "tsx", "src/generate.ts", "--check"],
      ],
      needsDocker: false,
    },
    { name: "integration with real Postgres", commands: [["just", "test-int"]], needsDocker: true },
    { name: "Playwright happy path vs compose", commands: [["just", "e2e", pid]], needsDocker: true },
    {
      name: "axe on happy-path screens",
      commands: [],
      needsDocker: true,
      sameAs: "Playwright happy path vs compose",
    },
  ];
}

export function notRunWithoutDocker(check: ExecCheck): CheckResult {
  return notRun(check.name, "docker is not available — runs in CI (test-py / e2e-p15)");
}

export function commandOutcome(check: ExecCheck, exitCodes: readonly number[], seconds: number): CheckResult {
  const failed = exitCodes.findIndex((c) => c !== 0);
  if (failed === -1) return pass(check.name, `${check.commands.map((c) => c.join(" ")).join(" && ")} (${seconds}s)`);
  return fail(check.name, `\`${check.commands[failed]!.join(" ")}\` exited ${exitCodes[failed]}`);
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
