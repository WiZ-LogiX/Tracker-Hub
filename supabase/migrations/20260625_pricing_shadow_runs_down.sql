-- Down migration: pricing_shadow_runs + feature_flags

-- 1. Drop RLS policies ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS pricing_shadow_runs_insert ON public.pricing_shadow_runs;
DROP POLICY IF EXISTS pricing_shadow_runs_select ON public.pricing_shadow_runs;

-- 2. Disable RLS ─────────────────────────────────────────────────────────────

ALTER TABLE public.pricing_shadow_runs DISABLE ROW LEVEL SECURITY;

-- 3. Drop table ──────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.pricing_shadow_runs CASCADE;

-- 4. Drop index on tenants.feature_flags (column itself is pre-existing, don't drop)
-- No action needed — feature_flags column was already present.
