-- Down migration: pricing levers, wastage, discounts, fees/credits

-- 1. Drop RLS policies ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS fees_credits_delete ON public.fees_credits;
DROP POLICY IF EXISTS fees_credits_update ON public.fees_credits;
DROP POLICY IF EXISTS fees_credits_insert ON public.fees_credits;
DROP POLICY IF EXISTS fees_credits_select ON public.fees_credits;

DROP POLICY IF EXISTS tenant_discounts_delete ON public.tenant_discounts;
DROP POLICY IF EXISTS tenant_discounts_update ON public.tenant_discounts;
DROP POLICY IF EXISTS tenant_discounts_insert ON public.tenant_discounts;
DROP POLICY IF EXISTS tenant_discounts_select ON public.tenant_discounts;

DROP POLICY IF EXISTS tenant_wastage_rules_delete ON public.tenant_wastage_rules;
DROP POLICY IF EXISTS tenant_wastage_rules_update ON public.tenant_wastage_rules;
DROP POLICY IF EXISTS tenant_wastage_rules_insert ON public.tenant_wastage_rules;
DROP POLICY IF EXISTS tenant_wastage_rules_select ON public.tenant_wastage_rules;

DROP POLICY IF EXISTS tenant_pricing_factors_delete ON public.tenant_pricing_factors;
DROP POLICY IF EXISTS tenant_pricing_factors_update ON public.tenant_pricing_factors;
DROP POLICY IF EXISTS tenant_pricing_factors_insert ON public.tenant_pricing_factors;
DROP POLICY IF EXISTS tenant_pricing_factors_select ON public.tenant_pricing_factors;

-- 2. Disable RLS ─────────────────────────────────────────────────────────────

ALTER TABLE public.fees_credits           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_discounts       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_wastage_rules   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_pricing_factors DISABLE ROW LEVEL SECURITY;

-- 3. Drop tables ─────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.fees_credits           CASCADE;
DROP TABLE IF EXISTS public.tenant_discounts       CASCADE;
DROP TABLE IF EXISTS public.tenant_wastage_rules   CASCADE;
DROP TABLE IF EXISTS public.tenant_pricing_factors CASCADE;

-- 4. Drop enums ──────────────────────────────────────────────────────────────

DROP TYPE IF EXISTS public.fee_sign;
DROP TYPE IF EXISTS public.wastage_scope;
DROP TYPE IF EXISTS public.pricing_factor_key;
