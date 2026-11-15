from __future__ import annotations

import re
from pathlib import Path

from algo_api.platform.catalog import CATALOG_PRODUCT_IDS

INDEX = Path(__file__).resolve().parents[3] / "PROJECT_INDEX.md"


def test_catalog_ids_match_project_index() -> None:
    ids = set(re.findall(r"^\| (P\d{2}) \|", INDEX.read_text(encoding="utf-8"), flags=re.MULTILINE))
    assert ids == CATALOG_PRODUCT_IDS
