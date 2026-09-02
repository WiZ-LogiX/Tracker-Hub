-- =============================================================================
-- catalog_edge_bands — dedicated table for edge banding materials
-- =============================================================================
-- Previously edge_band items shared catalog_materials. This gives them their
-- own table with a price_per_unit (per linear metre) field, matching the
-- pricing model in componentAmount.ts.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.catalog_edge_bands (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  code            text NOT NULL,
  price_per_unit  numeric(14,2) NOT NULL,
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.catalog_edge_bands
  ADD CONSTRAINT catalog_edge_bands_price_per_unit_positive CHECK (price_per_unit >= 0);

CREATE INDEX IF NOT EXISTS catalog_edge_bands_tenant_id_idx ON public.catalog_edge_bands (tenant_id);

-- RLS ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.catalog_edge_bands ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalog_edge_bands_select ON public.catalog_edge_bands
  FOR SELECT USING (is_tenant_member(tenant_id));

CREATE POLICY catalog_edge_bands_insert ON public.catalog_edge_bands
  FOR INSERT WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));

CREATE POLICY catalog_edge_bands_update ON public.catalog_edge_bands
  FOR UPDATE USING (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));

CREATE POLICY catalog_edge_bands_delete ON public.catalog_edge_bands
  FOR DELETE USING (is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));

-- Migrate existing edge_band components ───────────────────────────────────────
-- Components with kind='edge_band' reference catalog_materials IDs.
-- We don't move data here — the pricing functions will be updated to resolve
-- edge_band catalog_id from catalog_edge_bands directly.
