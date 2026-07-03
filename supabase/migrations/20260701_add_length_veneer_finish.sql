-- =============================================================================
-- Add length dimension, veneer/finish component kinds, and dimension unit
-- =============================================================================
-- 1. Extend component_kind enum with 'veneer' and 'finish'
-- 2. Add length_mm + dimension_unit to units table
-- =============================================================================

-- 1. Extend component_kind enum ──────────────────────────────────────────────

DO $$
BEGIN
  -- Add 'veneer' if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.component_kind'::regtype
      AND enumlabel = 'veneer'
  ) THEN
    ALTER TYPE public.component_kind ADD VALUE 'veneer';
  END IF;

  -- Add 'finish' if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.component_kind'::regtype
      AND enumlabel = 'finish'
  ) THEN
    ALTER TYPE public.component_kind ADD VALUE 'finish';
  END IF;
END
$$;

-- 2. Add length_mm + dimension_unit to units ─────────────────────────────────

-- dimension_unit enum: mm, m, or m2
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dimension_unit') THEN
    CREATE TYPE dimension_unit AS ENUM ('mm', 'm', 'm2');
  END IF;
END
$$;

ALTER TABLE units ADD COLUMN IF NOT EXISTS length_mm integer NOT NULL DEFAULT 0;
ALTER TABLE units ADD COLUMN IF NOT EXISTS dimension_unit dimension_unit NOT NULL DEFAULT 'mm';

-- CHECK: length_mm >= 0
ALTER TABLE units ADD CONSTRAINT units_length_mm_positive CHECK (length_mm >= 0);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_units_dimension_unit ON units(dimension_unit);
