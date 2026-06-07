-- Material-based wastage rules migration
-- Replaces dimension-based wastage_rules with simple material_id -> wastage_pct mapping

-- 1. Add material_id column to wastage_rules
ALTER TABLE public.wastage_rules
  ADD COLUMN IF NOT EXISTS material_id uuid;

-- 2. Add foreign key constraint
ALTER TABLE public.wastage_rules
  ADD CONSTRAINT wastage_rules_material_id_fkey
  FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;

-- 3. Create unique index to prevent duplicate wastage rules per material
CREATE UNIQUE INDEX IF NOT EXISTS wastage_rules_material_id_unique
  ON public.wastage_rules (material_id)
  WHERE material_id IS NOT NULL;

-- 4. Migrate existing data: for each material, create a wastage_rule using its wastage_pct
INSERT INTO public.wastage_rules (material_id, wastage_pct, active, created_at)
SELECT m.id, m.wastage_pct, true, now()
FROM public.materials m
LEFT JOIN public.wastage_rules wr ON wr.material_id = m.id
WHERE m.wastage_pct IS NOT NULL
  AND m.wastage_pct > 0
  AND wr.material_id IS NULL
ON CONFLICT (material_id) DO NOTHING;

-- 5. Add comment for clarity
COMMENT ON TABLE public.wastage_rules IS 'Material-specific wastage percentages. One rule per material.';
COMMENT ON COLUMN public.wastage_rules.material_id IS 'References materials.id. Unique per material.';
COMMENT ON COLUMN public.wastage_rules.wastage_pct IS 'Wastage percentage to apply for this material.';

-- 6. Grant permissions
GRANT SELECT ON public.wastage_rules TO authenticated;
GRANT ALL ON public.wastage_rules TO service_role;