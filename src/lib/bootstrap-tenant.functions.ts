import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TenantRole } from "@/lib/tenant-context";

/**
 * Self-healing tenant bootstrap for legacy authenticated users.
 *
 * When Phase 1 cut over from `public.user_roles` to `tenant_members`, pre-
 * existing users who had no row in `user_roles` (or whose row was lost
 * during the migration) ended up signed-in but with zero tenant
 * memberships. RLS then denies every table read, and the admin shell
 * (`isStaff === false`) refuses to render anything useful.
 *
 * This server fn detects that condition and inserts the missing
 * `tenant_members` row using the service role, attaching the user to the
 * default `pelecanon` tenant as `owner`. It is idempotent: if a membership
 * already exists, we return it without inserting.
 *
 * To support role transitions later, the optional `role` input lets the
 * caller pick non-owner roles, but the default is the safest for new
 * operators.
 */
const BootstrapInput = z
  .object({
    role: z
      .enum(["owner", "admin", "sales", "worker", "viewer"])
      .optional(),
  })
  .optional()
  .default({});

export interface BootstrapResult {
  tenantId: string;
  tenantSlug: string | null;
  tenantName: string | null;
  role: TenantRole;
  created: boolean;
}

export const bootstrapMyTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BootstrapInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<BootstrapResult> => {
    const { userId } = context;
    const requestedRole = data?.role ?? "owner";

    // 1. Resolve or create the default tenant.
    let tenantId: string | null = null;
    let tenantSlug: string | null = null;
    let tenantName: string | null = null;

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

    // Both branches above set tenantId; the throw is exhaustive on failure.
    if (!tenantId) {
      throw new Error("Failed to resolve default tenant");
    }

    // 2. Look for an existing membership row for this user.
    const { data: existingMembership } = await supabaseAdmin
      .from("tenant_members")
      .select("role, tenant_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingMembership) {
      return {
        tenantId: existingMembership.tenant_id,
        tenantSlug,
        tenantName,
        role: existingMembership.role as TenantRole,
        created: false,
      };
    }

    // 3. No row → insert one with the requested role.
    const { error: insertErr } = await supabaseAdmin
      .from("tenant_members")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        role: requestedRole,
      });
    if (insertErr) {
      throw new Error(insertErr.message);
    }

    return {
      tenantId,
      tenantSlug,
      tenantName,
      role: requestedRole,
      created: true,
    };
  });
