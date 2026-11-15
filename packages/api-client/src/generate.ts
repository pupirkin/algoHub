import { readFileSync, writeFileSync } from "node:fs";
import { GENERATED_PATH, renderSchemaTypes } from "./render";

const text = await renderSchemaTypes();
if (process.argv.includes("--check")) {
  const current = readFileSync(GENERATED_PATH, "utf8");
  if (current !== text) {
    console.error("packages/api-client/src/schema.gen.ts is stale — run `just openapi` and commit it.");
    process.exit(1);
  }
  console.log("schema.gen.ts is up to date.");
} else {
  writeFileSync(GENERATED_PATH, text);
  console.log(`wrote ${GENERATED_PATH}`);
}
