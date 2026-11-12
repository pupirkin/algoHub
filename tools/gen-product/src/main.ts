import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, planProduct, productDir } from "./plan.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error);
  process.exit(2);
}
const args = parsed.value;
const dir = join(root, productDir(args));
if (existsSync(dir)) {
  console.error(`${productDir(args)} already exists — refusing to overwrite.`);
  process.exit(1);
}
const today = new Date().toISOString().slice(0, 10);
const files = planProduct(args, today);
for (const f of files) {
  if (args.dryRun) {
    console.log(`[dry-run] ${f.path}`);
    continue;
  }
  const abs = join(root, f.path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, f.content);
  console.log(`created ${f.path}`);
}
console.log(
  `\nNext: add ${args.id} to apps/portal-web/src/registry.ts if missing, run \`just index\`, fill docs/PRD.md and ≥3 scenarios.`,
);
