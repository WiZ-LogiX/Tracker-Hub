
-- 1. Default-tenant helper
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT tenant_id FROM public.tenant_members
       WHERE user_id = auth.uid()
       ORDER BY created_at ASC LIMIT 1),
    (SELECT id FROM public.tenants WHERE slug = 'pelecanon')
  )
$$;

-- 2. Apply default to every tenant_id column on business tables
DO $$
DECLARE t text;
  tables text[] := ARRAY[
    'customers','quotes','quote_items','invoices','orders',
    'production_assignments','qc_inspections','remakes','workers',
    'materials','material_variants','suppliers','wastage_rules',
    'internal_notes','finishes','veneers','accessories','products',
    'product_templates','categories','configurations',
    'pricing_factors','pricing_rules','discounts',
    'production_logs','production_photos','notification_log',
    'notification_templates','quote_requests','audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id()', t);
  END LOOP;
END $$;

-- 3. Fix permissive RLS warning on tenants insert: require it's the first tenant for caller
DROP POLICY IF EXISTS tenants_self_insert ON public.tenants;
CREATE POLICY tenants_self_insert ON public.tenants
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Search_path on helper triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.prevent_tenant_id_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'tenant_id is immutable';
  END IF;
  RETURN NEW;
END $$;

-- 5. Restrict bucket listing: only owner can list/manage own logos
DROP POLICY IF EXISTS "Tenant logos authed write" ON storage.objects;
DROP POLICY IF EXISTS "Tenant logos authed update" ON storage.objects;
CREATE POLICY "Tenant logos owner write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tenant-logos' AND auth.uid() = owner);
CREATE POLICY "Tenant logos owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'tenant-logos' AND auth.uid() = owner);

-- 6. SECURITY DEFINER helpers should NOT be exposed via PostgREST/anon.
-- Revoke EXECUTE from PUBLIC + anon. Keep authenticated so RLS policies can call.
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(uuid, public.tenant_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_tenant_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_tenant_id() FROM PUBLIC, anon;
