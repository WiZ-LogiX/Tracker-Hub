-- =============================================================================
-- T2.0 — Hierarchical quotation builder
-- =============================================================================
-- Adds the 5-level pricing hierarchy:
--   quotation → product → section → unit → component
--
-- All tables carry tenant_id and are RLS-protected via is_tenant_member().
-- CASCADE deletes flow downward: deleting a quotation removes the entire tree.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enum for component kinds
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'component_kind') THEN
    CREATE TYPE public.component_kind AS ENUM (
      'material', 'hardware', 'accessory', 'manufacturing'
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. quotation_products — one row per configurable product in a quote
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.quotation_products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id  uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  product_type_code text NOT NULL,
  label         text,
  position      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_quotation_products_tenant
  ON public.quotation_products (tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotation_products_quotation
  ON public.quotation_products (quotation_id);

-- ---------------------------------------------------------------------------
-- 3. sections — logical zones within a product
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sections (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_product_id    uuid NOT NULL REFERENCES public.quotation_products(id) ON DELETE CASCADE,
  label                   text,
  position                integer NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  tenant_id               uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sections_tenant
  ON public.sections (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sections_quotation_product
  ON public.sections (quotation_product_id);

-- ---------------------------------------------------------------------------
-- 4. units — the fundamental pricing object
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.units (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id                uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  unit_type_id              uuid,
  width_mm                  integer NOT NULL DEFAULT 600,
  height_mm                 integer NOT NULL DEFAULT 720,
  depth_mm                  integer NOT NULL DEFAULT 600,
  qty                       integer NOT NULL DEFAULT 1,
  override_factor_keys      jsonb NOT NULL DEFAULT '{}',
  computed_unit_cost        numeric(14,2) NOT NULL DEFAULT 0,
  computed_unit_price       numeric(14,2) NOT NULL DEFAULT 0,
  snapshot_unit_cost        numeric(14,2) NOT NULL DEFAULT 0,
  snapshot_unit_price       numeric(14,2) NOT NULL DEFAULT 0,
  position                  integer NOT NULL DEFAULT 0,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  tenant_id                 uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,

  -- Reject negative dimensions and quantities
  CONSTRAINT units_width_mm_positive  CHECK (width_mm >= 0),
  CONSTRAINT units_height_mm_positive CHECK (height_mm >= 0),
  CONSTRAINT units_depth_mm_positive  CHECK (depth_mm >= 0),
  CONSTRAINT units_qty_positive       CHECK (qty >= 0)
);

CREATE INDEX IF NOT EXISTS idx_units_tenant
  ON public.units (tenant_id);
CREATE INDEX IF NOT EXISTS idx_units_section
  ON public.units (section_id);

-- ---------------------------------------------------------------------------
-- 5. components — leaf-level priced inputs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.components (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id           uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  kind              public.component_kind NOT NULL,
  catalog_id        uuid,
  qty               numeric(10,3) NOT NULL DEFAULT 1,
  unit_of_measure   text NOT NULL DEFAULT 'pcs',
  computed_amount   numeric(14,2) NOT NULL DEFAULT 0,
  snapshot_amount   numeric(14,2) NOT NULL DEFAULT 0,
  position          integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,

  -- Reject negative qty
  CONSTRAINT components_qty_positive CHECK (qty >= 0)
);

CREATE INDEX IF NOT EXISTS idx_components_tenant
  ON public.components (tenant_id);
CREATE INDEX IF NOT EXISTS idx_components_unit
  ON public.components (unit_id);

-- ---------------------------------------------------------------------------
-- 6. RLS policies — reuse is_tenant_member() from 20260612_tenant_rls_v1.sql
-- ---------------------------------------------------------------------------

ALTER TABLE public.quotation_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.components             ENABLE ROW LEVEL SECURITY;

-- quotation_products
CREATE POLICY quotation_products_select ON public.quotation_products
  FOR SELECT USING (is_tenant_member(tenant_id));

CREATE POLICY quotation_products_insert ON public.quotation_products
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));

CREATE POLICY quotation_products_update ON public.quotation_products
  FOR UPDATE USING (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]))
  WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));

CREATE POLICY quotation_products_delete ON public.quotation_products
  FOR DELETE USING (is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));

-- sections
CREATE POLICY sections_select ON public.sections
  FOR SELECT USING (is_tenant_member(tenant_id));

CREATE POLICY sections_insert ON public.sections
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));

CREATE POLICY sections_update ON public.sections
  FOR UPDATE USING (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]))
  WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));

CREATE POLICY sections_delete ON public.sections
  FOR DELETE USING (is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));

-- units
CREATE POLICY units_select ON public.units
  FOR SELECT USING (is_tenant_member(tenant_id));

CREATE POLICY units_insert ON public.units
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));

CREATE POLICY units_update ON public.units
  FOR UPDATE USING (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]))
  WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));

CREATE POLICY units_delete ON public.units
  FOR DELETE USING (is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));

-- components
CREATE POLICY components_select ON public.components
  FOR SELECT USING (is_tenant_member(tenant_id));

CREATE POLICY components_insert ON public.components
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));

CREATE POLICY components_update ON public.components
  FOR UPDATE USING (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]))
  WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));

CREATE POLICY components_delete ON public.components
  FOR DELETE USING (is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));
