-- Down migration: price_history (append-only)

-- 1. Drop indexes ────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS price_history_effective_idx;
DROP INDEX IF EXISTS price_history_entity_idx;
DROP INDEX IF EXISTS price_history_tenant_id_idx;

-- 2. Drop RLS policies ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS price_history_insert ON public.price_history;
DROP POLICY IF EXISTS price_history_select ON public.price_history;

-- 3. Disable RLS ─────────────────────────────────────────────────────────────

ALTER TABLE public.price_history DISABLE ROW LEVEL SECURITY;

-- 4. Drop table ──────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.price_history CASCADE;
