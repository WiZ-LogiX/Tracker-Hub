-- Add INSERT/UPDATE/DELETE policies for quotes table.
-- The tenant_rls_v1 migration (20260612) only created a SELECT policy.
-- This blocks all inserts via the RLS-enforcing client.

-- INSERT: tenant members with owner/admin/sales can create quotes
CREATE POLICY quotes_tenant_insert ON public.quotes
  FOR INSERT
  WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));

-- UPDATE: tenant members with owner/admin/sales can update quotes
CREATE POLICY quotes_tenant_update ON public.quotes
  FOR UPDATE
  USING (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]))
  WITH CHECK (is_tenant_member(tenant_id, ARRAY['owner','admin','sales']::public.tenant_role[]));

-- DELETE: only owner/admin can delete quotes
CREATE POLICY quotes_tenant_delete ON public.quotes
  FOR DELETE
  USING (is_tenant_member(tenant_id, ARRAY['owner','admin']::public.tenant_role[]));
