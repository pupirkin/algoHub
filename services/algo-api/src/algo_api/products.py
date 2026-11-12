"""Registry of product API packages mounted by algo-api.

This is the ONLY module allowed to import product packages (`algohub_pXX`). Each entry names the Postgres
schema the product owns; the schema itself is created by the product's own first Alembic migration
(ADR-0005), not by the compose init script. Products are added here by their own slice.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import APIRouter


@dataclass(frozen=True, slots=True)
class ProductMount:
    pid: str  # "p15"
    schema: str  # Postgres schema name, usually == pid
    router: APIRouter

    @property
    def prefix(self) -> str:
        return f"/api/v1/{self.pid}"


def product_mounts() -> list[ProductMount]:
    # Phase 0: no product has an API yet. P15 adds the first entry in Phase 2.
    return []
