
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS wastage_pct numeric;
COMMENT ON COLUMN public.materials.wastage_pct IS 'Optional per-material wastage % override. When set, overrides the wastage_rules lookup.';
