import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TenantRole } from "@/lib/tenant-context";

/**
 * Self-healing tenant bootstrap for legacy authenticated users.
 *
 * Returns the caller's tenant memberships after performing any necessary
 * backfill (tenant creation, membership insert). The server-side result is
 * the source of truth \u2014 clients use it directly instead of round-tripping
 * through Postgrest's RLS-limited vantage point. This is critical for
 * users whose Row-Level Security policies on `tenant_members` may be
 * over-restrictive in fresh installs.
 */
const BootstrapInput = z
  .object({
    role: z.enum(["owner", "admin", "sales", "worker", "viewer"]).optional(),
  })
  .optional()
  .default({});

export interface BootstrapMembership {
  tenantId: string;
  tenantSlug: string | null;
  tenantName: string | null;
  role: TenantRole;
}

export interface BootstrapResult {
  tenantId: string;
  tenantSlug: string | null;
  tenantName: string | null;
  role: TenantRole;
  memberships: BootstrapMembership[];
  created: boolean;
}

export const bootstrapMyTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => BootstrapInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const requestedRole = data?.role ?? "owner";

    // 0. Check local database first for existing membership
    try {
      const { db } = await import("@/db/client.server");
      const { tenantMembers, tenants } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");

      const localMembers = await db
        .select({
          tenantId: tenantMembers.tenantId,
          role: tenantMembers.role,
          tenantSlug: tenants.slug,
          tenantName: tenants.name,
        })
        .from(tenantMembers)
        .leftJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
        .where(eq(tenantMembers.userId, userId));

      if (localMembers.length > 0) {
        const memberships: BootstrapMembership[] = localMembers.map((m) => ({
          tenantId: m.tenantId,
          tenantSlug: m.tenantSlug,
          tenantName: m.tenantName,
          role: m.role as TenantRole,
        }));
        const primary = memberships[0];
        return {
          tenantId: primary.tenantId,
          tenantSlug: primary.tenantSlug,
          tenantName: primary.tenantName,
          role: primary.role,
          memberships,
          created: false,
        };
      }
    } catch (e) {
      console.warn("[bootstrapMyTenant] local db lookup error", e);
    }

    // 1. Resolve or create the default tenant.
    let tenantId = null;
    let tenantSlug = null;
    let tenantName = null;

    const { data: existingTenant } = await supabaseAdmin
      .from("tenants")
      .select("id, slug, name")
      .eq("slug", "pelecanon")
      .maybeSingle();
    if (existingTenant) {
      tenantId = existingTenant.id;
      tenantSlug = existingTenant.slug;
      tenantName = existingTenant.name;
    } else {
      const { data: inserted, error: tenantErr } = await supabaseAdmin
        .from("tenants")
        .insert({ slug: "pelecanon", name: "PeleCanon" })
        .select("id, slug, name")
        .single();
      if (tenantErr || !inserted) {
        throw new Error(tenantErr?.message ?? "Failed to create default tenant");
      }
      tenantId = inserted.id;
      tenantSlug = inserted.slug;
      tenantName = inserted.name;
    }

    if (!tenantId) {
      throw new Error("Failed to resolve default tenant");
    }

    // 2. Look for an existing membership row for this user.
    const { data: existingMembership } = await supabaseAdmin
      .from("tenant_members")
      .select("role, tenant_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existingMembership) {
      // 3. No row \u2192 insert one with the requested role.
      const { error: insertErr } = await supabaseAdmin.from("tenant_members").insert({
        tenant_id: tenantId,
        user_id: userId,
        role: requestedRole,
      });
      if (insertErr) {
        throw new Error(insertErr.message);
      }
    }

    // 4. Read all memberships for this user. Since we're using the service
    //    role client, we bypass any RLS that might exist on tenant_members
    //    and return the canonical list to the client.
    const { data: allMemberships, error: listErr } = await supabaseAdmin
      .from("tenant_members")
      .select("role, tenant_id, tenants(slug, name)")
      .eq("user_id", userId);
    if (listErr) {
      throw new Error(listErr.message);
    }

    const memberships = (allMemberships ?? []).map((m) => {
      const tenant = Array.isArray(m.tenants) ? m.tenants[0] : m.tenants;
      return {
        tenantId: m.tenant_id,
        tenantSlug: tenant?.slug ?? null,
        tenantName: tenant?.name ?? null,
        role: m.role,
      };
    });

    // Pick the primary membership returned by the bootstrap step. If the
    // user has multiple memberships, calling code can switch via the
    // client UI; for now we expose the first as the default.
    const primary = memberships.find((m) => m.tenantId === tenantId) ?? memberships[0];

    return {
      tenantId: primary?.tenantId ?? tenantId,
      tenantSlug: primary?.tenantSlug ?? tenantSlug,
      tenantName: primary?.tenantName ?? tenantName,
      role: primary?.role ?? requestedRole,
      memberships,
      created: !existingMembership,
    };
  });
