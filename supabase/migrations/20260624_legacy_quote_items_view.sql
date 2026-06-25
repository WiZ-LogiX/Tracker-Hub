-- =============================================================================
-- legacy_quote_items VIEW — 1:1 mirror of quote_items
-- =============================================================================
-- When leaf data eventually moves into units/components, this view will be
-- rewritten to UNION the new hierarchy back into the legacy shape.
-- For now it is a pure passthrough so zero code changes are needed.
--
-- RLS: the view uses SECURITY DEFINER via the base table's RLS policies.
-- Postgres applies quote_items RLS to queries against the view because
-- the view owner (migrator) differs from the querying role.
-- =============================================================================

CREATE OR REPLACE VIEW public.legacy_quote_items AS
  SELECT
    id,
    quote_id,
    product_id,
    product_name,
    material_id,
    material_name,
    finish_id,
    finish_name,
    dimension_value,
    qty,
    accessories,
    unit_price,
    line_total,
    breakdown,
    created_at,
    tenant_id
  FROM public.quote_items;
