-- Add brand and country_of_origin to all 7 catalog tables

ALTER TABLE public.catalog_materials ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE public.catalog_materials ADD COLUMN IF NOT EXISTS country_of_origin text;

ALTER TABLE public.catalog_finishes ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE public.catalog_finishes ADD COLUMN IF NOT EXISTS country_of_origin text;

ALTER TABLE public.catalog_veneers ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE public.catalog_veneers ADD COLUMN IF NOT EXISTS country_of_origin text;

ALTER TABLE public.catalog_edge_bands ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE public.catalog_edge_bands ADD COLUMN IF NOT EXISTS country_of_origin text;

ALTER TABLE public.catalog_hardware ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE public.catalog_hardware ADD COLUMN IF NOT EXISTS country_of_origin text;

ALTER TABLE public.catalog_accessories ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE public.catalog_accessories ADD COLUMN IF NOT EXISTS country_of_origin text;

ALTER TABLE public.catalog_manufacturing_operations ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE public.catalog_manufacturing_operations ADD COLUMN IF NOT EXISTS country_of_origin text;
