"""Contract fuzzing (TESTING_STRATEGY §3): schemathesis generates requests from the OpenAPI schema of the real
app (P15 on the in-memory store) and checks that no response is a 5xx, every response matches its schema
(documented status code, valid body) and authentication cannot be skipped (ST203/ST401: without the token ->
401, with a garbled one -> 401/403). Fast profile here; nightly raises ALGOHUB_SCHEMATHESIS_EXAMPLES.

Tokens come from an auth provider (organizer token for organizer endpoints, participant token for the ballot),
and half of the cases target a real room, otherwise almost everything would stop at 404.

Excluded checks, each pinned elsewhere:
- ``positive_data_acceptance``: some rules are semantic and not expressible in JSON Schema (labels distinct
  after case/width folding, ranking ids within *this* room's option count) -> documented 422, see test_api.py;
- ``allow_header_conformance``: on 405 Starlette lists only the methods of the first route matching the path
  (GET and DELETE /rooms/{id} are separate routes) — platform-level gap recorded in BUILD_STATE.
"""

from __future__ import annotations

import os
import random
from typing import Any

import schemathesis
from fastapi.testclient import TestClient
from hypothesis import HealthCheck, settings
from p15_testkit import API, FakeClock, make_app
from schemathesis.checks import allow_header_conformance, positive_data_acceptance

from algohub_p15.domain import Rules
from algohub_p15.memory_store import InMemoryRoomStore

MAX_EXAMPLES = int(os.environ.get("ALGOHUB_SCHEMATHESIS_EXAMPLES", "40"))

APP = make_app(InMemoryRoomStore(), Rules(10**6, 10**6, 10**6, 10**6), FakeClock())
_client = TestClient(APP)
_created = _client.post(f"{API}/rooms", json={"question": "Fuzz?", "options": ["A", "B", "C"]}).json()
ROOM_ID: str = _created["room"]["id"]
ORGANIZER: str = _created["organizer_token"]
PARTICIPANT: str = _client.post(
    f"{API}/rooms/{ROOM_ID}/participants", json={"display_name": "Fuzzer"}
).json()["participant_token"]

schema = schemathesis.openapi.from_asgi("/openapi.json", APP).include(path_regex=f"^{API}/")


def _role(case: Any) -> str:
    return "participant" if case.path.endswith("/ballot") else "organizer"


@schema.auth(cache_by_key=lambda case, _ctx: _role(case))
class RoomTokens:
    def get(self, case: Any, _ctx: Any) -> str:
        return PARTICIPANT if _role(case) == "participant" else ORGANIZER

    def set(self, case: Any, data: str, _ctx: Any) -> None:
        case.headers = {**(case.headers or {}), "Authorization": f"Bearer {data}"}


@schema.parametrize()
@settings(max_examples=MAX_EXAMPLES, deadline=None, suppress_health_check=list(HealthCheck))
def test_api_never_errors_and_matches_its_contract(case: Any) -> None:
    rng = random.Random(repr(case.path_parameters) + case.method)  # noqa: S311 — deterministic, not security
    # DELETE keeps random ids: deleting the shared room would turn every later case into a 404.
    targets_room = bool(case.path_parameters) and "room_id" in case.path_parameters
    if targets_room and case.method != "DELETE" and rng.random() < 0.5:
        case.path_parameters["room_id"] = ROOM_ID
    case.call_and_validate(excluded_checks=[positive_data_acceptance, allow_header_conformance])
