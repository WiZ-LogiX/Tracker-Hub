-- Down migration: quote_snapshots (append-only audit trail)

-- 1. Drop trigger and function ──────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_quote_snapshot_immutable ON public.quote_snapshots;
DROP FUNCTION IF EXISTS public.prevent_quote_snapshot_mutation();

-- 2. Drop RLS policies ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS quote_snapshots_insert ON public.quote_snapshots;
DROP POLICY IF EXISTS quote_snapshots_select ON public.quote_snapshots;

-- 3. Disable RLS ─────────────────────────────────────────────────────────────

ALTER TABLE public.quote_snapshots DISABLE ROW LEVEL SECURITY;

-- 4. Drop table ──────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.quote_snapshots CASCADE;
