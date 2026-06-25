-- =============================================================================
-- Unit type templates — reusable BOM definitions for the quotation builder
-- =============================================================================
-- unit_types:   reusable product templates (Base Cabinet, Wall Cabinet, etc.)
-- unit_type_bom: default bill-of-materials for each unit type
-- =============================================================================

-- 1. unit_types ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.unit_types (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  code                  text NOT NULL,
  label_i18n_key        text NOT NULL,
  category_code         text,
  nominal_width_mm      integer,
  nominal_height_mm     integer,
  nominal_depth_mm      integer,
  archived_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Unique (tenant, code) — one code per tenant
CREATE UNIQUE INDEX IF NOT EXISTS unit_types_tenant_code_unique
  ON public.unit_types (tenant_id, code);

-- Fast lookups
CREATE INDEX IF NOT EXISTS unit_types_tenant_id_idx
  ON public.unit_types (tenant_id);

CREATE INDEX IF NOT EXISTS unit_types_tenant_id_category_code_idx
  ON public.unit_types (tenant_id, category_code);

-- 2. unit_type_bom ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.unit_type_bom (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  unit_type_id          uuid NOT NULL REFERENCES public.unit_types(id) ON DELETE CASCADE,
  kind                  public.component_kind NOT NULL,
  catalog_ref           uuid,
  area_function_key     text,
  default_qty           numeric NOT NULL DEFAULT 1,
  position              integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Business rule: material kind must have either a catalog_ref or area_function_key.
-- Manufacturing kind must use area_function_key.
-- All other kinds (hardware, accessory) must use catalog_ref.
-- Enforced as: at least one of catalog_ref or area_function_key is non-null,
-- OR the kind is manufacturing and area_function_key is non-null.
ALTER TABLE public.unit_type_bom
  ADD CONSTRAINT unit_type_bom_reference_check
  CHECK (
    (kind = 'manufacturing' AND area_function_key IS NOT NULL)
    OR catalog_ref IS NOT NULL
    OR area_function_key IS NOT NULL
  );

-- Fast lookups
CREATE INDEX IF NOT EXISTS unit_type_bom_tenant_id_idx
  ON public.unit_type_bom (tenant_id);

CREATE INDEX IF NOT EXISTS unit_type_bom_unit_type_id_idx
  ON public.unit_type_bom (unit_type_id);

-- 3. RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.unit_types    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_type_bom ENABLE ROW LEVEL SECURITY;

-- unit_types — SELECT: all tenant roles
CREATE POLICY unit_types_select ON public.unit_types
  FOR SELECT USING (is_tenant_member(tenant_id));

-- unit_types — INSERT: owner/admin/sales
CREATE POLICY unit_types_insert ON public.unit_types
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));

-- unit_types — UPDATE: owner/admin/sales
CREATE POLICY unit_types_update ON public.unit_types
  FOR UPDATE USING (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));

-- unit_types — DELETE: owner/admin only
CREATE POLICY unit_types_delete ON public.unit_types
  FOR DELETE USING (is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));

-- unit_type_bom — SELECT: all tenant roles
CREATE POLICY unit_type_bom_select ON public.unit_type_bom
  FOR SELECT USING (is_tenant_member(tenant_id));

-- unit_type_bom — INSERT: owner/admin/sales
CREATE POLICY unit_type_bom_insert ON public.unit_type_bom
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));

-- unit_type_bom — UPDATE: owner/admin/sales
CREATE POLICY unit_type_bom_update ON public.unit_type_bom
  FOR UPDATE USING (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));

-- unit_type_bom — DELETE: owner/admin only
CREATE POLICY unit_type_bom_delete ON public.unit_type_bom
  FOR DELETE USING (is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));
