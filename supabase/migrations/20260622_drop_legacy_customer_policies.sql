-- =============================================================================
-- Complete fix: ensure tenants, tenant_members, enum, function, and policies
-- exist so customer CRUD works via RLS.
--
-- Run this in Supabase SQL Editor. Safe to re-run (idempotent).
-- =============================================================================

-- 0. Enum
DO $$ BEGIN
  CREATE TYPE public.tenant_role AS ENUM ('owner','admin','sales','worker','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. Tenants table
CREATE TABLE IF NOT EXISTS public.tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Tenant members table
CREATE TABLE IF NOT EXISTS public.tenant_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        public.tenant_role NOT NULL DEFAULT 'viewer',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS tenant_members_user_id_idx ON public.tenant_members (user_id);
CREATE INDEX IF NOT EXISTS tenant_members_tenant_id_idx ON public.tenant_members (tenant_id);

-- 3. Enable RLS on tenant_members + self-select policy
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_members_select_self ON public.tenant_members;
CREATE POLICY tenant_members_select_self ON public.tenant_members
  FOR SELECT USING (user_id = auth.uid());

-- 4. is_tenant_member helper
CREATE OR REPLACE FUNCTION public.is_tenant_member(
  _tenant_id uuid,
  _roles public.tenant_role[] DEFAULT ARRAY['owner','admin','sales','worker','viewer']::public.tenant_role[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = _tenant_id
      AND user_id = auth.uid()
      AND role = ANY (_roles)
  );
$$;

-- 5. Drop old is_staff policies on customers
DROP POLICY IF EXISTS "customers_staff_read"  ON public.customers;
DROP POLICY IF EXISTS "customers_staff_write" ON public.customers;
DROP POLICY IF EXISTS "customers_anon_insert"  ON public.customers;

-- 6. Ensure customers has tenant_id column
DO $$ BEGIN
  ALTER TABLE public.customers ADD COLUMN tenant_id uuid;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- 7. Create tenant RLS policies on customers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='customers' AND policyname='tenant_select'
  ) THEN
    CREATE POLICY tenant_select ON public.customers
      FOR SELECT USING (is_tenant_member(tenant_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='customers' AND policyname='tenant_insert'
  ) THEN
    CREATE POLICY tenant_insert ON public.customers
      FOR INSERT WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='customers' AND policyname='tenant_update'
  ) THEN
    CREATE POLICY tenant_update ON public.customers
      FOR UPDATE
      USING   (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]))
      WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='customers' AND policyname='tenant_delete'
  ) THEN
    CREATE POLICY tenant_delete ON public.customers
      FOR DELETE USING (is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));
  END IF;
END $$;

-- 8. Backfill tenant_id on existing customers (uses first tenant)
DO $$
DECLARE
  v_tid uuid;
BEGIN
  SELECT id INTO v_tid FROM public.tenants LIMIT 1;
  IF v_tid IS NOT NULL THEN
    UPDATE public.customers SET tenant_id = v_tid WHERE tenant_id IS NULL;
    ALTER TABLE public.customers ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END $$;

-- 9. Ensure you (the current user) are in tenant_members as owner
DO $$
DECLARE
  v_tid uuid;
  v_uid uuid;
BEGIN
  SELECT id INTO v_tid FROM public.tenants LIMIT 1;
  v_uid := auth.uid();
  IF v_tid IS NOT NULL AND v_uid IS NOT NULL THEN
    INSERT INTO public.tenant_members (tenant_id, user_id, role)
    VALUES (v_tid, v_uid, 'owner')
    ON CONFLICT (tenant_id, user_id) DO NOTHING;
  END IF;
END $$;
