import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const applyWastageRulesMigration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, supabase } = context;

    // Verify admin role
    const { data: profile } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (profile?.role !== "admin") {
      throw new Error("Admin only");
    }

    const results: string[] = [];
    const { error: migrationError } = await supabaseAdmin.rpc("exec" as any, {
      query: `
        ALTER TABLE public.wastage_rules
          ADD COLUMN IF NOT EXISTS material_id uuid;

        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'wastage_rules_material_id_fkey'
          ) THEN
            ALTER TABLE public.wastage_rules
            ADD CONSTRAINT wastage_rules_material_id_fkey
            FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;
          END IF;
        END $$;

        CREATE UNIQUE INDEX IF NOT EXISTS wastage_rules_material_id_unique
          ON public.wastage_rules (material_id)
          WHERE material_id IS NOT NULL;

        INSERT INTO public.wastage_rules (material_id, wastage_pct, active, created_at)
          SELECT m.id, m.wastage_pct, true, now()
          FROM public.materials m
          LEFT JOIN public.wastage_rules wr ON wr.material_id = m.id
          WHERE m.wastage_pct IS NOT NULL
            AND m.wastage_pct > 0
            AND wr.material_id IS NULL
          ON CONFLICT (material_id) DO NOTHING;
      `,
    } as any);

    if (migrationError) {
      results.push(`Migration: ${migrationError.message}`);
    } else {
      results.push("✓ Migration applied (column + FK + index + data backfill)");
    }

    return { success: !migrationError, results, context: !!supabase };
  });