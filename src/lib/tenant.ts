/**
 * Tenant isolation primitives — defense-in-depth on top of RLS.
 *
 * Every server function that reads or writes tenant-scoped data MUST:
 *   1. Use requireSupabaseAuth + requireTenant middleware
 *   2. Extract ctx = context.tenantContext as TenantContext
 *   3. Call setTenantGuc(ctx.tenantId) before any query
 *   4. Filter every query by .eq('tenant_id', ctx.tenantId)
 *
 * setTenantGuc sets the Postgres GUC `app.tenant_id` for the current
 * transaction. This prepares for RLS policies that check
 * current_setting('app.tenant_id'). Even after those policies are
 * deployed, the app-layer .eq('tenant_id') filter remains as
 * defense-in-depth.
 */
import { sql } from "drizzle-orm";
import { db, schema } from "@/db/client.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSession } from "@/lib/auth-helpers";
import { type TenantContext } from "@/lib/tenant-context";

export { db, schema };

/**
 * Resolve tenant context from the current request's bearer token.
 *
 * Use this in server functions that need tenant resolution outside the
 * middleware chain (e.g. helpers called from within a handler). When the
 * middleware chain is available, prefer reading context.tenantContext
 * instead — it's already resolved by requireTenant.
 */
export async function getTenantContext(): Promise<TenantContext> {
  const session = await requireSession();
  if (!session.tenantId) {
    throw new Error("Forbidden: no tenant membership for caller");
  }

  const { data: membership, error } = await supabaseAdmin
    .from("tenant_members")
    .select("role")
    .eq("user_id", session.userId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve tenant role: ${error.message}`);
  }

  return {
    userId: session.userId,
    tenantId: session.tenantId,
    role: (membership?.role as string) ?? "viewer",
  };
}

/**
 * Set the Postgres GUC `app.tenant_id` for the current transaction.
 *
 * This enables future RLS policies that check:
 *   current_setting('app.tenant_id') = tenant_id
 *
 * The `true` parameter makes the setting local to the current transaction
 * only — it does not leak across requests.
 *
 * MUST be called before any tenant-scoped query when using the Drizzle
 * client directly. For supabaseAdmin queries, the GUC is still set for
 * consistency and future RLS compatibility, but the app-layer
 * .eq('tenant_id') filter is the primary guard.
 */
export async function setTenantGuc(tenantId: string): Promise<void> {
  if (!tenantId) {
    throw new Error("setTenantGuc: tenantId is required");
  }
  try {
    await db.execute(
      sql`select set_config('app.tenant_id', ${tenantId}, true)`,
    );
  } catch (err) {
    // Best-effort: the GUC is only consumed by notification_dlq RLS policy.
    // Catalog functions use supabaseAdmin (RLS bypass) so the GUC is not
    // required for them. Log and continue rather than blocking all operations.
    console.warn("[setTenantGuc] Failed to set GUC (non-fatal):", err);
  }
}

/**
 * Guard that throws if ctx.tenantId is missing.
 * Returns the tenantId for convenience.
 */
export function requireTenantId(ctx: TenantContext): string {
  if (!ctx.tenantId) {
    throw new Error("Forbidden: tenantId is required for this operation");
  }
  return ctx.tenantId;
}

/**
 * Set the tenant GUC and return the Drizzle client.
 *
 * Use this for transactional flows where you need Drizzle's
 * db.transaction() with tenant context already established:
 *
 *   const tdb = await tenantDb(ctx.tenantId);
 *   await tdb.transaction(async (tx) => {
 *     // tx has app.tenant_id set
 *   });
 */
export async function tenantDb(tenantId: string) {
  await setTenantGuc(tenantId);
  return db;
}
