"""Retention of P15 data (ARCHITECTURE_PLAN §5): `just purge P15`.

A closed room and everything in it (options, participants' names, ballots, result) is deleted 30 days after
closing; a room that is never closed, 30 days after creation. Organizers can delete earlier
(DELETE /rooms/{id}).
Until the worker exists (P31) this runs by hand or by cron; scheduling it is a pre-deploy requirement.
"""

from __future__ import annotations

import sys

from algohub_p15.service import utc_now
from algohub_p15.store import SqlRoomStore
from shared_kernel.db import create_db_engine, create_session_factory
from shared_kernel.settings import load_settings


def main() -> int:
    engine = create_db_engine(load_settings())
    try:
        removed = SqlRoomStore(create_session_factory(engine)).purge_expired(utc_now())
    finally:
        engine.dispose()
    sys.stdout.write(f"p15: removed {removed} expired rooms\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
