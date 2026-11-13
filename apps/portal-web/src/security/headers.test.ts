import { describe, expect, it } from "vitest";
import { buildCsp, createNonce, originOf, STATIC_SECURITY_HEADERS } from "./headers";

const directive = (csp: string, name: string): string | undefined =>
  csp
    .split("; ")
    .find((d) => d.startsWith(`${name} `))
    ?.slice(name.length + 1);

describe("buildCsp", () => {
  const prod = buildCsp({ nonce: "abc", connectOrigins: ["http://localhost:8000"], dev: false });

  it("allows scripts only by nonce in production (no unsafe-inline / unsafe-eval)", () => {
    expect(directive(prod, "script-src")).toBe("'self' 'nonce-abc' 'strict-dynamic'");
    expect(prod).not.toContain("unsafe-inline");
    expect(prod).not.toContain("unsafe-eval");
  });

  it("forbids framing, plugins and foreign form targets", () => {
    expect(directive(prod, "frame-ancestors")).toBe("'none'");
    expect(directive(prod, "object-src")).toBe("'none'");
    expect(directive(prod, "form-action")).toBe("'self'");
    expect(directive(prod, "base-uri")).toBe("'self'");
  });

  it("lets the browser reach the API origin only", () => {
    expect(directive(prod, "connect-src")).toBe("'self' http://localhost:8000");
  });

  it("relaxes only what the Next dev server needs", () => {
    const dev = buildCsp({ nonce: "abc", connectOrigins: [], dev: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws:");
  });
});

describe("helpers", () => {
  it("originOf strips paths and rejects garbage", () => {
    expect(originOf("http://localhost:8000/api")).toBe("http://localhost:8000");
    expect(originOf("not a url")).toBeNull();
    expect(originOf(undefined)).toBeNull();
  });

  it("nonces are unique base64 strings of 128 bits", () => {
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(a);
  });

  it("static headers include the TESTING_STRATEGY §6 set", () => {
    const keys = STATIC_SECURITY_HEADERS.map((h) => h.key);
    for (const k of ["Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy"]) {
      expect(keys).toContain(k);
    }
  });
});
