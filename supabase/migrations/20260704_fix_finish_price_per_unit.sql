-- Fix catalog_finishes: replace modifier_type/modifier_value with price_per_unit.
-- The pricing engine expects price_per_unit (per m²) for finishes, not modifiers.

-- 1. Add price_per_unit column
ALTER TABLE public.catalog_finishes
  ADD COLUMN IF NOT EXISTS price_per_unit numeric(14,2) NOT NULL DEFAULT 0;

-- 2. Migrate data from modifier_value where modifier_type = 'fixed'
UPDATE public.catalog_finishes
SET price_per_unit = modifier_value
WHERE modifier_type = 'fixed' AND price_per_unit = 0;

-- 3. Drop modifier columns
ALTER TABLE public.catalog_finishes
  DROP COLUMN IF EXISTS modifier_type,
  DROP COLUMN IF EXISTS modifier_value;

-- 4. Drop modifier_type enum (no other tables use it)
DROP TYPE IF EXISTS public.modifier_type;
