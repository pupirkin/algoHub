import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { axeViolations, renderWith, result } from "../test-utils";
import { ResultExplanation } from "./result-explanation";

afterEach(cleanup);

describe("ResultExplanation", () => {
  it("names the winner and explains why, with scores and duels", async () => {
    const { container } = renderWith(<ResultExplanation result={result()} />);
    expect(screen.getByRole("heading", { name: "Победил вариант «Sushi»" })).toBeDefined();
    expect(screen.getByText(/«Sushi» выигрывает у каждого другого варианта/)).toBeDefined();
    expect(screen.getByRole("table", { name: "Баллы за места" })).toBeDefined();
    expect(screen.getByRole("table", { name: "Парные сравнения" })).toBeDefined();
    const firstScoreRow = screen.getAllByRole("row")[1]!;
    expect(firstScoreRow.textContent).toBe("Sushi4"); // sorted by points
    expect(screen.getByText(/В маленьких комнатах/)).toBeDefined();
    expect(screen.getByText(/Посчитано по голосам участников/)).toBeDefined();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("shows a tie honestly, with the seeded pick", () => {
    renderWith(
      <ResultExplanation
        result={result({
          outcome: "tie",
          winner_option_id: null,
          tied_option_ids: [0, 1, 2],
          tiebreak_option_id: 2,
          chosen_option_id: 2,
          decided_by: "borda",
          condorcet_winner_option_id: null,
          borda_points: [3, 3, 3],
          reasons: [
            { code: "no_condorcet_winner", option_ids: [], value: null, round: null },
            { code: "borda_top", option_ids: [0, 1, 2], value: 3, round: null },
            { code: "tie", option_ids: [0, 1, 2], value: null, round: null },
            { code: "tiebreak", option_ids: [2], value: null, round: null },
          ],
        })}
      />,
    );
    expect(screen.getByRole("heading", { name: "Ничья: «Pizza», «Sushi», «Burgers»" })).toBeDefined();
    expect(screen.getByText(/Жребий .* выбрал «Burgers»/)).toBeDefined();
    expect(screen.getByText("Из равных выбран «Burgers» жребием.")).toBeDefined();
  });

  it("explains IRV rounds and minimax regret", () => {
    renderWith(
      <ResultExplanation
        result={result({
          method: "irv",
          decided_by: "irv",
          winner_option_id: 2,
          chosen_option_id: 2,
          irv_rounds: [
            { votes: { "0": 4, "1": 2, "2": 3 }, exhausted: 1, eliminated: 1 },
            { votes: { "0": 4, "2": 5 }, exhausted: 0, eliminated: null },
          ],
          reasons: [{ code: "irv_majority", option_ids: [2], value: 5, round: 2 }],
        })}
      />,
    );
    expect(
      screen.getByText("В раунде 2 у «Burgers» 5 первых мест — больше половины оставшихся голосов."),
    ).toBeDefined();
    expect(screen.getByText("Выбывает «Sushi»")).toBeDefined();
    expect(screen.getByText("Бюллетеней без оставшихся вариантов: 1")).toBeDefined();
    cleanup();
    renderWith(
      <ResultExplanation
        result={result({
          method: "minimax_regret",
          decided_by: "minimax_regret",
          regrets: [
            { option_id: 0, max_regret: 2, total_regret: 3 },
            { option_id: 1, max_regret: 1, total_regret: 2 },
            { option_id: 2, max_regret: 2, total_regret: 4 },
          ],
          reasons: [{ code: "minimax_regret_top", option_ids: [1], value: 1, round: null }],
        })}
      />,
    );
    expect(screen.getByText("У «Sushi» худшее место у любого участника — не ниже 2.")).toBeDefined();
  });

  it("says plainly that nobody voted, without tables", () => {
    renderWith(
      <ResultExplanation
        result={result({
          outcome: "no_ballots",
          winner_option_id: null,
          chosen_option_id: null,
          ballot_count: 0,
          reasons: [{ code: "no_ballots", option_ids: [], value: null, round: null }],
        })}
      />,
    );
    expect(screen.getByRole("heading", { name: "Никто не проголосовал — победителя нет." })).toBeDefined();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
