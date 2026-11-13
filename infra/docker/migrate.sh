#!/bin/sh
# Same order as `just migrate`: platform schema first, then every product that ships migrations.
set -eu
cd /app
echo "migrating platform (services/algo-api)"
alembic -c services/algo-api/alembic.ini upgrade head
for ini in products/*/api/alembic.ini; do
  [ -f "$ini" ] || continue
  echo "migrating ${ini%/alembic.ini}"
  alembic -c "$ini" upgrade head
done
