-- COPY THIS ENTIRE BLOCK AND RUN IN SUPABASE DASHBOARD → SQL EDITOR
-- This adds material_id column and FK to wastage_rules table

-- 1. Add material_id column
ALTER TABLE public.wastage_rules
  ADD COLUMN IF NOT EXISTS material_id uuid;

-- 2. Add foreign key constraint
ALTER TABLE public.wastage_rules
  ADD CONSTRAINT wastage_rules_material_id_fkey
  FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;

-- 3. Create unique index (one wastage rule per material)
CREATE UNIQUE INDEX IF NOT EXISTS wastage_rules_material_id_unique
  ON public.wastage_rules (material_id)
  WHERE material_id IS NOT NULL;

-- 4. Migrate existing data: copy wastage_pct from materials table
INSERT INTO public.wastage_rules (material_id, wastage_pct, active, created_at)
SELECT m.id, m.wastage_pct, true, now()
FROM public.materials m
LEFT JOIN public.wastage_rules wr ON wr.material_id = m.id
WHERE m.wastage_pct IS NOT NULL
  AND m.wastage_pct > 0
  AND wr.material_id IS NULL
ON CONFLICT (material_id) DO NOTHING;

-- 5. Verify
SELECT * FROM public.wastage_rules WHERE material_id IS NOT NULL LIMIT 10;