-- Add area_function_key column to components table.
-- Required for veneer/finish/edge_band surface-area pricing.
-- The column was referenced by hierarchy.functions.ts and the pricing engine
-- but was never added to the remote DB schema.

ALTER TABLE components ADD COLUMN IF NOT EXISTS area_function_key text;

COMMENT ON COLUMN components.area_function_key IS 'Surface area function key for veneer/finish/edge_band pricing (e.g. door_panel, cabinet_side, edge_band)';
