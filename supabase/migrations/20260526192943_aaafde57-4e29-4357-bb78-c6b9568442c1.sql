
-- 1. user_roles: admin-only writes
CREATE POLICY "user_roles_admin_insert" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles_admin_update" ON public.user_roles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles_admin_delete" ON public.user_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2. products: hide internal cost columns from public/anon
REVOKE SELECT ON public.products FROM anon;
REVOKE SELECT ON public.products FROM authenticated;
GRANT SELECT (id, code, name_en, name_ar, description_ar, category_id, base_price, active, created_at)
  ON public.products TO anon;
GRANT SELECT ON public.products TO authenticated;

-- 3. SECURITY DEFINER functions: revoke broad EXECUTE
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- 4. production-photos bucket: stop listing while keeping public URL fetch working
DROP POLICY IF EXISTS "production_photos_public_read" ON storage.objects;
DROP POLICY IF EXISTS "production_photos_public_select" ON storage.objects;
DROP POLICY IF EXISTS "Public read production-photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view production photos" ON storage.objects;
DROP POLICY IF EXISTS "production photos public read" ON storage.objects;
-- Only staff can list/select objects via API; public URL access (bucket.public=true) still works for direct file fetches.
CREATE POLICY "production_photos_staff_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'production-photos' AND public.is_staff(auth.uid()));

-- 5. Tighten always-true anon insert policies
DROP POLICY IF EXISTS "customers_anon_insert" ON public.customers;
CREATE POLICY "customers_anon_insert" ON public.customers
  FOR INSERT TO anon
  WITH CHECK (
    name IS NOT NULL AND length(btrim(name)) > 0
    AND phone IS NOT NULL AND length(btrim(phone)) >= 6
  );

DROP POLICY IF EXISTS "rfq_anon_insert" ON public.quote_requests;
CREATE POLICY "rfq_anon_insert" ON public.quote_requests
  FOR INSERT TO anon
  WITH CHECK (
    customer_name IS NOT NULL AND length(btrim(customer_name)) > 0
    AND customer_phone IS NOT NULL AND length(btrim(customer_phone)) >= 6
    AND product_category IS NOT NULL AND length(btrim(product_category)) > 0
  );
