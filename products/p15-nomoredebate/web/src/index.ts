/**
 * @algohub/p15 — NoMoreDebate web (profile ROOM). The portal imports this module only from
 * `apps/portal-web/src/registry.ts` (`load: () => import("@algohub/p15")`).
 */
export { P15App as default, P15App, type P15AppProps } from "./app";
export { BASE_PATH, matchRoute, paths, type Route } from "./routes";
