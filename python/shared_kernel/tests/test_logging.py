from __future__ import annotations

import json

import pytest
import structlog
from hypothesis import given
from hypothesis import strategies as st

from shared_kernel.logging import REDACTED, REDACTED_KEYS, configure_logging, redact_processor
from shared_kernel.request_context import accept_or_generate


def test_redacts_top_level_and_nested_keys() -> None:
    event = {
        "event": "x",
        "email": "a@example.test",
        "payload": {"display_name": "Ann", "items": [{"lat": 43.2, "ok": 1}]},
        "Authorization": "Bearer abc",
    }
    out = redact_processor(None, "info", dict(event))
    assert out["email"] == REDACTED
    assert out["Authorization"] == REDACTED
    assert out["payload"]["display_name"] == REDACTED
    assert out["payload"]["items"][0] == {"lat": REDACTED, "ok": 1}
    assert out["event"] == "x"


@given(key=st.sampled_from(sorted(REDACTED_KEYS)), value=st.text())
def test_property_redacted_keys_never_leak(key: str, value: str) -> None:
    out = redact_processor(None, "info", {"event": "e", "nested": {key.upper(): value}, key: value})
    assert out[key] == REDACTED
    assert out["nested"][key.upper()] == REDACTED


def test_json_output_contains_no_secret(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging(level="INFO", json=True)
    structlog.get_logger("t").info("joined", participant_token="tok-123", room="r1")
    line = capsys.readouterr().out.strip().splitlines()[-1]
    data = json.loads(line)
    assert data["participant_token"] == REDACTED
    assert data["room"] == "r1"
    assert "tok-123" not in line


@pytest.mark.parametrize("bad", [None, "", "short", "x" * 200, "bad id with spaces", "id\nnewline-injection"])
def test_request_id_rejects_untrusted_values(bad: str | None) -> None:
    rid = accept_or_generate(bad)
    assert rid != bad
    assert len(rid) == 32


def test_request_id_accepts_well_formed() -> None:
    assert accept_or_generate("abc-123_def.456") == "abc-123_def.456"
