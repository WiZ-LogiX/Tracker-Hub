import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Delete all rows from a table.
 * Used for development / cleanup scripts.
 *
 * We use `.neq('id', '00000000-0000-0000-0000-000000000000')` because
 * Postgrest cannot issue a bare `DELETE` without a filter — an all-rows
 * delete would 400. The placeholder UUID never exists in practice, so every
 * real row matches.
 *
 * NEVER call this against `tenants`, `tenant_members`, or `auth.users` —
 * tenant-side tables break RLS for every user if emptied.
 */
export async function cleanTable(
  table: string,
): Promise<{ deleted: number; error?: string }> {
  const builder = supabaseAdmin.from(table as any);
  const { error, count } = await builder
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) {
    return { deleted: 0, error: error.message };
  }
  return { deleted: count ?? 0 };
}

/**
 * Drop data from business content tables only. Tenancy/auth tables are
 * intentionally excluded because emptying them revokes everyone's access.
 * Used for development / cleanup scripts.
 */
export async function cleanupAllData(): Promise<{
  success: boolean;
  results: Record<string, { deleted: number; error?: string }>;
}> {
  const tables = [
    "accessories",
    "audit_log",
    "categories",
    "quote_items",
    "product_templates",
    "products",
    "customers",
    "discounts",
    "finishes",
    "internal_notes",
    "wastage_rules",
    "notification_log",
    "notification_templates",
    "production_logs",
    "production_photos",
    "production_assignments",
    "qc_inspections",
    "remakes",
  ] as const;

  const results: Record<string, { deleted: number; error?: string }> = {};

  for (const table of tables) {
    const { deleted, error } = await cleanTable(table);
    results[table] = { deleted, error };
  }

  return { success: true, results };
}
