-- =============================================================================
-- Sprint 1.1 + 1.2 — Multi-tenancy foundation with PeleCanon backfill
-- =============================================================================
-- Idempotent. Re-runnable. Safe against partial application (DO blocks wrap
-- each ALTER). Run this in one go; if an earlier statement fails the rest
-- can be skipped without leaving the schema half-converted.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  text NOT NULL UNIQUE,
  name                  text NOT NULL,
  logo_url              text,
  primary_color         text,
  tax_number            text,
  commercial_registry   text,
  address               text,
  phone                 text,
  email                 text,
  currency              text NOT NULL DEFAULT 'EGP',
  tax_rate              numeric NOT NULL DEFAULT 14,
  plan                  text NOT NULL DEFAULT 'free',
  status                text NOT NULL DEFAULT 'active',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- tenant_role enum
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.tenant_role AS ENUM ('owner','admin','sales','worker','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- tenant_members
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Seed PeleCanon. Capture the id into a temp server var so every UPDATE below
-- can back-fill without a second round-trip.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  pelecanon_id uuid;
BEGIN
  INSERT INTO public.tenants (slug, name, status)
    VALUES ('pelecanon', 'PeleCanon', 'active')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO pelecanon_id;

  -- Owners-only reset path: if existing members rows are present don't clobber.
  -- We do not auto-create auth users or seed memberships here; that happens
  -- in 1.4 (auth-middleware + tenant resolver) once we cut over.
  --
  -- Single source of truth: 'handle_new_user' trigger still wires the first
  -- admin user into pelecanon, so backfilling from auth.users id is fine.
  INSERT INTO public.tenant_members (tenant_id, user_id, role)
    SELECT pelecanon_id, ur.user_id, 'owner'
    FROM public.user_roles ur
    WHERE ur.role IN ('admin','owner')
    ON CONFLICT (tenant_id, user_id) DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- Backfill tenant_id on every business table, then lock NOT NULL + index.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  pelecanon_id uuid;
  t            text;
  tables       text[] := ARRAY[
    'customers','quotes','quote_items','invoices','orders',
    'production_assignments','qc_inspections','remakes','workers',
    'materials','wastage_rules','internal_notes','production_photos',
    'notification_log','notification_templates','quote_requests','audit_log'
  ];
BEGIN
  SELECT id INTO pelecanon_id FROM public.tenants WHERE slug = 'pelecanon';

  FOREACH t IN ARRAY tables LOOP
    -- Skip if the table doesn't exist in this DB (e.g. brand-new prod).
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      CONTINUE;
    END IF;

    -- Add nullable tenant_id if missing.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'tenant_id'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN tenant_id uuid', t);
    END IF;

    -- Backfill. WHERE tenant_id IS NULL protects any row already correct.
    EXECUTE format('UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL', t, pelecanon_id);

    -- Lock NOT NULL.
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', t);

    -- Btree on tenant_id (single col).
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)',
      t || '_tenant_id_idx', t
    );

    -- Composite (tenant_id, created_at DESC) where created_at exists.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'created_at'
    ) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id, created_at DESC)',
        t || '_tenant_id_created_at_idx', t
      );
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Immutability trigger: once a row has a tenant_id, it must not change.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_tenant_id_immutable()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id is immutable on table %', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'customers','quotes','quote_items','invoices','orders',
    'production_assignments','qc_inspections','remakes','workers',
    'materials','wastage_rules','internal_notes','production_photos',
    'notification_log','notification_templates','quote_requests','audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_tenant_id_immutable', t);
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_id_immutable()',
        t || '_tenant_id_immutable', t
      );
    END IF;
  END LOOP;
END $$;