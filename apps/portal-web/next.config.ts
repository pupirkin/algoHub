import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { STATIC_SECURITY_HEADERS } from "./src/security/headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const config: NextConfig = {
  // Workspace packages are shipped as TypeScript source (ARCHITECTURE_PLAN §10).
  transpilePackages: ["@algohub/ui", "@algohub/core", "@algohub/api-client", "@algohub/p15"],
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Static security headers for every route; the per-request CSP (nonce) is set in middleware.ts.
  async headers() {
    return [{ source: "/:path*", headers: [...STATIC_SECURITY_HEADERS] }];
  },
};

export default withNextIntl(config);
