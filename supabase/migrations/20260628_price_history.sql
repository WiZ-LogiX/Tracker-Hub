-- Price history: append-only version tracking for catalog price changes.
-- Each row represents a price snapshot at a point in time.
-- The engine uses current catalog prices; this table provides historical
-- audit trail for margin reporting and price-change analysis.

CREATE TABLE IF NOT EXISTS public.price_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  entity_type text NOT NULL,  -- 'material' | 'hardware' | 'accessory' | 'manufacturing'
  entity_id   uuid NOT NULL,  -- FK to the catalog row
  price       numeric(14,2) NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: tenant isolation
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY price_history_select ON public.price_history
  FOR SELECT USING (tenant_id = (current_setting('app.tenant_id', true))::uuid);

CREATE POLICY price_history_insert ON public.price_history
  FOR INSERT WITH CHECK (tenant_id = (current_setting('app.tenant_id', true))::uuid);

-- No UPDATE or DELETE — append-only (matches quote_snapshots pattern)

-- Indexes for report queries
CREATE INDEX price_history_tenant_id_idx ON public.price_history (tenant_id);
CREATE INDEX price_history_entity_idx ON public.price_history (tenant_id, entity_type, entity_id);
CREATE INDEX price_history_effective_idx ON public.price_history (tenant_id, entity_type, entity_id, effective_from DESC);

COMMENT ON TABLE public.price_history IS 'Append-only catalog price version history. Each row is a price snapshot at a point in time.';
COMMENT ON COLUMN public.price_history.entity_type IS 'Catalog table: material, hardware, accessory, manufacturing';
COMMENT ON COLUMN public.price_history.entity_id IS 'Primary key of the catalog row';
COMMENT ON COLUMN public.price_history.effective_from IS 'Timestamp from which this price was effective';
