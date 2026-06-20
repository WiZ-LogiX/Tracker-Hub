-- Drop CHECK constraints on role_permissions and tenant_roles
-- to allow custom role slugs beyond the default 5.

ALTER TABLE public.role_permissions
  DROP CONSTRAINT IF EXISTS role_permissions_role_check;

ALTER TABLE public.tenant_roles
  DROP CONSTRAINT IF EXISTS tenant_roles_slug_check;
