-- Migration: Add material_id to wastage_rules for dimension-based wastage rules
-- Run this migration from the Supabase CLI or SQL Editor

-- Step 1: Add the column (nullable first to avoid issues with existing rows)
ALTER TABLE public.wastage_rules
ADD COLUMN IF NOT EXISTS material_id uuid REFERENCES public.materials(id) ON DELETE CASCADE;

-- Step 2: Create a unique index for material-level fallback rules
-- (rules where min/max dimensions are null, or single-rule materials)
CREATE UNIQUE INDEX IF NOT EXISTS wastage_rules_material_single_idx
ON public.wastage_rules (material_id)
WHERE min_dimension IS NULL AND max_dimension IS NULL;

-- Step 3: Create an index for efficient dimension-range lookups
CREATE INDEX IF NOT EXISTS wastage_rules_dimension_lookup_idx
ON public.wastage_rules (material_id, min_dimension, max_dimension);

-- Step 4: Migrate existing wastage_pct data from materials to wastage_rules
INSERT INTO public.wastage_rules (
  material_id,
  material_type,
  wastage_pct,
  active,
  min_dimension,
  max_dimension,
  created_at
)
SELECT 
  m.id,
  COALESCE(m.type, 'wood'),
  m.wastage_pct,
  true,
  0,
  NULL, -- Applies to all dimensions
  NOW()
FROM public.materials m
LEFT JOIN public.wastage_rules wr ON wr.material_id = m.id
WHERE m.wastage_pct IS NOT NULL 
  AND m.wastage_pct > 0
  AND wr.id IS NULL;

-- Step 5: Add NOT NULL constraint after migration (if wanted)
-- ALTER TABLE public.wastage_rules ALTER COLUMN material_id SET NOT NULL;
-- Note: Only uncomment after ALL rules have material_id populated