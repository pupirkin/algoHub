import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createApiClient, errorCode } from "./index";
import { GENERATED_PATH, renderSchemaTypes } from "./render";

describe("generated types", () => {
  it("match the committed OpenAPI snapshot (run `just openapi` after an API change)", async () => {
    expect(readFileSync(GENERATED_PATH, "utf8")).toBe(await renderSchemaTypes());
  });

  it("cover the P15 endpoints", () => {
    const text = readFileSync(GENERATED_PATH, "utf8");
    for (const p of ["/api/v1/p15/rooms", "/api/v1/p15/rooms/{room_id}/ballot", "/api/v1/p15/rooms/{room_id}/result"]) {
      expect(text).toContain(`"${p}"`);
    }
  });
});

describe("createApiClient", () => {
  it("joins base URL and path, sends JSON and parses the response", async () => {
    const seen: Request[] = [];
    const client = createApiClient({
      baseUrl: "http://api.test/",
      fetch: async (req) => {
        seen.push(req as Request);
        return new Response(JSON.stringify({ status: "accepted" }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      },
    });
    const res = await client.POST("/api/v1/platform/waitlist", { body: { product_id: "P15", email: "a@b.co" } });
    expect(res.response.status).toBe(202);
    expect(res.data).toEqual({ status: "accepted" });
    expect(seen[0]?.url).toBe("http://api.test/api/v1/platform/waitlist");
    expect(seen[0]?.signal).toBeDefined();
  });

  it("exposes the error envelope on non-2xx", async () => {
    const client = createApiClient({
      baseUrl: "http://api.test",
      fetch: async () =>
        new Response(JSON.stringify({ error: { code: "room_closed", message: "x", request_id: "r" } }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
    });
    const res = await client.GET("/api/v1/p15/rooms/{room_id}", { params: { path: { room_id: "x" } } });
    expect(res.data).toBeUndefined();
    expect(errorCode(res.error)).toBe("room_closed");
  });

  it("errorCode tolerates garbage", () => {
    expect(errorCode(null)).toBeUndefined();
    expect(errorCode("x")).toBeUndefined();
    expect(errorCode({ error: { code: 3 } })).toBeUndefined();
  });
});
