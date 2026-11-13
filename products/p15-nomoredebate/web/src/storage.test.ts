import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPermutation,
  parseParticipant,
  resetStorageForTests,
  storage,
  subscribeStorage,
  tokenFromFragment,
} from "./storage";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetStorageForTests();
});

describe("storage", () => {
  it("remembers tokens per room and notifies subscribers", () => {
    const seen = vi.fn();
    const unsubscribe = subscribeStorage(seen);
    storage.setOrganizerToken("a", "tok-a");
    storage.setParticipant("a", { token: "p", name: "Ann" });
    expect(storage.organizerToken("a")).toBe("tok-a");
    expect(storage.organizerToken("b")).toBeNull();
    expect(storage.participant("a")).toEqual({ token: "p", name: "Ann" });
    expect(seen).toHaveBeenCalledTimes(2);
    unsubscribe();
    storage.setOrganizerToken("a", null);
    expect(seen).toHaveBeenCalledTimes(2);
    expect(storage.organizerToken("a")).toBeNull();
  });

  it("keeps working in memory when localStorage throws (private mode)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    storage.setOrganizerToken("x", "tok");
    expect(storage.organizerToken("x")).toBe("tok");
  });

  it("drafts must be permutations of the room's options", () => {
    storage.setDraft("r", [2, 0, 1]);
    expect(storage.draft("r", 3)).toEqual([2, 0, 1]);
    expect(storage.draft("r", 4)).toBeNull();
    localStorage.setItem("p15:draft:r", "not json");
    expect(storage.draft("r", 3)).toBeNull();
  });

  it("parses participant sessions defensively", () => {
    expect(parseParticipant(null)).toBeNull();
    expect(parseParticipant("{")).toBeNull();
    expect(parseParticipant('{"token":1,"name":"x"}')).toBeNull();
    expect(parseParticipant('{"token":"t","name":"x"}')).toEqual({ token: "t", name: "x" });
  });

  it.each([
    [[0, 1, 2], 3, true],
    [[2, 0, 1], 3, true],
    [[0, 0, 1], 3, false],
    [[0, 1], 3, false],
    [[0, 1, 3], 3, false],
    [[0, 1.5, 2], 3, false],
    ["012", 3, false],
  ])("isPermutation(%j, %i) = %s", (v, n, expected) => {
    expect(isPermutation(v, n)).toBe(expected);
  });

  it("reads the organizer token from the fragment only", () => {
    expect(tokenFromFragment("#t=abcdefghijklmnopqrstuv")).toBe("abcdefghijklmnopqrstuv");
    expect(tokenFromFragment("#x=1&t=abcdefghijklmnopqrstuv")).toBe("abcdefghijklmnopqrstuv");
    expect(tokenFromFragment("#t=short")).toBeNull();
    expect(tokenFromFragment("#t=bad token with spaces")).toBeNull();
    expect(tokenFromFragment("")).toBeNull();
  });
});
