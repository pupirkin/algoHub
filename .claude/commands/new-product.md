---
description: Generate a new product skeleton and register it
argument-hint: <ID> <slug> <CLIENT|ROOM|SOLVER|DATA[+...]>
---
Create a product from the template: $ARGUMENTS

1. `just gen $0 $1 --profile $2` — creates `products/<id>-<slug>/{docs,scenarios}`.
2. Ensure the entry exists in `apps/portal-web/src/registry.ts` (status `DISCOVERY` or `DESIGNED` only
   when its criteria in `TESTING_STRATEGY.md §7` hold), then `just index`.
3. Fill `docs/PRD.md` (problem, acceptance scenario, non-goals) and write ≥ 3 golden scenarios in
   `scenarios/*.json` before any code.
4. If the product has an API: add its package to `services/algo-api/src/algo_api/products.py` and to the
   import-linter independence contract in the root `pyproject.toml`.
5. `just dod $0` and report the table honestly.
