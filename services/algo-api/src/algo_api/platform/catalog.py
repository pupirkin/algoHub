"""Catalog product ids known to the API. algo-api is the only Python module that knows the full product list
(CLAUDE.md rule 2); `tests/test_catalog_ids.py` keeps it in sync with PROJECT_INDEX.md (generated from
apps/portal-web/src/registry.ts)."""

from __future__ import annotations

CATALOG_SIZE = 32
CATALOG_PRODUCT_IDS: frozenset[str] = frozenset(f"P{i:02d}" for i in range(1, CATALOG_SIZE + 1))
