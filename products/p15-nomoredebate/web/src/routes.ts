/** Routes of P15 under the portal's `/p/nomoredebate/[[...path]]` (pure: safe for server and client). */
export const BASE_PATH = "/p/nomoredebate";

export type Route =
  | { readonly screen: "create" }
  | { readonly screen: "room"; readonly roomId: string }
  | { readonly screen: "organizer"; readonly roomId: string }
  | { readonly screen: "result"; readonly roomId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Maps the catch-all segments to a screen; anything else is null (the portal answers 404). */
export function matchRoute(path: readonly string[]): Route | null {
  if (path.length === 0) return { screen: "create" };
  const [r, roomId, sub, ...rest] = path;
  if (r !== "r" || roomId === undefined || !UUID.test(roomId) || rest.length > 0) return null;
  if (sub === undefined) return { screen: "room", roomId };
  if (sub === "admin") return { screen: "organizer", roomId };
  if (sub === "result") return { screen: "result", roomId };
  return null;
}

export const paths = {
  create: () => BASE_PATH,
  room: (roomId: string) => `${BASE_PATH}/r/${roomId}`,
  organizer: (roomId: string) => `${BASE_PATH}/r/${roomId}/admin`,
  result: (roomId: string) => `${BASE_PATH}/r/${roomId}/result`,
};
