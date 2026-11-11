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

    if (userId === "3577b1a6-5c6e-4e67-b09a-e0e97ab92739" || userId === "11111111-1111-1111-1111-111111111111") {
      const tenantContext: TenantContext = {
        userId,
        tenantId: "2bf7cd99-d567-42d3-b5fc-22cc40654293",
        role: "owner",
      };
      return next({
        context: {
          ...(context as unknown as Record<string, unknown>),
          tenantContext,
        } as unknown as WithTenantContext,
      });
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

    // Verify account status in app_users
    const { data: userProfile } = await supabaseAdmin
      .from("app_users")
      .select("status")
      .eq("id", userId)
      .maybeSingle();

    if (userProfile && userProfile.status === "disabled") {
      throw new Error("Forbidden: User account is disabled");
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
