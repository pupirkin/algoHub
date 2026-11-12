"""Writes (or checks) the committed OpenAPI snapshot: `python -m algo_api.export_openapi [--check]`."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from pydantic import SecretStr

from algo_api.main import create_app
from shared_kernel.settings import Settings

SNAPSHOT = Path(__file__).resolve().parents[2] / "openapi.json"


def current_spec() -> dict[str, Any]:
    # Snapshot must not depend on the developer's environment.
    settings = Settings(
        database_url=SecretStr("postgresql+psycopg://snapshot@localhost/snapshot"), version="0.0.0"
    )
    return create_app(settings).openapi()


def render(spec: dict[str, Any]) -> str:
    return json.dumps(spec, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main(argv: list[str]) -> int:
    text = render(current_spec())
    if "--check" in argv:
        if not SNAPSHOT.exists() or SNAPSHOT.read_text(encoding="utf-8") != text:
            sys.stderr.write("openapi.json is stale — run `just openapi` and commit the snapshot.\n")
            return 1
        sys.stdout.write("openapi.json is up to date.\n")
        return 0
    SNAPSHOT.write_text(text, encoding="utf-8")
    sys.stdout.write(f"wrote {SNAPSHOT}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
