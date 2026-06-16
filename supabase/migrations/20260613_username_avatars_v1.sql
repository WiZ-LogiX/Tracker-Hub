-- Username + avatar columns on a per-app-user profile table.
-- Auth still uses supabase auth.users with a synthetic `<username>@pelecanon.local` email
-- so RLS, JWT, and the existing admin client continue to work; only the login UX changes.

CREATE TABLE IF NOT EXISTS public.app_users (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  username      text NOT NULL,
  display_name  text NOT NULL,
  avatar_key    text,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_users_username_idx
  ON public.app_users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_proxy_idx
  ON public.app_users (lower(username) || '@pelecanon.local');

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_users_select_self_or_staff ON public.app_users;
CREATE POLICY app_users_select_self_or_staff ON public.app_users FOR SELECT
  USING (
    -- Self can read own profile.
    id = auth.uid()
    OR
    -- Same tenant + at least admin role can read everyone.
    (SELECT COUNT(*) FROM public.tenant_members tm
       WHERE tm.tenant_id = app_users.tenant_id
         AND tm.user_id = auth.uid()
         AND tm.role IN ('owner','admin')) > 0
  );

DROP POLICY IF EXISTS app_users_write_admin ON public.app_users;
CREATE POLICY app_users_write_admin ON public.app_users FOR ALL
  USING (
    (SELECT COUNT(*) FROM public.tenant_members tm
       WHERE tm.tenant_id = app_users.tenant_id
         AND tm.user_id = auth.uid()
         AND tm.role IN ('owner','admin')) > 0
  )
  WITH CHECK (
    (SELECT COUNT(*) FROM public.tenant_members tm
       WHERE tm.tenant_id = app_users.tenant_id
         AND tm.user_id = auth.uid()
         AND tm.role IN ('owner','admin')) > 0
  );

DROP POLICY IF EXISTS app_users_insert_admin ON public.app_users;
CREATE POLICY app_users_insert_admin ON public.app_users FOR INSERT
  WITH CHECK (
    (SELECT COUNT(*) FROM public.tenant_members tm
       WHERE tm.tenant_id = app_users.tenant_id
         AND tm.user_id = auth.uid()
         AND tm.role IN ('owner','admin')) > 0
  );

-- Backfill: pick an existing user if there is one. Username = 'admin'. The
-- `ensureBootstrapAdmin` server fn updates the password / claims at runtime
-- so the SQL migration does not embed any credential strings.
DO $$
DECLARE
  v_tenant uuid;
  v_user uuid;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'pelecanon' LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'No pelecanon tenant yet — app_users will be created on first login';
    RETURN;
  END IF;

  -- Pick the first auth user if any — they'll become the bootstrap admin.
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;

  IF v_user IS NOT NULL THEN
    INSERT INTO public.app_users (id, tenant_id, username, display_name, status)
    VALUES (v_user, v_tenant, 'admin', 'Admin', 'active')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;