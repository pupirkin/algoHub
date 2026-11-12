-- Runs once on an empty data directory. One schema per product (ADR-0005);
-- product schemas are created by each product's own Alembic migrations, not here.
CREATE SCHEMA IF NOT EXISTS platform;
