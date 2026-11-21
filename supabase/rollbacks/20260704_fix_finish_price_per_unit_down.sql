-- Reverse: restore modifier_type/modifier_value on catalog_finishes

-- 1. Re-create modifier_type enum
DO $$ BEGIN
  CREATE TYPE public.modifier_type AS ENUM ('percent', 'fixed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add modifier columns back
ALTER TABLE public.catalog_finishes
  ADD COLUMN IF NOT EXISTS modifier_type public.modifier_type NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS modifier_value numeric(14,2) NOT NULL DEFAULT 0;

-- 3. Migrate price_per_unit back to modifier_value
UPDATE public.catalog_finishes
SET modifier_value = price_per_unit;

-- 4. Drop price_per_unit
ALTER TABLE public.catalog_finishes
  DROP COLUMN IF EXISTS price_per_unit;
