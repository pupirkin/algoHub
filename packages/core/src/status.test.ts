import { describe, expect, it } from "vitest";
import { DOD_GATED_STATUSES, isProductProfile, isProductStatus, PRODUCT_STATUSES } from "./status";

describe("status vocabulary", () => {
  it("has the eight statuses from CLAUDE.md in order", () => {
    expect(PRODUCT_STATUSES).toEqual([
      "NOT_STARTED",
      "DISCOVERY",
      "DESIGNED",
      "IN_PROGRESS",
      "MVP_READY",
      "VALIDATING",
      "LIVE",
      "BLOCKED",
    ]);
  });

  it("gates MVP_READY and LIVE behind dod", () => {
    expect(DOD_GATED_STATUSES).toEqual(["MVP_READY", "LIVE"]);
  });

  it("guards", () => {
    expect(isProductStatus("LIVE")).toBe(true);
    expect(isProductStatus("live")).toBe(false);
    expect(isProductProfile("SOLVER")).toBe(true);
    expect(isProductProfile("SERVER")).toBe(false);
  });
});
