import { createApiClient, errorCode, type ApiClient, type Schemas } from "@algohub/api-client";
import { err, ok, type Result } from "@algohub/core";

export type Room = Schemas["RoomOut"];
export type RoomResult = Schemas["ResultOut"];
export type Participant = Schemas["ParticipantOut"];
export type Ballot = Schemas["BallotOut"];
export type Method = Schemas["RoomOut"]["method"];
export type CreateRoomBody = Schemas["CreateRoomRequest"];
export type CreatedRoom = Schemas["CreatedRoom"];
export type Joined = Schemas["Joined"];

/** What the UI needs to know about a failure: an HTTP status + machine code, or "no answer at all". */
export type ApiFailure =
  { readonly kind: "http"; readonly status: number; readonly code: string | undefined } | { readonly kind: "network" };

export type ApiResult<T> = Promise<Result<T, ApiFailure>>;

async function wrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<Result<T, ApiFailure>> {
  try {
    const { data, error, response } = await call;
    if (response.ok) return ok(data as T);
    return err({ kind: "http", status: response.status, code: errorCode(error) });
  } catch {
    return err({ kind: "network" });
  }
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** P15 calls over the generated client: every function returns a Result, never throws. */
export function createP15Api(baseUrl: string, fetchImpl?: typeof fetch) {
  const c: ApiClient = createApiClient(fetchImpl === undefined ? { baseUrl } : { baseUrl, fetch: fetchImpl });
  const room = (roomId: string) => ({ params: { path: { room_id: roomId } } });
  return {
    createRoom: (body: CreateRoomBody): ApiResult<CreatedRoom> => wrap(c.POST("/api/v1/p15/rooms", { body })),
    getRoom: (roomId: string): ApiResult<Room> => wrap(c.GET("/api/v1/p15/rooms/{room_id}", room(roomId))),
    join: (roomId: string, displayName: string): ApiResult<Joined> =>
      wrap(
        c.POST("/api/v1/p15/rooms/{room_id}/participants", {
          ...room(roomId),
          body: { display_name: displayName },
        }),
      ),
    myBallot: (roomId: string, token: string): ApiResult<Ballot> =>
      wrap(c.GET("/api/v1/p15/rooms/{room_id}/ballot", { ...room(roomId), headers: auth(token) })),
    vote: (roomId: string, token: string, ranking: number[]): ApiResult<Ballot> =>
      wrap(c.PUT("/api/v1/p15/rooms/{room_id}/ballot", { ...room(roomId), headers: auth(token), body: { ranking } })),
    participants: (roomId: string, token: string): ApiResult<Participant[]> =>
      wrap(c.GET("/api/v1/p15/rooms/{room_id}/participants", { ...room(roomId), headers: auth(token) })).then((r) =>
        r.ok ? ok(r.value.participants) : r,
      ),
    close: (roomId: string, token: string): ApiResult<RoomResult> =>
      wrap(c.POST("/api/v1/p15/rooms/{room_id}/close", { ...room(roomId), headers: auth(token) })),
    result: (roomId: string): ApiResult<RoomResult> => wrap(c.GET("/api/v1/p15/rooms/{room_id}/result", room(roomId))),
    deleteRoom: (roomId: string, token: string): ApiResult<undefined> =>
      wrap(c.DELETE("/api/v1/p15/rooms/{room_id}", { ...room(roomId), headers: auth(token) })).then((r) =>
        r.ok ? ok(undefined) : r,
      ),
  };
}

export type P15Api = ReturnType<typeof createP15Api>;

/** i18n key (under `p15.common`) for failures every screen handles the same way. */
export function commonErrorKey(f: ApiFailure): "notFound" | "rateLimited" | "unavailable" {
  if (f.kind === "http" && f.status === 404) return "notFound";
  if (f.kind === "http" && f.status === 429) return "rateLimited";
  return "unavailable";
}
