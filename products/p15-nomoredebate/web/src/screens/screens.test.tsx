import { err, ok } from "@algohub/core";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetStorageForTests, storage } from "../storage";
import { axeViolations, fakeApi, http, renderWith, result, room, ROOM_ID } from "../test-utils";
import { CreateRoom, validateDraft } from "./create-room";
import { OrganizerRoom } from "./organizer-room";
import { completeOrder, ParticipantRoom } from "./participant-room";
import { ResultView } from "./result-view";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetStorageForTests();
  window.location.hash = "";
});

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("validateDraft", () => {
  it.each([
    ["", ["a", "b"], "question"],
    ["Q", ["a"], "options"],
    ["Q", ["a", " A "], "options"],
    ["Q", ["a", "x".repeat(81)], "options"],
    ["Q", ["a", "", "b"], null],
    ["Q", ["Пицца", "Суши"], null],
  ])("(%j, %j) -> %s", (q, o, expected) => {
    expect(validateDraft(q, o)).toBe(expected);
  });
});

describe("CreateRoom", () => {
  function fill(question: string, options: string[]) {
    fireEvent.change(screen.getByLabelText("Вопрос"), { target: { value: question } });
    options.forEach((o, i) => {
      if (i >= 2) fireEvent.click(screen.getByRole("button", { name: "Добавить вариант" }));
      fireEvent.change(screen.getByLabelText(`Вариант ${i + 1}`), { target: { value: o } });
    });
  }

  it("creates the room, remembers the organizer token and opens the organizer page", async () => {
    const createRoom = vi.fn(() =>
      Promise.resolve(
        ok({
          room: room(),
          organizer_token: "organizer-token-123456",
          share_path: `/p/nomoredebate/r/${ROOM_ID}`,
          organizer_path: `/p/nomoredebate/r/${ROOM_ID}/admin`,
        }),
      ),
    );
    const { env, container } = renderWith(<CreateRoom />, { api: fakeApi({ createRoom }) });
    expect(await axeViolations(container)).toEqual([]);
    fill("  Что заказываем? ", ["Pizza", "Sushi", "Burgers"]);
    fireEvent.click(screen.getByLabelText("Как на выборах (выбывание)"));
    fireEvent.change(screen.getByLabelText("Закрыть автоматически"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("Сколько участников максимум"), { target: { value: "10" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Создать комнату" }));
    });
    expect(createRoom).toHaveBeenCalledWith({
      question: "Что заказываем?",
      options: ["Pizza", "Sushi", "Burgers"],
      method: "irv",
      deadline_minutes: 60,
      max_participants: 10,
    });
    expect(storage.organizerToken(ROOM_ID)).toBe("organizer-token-123456");
    expect(env.navigate).toHaveBeenCalledWith(`/p/nomoredebate/r/${ROOM_ID}/admin#t=organizer-token-123456`);
  });

  it("catches mistakes before calling the API and explains them", async () => {
    const createRoom = vi.fn();
    renderWith(<CreateRoom />, { api: fakeApi({ createRoom }) });
    fill("Q", ["Pizza", "pizza"]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Создать комнату" }));
    });
    expect(screen.getByRole("alert").textContent).toMatch(/разных непустых вариантов/);
    expect(createRoom).not.toHaveBeenCalled();
  });

  it("maps API failures to messages", async () => {
    const createRoom = vi.fn(() => Promise.resolve(err(http(429, "rate_limited"))));
    renderWith(<CreateRoom />, { api: fakeApi({ createRoom }) });
    fill("Q", ["A", "B"]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Создать комнату" }));
    });
    expect(screen.getByRole("alert").textContent).toMatch(/Слишком много запросов/);
  });

  it("adds up to 10 options and removes extra ones", () => {
    renderWith(<CreateRoom />);
    for (let i = 0; i < 8; i++) fireEvent.click(screen.getByRole("button", { name: "Добавить вариант" }));
    expect(screen.getByLabelText("Вариант 10")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Добавить вариант" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Удалить вариант 10" }));
    expect(screen.queryByLabelText("Вариант 10")).toBeNull();
  });
});

describe("ParticipantRoom", () => {
  it("shows loading, then asks for a name; joining stores the session and shows the ranking", async () => {
    const join = vi.fn(() =>
      Promise.resolve(ok({ participant_id: "p", participant_token: "participant-token-1234", display_name: "Ann" })),
    );
    const myBallot = vi.fn(() => Promise.resolve(ok({ display_name: "Ann", ranking: null, updated_at: null })));
    const { container } = renderWith(<ParticipantRoom roomId={ROOM_ID} />, { api: fakeApi({ join, myBallot }) });
    expect(screen.getByRole("status").textContent).toBe("Загружаем…");
    await settle();
    expect(screen.getByRole("heading", { name: "Что заказываем?" })).toBeDefined();
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.change(screen.getByLabelText("Ваше имя"), { target: { value: " Ann " } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Войти в комнату" }));
    });
    await settle();
    expect(join).toHaveBeenCalledWith(ROOM_ID, "Ann");
    expect(storage.participant(ROOM_ID)).toEqual({ token: "participant-token-1234", name: "Ann" });
    expect(screen.getByRole("heading", { name: "Расставьте варианты по порядку" })).toBeDefined();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("explains a taken name", async () => {
    const join = vi.fn(() => Promise.resolve(err(http(409, "name_taken"))));
    renderWith(<ParticipantRoom roomId={ROOM_ID} />, { api: fakeApi({ join }) });
    await settle();
    fireEvent.change(screen.getByLabelText("Ваше имя"), { target: { value: "Ann" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Войти в комнату" }));
    });
    expect(screen.getByRole("alert").textContent).toMatch(/имя уже занято/);
  });

  it("restores the saved ballot and submits the full order", async () => {
    storage.setParticipant(ROOM_ID, { token: "participant-token-1234", name: "Ann" });
    const myBallot = vi.fn(() =>
      Promise.resolve(ok({ display_name: "Ann", ranking: [2], updated_at: "2026-11-13T12:00:00Z" })),
    );
    const vote = vi.fn((_r: string, _t: string, ranking: number[]) =>
      Promise.resolve(ok({ display_name: "Ann", ranking, updated_at: "2026-11-13T12:01:00Z" })),
    );
    renderWith(<ParticipantRoom roomId={ROOM_ID} />, { api: fakeApi({ myBallot, vote }) });
    await settle();
    await settle();
    const labels = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(labels[0]).toContain("Burgers"); // server ballot [2] -> Burgers first, the rest after
    fireEvent.click(screen.getByRole("button", { name: "Опустить «Burgers»" }));
    expect(screen.getAllByRole("status").some((s) => s.textContent === "Есть несохранённые изменения.")).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Обновить голос" }));
    });
    expect(vote).toHaveBeenCalledWith(ROOM_ID, "participant-token-1234", [0, 2, 1]);
    expect(screen.getByText("Голос сохранён. Его можно изменить, пока голосование открыто.")).toBeDefined();
  });

  it("forgets a token the server no longer accepts and asks to join again", async () => {
    storage.setParticipant(ROOM_ID, { token: "stale-token-0000000000", name: "Ann" });
    const myBallot = vi.fn(() => Promise.resolve(err(http(403, "invalid_token"))));
    renderWith(<ParticipantRoom roomId={ROOM_ID} />, { api: fakeApi({ myBallot }) });
    await settle();
    await settle();
    expect(storage.participant(ROOM_ID)).toBeNull();
    expect(screen.getByLabelText("Ваше имя")).toBeDefined();
  });

  it("sends voters of a closed room to the result", async () => {
    const getRoom = vi.fn(() => Promise.resolve(ok(room({ status: "closed", closed_at: "2026-11-13T13:00:00Z" }))));
    renderWith(<ParticipantRoom roomId={ROOM_ID} />, { api: fakeApi({ getRoom }) });
    await settle();
    expect(screen.getByRole("link", { name: "Открыть результат" }).getAttribute("href")).toBe(
      `/p/nomoredebate/r/${ROOM_ID}/result`,
    );
  });

  it.each([
    [http(404, "room_not_found"), /Комната не найдена/],
    [{ kind: "network" } as const, /временно недоступен/],
  ])("shows an error state for %j", async (failure, text) => {
    const getRoom = vi.fn(() => Promise.resolve(err(failure)));
    renderWith(<ParticipantRoom roomId={ROOM_ID} />, { api: fakeApi({ getRoom }) });
    await settle();
    expect(screen.getByRole("alert").textContent).toMatch(text);
  });

  it("completeOrder puts listed options first", () => {
    expect(completeOrder([2], 3)).toEqual([2, 0, 1]);
    expect(completeOrder(null, 3)).toEqual([0, 1, 2]);
    expect(completeOrder([1, 9], 3)).toEqual([1, 0, 2]);
  });
});

describe("OrganizerRoom", () => {
  it("without the organizer link says so and shows nothing private", async () => {
    const participants = vi.fn();
    renderWith(<OrganizerRoom roomId={ROOM_ID} />, { api: fakeApi({ participants }) });
    await settle();
    expect(screen.getByRole("alert").textContent).toMatch(/страница организатора/);
    expect(participants).not.toHaveBeenCalled();
  });

  it("takes the token from #t=, lists who voted, closes after confirmation", async () => {
    window.location.hash = "#t=organizer-token-123456";
    const participants = vi.fn(() =>
      Promise.resolve(
        ok([
          { display_name: "Ann", has_voted: true, joined_at: "2026-11-13T12:00:00Z" },
          { display_name: "Bo", has_voted: false, joined_at: "2026-11-13T12:01:00Z" },
        ]),
      ),
    );
    const close = vi.fn(() => Promise.resolve(ok(result())));
    const { env, container } = renderWith(<OrganizerRoom roomId={ROOM_ID} />, {
      api: fakeApi({ participants, close }),
    });
    await settle();
    await settle();
    expect(storage.organizerToken(ROOM_ID)).toBe("organizer-token-123456");
    expect(screen.getByLabelText("Ссылка для участников")).toHaveProperty(
      "value",
      `http://portal.test/p/nomoredebate/r/${ROOM_ID}`,
    );
    expect(screen.getByText("✓ проголосовал(а)")).toBeDefined();
    expect(screen.getByText("ещё не голосовал(а)")).toBeDefined();
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Закрыть голосование" }));
    expect(close).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Да, закрыть" }));
    });
    expect(close).toHaveBeenCalledWith(ROOM_ID, "organizer-token-123456");
    expect(env.navigate).toHaveBeenCalledWith(`/p/nomoredebate/r/${ROOM_ID}/result`);
  });

  it("a token the server rejects is explained, not offered for retry", async () => {
    storage.setOrganizerToken(ROOM_ID, "stale-organizer-token-00");
    const participants = vi.fn(() => Promise.resolve(err(http(403, "invalid_token"))));
    renderWith(<OrganizerRoom roomId={ROOM_ID} />, { api: fakeApi({ participants }) });
    await settle();
    await settle();
    expect(screen.getByText(/страница организатора/)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Повторить" })).toBeNull();
  });

  it("deletes the room after confirmation and forgets the token", async () => {
    storage.setOrganizerToken(ROOM_ID, "organizer-token-123456");
    const deleteRoom = vi.fn(() => Promise.resolve(ok(undefined)));
    renderWith(<OrganizerRoom roomId={ROOM_ID} />, { api: fakeApi({ deleteRoom }) });
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Удалить комнату" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Да, удалить" }));
    });
    expect(deleteRoom).toHaveBeenCalledWith(ROOM_ID, "organizer-token-123456");
    expect(screen.getByText("Комната удалена.")).toBeDefined();
    expect(storage.organizerToken(ROOM_ID)).toBeNull();
  });
});

describe("ResultView", () => {
  it("waits while the room is open, then shows the result", async () => {
    const res = vi
      .fn()
      .mockResolvedValueOnce(err(http(404, "result_not_ready")))
      .mockResolvedValue(ok(result()));
    renderWith(<ResultView roomId={ROOM_ID} />, { api: fakeApi({ result: res }), pollMs: 20 });
    await settle();
    expect(screen.getByText(/Голосование ещё идёт/)).toBeDefined();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Победил вариант «Sushi»" })).toBeDefined());
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Что заказываем?");
  });

  it("a deleted room is not found, and polling stops", async () => {
    const res = vi.fn(() => Promise.resolve(err(http(404, "room_not_found"))));
    renderWith(<ResultView roomId={ROOM_ID} />, { api: fakeApi({ result: res }), pollMs: 10 });
    await settle();
    expect(screen.getByRole("alert").textContent).toMatch(/Комната не найдена/);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(res.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
