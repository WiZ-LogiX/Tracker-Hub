-- =============================================================================
-- Quote snapshots — append-only audit trail for pricing immutability
-- =============================================================================
-- Every state transition freezes the full tree + computed breakdown so
-- historical quotes never change when catalog prices move.
--
-- Defence-in-depth:
--   1. BEFORE UPDATE / BEFORE DELETE trigger → raises exception
--   2. RLS grants INSERT + SELECT only; no UPDATE / DELETE policies exist
-- =============================================================================

-- 1. Table ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.quote_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  quotation_id      uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  state             text NOT NULL,
  tree_json         jsonb NOT NULL,
  breakdown_json    jsonb NOT NULL,
  rule_version_id   text,
  factors_json      jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS quote_snapshots_tenant_id_idx
  ON public.quote_snapshots (tenant_id);

CREATE INDEX IF NOT EXISTS quote_snapshots_quotation_id_idx
  ON public.quote_snapshots (quotation_id);

-- Composite index for "get all snapshots for a quote in a given state, ordered by time"
CREATE INDEX IF NOT EXISTS quote_snapshots_quotation_id_state_idx
  ON public.quote_snapshots (quotation_id, state, created_at);

-- 2. Append-only trigger ─────────────────────────────────────────────────────
-- Fires BEFORE UPDATE or DELETE on any row. Always raises an exception.
-- Defence-in-depth: even service-role bypass of RLS cannot mutate snapshots.

CREATE OR REPLACE FUNCTION public.prevent_quote_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'quote_snapshots is append-only: % operation forbidden', TG_OP;
END;
$$;

CREATE TRIGGER trg_quote_snapshot_immutable
  BEFORE UPDATE OR DELETE ON public.quote_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_quote_snapshot_mutation();

-- 3. RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.quote_snapshots ENABLE ROW LEVEL SECURITY;

-- SELECT: all tenant roles can read snapshots
CREATE POLICY quote_snapshots_select ON public.quote_snapshots
  FOR SELECT USING (is_tenant_member(tenant_id));

-- INSERT: owner, admin, sales can create snapshots
CREATE POLICY quote_snapshots_insert ON public.quote_snapshots
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));

-- No UPDATE policy → RLS denies UPDATE by default
-- No DELETE policy → RLS denies DELETE by default
