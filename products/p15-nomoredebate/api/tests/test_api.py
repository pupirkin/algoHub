"""HTTP behaviour of /api/v1/p15 (TESTING_STRATEGY §3, §6, §9 ROOM): validation, authz matrix, conflicts,
idempotency, deadlines, privacy of public responses, rate limits. Runs on both stores (see conftest)."""

from __future__ import annotations

import json
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from p15_testkit import API, FakeClock, bearer, create_room, join, make_app

from algohub_p15.domain import Rules
from algohub_p15.memory_store import InMemoryRoomStore

# ------------------------------------------------------------------------------------------ create / read


def test_create_returns_public_room_organizer_token_and_paths(api: TestClient) -> None:
    data = create_room(api, method="irv", deadline_minutes=60, max_participants=5)
    room = data["room"]
    assert room["status"] == "open"
    assert room["method"] == "irv"
    assert [o["label"] for o in room["options"]] == ["Pizza", "Sushi", "Burgers"]
    assert [o["id"] for o in room["options"]] == [0, 1, 2]
    assert (room["participant_count"], room["ballot_count"], room["max_participants"]) == (0, 0, 5)
    assert room["deadline_at"] is not None
    assert len(data["organizer_token"]) >= 22  # 128 bits, base64url
    assert data["share_path"] == f"/p/nomoredebate/r/{room['id']}"
    assert data["organizer_path"] == f"/p/nomoredebate/r/{room['id']}/admin"
    assert data["organizer_token"] not in data["share_path"] + data["organizer_path"]


def test_defaults_are_condorcet_borda_and_thirty_participants(api: TestClient) -> None:
    room = create_room(api)["room"]
    assert (room["method"], room["max_participants"], room["deadline_at"]) == ("condorcet_borda", 30, None)


def test_text_is_normalized(api: TestClient) -> None:
    room = create_room(api, question="  Что   делаем?  ", options=["  Кино ", "Café"])["room"]
    assert room["question"] == "Что делаем?"
    assert [o["label"] for o in room["options"]] == ["Кино", "Café"]


@pytest.mark.parametrize(
    "body",
    [
        {"question": "Q", "options": ["only one"]},
        {"question": "Q", "options": [f"o{i}" for i in range(11)]},
        {"question": "Q", "options": ["Pizza", " pizza "]},
        {"question": "Q", "options": ["Pizza", "\uff30\uff29\uff3a\uff3a\uff21"]},  # full-width: same option
        {"question": "Q", "options": ["A", ""]},
        {"question": "Q", "options": ["A", "   "]},
        {"question": "   ", "options": ["A", "B"]},
        {"question": "x" * 201, "options": ["A", "B"]},
        {"question": "Q", "options": ["A", "x" * 81]},
        {"question": "Q\u0000", "options": ["A", "B"]},
        {"question": "Q", "options": ["A\nB", "C"]},
        {"question": "Q", "options": ["A", "B"], "method": "dictator"},
        {"question": "Q", "options": ["A", "B"], "deadline_minutes": 4},
        {"question": "Q", "options": ["A", "B"], "deadline_minutes": 7 * 24 * 60 + 1},
        {"question": "Q", "options": ["A", "B"], "max_participants": 1},
        {"question": "Q", "options": ["A", "B"], "max_participants": 51},
        {"question": "Q", "options": ["A", "B"], "organizer_token": "mine"},
        {"options": ["A", "B"]},
        # NFC lengthens U+0958 to two code points: within the raw limit, over it after normalization.
        {"question": "\u0958" * 200, "options": ["A", "B"]},
        {"question": "Q", "options": ["A", "\u0958" * 80]},
    ],
)
def test_create_validation_is_422_with_fields(api: TestClient, body: dict[str, Any]) -> None:
    res = api.post(f"{API}/rooms", json=body)
    assert res.status_code == 422, res.text
    assert res.json()["error"]["code"] == "validation_error"
    assert res.json()["error"]["details"]["fields"]


def test_unknown_room_is_404_on_every_endpoint(api: TestClient) -> None:
    rid = uuid.uuid4()
    token = bearer("x" * 22)
    calls = [
        api.get(f"{API}/rooms/{rid}"),
        api.post(f"{API}/rooms/{rid}/participants", json={"display_name": "Ann"}),
        api.get(f"{API}/rooms/{rid}/participants", headers=token),
        api.get(f"{API}/rooms/{rid}/ballot", headers=token),
        api.put(f"{API}/rooms/{rid}/ballot", json={"ranking": [0]}, headers=token),
        api.post(f"{API}/rooms/{rid}/close", headers=token),
        api.get(f"{API}/rooms/{rid}/result"),
        api.delete(f"{API}/rooms/{rid}", headers=token),
    ]
    assert [c.status_code for c in calls] == [404] * len(calls)
    assert {c.json()["error"]["code"] for c in calls} == {"room_not_found"}


def test_malformed_room_id_is_422(api: TestClient) -> None:
    assert api.get(f"{API}/rooms/not-a-uuid").status_code == 422


# ------------------------------------------------------------------------------------------ authz matrix

ENDPOINTS = ["list_participants", "get_ballot", "put_ballot", "close", "delete"]
# expected status per (endpoint, credential); "ok" = the endpoint's success status
MATRIX: dict[str, dict[str, int]] = {
    "list_participants": {"none": 401, "garbage": 403, "participant": 403, "organizer": 200},
    "get_ballot": {"none": 401, "garbage": 403, "participant": 200, "organizer": 403},
    "put_ballot": {"none": 401, "garbage": 403, "participant": 200, "organizer": 403},
    "close": {"none": 401, "garbage": 403, "participant": 403, "organizer": 200},
    "delete": {"none": 401, "garbage": 403, "participant": 403, "organizer": 204},
}


def _call(api: TestClient, endpoint: str, rid: str, headers: dict[str, str]) -> Any:
    base = f"{API}/rooms/{rid}"
    if endpoint == "list_participants":
        return api.get(f"{base}/participants", headers=headers)
    if endpoint == "get_ballot":
        return api.get(f"{base}/ballot", headers=headers)
    if endpoint == "put_ballot":
        return api.put(f"{base}/ballot", json={"ranking": [1, 0]}, headers=headers)
    if endpoint == "close":
        return api.post(f"{base}/close", headers=headers)
    return api.delete(base, headers=headers)


@pytest.mark.parametrize("endpoint", ENDPOINTS)
@pytest.mark.parametrize("credential", ["none", "garbage", "participant", "organizer"])
def test_authz_matrix(api: TestClient, endpoint: str, credential: str) -> None:
    created = create_room(api)
    rid = created["room"]["id"]
    participant = join(api, rid, "Ann")
    headers = {
        "none": {},
        "garbage": bearer("not-a-real-token-0000000"),
        "participant": bearer(participant),
        "organizer": bearer(created["organizer_token"]),
    }[credential]
    res = _call(api, endpoint, rid, headers)
    assert res.status_code == MATRIX[endpoint][credential], res.text
    if res.status_code == 401:
        assert res.json()["error"]["code"] == "missing_token"
        assert res.headers["WWW-Authenticate"] == "Bearer"
    if res.status_code == 403:
        assert res.json()["error"]["code"] == "invalid_token"


def test_tokens_are_scoped_to_their_room(api: TestClient) -> None:
    a, b = create_room(api), create_room(api)
    ann_in_a = join(api, a["room"]["id"], "Ann")
    rid_b = b["room"]["id"]
    assert api.post(f"{API}/rooms/{rid_b}/close", headers=bearer(a["organizer_token"])).status_code == 403
    assert api.get(f"{API}/rooms/{rid_b}/ballot", headers=bearer(ann_in_a)).status_code == 403


# ------------------------------------------------------------------------------------------ joining


def test_names_are_unique_per_room_case_insensitively(api: TestClient) -> None:
    rid = create_room(api)["room"]["id"]
    join(api, rid, "Ann")
    res = api.post(f"{API}/rooms/{rid}/participants", json={"display_name": "  aNN "})
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "name_taken"
    join(api, create_room(api)["room"]["id"], "Ann")  # another room: fine


def test_room_full_is_409(api: TestClient) -> None:
    rid = create_room(api, max_participants=2)["room"]["id"]
    join(api, rid, "Ann")
    join(api, rid, "Bo")
    res = api.post(f"{API}/rooms/{rid}/participants", json={"display_name": "Cy"})
    assert (res.status_code, res.json()["error"]["code"]) == (409, "room_full")


@pytest.mark.parametrize("name", ["", "   ", "x" * 41, "a\tb", "a\u007fb", "\u0958" * 40])
def test_bad_display_name_is_422(api: TestClient, name: str) -> None:
    rid = create_room(api)["room"]["id"]
    assert api.post(f"{API}/rooms/{rid}/participants", json={"display_name": name}).status_code == 422


def test_unicode_names_and_labels_round_trip(api: TestClient) -> None:
    rid = create_room(api, options=["Кафе «Ёлка»", "寿司", "🍕"])["room"]["id"]
    token = join(api, rid, "Әлия")
    ballot = api.get(f"{API}/rooms/{rid}/ballot", headers=bearer(token)).json()
    assert ballot == {"display_name": "Әлия", "ranking": None, "updated_at": None}


# ------------------------------------------------------------------------------------------ ballots


def test_put_ballot_is_idempotent_and_last_write_wins(api: TestClient, clock: FakeClock) -> None:
    rid = create_room(api)["room"]["id"]
    token = join(api, rid, "Ann")
    first = api.put(f"{API}/rooms/{rid}/ballot", json={"ranking": [2, 0, 1]}, headers=bearer(token))
    again = api.put(f"{API}/rooms/{rid}/ballot", json={"ranking": [2, 0, 1]}, headers=bearer(token))
    assert first.status_code == again.status_code == 200
    assert first.json()["ranking"] == again.json()["ranking"] == [2, 0, 1]
    clock.advance(seconds=5)
    api.put(f"{API}/rooms/{rid}/ballot", json={"ranking": [1]}, headers=bearer(token))
    mine = api.get(f"{API}/rooms/{rid}/ballot", headers=bearer(token)).json()
    assert mine["ranking"] == [1]
    assert mine["updated_at"] == "2026-11-13T12:00:05Z"
    assert api.get(f"{API}/rooms/{rid}").json()["ballot_count"] == 1


@pytest.mark.parametrize(
    ("ranking", "code"),
    [
        ([], "validation_error"),
        ([0, 0], "validation_error"),
        ([-1], "validation_error"),
        ([10], "validation_error"),
        ([True], "validation_error"),
        (["0"], "validation_error"),
        ([3], "invalid_ballot"),  # valid id shape, but this room has 3 options (0..2)
    ],
)
def test_invalid_ranking_is_422(api: TestClient, ranking: list[Any], code: str) -> None:
    rid = create_room(api)["room"]["id"]
    token = join(api, rid, "Ann")
    res = api.put(f"{API}/rooms/{rid}/ballot", json={"ranking": ranking}, headers=bearer(token))
    assert res.status_code == 422, res.text
    assert res.json()["error"]["code"] == code


# ------------------------------------------------------------------------------ closing and results


def _vote(api: TestClient, rid: str, name: str, ranking: list[int]) -> str:
    token = join(api, rid, name)
    res = api.put(f"{API}/rooms/{rid}/ballot", json={"ranking": ranking}, headers=bearer(token))
    assert res.status_code == 200, res.text
    return token


def test_result_is_404_until_closed_then_explained(api: TestClient) -> None:
    created = create_room(api)
    rid, org = created["room"]["id"], created["organizer_token"]
    _vote(api, rid, "Ann", [0, 1, 2])
    _vote(api, rid, "Bo", [1, 0, 2])
    _vote(api, rid, "Cy", [2, 1, 0])
    pending = api.get(f"{API}/rooms/{rid}/result")
    assert (pending.status_code, pending.json()["error"]["code"]) == (404, "result_not_ready")

    closed = api.post(f"{API}/rooms/{rid}/close", headers=bearer(org))
    assert closed.status_code == 200, closed.text
    result = closed.json()
    assert (result["outcome"], result["winner_option_id"], result["decided_by"]) == ("winner", 1, "condorcet")
    assert result["chosen_option_id"] == 1
    assert result["borda_points"] == [3.0, 4.0, 2.0]
    assert result["pairwise_wins"][1] == [2, 0, 2]
    assert [r["code"] for r in result["reasons"]] == ["condorcet_winner"]
    assert result["provenance"]["source"] == "user"
    assert result["options"][1]["label"] == "Sushi"
    assert api.get(f"{API}/rooms/{rid}/result").json() == result
    assert api.get(f"{API}/rooms/{rid}").json()["status"] == "closed"


def test_close_is_idempotent_and_freezes_the_room(api: TestClient, clock: FakeClock) -> None:
    created = create_room(api)
    rid, org = created["room"]["id"], created["organizer_token"]
    ann = _vote(api, rid, "Ann", [0])
    first = api.post(f"{API}/rooms/{rid}/close", headers=bearer(org)).json()
    clock.advance(minutes=1)
    assert api.post(f"{API}/rooms/{rid}/close", headers=bearer(org)).json() == first
    late_vote = api.put(f"{API}/rooms/{rid}/ballot", json={"ranking": [1]}, headers=bearer(ann))
    late_join = api.post(f"{API}/rooms/{rid}/participants", json={"display_name": "Bo"})
    assert (late_vote.status_code, late_vote.json()["error"]["code"]) == (409, "room_closed")
    assert (late_join.status_code, late_join.json()["error"]["code"]) == (409, "room_closed")


def test_close_with_no_ballots_reports_no_ballots(api: TestClient) -> None:
    created = create_room(api)
    res = api.post(f"{API}/rooms/{created['room']['id']}/close", headers=bearer(created["organizer_token"]))
    body = res.json()
    assert (body["outcome"], body["chosen_option_id"], body["ballot_count"]) == ("no_ballots", None, 0)


def test_tie_is_reported_with_a_deterministic_pick(api: TestClient) -> None:
    created = create_room(api)
    rid, org = created["room"]["id"], created["organizer_token"]
    for name, ranking in (("Ann", [0, 1, 2]), ("Bo", [1, 2, 0]), ("Cy", [2, 0, 1])):
        _vote(api, rid, name, ranking)
    body = api.post(f"{API}/rooms/{rid}/close", headers=bearer(org)).json()
    assert body["outcome"] == "tie"
    assert body["tied_option_ids"] == [0, 1, 2]
    assert body["tiebreak_option_id"] in body["tied_option_ids"]
    assert body["chosen_option_id"] == body["tiebreak_option_id"]
    assert [r["code"] for r in body["reasons"]][-2:] == ["tie", "tiebreak"]


def test_deadline_closes_the_room_lazily(api: TestClient, clock: FakeClock) -> None:
    rid = create_room(api, deadline_minutes=10)["room"]["id"]
    ann = _vote(api, rid, "Ann", [2])
    clock.advance(minutes=10)
    late = api.put(f"{API}/rooms/{rid}/ballot", json={"ranking": [0]}, headers=bearer(ann))
    assert (late.status_code, late.json()["error"]["code"]) == (409, "room_closed")
    room = api.get(f"{API}/rooms/{rid}").json()
    assert room["status"] == "closed"
    assert room["closed_at"] == "2026-11-13T12:10:00Z"
    assert api.get(f"{API}/rooms/{rid}/result").json()["winner_option_id"] == 2


def test_organizer_sees_who_voted_but_not_how(api: TestClient, clock: FakeClock) -> None:
    created = create_room(api)
    rid = created["room"]["id"]
    _vote(api, rid, "Ann", [1, 0])
    clock.advance(seconds=1)  # listed in joining order
    join(api, rid, "Bo")
    body = api.get(f"{API}/rooms/{rid}/participants", headers=bearer(created["organizer_token"])).json()
    assert [(p["display_name"], p["has_voted"]) for p in body["participants"]] == [
        ("Ann", True),
        ("Bo", False),
    ]
    assert "ranking" not in json.dumps(body)


def test_delete_removes_everything(api: TestClient) -> None:
    created = create_room(api)
    rid = created["room"]["id"]
    ann = _vote(api, rid, "Ann", [0])
    assert api.delete(f"{API}/rooms/{rid}", headers=bearer(created["organizer_token"])).status_code == 204
    assert api.get(f"{API}/rooms/{rid}").status_code == 404
    assert api.get(f"{API}/rooms/{rid}/ballot", headers=bearer(ann)).status_code == 404


# ------------------------------------------------------------------------------------------ privacy


def test_public_responses_leak_no_tokens_hashes_names_or_ballots(api: TestClient) -> None:
    created = create_room(api)
    rid, org = created["room"]["id"], created["organizer_token"]
    ann = _vote(api, rid, "Ann-Secret-Name", [2, 1, 0])
    secrets = [org, ann, "Ann-Secret-Name", "token", "hash"]
    public_open = api.get(f"{API}/rooms/{rid}").text
    api.post(f"{API}/rooms/{rid}/close", headers=bearer(org))
    public_closed = api.get(f"{API}/rooms/{rid}").text + api.get(f"{API}/rooms/{rid}/result").text
    for text in (public_open, public_closed):
        for s in secrets:
            assert s not in text
    assert "[2, 1, 0]" not in public_open
    assert "ranking" not in public_open + public_closed


# ------------------------------------------------------------------------------------------ rate limits


def test_write_endpoints_are_rate_limited_per_ip(clock: FakeClock) -> None:
    rules = Rules(
        rooms_per_ip_per_hour=2,
        joins_per_ip_per_minute=2,
        ballots_per_ip_per_minute=2,
        organizer_actions_per_ip_per_minute=2,
    )
    with TestClient(make_app(InMemoryRoomStore(), rules, clock)) as api:
        created = [create_room(api), create_room(api)]
        third = api.post(f"{API}/rooms", json={"question": "Q", "options": ["A", "B"]})
        assert third.status_code == 429
        assert int(third.headers["Retry-After"]) > 0
        assert third.json()["error"]["code"] == "rate_limited"
        rid = created[0]["room"]["id"]
        ann, _bo = join(api, rid, "Ann"), join(api, rid, "Bo")
        assert api.post(f"{API}/rooms/{rid}/participants", json={"display_name": "Cy"}).status_code == 429
        put = [
            api.put(f"{API}/rooms/{rid}/ballot", json={"ranking": [0]}, headers=bearer(ann)) for _ in range(3)
        ]
        assert [r.status_code for r in put] == [200, 200, 429]
        # invalid bodies are counted too: the limit runs before parsing
        org = bearer(created[1]["organizer_token"])
        rid1 = created[1]["room"]["id"]
        codes = [api.post(f"{API}/rooms/{rid1}/close", headers=org).status_code for _ in range(3)]
        assert codes == [200, 200, 429]
        assert api.get(f"{API}/rooms/{rid}").status_code == 200  # reads are not limited


def test_oversized_body_is_413(api: TestClient) -> None:
    res = api.post(f"{API}/rooms", json={"question": "Q", "options": ["A", "B"], "pad": "x" * 20_000})
    assert res.status_code == 413
