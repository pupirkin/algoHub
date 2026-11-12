import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { products } from "../../../apps/portal-web/src/registry.ts";
import { renderIndex } from "./render.ts";

const target = fileURLToPath(new URL("../../../PROJECT_INDEX.md", import.meta.url));
const next = renderIndex(products);
const check = process.argv.includes("--check");

let current = "";
try {
  current = readFileSync(target, "utf8");
} catch {
  current = "";
}

if (check) {
  if (current !== next) {
    console.error("PROJECT_INDEX.md is out of date with registry.ts — run `just index`.");
    process.exit(1);
  }
  console.log("PROJECT_INDEX.md is up to date.");
} else {
  writeFileSync(target, next);
  console.log(`PROJECT_INDEX.md written (${products.length} products).`);
}
