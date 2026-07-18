-- Drop the legacy quotes_staff_all policy that conflicts with tenant_rls_v1.
-- The old policy requires is_staff() which checks user_roles table.
-- The new tenant_insert policy (from 20260612_tenant_rls_v1) requires
-- is_tenant_member() which checks tenant_members — the correct check.
-- Having both active means PostgreSQL ORs them for INSERT. If is_staff()
-- fails (no user_roles row), the tenant_insert policy should still pass
-- for valid tenant members. But to avoid confusion and ensure consistent
-- behavior, drop the legacy policy.

DROP POLICY IF EXISTS quotes_staff_all ON public.quotes;
