// Tenant-resolution middleware for TanStack Start server functions.
//
// Run this AFTER requireSupabaseAuth. It reads the user's first tenant
// membership (ordered by created_at) and injects a typed TenantContext into
// the server-function context. Every mutation that touches tenant-owned data
// should include this middleware as a second line of defense on top of RLS.
import { createMiddleware } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isMockAuthAllowed } from "./auth-middleware";
import {
  type TenantRole,
  type TenantContext,
  resolveEffectivePermissions,
  ALL_PERMISSION_SLUGS,
} from "@/lib/tenant-context";

export interface WithTenantContext {
  tenantContext: TenantContext;
}

export const requireTenant = createMiddleware({ type: "function" }).server(
  async ({ next, context }) => {
    const userId = (context as unknown as { userId?: string }).userId;
    if (!userId) {
      throw new Error("Unauthorized: tenant middleware requires an authenticated user");
    }

    if (
      isMockAuthAllowed() &&
      (userId === "3577b1a6-5c6e-4e67-b09a-e0e97ab92739" ||
        userId === "11111111-1111-1111-1111-111111111111")
    ) {
      const tenantContext: TenantContext = {
        userId,
        tenantId: "2bf7cd99-d567-42d3-b5fc-22cc40654293",
        role: "owner",
        permissions: new Set(ALL_PERMISSION_SLUGS),
      };
      return next({
        context: {
          ...(context as unknown as Record<string, unknown>),
          tenantContext,
        } as unknown as WithTenantContext,
      });
    }

    // Check local database first for membership
    try {
      const { db } = await import("@/db/client.server");
      const { tenantMembers, appUsers } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");

      const [localMember] = await db
        .select({
          tenantId: tenantMembers.tenantId,
          role: tenantMembers.role,
        })
        .from(tenantMembers)
        .where(eq(tenantMembers.userId, userId))
        .limit(1);

      if (localMember) {
        // Verify account status
        const [localUser] = await db
          .select({ status: appUsers.status })
          .from(appUsers)
          .where(eq(appUsers.id, userId))
          .limit(1);

        if (localUser && localUser.status === "disabled") {
          throw new Error("Forbidden: User account is disabled");
        }

        const role = localMember.role as TenantRole;
        const permissions = await resolveEffectivePermissions(localMember.tenantId, role);
        const tenantContext: TenantContext = {
          userId,
          tenantId: localMember.tenantId,
          role,
          permissions,
        };
        return next({
          context: {
            ...(context as unknown as Record<string, unknown>),
            tenantContext,
          } as unknown as WithTenantContext,
        });
      }
    } catch (e: any) {
      if (e.message?.startsWith("Forbidden:")) throw e;
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
    const permissions = await resolveEffectivePermissions(membership.tenant_id, role);

    const tenantContext: TenantContext = {
      userId,
      tenantId: membership.tenant_id,
      role,
      permissions,
    };

    return next({
      context: {
        ...(context as unknown as Record<string, unknown>),
        tenantContext,
      } as unknown as WithTenantContext,
    });
  },
);
