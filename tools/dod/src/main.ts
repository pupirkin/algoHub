import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkAlgorithmTests,
  checkDocs,
  checkEnvExample,
  checkRegistry,
  checkScenarios,
  checkStatusConsistency,
  checkStatusDoc,
  commandOutcome,
  executionPlan,
  findProductDir,
  notRunWithoutDocker,
  renderTable,
  verdict,
  type CheckResult,
} from "./checks.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const argv = process.argv.slice(2).filter((a) => a !== "--");
const id = argv.find((a) => !a.startsWith("--"));
const staticOnly = argv.includes("--static"); // file checks only (fast; used by tests and editors)
if (id === undefined || !/^p\d{2}$/i.test(id)) {
  console.error("usage: dod <ID> [--static]   e.g. just dod P15");
  process.exit(2);
}

const registrySource = readFileSync(join(root, "apps/portal-web/src/registry.ts"), "utf8");
const dir = findProductDir(root, id);
const results: CheckResult[] = [checkRegistry(registrySource, id), checkEnvExample(root)];
if (dir === undefined) {
  results.push({ name: "product directory", outcome: "FAIL", detail: `products/${id.toLowerCase()}-* not found` });
} else {
  const today = new Date().toISOString().slice(0, 10);
  results.push(
    checkDocs(dir),
    checkScenarios(dir),
    checkStatusDoc(dir, today),
    checkStatusConsistency(registrySource, id, dir),
    checkAlgorithmTests(root, dir),
  );
}

function dockerAvailable(): boolean {
  return spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
}

if (staticOnly) {
  results.push({ name: "execution checks", outcome: "NOT_RUN", detail: "--static: commands were not executed" });
} else {
  const docker = dockerAvailable();
  const byName = new Map<string, CheckResult>();
  for (const check of executionPlan(id)) {
    let result: CheckResult;
    if (check.sameAs !== undefined) {
      const base = byName.get(check.sameAs);
      result =
        base === undefined
          ? notRunWithoutDocker(check)
          : { name: check.name, outcome: base.outcome, detail: `asserted inside "${check.sameAs}" (${base.outcome})` };
    } else if (check.needsDocker && !docker) {
      result = notRunWithoutDocker(check);
    } else {
      const started = Date.now();
      const codes: number[] = [];
      for (const [cmd, ...args] of check.commands) {
        console.error(`dod: running ${[cmd, ...args].join(" ")}`);
        const run = spawnSync(cmd!, args, {
          cwd: root,
          stdio: ["ignore", "pipe", "pipe"],
          encoding: "utf8",
          maxBuffer: 256 * 1024 * 1024, // image builds are chatty; a full buffer must not look like a failure
        });
        codes.push(run.status ?? 1);
        if (run.status !== 0) {
          console.error(`${run.stdout ?? ""}${run.stderr ?? ""}`.split("\n").slice(-25).join("\n"));
          break;
        }
      }
      result = commandOutcome(check, codes, Math.round((Date.now() - started) / 1000));
    }
    byName.set(check.name, result);
    results.push(result);
  }
}

console.log(renderTable(id, results));
const v = verdict(results);
process.exit(v === "GREEN" ? 0 : v === "RED" ? 1 : 3);
