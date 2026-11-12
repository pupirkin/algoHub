import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages are shipped as TypeScript source (ARCHITECTURE_PLAN §10).
  transpilePackages: ["@algohub/ui", "@algohub/core"],
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Security headers (CSP with nonce, HSTS, …) are Phase 1 «Портал».
};

export default config;
