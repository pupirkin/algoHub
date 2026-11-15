import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { axeViolations, renderWith } from "../test-utils";
import { move, RankingEditor } from "./ranking-editor";

afterEach(cleanup);

const OPTIONS = [
  { id: 0, label: "Pizza" },
  { id: 1, label: "Sushi" },
  { id: 2, label: "Burgers" },
];

function Harness({ initial = [0, 1, 2] }: { initial?: number[] }) {
  const [order, setOrder] = useState(initial);
  return (
    <>
      <p id="help">help</p>
      <RankingEditor options={OPTIONS} order={order} onChange={setOrder} describedBy="help" />
      <output data-testid="order">{order.join(",")}</output>
    </>
  );
}

describe("move", () => {
  it("moves within bounds and ignores invalid moves", () => {
    expect(move([0, 1, 2], 0, 2)).toEqual([1, 2, 0]);
    expect(move([0, 1, 2], 2, 0)).toEqual([2, 0, 1]);
    expect(move([0, 1, 2], 0, -1)).toEqual([0, 1, 2]);
    expect(move([0, 1, 2], 3, 0)).toEqual([0, 1, 2]);
  });
});

describe("RankingEditor", () => {
  it("reorders with the ↑/↓ buttons and announces each move", async () => {
    renderWith(<Harness />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Опустить «Pizza»" }));
    });
    expect(screen.getByTestId("order").textContent).toBe("1,0,2");
    expect(screen.getByText("«Pizza» теперь на 2 месте")).toBeDefined();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Поднять «Burgers»" }));
    });
    expect(screen.getByTestId("order").textContent).toBe("1,2,0");
  });

  it("disables moves past the edges", () => {
    renderWith(<Harness />);
    expect(screen.getByRole("button", { name: "Поднять «Pizza»" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Опустить «Burgers»" })).toHaveProperty("disabled", true);
  });

  it("supports drag and drop", async () => {
    renderWith(<Harness />);
    const items = screen.getAllByRole("listitem");
    await act(async () => {
      fireEvent.dragStart(items[2]!);
    });
    await act(async () => {
      fireEvent.dragOver(items[0]!);
      fireEvent.drop(items[0]!);
    });
    expect(screen.getByTestId("order").textContent).toBe("2,0,1");
  });

  it("is an ordered list with no axe violations", async () => {
    const { container } = renderWith(<Harness />);
    expect(screen.getByRole("list").tagName).toBe("OL");
    expect(await axeViolations(container)).toEqual([]);
  });
});
