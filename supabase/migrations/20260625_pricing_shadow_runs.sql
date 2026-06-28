-- =============================================================================
-- Pricing shadow runs — legacy vs v3 engine comparison
-- =============================================================================
-- Records the difference between legacy pricing and v3 engine output for each
-- quote, enabling safe cutover by proving the new engine doesn't silently
-- diverge from the live legacy engine.
-- =============================================================================

-- 1. Add feature_flags column to tenants ──────────────────────────────────────

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}';

-- 2. Shadow runs table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pricing_shadow_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  quotation_id      uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  legacy_total      numeric(14, 2),
  v3_total          numeric(14, 2) NOT NULL,
  diff              numeric(14, 2),
  within_tolerance  boolean NOT NULL DEFAULT true,
  legacy_error      text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS pricing_shadow_runs_tenant_id_idx
  ON public.pricing_shadow_runs (tenant_id);

CREATE INDEX IF NOT EXISTS pricing_shadow_runs_quotation_id_idx
  ON public.pricing_shadow_runs (quotation_id);

CREATE INDEX IF NOT EXISTS pricing_shadow_runs_tenant_id_created_at_idx
  ON public.pricing_shadow_runs (tenant_id, created_at);

-- 3. RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.pricing_shadow_runs ENABLE ROW LEVEL SECURITY;

-- SELECT: all tenant roles can read shadow runs
CREATE POLICY pricing_shadow_runs_select ON public.pricing_shadow_runs
  FOR SELECT USING (is_tenant_member(tenant_id));

-- INSERT: owner, admin, sales can create shadow runs
CREATE POLICY pricing_shadow_runs_insert ON public.pricing_shadow_runs
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));

-- No UPDATE policy → RLS denies UPDATE by default
-- No DELETE policy → RLS denies DELETE by default
