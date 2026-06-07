import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const applyWastageRulesMigration = createServerFn({ method: "POST" })
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

    const results: string[] = [];

    try {
      // Use the pg extension to execute raw SQL
      
      // 1. Add material_id column if not exists
      const { error: colError } = await supabaseAdmin.rpc('exec', {
        query: `
          ALTER TABLE public.wastage_rules
          ADD COLUMN IF NOT EXISTS material_id uuid;
        `
      });
      if (colError) results.push(`Column add: ${colError.message}`);
      else results.push("✓ Added material_id column");

      // 2. Add foreign key constraint
      const { error: fkError } = await supabaseAdmin.rpc('exec', {
        query: `
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
        `
      });
      if (fkError && !fkError.message.includes("already exists")) {
        results.push(`FK constraint: ${fkError.message}`);
      } else {
        results.push("✓ Added foreign key constraint");
      }

      // 3. Create unique index
      const { error: idxError } = await supabaseAdmin.rpc('exec', {
        query: `
          CREATE UNIQUE INDEX IF NOT EXISTS wastage_rules_material_id_unique
          ON public.wastage_rules (material_id)
          WHERE material_id IS NOT NULL;
        `
      });
      if (idxError) results.push(`Index: ${idxError.message}`);
      else results.push("✓ Created unique index");

      // 4. Migrate existing data
      const { error: migrateError } = await supabaseAdmin.rpc('exec', {
        query: `
          INSERT INTO public.wastage_rules (material_id, wastage_pct, active, created_at)
          SELECT m.id, m.wastage_pct, true, now()
          FROM public.materials m
          LEFT JOIN public.wastage_rules wr ON wr.material_id = m.id
          WHERE m.wastage_pct IS NOT NULL
            AND m.wastage_pct > 0
            AND wr.material_id IS NULL
          ON CONFLICT (material_id) DO NOTHING;
        `
      });
      if (migrateError) results.push(`Migration: ${migrateError.message}`);
      else results.push("✓ Migrated existing wastage data");

      return { success: true, results };
    } catch (e: any) {
      return { success: false, error: e.message, results };
    }
  });