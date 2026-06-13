-- =============================================================================
-- Sprint 1.3 — Tenant-driven RLS rewrite
-- =============================================================================
-- Forces every business table to gate reads/writes by tenant membership.
--
-- Reference helper: is_tenant_member(_table_tenant uuid, _allowed_roles
-- tenant_role[]) — SECURITY DEFINER with locked search_path so policies
-- stay one-line and recursion-free.
--
-- Role policy summary by table:
--   SELECT: any member of the tenant.
--   INSERT: owner / admin / sales (workers + viewers can't author).
--   UPDATE: owner / admin / sales (same authoring envelope).
--   DELETE: owner / admin only (sales operates inside the funnel but
--            doesn't tear rows out).
-- Worker-only narrowing on production_assignments: a worker only sees
-- rows where worker_id matches their auth.uid().
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_tenant_member(
  _table_tenant uuid,
  _allowed_roles public.tenant_role[] DEFAULT ARRAY['owner','admin','sales','worker','viewer']::public.tenant_role[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = _table_tenant
      AND user_id = auth.uid()
      AND role = ANY (_allowed_roles)
  );
$$;

-- Worker-assignment visibility: a row in production_assignments is visible
-- to a `worker` member only if they authored it.
CREATE OR REPLACE FUNCTION public.worker_assignment_visible(_worker_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT _worker_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Macro: apply four policies to a single tenant-scoped table.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t          text;
  write_role text[] := ARRAY['owner','admin','sales']::public.tenant_role[];
  del_role   text[] := ARRAY['owner','admin']::public.tenant_role[];

  tables_text text[] := ARRAY[
    'customers','quotes','quote_items','invoices','orders',
    'production_assignments','qc_inspections','remakes','workers',
    'materials','wastage_rules','internal_notes','production_photos',
    'notification_log','notification_templates','quote_requests','audit_log'
  ];

  -- Append-only tables: do not allow DELETE / UPDATE.
  append_only text[] := ARRAY[
    'notification_log','audit_log','quote_items'
  ];

  -- Customer-managed-form tables (the public-facing intake site touches
  -- these directly without authentication):
  intake_managed text[] := ARRAY['quote_requests'];
BEGIN
  FOREACH t IN ARRAY tables_text LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- SELECT — every member of the tenant sees the row. Exception:
    -- production_assignments workers only see their own.
    IF t = 'production_assignments' THEN
      EXECUTE format($f$
        DROP POLICY IF EXISTS tenant_select ON public.%I;
        CREATE POLICY tenant_select ON public.%I
          FOR SELECT
          USING (
            is_tenant_member(tenant_id, ARRAY['owner','admin','sales','viewer']::public.tenant_role[])
            OR (
              is_tenant_member(tenant_id, ARRAY['worker']::public.tenant_role[])
              AND worker_assignment_visible(worker_id)
            )
          );
      $f$, t, t);
    ELSE
      EXECUTE format($f$
        DROP POLICY IF EXISTS tenant_select ON public.%I;
        CREATE POLICY tenant_select ON public.%I
          FOR SELECT
          USING (is_tenant_member(tenant_id));
      $f$, t, t);
    END IF;

    -- INSERT — author role check.
    IF NOT (t = ANY(intake_managed)) THEN
      EXECUTE format($f$
        DROP POLICY IF EXISTS tenant_insert ON public.%I;
        CREATE POLICY tenant_insert ON public.%I
          FOR INSERT
          WITH CHECK (is_tenant_member(tenant_id, %L::public.tenant_role[]));
      $f$, t, write_role);
    END IF;

    -- UPDATE — append-only tables reject entirely.
    IF t = ANY(append_only) THEN
      EXECUTE format($f$
        DROP POLICY IF EXISTS tenant_update ON public.%I;
        CREATE POLICY tenant_update ON public.%I
          FOR UPDATE
          USING (false) WITH CHECK (false);
      $f$, t, t);
    ELSE
      EXECUTE format($f$
        DROP POLICY IF EXISTS tenant_update ON public.%I;
        CREATE POLICY tenant_update ON public.%I
          FOR UPDATE
          USING   (is_tenant_member(tenant_id, %L::public.tenant_role[]))
          WITH CHECK (is_tenant_member(tenant_id, %L::public.tenant_role[]));
      $f$, t, write_role, write_role);
    END IF;

    -- DELETE — append-only rejects; otherwise owner/admin only.
    IF t = ANY(append_only) THEN
      EXECUTE format($f$
        DROP POLICY IF EXISTS tenant_delete ON public.%I;
        CREATE POLICY tenant_delete ON public.%I
          FOR DELETE
          USING (false);
      $f$, t);
    ELSE
      EXECUTE format($f$
        DROP POLICY IF EXISTS tenant_delete ON public.%I;
        CREATE POLICY tenant_delete ON public.%I
          FOR DELETE
          USING (is_tenant_member(tenant_id, %L::public.tenant_role[]));
      $f$, t, del_role);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Bootstrap an "any authenticated member is at least a viewer" guarantee:
-- make sure tenant_members SELECT is allowed for the user to read their
-- own memberships.
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_members_select_self ON public.tenant_members;
CREATE POLICY tenant_members_select_self ON public.tenant_members
  FOR SELECT
  USING (user_id = auth.uid());

-- Writes to tenant_members happen via service-role server fns only (1.4).
-- Adding tenant_members INSERT/UPDATE/DELETE policies here would block
-- service-role bypass — which is by design — but also block onboarding
-- from the client. We deliberately leave them denied at RLS layer and
-- require server-fn tooling.