import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, createNonce, originOf } from "./src/security/headers";

/**
 * Per-request Content-Security-Policy with a nonce. Next.js reads the nonce from the request's CSP header and
 * stamps it on its own inline scripts (pages are dynamic — see app/layout.tsx).
 */
export function middleware(request: NextRequest) {
  const nonce = createNonce();
  const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_BASE_URL);
  const csp = buildCsp({
    nonce,
    connectOrigins: apiOrigin === null ? [] : [apiOrigin],
    dev: process.env.NODE_ENV === "development",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api/|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
