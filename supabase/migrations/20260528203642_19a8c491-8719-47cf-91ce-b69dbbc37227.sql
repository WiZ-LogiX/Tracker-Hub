
-- Helper function (project doesn't have it yet)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- 1. Tenants
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  primary_color text,
  tax_number text,
  commercial_registry text,
  address text,
  phone text,
  email text,
  currency text NOT NULL DEFAULT 'EGP',
  tax_rate numeric NOT NULL DEFAULT 14,
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- 2. role enum + members
CREATE TYPE public.tenant_role AS ENUM ('owner','admin','sales','worker','viewer');

CREATE TABLE public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.tenant_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX idx_tenant_members_user ON public.tenant_members(user_id);
CREATE INDEX idx_tenant_members_tenant ON public.tenant_members(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_members TO authenticated;
GRANT ALL ON public.tenant_members TO service_role;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

-- 3. Helpers
CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant_id uuid, _roles public.tenant_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenant_members
    WHERE tenant_id = _tenant_id AND user_id = auth.uid() AND role = ANY(_roles))
$$;

CREATE OR REPLACE FUNCTION public.current_user_tenant_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() $$;

-- 4. RLS tenants + members
CREATE POLICY tenants_member_read ON public.tenants FOR SELECT TO authenticated
  USING (id IN (SELECT public.current_user_tenant_ids()));
CREATE POLICY tenants_owner_update ON public.tenants FOR UPDATE TO authenticated
  USING (public.is_tenant_member(id, ARRAY['owner','admin']::public.tenant_role[]))
  WITH CHECK (public.is_tenant_member(id, ARRAY['owner','admin']::public.tenant_role[]));
CREATE POLICY tenants_self_insert ON public.tenants FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY members_self_read ON public.tenant_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));
CREATE POLICY members_owner_write ON public.tenant_members FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]))
  WITH CHECK (public.is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));
CREATE POLICY members_self_insert ON public.tenant_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 5. Seed PeleCanon + backfill memberships
DO $$
DECLARE v_tid uuid;
BEGIN
  INSERT INTO public.tenants (slug, name, currency, tax_rate, plan, status)
  VALUES ('pelecanon','PeleCanon','EGP',14,'pro','active') RETURNING id INTO v_tid;

  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  SELECT DISTINCT v_tid, ur.user_id,
    CASE WHEN ur.role::text = 'admin' THEN 'owner'::public.tenant_role
         ELSE 'admin'::public.tenant_role END
  FROM public.user_roles ur
  ON CONFLICT DO NOTHING;
END $$;

-- 6. Immutability trigger
CREATE OR REPLACE FUNCTION public.prevent_tenant_id_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'tenant_id is immutable';
  END IF;
  RETURN NEW;
END $$;

-- 7. tenant_id on every business table
DO $$
DECLARE
  v_tid uuid; t text; has_created boolean;
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
  SELECT id INTO v_tid FROM public.tenants WHERE slug = 'pelecanon';
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid', t);
    EXECUTE format('UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL', t, v_tid);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', t);
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT', t, t || '_tenant_id_fkey');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(tenant_id)', 'idx_' || t || '_tenant', t);
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='created_at') INTO has_created;
    IF has_created THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(tenant_id, created_at DESC)', 'idx_' || t || '_tenant_created', t);
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_tenant_immutable ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_tenant_immutable BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change()', t, t);
  END LOOP;
END $$;

-- 8. Replace policies on business tables
DO $$
DECLARE
  t text; pol record;
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
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id IN (SELECT public.current_user_tenant_ids()))', t || '_tenant_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(tenant_id, ARRAY[''owner'',''admin'',''sales'']::public.tenant_role[]))', t || '_tenant_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_tenant_member(tenant_id, ARRAY[''owner'',''admin'',''sales'']::public.tenant_role[])) WITH CHECK (public.is_tenant_member(tenant_id, ARRAY[''owner'',''admin'',''sales'']::public.tenant_role[]))', t || '_tenant_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_tenant_member(tenant_id, ARRAY[''owner'',''admin'']::public.tenant_role[]))', t || '_tenant_delete', t);
  END LOOP;
END $$;

-- Public lead capture (anon insert) — locked to PeleCanon tenant
CREATE POLICY quote_requests_anon_insert ON public.quote_requests FOR INSERT TO anon
  WITH CHECK (
    customer_name IS NOT NULL AND length(btrim(customer_name)) > 0
    AND customer_phone IS NOT NULL AND length(btrim(customer_phone)) >= 6
    AND product_category IS NOT NULL AND length(btrim(product_category)) > 0
    AND tenant_id = (SELECT id FROM public.tenants WHERE slug = 'pelecanon')
  );
CREATE POLICY customers_anon_insert ON public.customers FOR INSERT TO anon
  WITH CHECK (
    name IS NOT NULL AND length(btrim(name)) > 0
    AND phone IS NOT NULL AND length(btrim(phone)) >= 6
    AND tenant_id = (SELECT id FROM public.tenants WHERE slug = 'pelecanon')
  );

-- Public read for catalog tables (tenant filtering done in app)
CREATE POLICY products_public_read ON public.products FOR SELECT TO anon USING (true);
CREATE POLICY product_templates_public_read ON public.product_templates FOR SELECT TO anon USING (active = true);
CREATE POLICY materials_public_read ON public.materials FOR SELECT TO anon USING (true);
CREATE POLICY finishes_public_read ON public.finishes FOR SELECT TO anon USING (true);
CREATE POLICY categories_public_read ON public.categories FOR SELECT TO anon USING (true);
CREATE POLICY accessories_public_read ON public.accessories FOR SELECT TO anon USING (true);

-- 9. Tenant audit log
CREATE TABLE public.tenant_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tenant_audit_tenant ON public.tenant_audit_log(tenant_id, created_at DESC);
GRANT SELECT, INSERT ON public.tenant_audit_log TO authenticated;
GRANT ALL ON public.tenant_audit_log TO service_role;
ALTER TABLE public.tenant_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_audit_owner_read ON public.tenant_audit_log FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));
CREATE POLICY tenant_audit_member_insert ON public.tenant_audit_log FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT public.current_user_tenant_ids()));

-- 10. handle_new_user: don't auto-grant admin role anymore
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END $$;

-- 11. updated_at trigger for tenants
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 12. Storage bucket for tenant logos
INSERT INTO storage.buckets (id, name, public) VALUES ('tenant-logos','tenant-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Tenant logos public read" ON storage.objects FOR SELECT TO public
USING (bucket_id = 'tenant-logos');
CREATE POLICY "Tenant logos authed write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'tenant-logos');
CREATE POLICY "Tenant logos authed update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'tenant-logos');
