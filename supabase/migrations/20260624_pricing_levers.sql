-- =============================================================================
-- Pricing levers, wastage rules, discounts, fees/credits
-- =============================================================================
-- New prefixed tables (tenant_pricing_factors, tenant_wastage_rules,
-- tenant_discounts, fees_credits) for the data-driven pricing engine.
-- Existing tables (pricing_factors, wastage_rules, discounts) untouched.
-- =============================================================================

-- 1. Enums ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pricing_factor_key') THEN
    CREATE TYPE public.pricing_factor_key AS ENUM (
      'labor', 'overhead', 'margin', 'luxury', 'complexity', 'rush', 'wastage'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wastage_scope') THEN
    CREATE TYPE public.wastage_scope AS ENUM ('material', 'material_type');
  END IF;
END $$;

-- discount_type already exists (percent, fixed)

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fee_sign') THEN
    CREATE TYPE public.fee_sign AS ENUM ('plus', 'minus');
  END IF;
END $$;

-- 2. tenant_pricing_factors ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_pricing_factors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  factor_key    public.pricing_factor_key NOT NULL,
  percent       numeric(6,2) NOT NULL DEFAULT 0,
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_pricing_factors
  ADD CONSTRAINT tenant_pricing_factors_percent_range
  CHECK (percent >= 0 AND percent <= 100);

CREATE INDEX IF NOT EXISTS tenant_pricing_factors_tenant_id_idx
  ON public.tenant_pricing_factors (tenant_id);

-- 3. tenant_wastage_rules ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_wastage_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  scope         public.wastage_scope NOT NULL,
  ref           text,
  pct           numeric(6,2) NOT NULL,
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_wastage_rules_tenant_id_idx
  ON public.tenant_wastage_rules (tenant_id);

-- 4. tenant_discounts ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_discounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  code          text NOT NULL,
  type          public.discount_type NOT NULL,
  value         numeric(14,2) NOT NULL,
  max_value     numeric(14,2),
  valid_from    date NOT NULL DEFAULT CURRENT_DATE,
  valid_to      date,
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_discounts
  ADD CONSTRAINT tenant_discounts_value_positive CHECK (value >= 0);

CREATE INDEX IF NOT EXISTS tenant_discounts_tenant_id_idx
  ON public.tenant_discounts (tenant_id);

-- 5. fees_credits ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fees_credits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  code            text NOT NULL,
  label_i18n_key  text NOT NULL,
  sign            public.fee_sign NOT NULL,
  amount          numeric(14,2),
  formula_key     text,
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Business rule: must have either amount or formula_key (not neither)
ALTER TABLE public.fees_credits
  ADD CONSTRAINT fees_credits_amount_or_formula
  CHECK (amount IS NOT NULL OR formula_key IS NOT NULL);

CREATE INDEX IF NOT EXISTS fees_credits_tenant_id_idx
  ON public.fees_credits (tenant_id);

-- 6. RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.tenant_pricing_factors  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_wastage_rules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_discounts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fees_credits           ENABLE ROW LEVEL SECURITY;

-- SELECT: all tenant roles
CREATE POLICY tenant_pricing_factors_select ON public.tenant_pricing_factors
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY tenant_wastage_rules_select ON public.tenant_wastage_rules
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY tenant_discounts_select ON public.tenant_discounts
  FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY fees_credits_select ON public.fees_credits
  FOR SELECT USING (is_tenant_member(tenant_id));

-- INSERT: owner/admin/sales
CREATE POLICY tenant_pricing_factors_insert ON public.tenant_pricing_factors
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));
CREATE POLICY tenant_wastage_rules_insert ON public.tenant_wastage_rules
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));
CREATE POLICY tenant_discounts_insert ON public.tenant_discounts
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));
CREATE POLICY fees_credits_insert ON public.fees_credits
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));

-- UPDATE: owner/admin/sales
CREATE POLICY tenant_pricing_factors_update ON public.tenant_pricing_factors
  FOR UPDATE USING (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));
CREATE POLICY tenant_wastage_rules_update ON public.tenant_wastage_rules
  FOR UPDATE USING (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));
CREATE POLICY tenant_discounts_update ON public.tenant_discounts
  FOR UPDATE USING (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));
CREATE POLICY fees_credits_update ON public.fees_credits
  FOR UPDATE USING (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));

-- DELETE: owner/admin only
CREATE POLICY tenant_pricing_factors_delete ON public.tenant_pricing_factors
  FOR DELETE USING (is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));
CREATE POLICY tenant_wastage_rules_delete ON public.tenant_wastage_rules
  FOR DELETE USING (is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));
CREATE POLICY tenant_discounts_delete ON public.tenant_discounts
  FOR DELETE USING (is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));
CREATE POLICY fees_credits_delete ON public.fees_credits
  FOR DELETE USING (is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));

-- 7. Seed defaults for PeleCanon tenant ─────────────────────────────────────
-- PeleCanon tenant_id = '2bf7cd99-d567-42d3-b5fc-22cc40654293'

INSERT INTO public.fees_credits (tenant_id, code, label_i18n_key, sign, amount)
VALUES
  ('2bf7cd99-d567-42d3-b5fc-22cc40654293', 'site_visit',  'site_visit',  'minus', 1000),
  ('2bf7cd99-d567-42d3-b5fc-22cc40654293', 'transport',    'transport',    'plus',  2000)
ON CONFLICT DO NOTHING;
