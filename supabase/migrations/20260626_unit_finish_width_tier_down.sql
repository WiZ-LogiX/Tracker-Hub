-- Down migration: width_tier enum + finish_id + width_tier on units

-- 1. Drop index ──────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS units_finish_id_idx;

-- 2. Drop columns from units ─────────────────────────────────────────────────

ALTER TABLE units DROP COLUMN IF EXISTS width_tier;
ALTER TABLE units DROP COLUMN IF EXISTS finish_id;

-- 3. Drop enum type ──────────────────────────────────────────────────────────

DROP TYPE IF EXISTS width_tier;
