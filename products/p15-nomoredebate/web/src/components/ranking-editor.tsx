"use client";

import { Button, cn } from "@algohub/ui";
import { useT } from "../i18n";
import { useRef, useState, type DragEvent } from "react";

export interface RankingOption {
  readonly id: number;
  readonly label: string;
}

export interface RankingEditorProps {
  readonly options: readonly RankingOption[];
  /** Option ids, most preferred first (always a permutation of all options). */
  readonly order: readonly number[];
  readonly onChange: (order: number[]) => void;
  readonly disabled?: boolean;
  /** Id of the element that explains how to rank (instructions). */
  readonly describedBy?: string;
}

export function move(order: readonly number[], from: number, to: number): number[] {
  const next = [...order];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

/**
 * Drag-and-drop ranking with an accessible fallback: every row has ↑/↓ buttons, focus follows the moved row,
 * and each move is announced in a polite live region. (HTML5 drag does not work on touch screens — the buttons
 * do, so mobile users are never stuck.)
 */
export function RankingEditor({ options, order, onChange, disabled = false, describedBy }: RankingEditorProps) {
  const t = useT("vote");
  const [announcement, setAnnouncement] = useState("");
  const [dragging, setDragging] = useState<number | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement | null>());
  const label = (id: number) => options.find((o) => o.id === id)?.label ?? String(id);

  function apply(from: number, to: number, focus?: "up" | "down") {
    const next = move(order, from, to);
    const id = order[from];
    if (id === undefined) return;
    onChange(next);
    setAnnouncement(t("moved", { label: label(id), n: to + 1 }));
    if (focus !== undefined) {
      // At the edges the pressed button disappears into disabled state: keep focus on the row's other button.
      const atEdge = (focus === "up" && to === 0) || (focus === "down" && to === next.length - 1);
      const target = atEdge ? (focus === "up" ? "down" : "up") : focus;
      requestAnimationFrame(() => buttons.current.get(`${id}:${target}`)?.focus());
    }
  }

  function onDrop(e: DragEvent<HTMLLIElement>, to: number) {
    e.preventDefault();
    if (dragging !== null) apply(dragging, to);
    setDragging(null);
  }

  return (
    <div>
      <ol className="flex flex-col gap-2" aria-describedby={describedBy}>
        {order.map((id, i) => (
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- drag is a pointer enhancement; the ↑/↓ buttons in every row are the keyboard and touch path
          <li
            key={id}
            draggable={!disabled}
            onDragStart={() => setDragging(i)}
            onDragEnd={() => setDragging(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, i)}
            className={cn(
              "flex items-center gap-3 rounded-md border border-border bg-background p-2",
              !disabled && "cursor-grab active:cursor-grabbing",
              dragging === i && "opacity-50",
            )}
          >
            <span className="w-16 shrink-0 text-sm text-muted-foreground">{t("position", { n: i + 1 })}</span>
            <span className="min-w-0 flex-1 break-words font-medium">{label(id)}</span>
            <Button
              ref={(el) => {
                buttons.current.set(`${id}:up`, el);
              }}
              variant="outline"
              size="sm"
              aria-label={t("moveUp", { label: label(id) })}
              disabled={disabled || i === 0}
              onClick={() => apply(i, i - 1, "up")}
            >
              <span aria-hidden="true">↑</span>
            </Button>
            <Button
              ref={(el) => {
                buttons.current.set(`${id}:down`, el);
              }}
              variant="outline"
              size="sm"
              aria-label={t("moveDown", { label: label(id) })}
              disabled={disabled || i === order.length - 1}
              onClick={() => apply(i, i + 1, "down")}
            >
              <span aria-hidden="true">↓</span>
            </Button>
          </li>
        ))}
      </ol>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
