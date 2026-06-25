-- =============================================================================
-- Catalog tables — tenant-scoped priced entities
-- =============================================================================
-- catalog_materials, catalog_material_variants, catalog_finishes, catalog_veneers,
-- catalog_hardware, catalog_accessories, catalog_manufacturing_operations,
-- catalog_suppliers
--
-- All carry tenant_id, archived_at, created_at/updated_at.
-- ON DELETE RESTRICT on all FKs — deletion is forbidden, use archived_at.
-- =============================================================================

-- 1. Extend pricing_unit enum with new values ────────────────────────────────

DO $$ BEGIN
  ALTER TYPE public.pricing_unit ADD VALUE IF NOT EXISTS 'piece';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.pricing_unit ADD VALUE IF NOT EXISTS 'm';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.pricing_unit ADD VALUE IF NOT EXISTS 'm2';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.pricing_unit ADD VALUE IF NOT EXISTS 'minute';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. New enums ───────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'modifier_type') THEN
    CREATE TYPE public.modifier_type AS ENUM ('percent', 'fixed');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'manufacturing_rate_unit') THEN
    CREATE TYPE public.manufacturing_rate_unit AS ENUM ('piece', 'm', 'm2', 'minute');
  END IF;
END $$;

-- 3. catalog_suppliers ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.catalog_suppliers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name          text NOT NULL,
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalog_suppliers_tenant_id_idx ON public.catalog_suppliers (tenant_id);

-- 4. catalog_materials ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.catalog_materials (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  code                  text NOT NULL,
  label_i18n_key        text NOT NULL,
  pricing_unit          public.pricing_unit NOT NULL,
  price_per_unit        numeric(14,2) NOT NULL,
  default_wastage_pct   numeric(5,2),
  supplier_id           uuid REFERENCES public.catalog_suppliers(id) ON DELETE RESTRICT,
  archived_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.catalog_materials
  ADD CONSTRAINT catalog_materials_price_per_unit_positive CHECK (price_per_unit >= 0);

CREATE INDEX IF NOT EXISTS catalog_materials_tenant_id_idx ON public.catalog_materials (tenant_id);

-- 5. catalog_material_variants ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.catalog_material_variants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  material_id     uuid NOT NULL REFERENCES public.catalog_materials(id) ON DELETE RESTRICT,
  thickness_mm    numeric(6,1),
  finish_code     text,
  price_modifier  numeric(14,2) NOT NULL DEFAULT 0,
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalog_material_variants_tenant_id_idx ON public.catalog_material_variants (tenant_id);
CREATE INDEX IF NOT EXISTS catalog_material_variants_material_id_idx ON public.catalog_material_variants (material_id);

-- 6. catalog_finishes ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.catalog_finishes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  code            text NOT NULL,
  modifier_type   public.modifier_type NOT NULL,
  modifier_value  numeric(14,2) NOT NULL,
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalog_finishes_tenant_id_idx ON public.catalog_finishes (tenant_id);

-- 7. catalog_veneers ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.catalog_veneers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  code          text NOT NULL,
  price_per_m2  numeric(14,2) NOT NULL,
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.catalog_veneers
  ADD CONSTRAINT catalog_veneers_price_per_m2_positive CHECK (price_per_m2 >= 0);

CREATE INDEX IF NOT EXISTS catalog_veneers_tenant_id_idx ON public.catalog_veneers (tenant_id);

-- 8. catalog_hardware ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.catalog_hardware (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  code              text NOT NULL,
  price_per_piece   numeric(14,2) NOT NULL,
  archived_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.catalog_hardware
  ADD CONSTRAINT catalog_hardware_price_per_piece_positive CHECK (price_per_piece >= 0);

CREATE INDEX IF NOT EXISTS catalog_hardware_tenant_id_idx ON public.catalog_hardware (tenant_id);

-- 9. catalog_accessories ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.catalog_accessories (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  code              text NOT NULL,
  price_per_piece   numeric(14,2) NOT NULL,
  archived_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.catalog_accessories
  ADD CONSTRAINT catalog_accessories_price_per_piece_positive CHECK (price_per_piece >= 0);

CREATE INDEX IF NOT EXISTS catalog_accessories_tenant_id_idx ON public.catalog_accessories (tenant_id);

-- 10. catalog_manufacturing_operations ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.catalog_manufacturing_operations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  code          text NOT NULL,
  rate_unit     public.manufacturing_rate_unit NOT NULL,
  rate          numeric(14,2) NOT NULL,
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.catalog_manufacturing_operations
  ADD CONSTRAINT catalog_manufacturing_operations_rate_positive CHECK (rate >= 0);

CREATE INDEX IF NOT EXISTS catalog_manufacturing_operations_tenant_id_idx ON public.catalog_manufacturing_operations (tenant_id);

-- 11. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.catalog_suppliers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_materials               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_material_variants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_finishes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_veneers                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_hardware                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_accessories             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_manufacturing_operations ENABLE ROW LEVEL SECURITY;

-- SELECT: all tenant roles
CREATE POLICY catalog_suppliers_select ON public.catalog_suppliers
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY catalog_materials_select ON public.catalog_materials
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY catalog_material_variants_select ON public.catalog_material_variants
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY catalog_finishes_select ON public.catalog_finishes
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY catalog_veneers_select ON public.catalog_veneers
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY catalog_hardware_select ON public.catalog_hardware
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY catalog_accessories_select ON public.catalog_accessories
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY catalog_manufacturing_operations_select ON public.catalog_manufacturing_operations
  FOR SELECT USING (is_tenant_member(tenant_id));

-- INSERT: owner/admin/sales
CREATE POLICY catalog_suppliers_insert ON public.catalog_suppliers
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));
CREATE POLICY catalog_materials_insert ON public.catalog_materials
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));
CREATE POLICY catalog_material_variants_insert ON public.catalog_material_variants
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));
CREATE POLICY catalog_finishes_insert ON public.catalog_finishes
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));
CREATE POLICY catalog_veneers_insert ON public.catalog_veneers
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));
CREATE POLICY catalog_hardware_insert ON public.catalog_hardware
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));
CREATE POLICY catalog_accessories_insert ON public.catalog_accessories
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));
CREATE POLICY catalog_manufacturing_operations_insert ON public.catalog_manufacturing_operations
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));

-- UPDATE: owner/admin/sales
CREATE POLICY catalog_suppliers_update ON public.catalog_suppliers
  FOR UPDATE USING (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));
CREATE POLICY catalog_materials_update ON public.catalog_materials
  FOR UPDATE USING (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));
CREATE POLICY catalog_material_variants_update ON public.catalog_material_variants
  FOR UPDATE USING (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));
CREATE POLICY catalog_finishes_update ON public.catalog_finishes
  FOR UPDATE USING (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));
CREATE POLICY catalog_veneers_update ON public.catalog_veneers
  FOR UPDATE USING (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));
CREATE POLICY catalog_hardware_update ON public.catalog_hardware
  FOR UPDATE USING (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));
CREATE POLICY catalog_accessories_update ON public.catalog_accessories
  FOR UPDATE USING (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));
CREATE POLICY catalog_manufacturing_operations_update ON public.catalog_manufacturing_operations
  FOR UPDATE USING (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));

-- DELETE: owner/admin only
CREATE POLICY catalog_suppliers_delete ON public.catalog_suppliers
  FOR DELETE USING (is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));
CREATE POLICY catalog_materials_delete ON public.catalog_materials
  FOR DELETE USING (is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));
CREATE POLICY catalog_material_variants_delete ON public.catalog_material_variants
  FOR DELETE USING (is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));
CREATE POLICY catalog_finishes_delete ON public.catalog_finishes
  FOR DELETE USING (is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));
CREATE POLICY catalog_veneers_delete ON public.catalog_veneers
  FOR DELETE USING (is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));
CREATE POLICY catalog_hardware_delete ON public.catalog_hardware
  FOR DELETE USING (is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));
CREATE POLICY catalog_accessories_delete ON public.catalog_accessories
  FOR DELETE USING (is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));
CREATE POLICY catalog_manufacturing_operations_delete ON public.catalog_manufacturing_operations
  FOR DELETE USING (is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));
