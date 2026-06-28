-- T2.x: Add finish_id and width_tier columns to units table.
-- finish_id references catalog_finishes (nullable).
-- width_tier is an enum: narrow (<400mm), standard (400–800mm), wide (800–1200mm), extra_wide (>1200mm).

-- 1. Create width_tier enum type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'width_tier') THEN
    CREATE TYPE width_tier AS ENUM ('narrow', 'standard', 'wide', 'extra_wide');
  END IF;
END$$;

-- 2. Add columns to units table
ALTER TABLE units ADD COLUMN IF NOT EXISTS finish_id uuid
  REFERENCES catalog_finishes(id) ON DELETE RESTRICT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS width_tier width_tier;

-- 3. Index for finish lookups
CREATE INDEX IF NOT EXISTS units_finish_id_idx ON units(finish_id);
