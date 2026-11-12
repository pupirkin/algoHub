from __future__ import annotations

from algo_api.export_openapi import SNAPSHOT, current_spec, render


def test_openapi_snapshot_is_current() -> None:
    """Contract drift = test failure. Regenerate with `just openapi` and commit (CLAUDE.md rule 6)."""
    assert SNAPSHOT.exists(), "services/algo-api/openapi.json missing — run `just openapi`"
    assert SNAPSHOT.read_text(encoding="utf-8") == render(current_spec())


def test_all_product_paths_are_versioned() -> None:
    for path in current_spec()["paths"]:
        assert path in {"/healthz", "/readyz"} or path.startswith("/api/v1/"), path
