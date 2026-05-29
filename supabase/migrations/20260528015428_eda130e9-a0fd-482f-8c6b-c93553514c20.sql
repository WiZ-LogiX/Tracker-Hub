
-- 1) Restrict anon column access on products
REVOKE SELECT ON public.products FROM anon;
GRANT SELECT (id, company_id, category_id, code, name_ar, name_en, description_ar, active, created_at) ON public.products TO anon;

-- 2) Make production-photos bucket private
UPDATE storage.buckets SET public = false WHERE id = 'production-photos';
