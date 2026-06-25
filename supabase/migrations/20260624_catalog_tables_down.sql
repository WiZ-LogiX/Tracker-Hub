-- Down migration: catalog tables

-- 1. Drop RLS policies ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS catalog_manufacturing_operations_delete ON public.catalog_manufacturing_operations;
DROP POLICY IF EXISTS catalog_manufacturing_operations_update ON public.catalog_manufacturing_operations;
DROP POLICY IF EXISTS catalog_manufacturing_operations_insert ON public.catalog_manufacturing_operations;
DROP POLICY IF EXISTS catalog_manufacturing_operations_select ON public.catalog_manufacturing_operations;

DROP POLICY IF EXISTS catalog_accessories_delete ON public.catalog_accessories;
DROP POLICY IF EXISTS catalog_accessories_update ON public.catalog_accessories;
DROP POLICY IF EXISTS catalog_accessories_insert ON public.catalog_accessories;
DROP POLICY IF EXISTS catalog_accessories_select ON public.catalog_accessories;

DROP POLICY IF EXISTS catalog_hardware_delete ON public.catalog_hardware;
DROP POLICY IF EXISTS catalog_hardware_update ON public.catalog_hardware;
DROP POLICY IF EXISTS catalog_hardware_insert ON public.catalog_hardware;
DROP POLICY IF EXISTS catalog_hardware_select ON public.catalog_hardware;

DROP POLICY IF EXISTS catalog_veneers_delete ON public.catalog_veneers;
DROP POLICY IF EXISTS catalog_veneers_update ON public.catalog_veneers;
DROP POLICY IF EXISTS catalog_veneers_insert ON public.catalog_veneers;
DROP POLICY IF EXISTS catalog_veneers_select ON public.catalog_veneers;

DROP POLICY IF EXISTS catalog_finishes_delete ON public.catalog_finishes;
DROP POLICY IF EXISTS catalog_finishes_update ON public.catalog_finishes;
DROP POLICY IF EXISTS catalog_finishes_insert ON public.catalog_finishes;
DROP POLICY IF EXISTS catalog_finishes_select ON public.catalog_finishes;

DROP POLICY IF EXISTS catalog_material_variants_delete ON public.catalog_material_variants;
DROP POLICY IF EXISTS catalog_material_variants_update ON public.catalog_material_variants;
DROP POLICY IF EXISTS catalog_material_variants_insert ON public.catalog_material_variants;
DROP POLICY IF EXISTS catalog_material_variants_select ON public.catalog_material_variants;

DROP POLICY IF EXISTS catalog_materials_delete ON public.catalog_materials;
DROP POLICY IF EXISTS catalog_materials_update ON public.catalog_materials;
DROP POLICY IF EXISTS catalog_materials_insert ON public.catalog_materials;
DROP POLICY IF EXISTS catalog_materials_select ON public.catalog_materials;

DROP POLICY IF EXISTS catalog_suppliers_delete ON public.catalog_suppliers;
DROP POLICY IF EXISTS catalog_suppliers_update ON public.catalog_suppliers;
DROP POLICY IF EXISTS catalog_suppliers_insert ON public.catalog_suppliers;
DROP POLICY IF EXISTS catalog_suppliers_select ON public.catalog_suppliers;

-- 2. Disable RLS ─────────────────────────────────────────────────────────────

ALTER TABLE public.catalog_manufacturing_operations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_accessories             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_hardware                DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_veneers                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_finishes                DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_material_variants       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_materials               DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_suppliers               DISABLE ROW LEVEL SECURITY;

-- 3. Drop tables (children first) ────────────────────────────────────────────

DROP TABLE IF EXISTS public.catalog_manufacturing_operations CASCADE;
DROP TABLE IF EXISTS public.catalog_accessories      CASCADE;
DROP TABLE IF EXISTS public.catalog_hardware         CASCADE;
DROP TABLE IF EXISTS public.catalog_veneers          CASCADE;
DROP TABLE IF EXISTS public.catalog_finishes         CASCADE;
DROP TABLE IF EXISTS public.catalog_material_variants CASCADE;
DROP TABLE IF EXISTS public.catalog_materials        CASCADE;
DROP TABLE IF EXISTS public.catalog_suppliers        CASCADE;

-- 4. Drop new enums ──────────────────────────────────────────────────────────

DROP TYPE IF EXISTS public.manufacturing_rate_unit;
DROP TYPE IF EXISTS public.modifier_type;
