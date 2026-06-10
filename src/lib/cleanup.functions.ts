import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const cleanupAllData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    // Verify admin role
    const { data: profile } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();
    
    if (profile?.role !== "admin") {
      throw new Error("Admin only");
    }

    // Delete in correct order (children first due to FK constraints)
    const tables = [
      "production_photos",
      "production_logs", 
      "production_assignments",
      "qc_inspections",
      "remakes",
      "quote_items",
      "configurations",
      "internal_notes",
      "audit_log",
      "notification_log",
      "invoices",
      "orders",
      "quotes",
      "quote_requests",
    ];

    const results: Record<string, { deleted: number; error?: string }> = {};

    for (const table of tables) {
      try {
        const { error, count } = await supabaseAdmin
          .from(table)
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000"); // delete all
        
        if (error) {
          results[table] = { deleted: 0, error: error.message };
        } else {
          results[table] = { deleted: count ?? 0 };
        }
      } catch (e: any) {
        results[table] = { deleted: 0, error: e?.message ?? String(e) };
      }
    }

    return { success: true, results };
  });