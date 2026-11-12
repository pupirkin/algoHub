export const dynamic = "force-dynamic";

/** Liveness of the portal process. Does not call algo-api (that is algo-api's own /readyz). */
export function GET(): Response {
  return Response.json({ status: "ok", service: "portal-web" }, { headers: { "Cache-Control": "no-store" } });
}
