"""Deletes waitlist sign-ups older than the retention period: `just purge-waitlist`.

Until the worker exists (P31) this is run by hand or by cron; scheduling it is a pre-deploy requirement.
"""

from __future__ import annotations

import sys

from algo_api.platform.waitlist import RETENTION_DAYS, SqlWaitlistStore
from shared_kernel.db import create_db_engine, create_session_factory
from shared_kernel.settings import load_settings


def main() -> int:
    engine = create_db_engine(load_settings())
    try:
        removed = SqlWaitlistStore(create_session_factory(engine)).purge_older_than(RETENTION_DAYS)
    finally:
        engine.dispose()
    sys.stdout.write(f"waitlist: removed {removed} sign-ups older than {RETENTION_DAYS} days\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
