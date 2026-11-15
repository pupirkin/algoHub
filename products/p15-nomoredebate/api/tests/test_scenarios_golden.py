"""Golden scenarios (TESTING_STRATEGY §2.3): `products/p15-nomoredebate/scenarios/*.json` are the spec.

Each file feeds two tests here: the algorithm with the scenario's seed (exact, incl. the tie-break pick), and
the same story through HTTP (create -> join -> vote -> close) on both stores; the tie-break pick there depends
on the random room id, so only seed-independent fields are compared. Playwright replays `ui.steps` (e2e).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from p15_testkit import API, SCENARIOS, bearer, create_room, join

from algorithms.social_choice import Method, decide, explain

FILES = sorted(SCENARIOS.glob("*.json"))


def load(path: Path) -> dict[str, Any]:
    data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    return data


def test_there_are_at_least_three_scenarios_and_names_match_files() -> None:
    assert len(FILES) >= 3
    for f in FILES:
        assert load(f)["name"] == f.stem


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_algorithm_matches_scenario(path: Path) -> None:
    sc = load(path)
    inp, exp = sc["input"], sc["expected"]
    labels: list[str] = inp["options"]
    d = decide(len(labels), inp["ballots"], Method(inp["method"]), inp["seed"])

    def label(i: int | None) -> str | None:
        return None if i is None else labels[i]

    assert d.outcome == exp["outcome"]
    assert label(d.winner) == exp["winner"]
    assert [labels[i] for i in d.tied] == exp["tied"]
    assert label(d.tiebreak_pick) == exp["tiebreak_pick"]
    assert [r.code for r in explain(d)] == exp["explain_codes"]
    if "decided_by" in exp:
        assert d.decided_by == exp["decided_by"]
    if "condorcet_winner" in exp:
        assert label(d.condorcet_winner) == exp["condorcet_winner"]
    if "borda_points" in exp:
        assert {labels[i]: p / 2 for i, p in enumerate(d.borda_points_x2)} == exp["borda_points"]
    if "regrets" in exp:
        assert d.regrets is not None
        assert {labels[i]: list(r) for i, r in enumerate(d.regrets)} == exp["regrets"]
    if "irv_rounds" in exp:
        assert d.irv_rounds is not None
        got = [
            {
                "counts": {labels[o]: c for o, c in r.counts},
                "exhausted": r.exhausted,
                "eliminated": label(r.eliminated),
            }
            for r in d.irv_rounds
        ]
        assert got == exp["irv_rounds"]


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_scenario_through_http(api: TestClient, path: Path) -> None:
    sc = load(path)
    inp, exp = sc["input"], sc["expected"]
    labels: list[str] = inp["options"]
    created = create_room(api, question=inp["question"], options=labels, method=inp["method"])
    rid = created["room"]["id"]
    voters = inp.get("voters") or [f"Voter {i + 1}" for i in range(len(inp["ballots"]))]
    for name, ranking in zip(voters, inp["ballots"], strict=True):
        token = join(api, rid, name)
        res = api.put(f"{API}/rooms/{rid}/ballot", json={"ranking": ranking}, headers=bearer(token))
        assert res.status_code == 200, res.text
    res = api.post(f"{API}/rooms/{rid}/close", headers=bearer(created["organizer_token"]))
    assert res.status_code == 200, res.text
    body = res.json()

    def label(i: int | None) -> str | None:
        return None if i is None else labels[i]

    assert body["outcome"] == exp["outcome"]
    assert label(body["winner_option_id"]) == exp["winner"]
    assert [labels[i] for i in body["tied_option_ids"]] == exp["tied"]
    assert [r["code"] for r in body["reasons"]] == exp["explain_codes"]
    assert body["ballot_count"] == len(inp["ballots"])
    if "borda_points" in exp:
        assert dict(zip(labels, body["borda_points"], strict=True)) == exp["borda_points"]
