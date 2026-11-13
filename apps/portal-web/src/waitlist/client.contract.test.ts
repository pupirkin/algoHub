import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MAX_EMAIL_LENGTH, WAITLIST_PATH, type WaitlistRequest } from "./client";

/** Until @algohub/api-client is generated, this guards the hand-written client against the committed snapshot. */
interface Schema {
  properties: Record<string, { maxLength?: number }>;
  required: string[];
  additionalProperties?: boolean;
}
const spec = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../../services/algo-api/openapi.json", import.meta.url)), "utf8"),
) as {
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
  components: { schemas: Record<string, Schema> };
};

describe("waitlist client ↔ openapi.json", () => {
  it("path and status codes exist", () => {
    const op = spec.paths[WAITLIST_PATH]?.post;
    expect(op).toBeDefined();
    expect(Object.keys(op!.responses)).toEqual(expect.arrayContaining(["202", "422", "429"]));
  });

  it("request fields match exactly", () => {
    const schema = spec.components.schemas.WaitlistRequest!;
    const sample: WaitlistRequest = { product_id: "P15", email: "a@b.co" };
    expect(Object.keys(schema.properties).sort()).toEqual(Object.keys(sample).sort());
    expect(schema.required.sort()).toEqual(Object.keys(sample).sort());
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.email?.maxLength).toBe(MAX_EMAIL_LENGTH);
  });
});
