import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Drop all data from the given table.
 * Used for development / cleanup scripts.
 */
export async function cleanTable(table: string): Promise<{ deleted: number; error?: string }> {
  const { error, count } = await supabaseAdmin
    .from(table as any)                // <-- cast to any to bypass TS overload error
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // delete all rows except the soft‑delete marker

  if (error) {
    return { deleted: 0, error: error.message };
  }
  return { deleted: count ?? 0 };
}