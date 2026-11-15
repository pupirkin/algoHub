"use client";

import { useFormatter } from "next-intl";
import { useT } from "../i18n";
import type { RoomResult } from "../api";

type Reason = RoomResult["reasons"][number];

export function ResultExplanation({ result }: { result: RoomResult }) {
  const t = useT("result");
  const tm = useT("method");
  const format = useFormatter();
  const labels = new Map(result.options.map((o) => [o.id, o.label]));
  const label = (id: number | null | undefined) => (id === null || id === undefined ? "" : (labels.get(id) ?? ""));
  const list = (ids: readonly number[]) => ids.map((id) => `«${label(id)}»`).join(", ");

  function reasonText(r: Reason): string {
    const first = r.option_ids[0];
    switch (r.code) {
      case "condorcet_winner":
      case "tiebreak":
        return t(`reasons.${r.code}`, { label: label(first) });
      case "borda_top":
        return t("reasons.borda_top", { labels: list(r.option_ids), value: format.number(r.value ?? 0) });
      case "irv_majority":
        return t("reasons.irv_majority", { label: label(first), value: r.value ?? 0, round: r.round ?? 0 });
      case "irv_tie":
        return t("reasons.irv_tie", { labels: list(r.option_ids), round: r.round ?? 0 });
      case "minimax_regret_top":
        return t("reasons.minimax_regret_top", { labels: list(r.option_ids), place: (r.value ?? 0) + 1 });
      case "tie":
        return t("reasons.tie", { labels: list(r.option_ids) });
      default:
        return t(`reasons.${r.code}`);
    }
  }

  const byPoints = [...result.options].sort(
    (a, b) => (result.borda_points[b.id] ?? 0) - (result.borda_points[a.id] ?? 0) || a.id - b.id,
  );

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="p15-outcome" className="rounded-md border border-border bg-muted p-4">
        <h2 id="p15-outcome" className="text-2xl font-bold">
          {result.outcome === "winner"
            ? t("winner", { label: label(result.winner_option_id) })
            : result.outcome === "tie"
              ? t("tie", { labels: list(result.tied_option_ids) })
              : t("noBallots")}
        </h2>
        {result.outcome === "tie" ? (
          <p className="mt-2">{t("tiebreak", { label: label(result.tiebreak_option_id) })}</p>
        ) : null}
        <p className="mt-2 text-sm text-muted-foreground">
          {t("method", { method: tm(result.method) })} · {t("ballots", { count: result.ballot_count })}
        </p>
      </section>

      <section aria-labelledby="p15-why">
        <h2 id="p15-why" className="text-xl font-semibold">
          {t("why")}
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {result.reasons.map((r, i) => (
            <li key={`${r.code}-${i}`}>{reasonText(r)}</li>
          ))}
        </ul>
      </section>

      {result.ballot_count > 0 ? (
        <>
          <section aria-labelledby="p15-scores">
            <h2 id="p15-scores" className="text-xl font-semibold">
              {t("scoresHeading")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("scoresHelp")}</p>
            <table aria-labelledby="p15-scores" className="mt-2 w-full max-w-md text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className="py-1 pr-4">
                    {t("option")}
                  </th>
                  <th scope="col" className="py-1 text-right">
                    {t("points")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {byPoints.map((o) => (
                  <tr key={o.id} className="border-t border-border">
                    <th scope="row" className="py-1 pr-4 font-normal">
                      {o.label}
                    </th>
                    <td className="py-1 text-right tabular-nums">{format.number(result.borda_points[o.id] ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section aria-labelledby="p15-pairwise">
            <h2 id="p15-pairwise" className="text-xl font-semibold">
              {t("pairwiseHeading")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("pairwiseHelp")}</p>
            <div className="mt-2 overflow-x-auto">
              <table aria-labelledby="p15-pairwise" className="text-sm">
                <thead>
                  <tr>
                    <td />
                    {result.options.map((o) => (
                      <th key={o.id} scope="col" className="max-w-24 px-2 py-1 text-left font-medium">
                        {o.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.options.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <th scope="row" className="px-2 py-1 text-left font-medium">
                        {row.label}
                      </th>
                      {result.options.map((col) => (
                        <td key={col.id} className="px-2 py-1 text-center tabular-nums">
                          {row.id === col.id ? "—" : (result.pairwise_wins[row.id]?.[col.id] ?? 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {result.irv_rounds ? (
            <section aria-labelledby="p15-rounds">
              <h2 id="p15-rounds" className="text-xl font-semibold">
                {t("roundsHeading")}
              </h2>
              <ol className="mt-2 flex flex-col gap-2">
                {result.irv_rounds.map((r, i) => (
                  <li key={i} className="rounded-md border border-border p-2 text-sm">
                    <p className="font-medium">{t("round", { n: i + 1 })}</p>
                    <p>
                      {Object.entries(r.votes)
                        .map(([id, v]) => `${label(Number(id))}: ${v}`)
                        .join(" · ")}
                    </p>
                    {r.exhausted > 0 ? <p>{t("exhausted", { count: r.exhausted })}</p> : null}
                    {r.eliminated !== null ? <p>{t("eliminated", { label: label(r.eliminated) })}</p> : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {result.regrets ? (
            <section aria-labelledby="p15-regret">
              <h2 id="p15-regret" className="text-xl font-semibold">
                {t("regretHeading")}
              </h2>
              <table aria-labelledby="p15-regret" className="mt-2 w-full max-w-md text-left text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="py-1 pr-4">
                      {t("option")}
                    </th>
                    <th scope="col" className="py-1 pr-4 text-right">
                      {t("worstPlace")}
                    </th>
                    <th scope="col" className="py-1 text-right">
                      {t("totalRegret")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.regrets.map((r) => (
                    <tr key={r.option_id} className="border-t border-border">
                      <th scope="row" className="py-1 pr-4 font-normal">
                        {label(r.option_id)}
                      </th>
                      <td className="py-1 pr-4 text-right tabular-nums">{r.max_regret + 1}</td>
                      <td className="py-1 text-right tabular-nums">{r.total_regret}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
        </>
      ) : null}

      <footer className="text-xs text-muted-foreground">
        <p>
          {t("computedAt", {
            time: format.dateTime(new Date(result.computed_at), { dateStyle: "medium", timeStyle: "short" }),
          })}
        </p>
        {result.ballot_count > 0 && result.ballot_count <= 3 ? <p className="mt-1">{t("smallRoom")}</p> : null}
      </footer>
    </div>
  );
}
