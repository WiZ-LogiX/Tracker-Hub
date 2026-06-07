-- Material-based wastage rules migration
-- Replaces dimension-based wastage_rules with simple material_id -> wastage_pct mapping

-- 1. Add material_id to wastage_rules, make it unique, drop old columns
ALTER TABLE public.wastage_rules
  ADD COLUMN IF NOT EXISTS material_id uuid REFERENCES public.materials(id) ON DELETE CASCADE;

-- 2. Create unique index to prevent duplicate wastage rules per material
CREATE UNIQUE INDEX IF NOT EXISTS wastage_rules_material_id_unique
  ON public.wastage_rules (material_id)
  WHERE material_id IS NOT NULL;

-- 3. Migrate existing data: for each material, create a wastage_rule using its wastage_pct
-- (Only for materials that have wastage_pct set and don't already have a rule)
INSERT INTO public.wastage_rules (material_id, wastage_pct, active, created_at)
SELECT m.id, m.wastage_pct, true, now()
FROM public.materials m
LEFT JOIN public.wastage_rules wr ON wr.material_id = m.id
WHERE m.wastage_pct IS NOT NULL
  AND m.wastage_pct > 0
  AND wr.material_id IS NULL
ON CONFLICT (material_id) DO NOTHING;

-- 4. Drop old dimension-based columns (keep for backward compat but they're now optional)
-- We'll keep them but they won't be used for new material-based logic
-- ALTER TABLE public.wastage_rules DROP COLUMN IF EXISTS material_type;
-- ALTER TABLE public.wastage_rules DROP COLUMN IF EXISTS min_dimension;
-- ALTER TABLE public.wastage_rules DROP COLUMN IF EXISTS max_dimension;

-- 5. Add comment for clarity
COMMENT ON TABLE public.wastage_rules IS 'Material-specific wastage percentages. One rule per material.';
COMMENT ON COLUMN public.wastage_rules.material_id IS 'References materials.id. Unique per material.';
COMMENT ON COLUMN public.wastage_rules.wastage_pct IS 'Wastage percentage to apply for this material.';