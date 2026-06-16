-- =============================================================================
-- Sprint 2.0 — Bootstrap tenant membership for new auth users.
--
-- Phase 1 created `tenant_members` rows for pre-existing admin/owner users by
-- reading `public.user_roles`. That table is deprecated (the role column now
-- lives on `tenant_members`), so any user who signs up after the migration
-- would land in auth.users with no team membership and be unable to log in.
--
-- This trigger:
--   * Fires AFTER INSERT on auth.users.
--   * Adds the new user as `owner` of the default `pelecanon` tenant.
--   * Is idempotent (ON CONFLICT DO NOTHING; tenants.id never collides here).
-- Replace the hardcoded role once a proper invite flow exists.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  pelecanon_id uuid;
BEGIN
  SELECT id INTO pelecanon_id
  FROM public.tenants
  WHERE slug = 'pelecanon';

  IF pelecanon_id IS NULL THEN
    -- The default tenant must exist. If it doesn't, we surface the error so
    -- the migration gets fixed rather than silently dropping the user.
    RAISE EXCEPTION 'Default tenant "pelecanon" not found; cannot bootstrap membership for new user %', NEW.id;
  END IF;

  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (pelecanon_id, NEW.id, 'owner')
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
