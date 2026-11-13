import { describe, expect, it } from "vitest";
import { matchRoute, paths } from "./routes";

const ID = "11111111-2222-4333-8444-555555555555";

describe("matchRoute", () => {
  it.each([
    [[], { screen: "create" }],
    [["r", ID], { screen: "room", roomId: ID }],
    [["r", ID, "admin"], { screen: "organizer", roomId: ID }],
    [["r", ID, "result"], { screen: "result", roomId: ID }],
  ])("%j -> screen", (path, route) => {
    expect(matchRoute(path)).toEqual(route);
  });

  it.each([[["r"]], [["r", "not-a-uuid"]], [["room", ID]], [["r", ID, "other"]], [["r", ID, "admin", "x"]], [["x"]]])(
    "%j -> null (portal answers 404)",
    (path) => {
      expect(matchRoute(path)).toBeNull();
    },
  );

  it("builds paths that round-trip", () => {
    for (const p of [paths.room(ID), paths.organizer(ID), paths.result(ID)]) {
      const segments = p.replace("/p/nomoredebate/", "").split("/");
      expect(matchRoute(segments)).not.toBeNull();
    }
    expect(paths.create()).toBe("/p/nomoredebate");
  });
});
