
-- Merge material variants (supplier + country of origin) into materials
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS supplier_id uuid,
  ADD COLUMN IF NOT EXISTS country_of_origin text;

-- Backfill from the most recent active variant per material
WITH latest AS (
  SELECT DISTINCT ON (material_id)
    material_id, supplier_id, country_of_origin, price_per_unit
  FROM public.material_variants
  WHERE active = true
  ORDER BY material_id, valid_from DESC, created_at DESC
)
UPDATE public.materials m
SET supplier_id = COALESCE(m.supplier_id, l.supplier_id),
    country_of_origin = COALESCE(m.country_of_origin, l.country_of_origin),
    price_per_unit = CASE WHEN m.price_per_unit = 0 THEN l.price_per_unit ELSE m.price_per_unit END
FROM latest l
WHERE m.id = l.material_id;
