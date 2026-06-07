-- Material-based wastage rules with dimension ranges
-- Replaces simple material_id -> wastage_pct with material_id + dimension ranges

-- 1. Add dimension columns if they don't exist
ALTER TABLE public.wastage_rules
  ADD COLUMN IF NOT EXISTS min_dimension numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_dimension numeric;

-- 2. Create index for dimension range lookups
CREATE INDEX IF NOT EXISTS wastage_rules_material_dim_idx
  ON public.wastage_rules (material_id, min_dimension, max_dimension);

-- 3. Migrate existing single-row-per-material rules to have min=0, max=NULL
UPDATE public.wastage_rules
SET min_dimension = 0, max_dimension = NULL
WHERE material_id IS NOT NULL
  AND (min_dimension IS NULL OR min_dimension = 0)
  AND max_dimension IS NULL;

-- 4. Add unique constraint to prevent overlapping ranges for same material
-- (This is a partial index - only one rule per material per range start)
CREATE UNIQUE INDEX IF NOT EXISTS wastage_rules_material_min_unique
  ON public.wastage_rules (material_id, min_dimension)
  WHERE material_id IS NOT NULL;

-- 5. Grant permissions
GRANT SELECT ON public.wastage_rules TO authenticated;
GRANT ALL ON public.wastage_rules TO service_role;

-- 6. Add comments
COMMENT ON TABLE public.wastage_rules IS 'Material-specific wastage percentages with optional dimension ranges.';
COMMENT ON COLUMN public.wastage_rules.material_id IS 'References materials.id. NULL for global fallback rules.';
COMMENT ON COLUMN public.wastage_rules.min_dimension IS 'Minimum dimension (inclusive) for this rule to apply.';
COMMENT ON COLUMN public.wastage_rules.max_dimension IS 'Maximum dimension (exclusive) for this rule to apply. NULL = no upper limit.';
COMMENT ON COLUMN public.wastage_rules.wastage_pct IS 'Wastage percentage to apply when dimension falls in [min_dimension, max_dimension).';