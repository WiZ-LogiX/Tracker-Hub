-- Down migration: unit type templates
-- Drops RLS policies, disables RLS, drops tables.

-- 1. Drop RLS policies ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS unit_type_bom_delete ON public.unit_type_bom;
DROP POLICY IF EXISTS unit_type_bom_update ON public.unit_type_bom;
DROP POLICY IF EXISTS unit_type_bom_insert ON public.unit_type_bom;
DROP POLICY IF EXISTS unit_type_bom_select ON public.unit_type_bom;

DROP POLICY IF EXISTS unit_types_delete ON public.unit_types;
DROP POLICY IF EXISTS unit_types_update ON public.unit_types;
DROP POLICY IF EXISTS unit_types_insert ON public.unit_types;
DROP POLICY IF EXISTS unit_types_select ON public.unit_types;

-- 2. Disable RLS ─────────────────────────────────────────────────────────────

ALTER TABLE public.unit_type_bom DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_types    DISABLE ROW LEVEL SECURITY;

-- 3. Drop tables (children first) ────────────────────────────────────────────

DROP TABLE IF EXISTS public.unit_type_bom CASCADE;
DROP TABLE IF EXISTS public.unit_types  CASCADE;
