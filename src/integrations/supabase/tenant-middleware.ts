// Tenant-resolution middleware for TanStack Start server functions.
//
// Run this AFTER requireSupabaseAuth. It reads the user's first tenant
// membership (ordered by created_at) and injects a typed TenantContext into
// the server-function context. Every mutation that touches tenant-owned data
// should include this middleware as a second line of defense on top of RLS.
import { createMiddleware } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { type TenantRole, type TenantContext } from "@/lib/tenant-context";

export interface WithTenantContext {
  tenantContext: TenantContext;
}

export const requireTenant = createMiddleware({ type: "function" }).server(
  async ({ next, context }) => {
    const userId = (context as unknown as { userId?: string }).userId;
    if (!userId) {
      throw new Error("Unauthorized: tenant middleware requires an authenticated user");
    }

    const { data: membership, error } = await supabaseAdmin
      .from("tenant_members")
      .select("tenant_id, role, tenants!inner(id, slug, name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[requireTenant] membership lookup failed", error.message);
      throw new Error("Failed to resolve tenant membership");
    }
    if (!membership) {
      throw new Error("Forbidden: user is not a member of any tenant");
    }

    const role = membership.role as TenantRole;

    const tenantContext: TenantContext = {
      userId,
      tenantId: membership.tenant_id,
      role,
    };

      return next({
        context: {
          ...(context as unknown as Record<string, unknown>),
          tenantContext,
        } as unknown as WithTenantContext,
      });
  },
);
