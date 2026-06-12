import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Delete all rows from a table (except the soft-delete marker).
 * Used for development / cleanup scripts.
 *
 * NOTE: Supabase PostgrestQueryBuilder `.delete()` accepts a filter chain; we use
 * `.neq('id', ...)` rather than `.eq()` so non-zero rows match. This relies on
 * the table having an `id` column.
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
 * Drop data from all tables that ship with the starter template.
 * Used for development / cleanup scripts.
 */
export async function cleanupAllData(): Promise<{
  success: boolean;
  results: Record<string, { deleted: number; error?: string }>;
}> {
  const tables = [
    "accessories",
    "tenants",
    "audit_log",
    "categories",
    "configurations",
    "quote_items",
    "product_templates",
    "customers",
    "discounts",
    "finishes",
    "internal_notes",
    "wastage_rules",
  ] as const;

  const results: Record<string, { deleted: number; error?: string }> = {};

  for (const table of tables) {
    const { deleted, error } = await cleanTable(table);
    results[table] = { deleted, error };
  }

  return { success: true, results };
}