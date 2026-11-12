import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkDocs,
  checkEnvExample,
  checkRegistry,
  checkScenarios,
  checkStatusDoc,
  findProductDir,
  pendingExecutionChecks,
  renderTable,
  verdict,
  type CheckResult,
} from "./checks.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const id = process.argv.slice(2).find((a) => a !== "--");
if (id === undefined || !/^p\d{2}$/i.test(id)) {
  console.error("usage: dod <ID>   e.g. just dod P15");
  process.exit(2);
}

const registrySource = readFileSync(join(root, "apps/portal-web/src/registry.ts"), "utf8");
const dir = findProductDir(root, id);
const results: CheckResult[] = [checkRegistry(registrySource, id), checkEnvExample(root)];
if (dir === undefined) {
  results.push({ name: "product directory", outcome: "FAIL", detail: `products/${id.toLowerCase()}-* not found` });
} else {
  const today = new Date().toISOString().slice(0, 10);
  results.push(checkDocs(dir), checkScenarios(dir), checkStatusDoc(dir, today));
}
results.push(...pendingExecutionChecks());

console.log(renderTable(id, results));
const v = verdict(results);
process.exit(v === "GREEN" ? 0 : v === "RED" ? 1 : 3);
