-- Migration: Add value_type and fixed_amount to tenant_pricing_factors
-- Allows factors to be either percentage-based or fixed EGP amounts.
-- Also adds a unique constraint on (tenant_id, factor_key) for non-archived rows.

-- 1. Create enum type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'factor_value_type') THEN
    CREATE TYPE factor_value_type AS ENUM ('percent', 'fixed');
  END IF;
END $$;

-- 2. Add columns
ALTER TABLE tenant_pricing_factors
  ADD COLUMN IF NOT EXISTS value_type factor_value_type NOT NULL DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS fixed_amount numeric(10,2) NOT NULL DEFAULT 0;

-- 3. Update CHECK constraint to allow fixed_amount > 0 when value_type = 'fixed'
ALTER TABLE tenant_pricing_factors
  DROP CONSTRAINT IF EXISTS tenant_pricing_factors_percent_range;

ALTER TABLE tenant_pricing_factors
  ADD CONSTRAINT tenant_pricing_factors_value_check
  CHECK (
    (value_type = 'percent' AND percent >= 0 AND percent <= 100)
    OR
    (value_type = 'fixed' AND fixed_amount >= 0)
  );

-- 4. Unique constraint: one active factor per key per tenant
CREATE UNIQUE INDEX IF NOT EXISTS tenant_pricing_factors_tenant_key_idx
  ON tenant_pricing_factors (tenant_id, factor_key)
  WHERE archived_at IS NULL;

-- 5. Apply migration to remote DB
