-- =============================================================================
-- T2.0 — Down migration: Hierarchical quotation builder
-- =============================================================================
-- Drops all tables, RLS policies, and enum created by the up migration.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Drop RLS policies (must drop policies before disabling RLS)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS quotation_products_select ON public.quotation_products;
DROP POLICY IF EXISTS quotation_products_insert ON public.quotation_products;
DROP POLICY IF EXISTS quotation_products_update ON public.quotation_products;
DROP POLICY IF EXISTS quotation_products_delete ON public.quotation_products;

DROP POLICY IF EXISTS sections_select ON public.sections;
DROP POLICY IF EXISTS sections_insert ON public.sections;
DROP POLICY IF EXISTS sections_update ON public.sections;
DROP POLICY IF EXISTS sections_delete ON public.sections;

DROP POLICY IF EXISTS units_select ON public.units;
DROP POLICY IF EXISTS units_insert ON public.units;
DROP POLICY IF EXISTS units_update ON public.units;
DROP POLICY IF EXISTS units_delete ON public.units;

DROP POLICY IF EXISTS components_select ON public.components;
DROP POLICY IF EXISTS components_insert ON public.components;
DROP POLICY IF EXISTS components_update ON public.components;
DROP POLICY IF EXISTS components_delete ON public.components;

-- ---------------------------------------------------------------------------
-- 2. Disable RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.components  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.units       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_products DISABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Drop tables (cascade drops FKs and indexes)
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS public.components  CASCADE;
DROP TABLE IF EXISTS public.units       CASCADE;
DROP TABLE IF EXISTS public.sections    CASCADE;
DROP TABLE IF EXISTS public.quotation_products CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Drop enum
-- ---------------------------------------------------------------------------

DROP TYPE IF EXISTS public.component_kind;
