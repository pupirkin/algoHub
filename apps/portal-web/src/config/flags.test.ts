import { describe, expect, it } from "vitest";
import { isPreviewEnabled, parseFlags } from "./flags";

describe("feature flags", () => {
  it("parses a comma list, ignoring blanks and spaces", () => {
    expect([...parseFlags(" preview:P15 , ,preview:P31")]).toEqual(["preview:P15", "preview:P31"]);
    expect(parseFlags(undefined).size).toBe(0);
  });

  it("preview is opt-in per product id", () => {
    expect(isPreviewEnabled("P15", "preview:P15")).toBe(true);
    expect(isPreviewEnabled("P15", "preview:P1")).toBe(false);
    expect(isPreviewEnabled("P15", "P15")).toBe(false);
    expect(isPreviewEnabled("P15", "")).toBe(false);
  });
});
