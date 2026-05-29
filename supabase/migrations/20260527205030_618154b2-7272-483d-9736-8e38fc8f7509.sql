
-- =========================================================
-- Phase 1: configurable manufacturing + pricing engine
-- =========================================================

-- 1. companies (tenancy seed) -----------------------------------------
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY companies_staff_read ON public.companies FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY companies_admin_write ON public.companies FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- seed default company with a stable UUID
INSERT INTO public.companies (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'PeleCanon')
ON CONFLICT (id) DO NOTHING;

-- helper: default company uuid
CREATE OR REPLACE FUNCTION public.default_company_id() RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;

-- 2. suppliers --------------------------------------------------------
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.default_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  country text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY suppliers_staff_all ON public.suppliers FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

-- 3. material_variants ------------------------------------------------
CREATE TABLE public.material_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.default_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  material_id uuid NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  country_of_origin text,
  price_per_unit numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EGP',
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- cost data: staff-only, no anon
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_variants TO authenticated;
GRANT ALL ON public.material_variants TO service_role;
ALTER TABLE public.material_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY material_variants_staff_all ON public.material_variants FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
CREATE INDEX idx_mv_material ON public.material_variants(material_id);
CREATE INDEX idx_mv_supplier ON public.material_variants(supplier_id);

-- 4. veneers ----------------------------------------------------------
CREATE TABLE public.veneers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.default_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  price_per_m2 numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.veneers TO authenticated;
GRANT ALL ON public.veneers TO service_role;
ALTER TABLE public.veneers ENABLE ROW LEVEL SECURITY;
CREATE POLICY veneers_staff_all ON public.veneers FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

-- 5. pricing_factors --------------------------------------------------
CREATE TABLE public.pricing_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.default_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  key text NOT NULL,
  label_ar text NOT NULL,
  kind text NOT NULL, -- labor|wastage|overhead|margin|luxury|complexity|rush|country|custom
  value_pct numeric NOT NULL DEFAULT 0,
  value_fixed numeric NOT NULL DEFAULT 0,
  scope text NOT NULL DEFAULT 'global', -- global|category|product|item
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_factors TO authenticated;
GRANT ALL ON public.pricing_factors TO service_role;
ALTER TABLE public.pricing_factors ENABLE ROW LEVEL SECURITY;
CREATE POLICY pricing_factors_staff_all ON public.pricing_factors FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

-- 6. pricing_rules ----------------------------------------------------
CREATE TABLE public.pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.default_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft', -- draft|active|archived
  formula jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_from timestamptz,
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_rules TO authenticated;
GRANT ALL ON public.pricing_rules TO service_role;
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY pricing_rules_staff_all ON public.pricing_rules FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

-- seed an initial active rule v1 mirroring current behavior
INSERT INTO public.pricing_rules (company_id, name, version, status, formula, effective_from)
VALUES (public.default_company_id(), 'القاعدة الافتراضية', 1, 'active',
  '{"steps":[
    {"op":"add","of":"base_cost"},
    {"op":"add","of":"material_cost"},
    {"op":"add","of":"finish_cost"},
    {"op":"add","of":"veneer_cost"},
    {"op":"add","of":"accessories_cost"},
    {"op":"snapshot","as":"subtotal_before_overhead"},
    {"op":"mul_pct","factor":"labor","of":"subtotal_before_overhead","add":true},
    {"op":"mul_pct","factor":"wastage","of":"subtotal_before_overhead","add":true},
    {"op":"mul_pct","factor":"overhead","of":"subtotal_before_overhead","add":true},
    {"op":"snapshot","as":"cost_before_margin"},
    {"op":"mul_pct","factor":"margin","of":"cost_before_margin","add":true}
  ]}'::jsonb,
  now())
ON CONFLICT DO NOTHING;

-- seed default factors mirroring current product defaults
INSERT INTO public.pricing_factors (company_id, key, label_ar, kind, value_pct, scope)
VALUES
  (public.default_company_id(), 'labor', 'العمالة', 'labor', 15, 'global'),
  (public.default_company_id(), 'wastage', 'الهدر', 'wastage', 8, 'global'),
  (public.default_company_id(), 'overhead', 'المصاريف العامة', 'overhead', 10, 'global'),
  (public.default_company_id(), 'margin', 'هامش الربح', 'margin', 25, 'global'),
  (public.default_company_id(), 'luxury', 'فخامة', 'luxury', 0, 'item'),
  (public.default_company_id(), 'complexity', 'تعقيد التصميم', 'complexity', 0, 'item'),
  (public.default_company_id(), 'rush', 'استعجال', 'rush', 0, 'item')
ON CONFLICT (company_id, key) DO NOTHING;

-- 7. product_templates -----------------------------------------------
CREATE TABLE public.product_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.default_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  category_id uuid,
  code text,
  name_ar text NOT NULL,
  name_en text,
  description_ar text,
  base_price numeric NOT NULL DEFAULT 0,
  default_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_templates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_templates TO authenticated;
GRANT ALL ON public.product_templates TO service_role;
ALTER TABLE public.product_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_templates_public_read ON public.product_templates FOR SELECT USING (active = true);
CREATE POLICY product_templates_staff_write ON public.product_templates FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

-- seed templates from existing products
INSERT INTO public.product_templates (company_id, category_id, code, name_ar, name_en, description_ar, base_price, active)
SELECT public.default_company_id(), category_id, code, name_ar, name_en, description_ar, base_price, active
FROM public.products
ON CONFLICT DO NOTHING;

-- 8. configurations --------------------------------------------------
CREATE TABLE public.configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_item_id uuid REFERENCES public.quote_items(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.product_templates(id) ON DELETE SET NULL,
  selections jsonb NOT NULL DEFAULT '{}'::jsonb,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  pricing_rule_version int,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.configurations TO authenticated;
GRANT ALL ON public.configurations TO service_role;
ALTER TABLE public.configurations ENABLE ROW LEVEL SECURITY;
CREATE POLICY configurations_staff_all ON public.configurations FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

-- 9. Phase 2 operational tables (empty stubs) ------------------------
CREATE TABLE public.workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.default_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text,
  phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workers TO authenticated;
GRANT ALL ON public.workers TO service_role;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY workers_staff_all ON public.workers FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE TABLE public.production_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  stage order_stage NOT NULL,
  worker_id uuid REFERENCES public.workers(id) ON DELETE SET NULL,
  started_at timestamptz,
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_assignments TO authenticated;
GRANT ALL ON public.production_assignments TO service_role;
ALTER TABLE public.production_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY production_assignments_staff_all ON public.production_assignments FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE TABLE public.qc_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  stage order_stage NOT NULL,
  passed boolean NOT NULL DEFAULT false,
  notes text,
  inspector_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qc_inspections TO authenticated;
GRANT ALL ON public.qc_inspections TO service_role;
ALTER TABLE public.qc_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY qc_inspections_staff_all ON public.qc_inspections FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE TABLE public.remakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.remakes TO authenticated;
GRANT ALL ON public.remakes TO service_role;
ALTER TABLE public.remakes ENABLE ROW LEVEL SECURITY;
CREATE POLICY remakes_staff_all ON public.remakes FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE TABLE public.internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  author_id uuid,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_notes TO authenticated;
GRANT ALL ON public.internal_notes TO service_role;
ALTER TABLE public.internal_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY internal_notes_staff_all ON public.internal_notes FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
CREATE INDEX idx_internal_notes_entity ON public.internal_notes(entity_type, entity_id);

-- 10. add company_id to existing operational tables ------------------
ALTER TABLE public.customers       ADD COLUMN IF NOT EXISTS company_id uuid NOT NULL DEFAULT public.default_company_id();
ALTER TABLE public.materials       ADD COLUMN IF NOT EXISTS company_id uuid NOT NULL DEFAULT public.default_company_id();
ALTER TABLE public.finishes        ADD COLUMN IF NOT EXISTS company_id uuid NOT NULL DEFAULT public.default_company_id();
ALTER TABLE public.accessories     ADD COLUMN IF NOT EXISTS company_id uuid NOT NULL DEFAULT public.default_company_id();
ALTER TABLE public.categories      ADD COLUMN IF NOT EXISTS company_id uuid NOT NULL DEFAULT public.default_company_id();
ALTER TABLE public.discounts       ADD COLUMN IF NOT EXISTS company_id uuid NOT NULL DEFAULT public.default_company_id();
ALTER TABLE public.products        ADD COLUMN IF NOT EXISTS company_id uuid NOT NULL DEFAULT public.default_company_id();
ALTER TABLE public.quote_requests  ADD COLUMN IF NOT EXISTS company_id uuid NOT NULL DEFAULT public.default_company_id();
ALTER TABLE public.quotes          ADD COLUMN IF NOT EXISTS company_id uuid NOT NULL DEFAULT public.default_company_id();
ALTER TABLE public.quote_items     ADD COLUMN IF NOT EXISTS company_id uuid NOT NULL DEFAULT public.default_company_id();
ALTER TABLE public.invoices        ADD COLUMN IF NOT EXISTS company_id uuid NOT NULL DEFAULT public.default_company_id();
ALTER TABLE public.orders          ADD COLUMN IF NOT EXISTS company_id uuid NOT NULL DEFAULT public.default_company_id();
ALTER TABLE public.production_logs ADD COLUMN IF NOT EXISTS company_id uuid NOT NULL DEFAULT public.default_company_id();
ALTER TABLE public.production_photos ADD COLUMN IF NOT EXISTS company_id uuid NOT NULL DEFAULT public.default_company_id();
ALTER TABLE public.audit_log       ADD COLUMN IF NOT EXISTS company_id uuid NOT NULL DEFAULT public.default_company_id();

-- 11. seed material_variants from existing materials -----------------
INSERT INTO public.material_variants (company_id, material_id, price_per_unit, currency, valid_from, active)
SELECT public.default_company_id(), m.id, m.price_per_unit, 'EGP', CURRENT_DATE, m.active
FROM public.materials m
WHERE NOT EXISTS (
  SELECT 1 FROM public.material_variants mv WHERE mv.material_id = m.id
);
