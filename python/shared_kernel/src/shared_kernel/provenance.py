"""Provenance of every external or computed figure (ARCHITECTURE_PLAN D9, CLAUDE.md rule 4).

Wire shape mirrors ``@algohub/core`` ``Provenance``: ``{source: live|demo|user, fetched_at, confidence?}``.
``demo`` values must be labelled in the UI and are never presented as real.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

ProvenanceSource = Literal["live", "demo", "user"]


class Provenance(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    source: ProvenanceSource
    fetched_at: AwareDatetime = Field(description="When the value was fetched or computed (ISO-8601, UTC).")
    confidence: float | None = Field(default=None, ge=0, le=1)


def computed_from_user_input(at: datetime) -> Provenance:
    """Provenance of a value computed only from what users entered (no external data, nothing demo)."""
    return Provenance(source="user", fetched_at=at)
