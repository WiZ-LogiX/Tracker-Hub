// Materials CRUD — using Supabase client (RLS-enforced) for now.
// Will switch to Drizzle after multi-tenant migration is applied.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function serialize(r: any) {
  return {
    id: r.id,
    name_ar: r.name_ar,
    name_en: r.name_en,
    type: r.type,
    unit: r.unit,
    price_per_unit: Number(r.price_per_unit),
    wastage_pct: r.wastage_pct == null ? null : Number(r.wastage_pct),
    supplier_id: r.supplier_id,
    country_of_origin: r.country_of_origin,
    active: r.active,
    created_at: r.created_at,
  };
}

export const listMaterials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    
    // Get materials
    const { data: materials, error: matError } = await supabase
      .from("materials")
      .select("*")
      .order("created_at", { ascending: false });
    if (matError) throw new Error(matError.message);

    // Get wastage rules with dimension ranges
    let wastageRules: any[] = [];
    const { data: wrData, error: wrError } = await supabase
      .from("wastage_rules")
      .select("material_id, min_dimension, max_dimension, wastage_pct")
      .eq("active", true)
      .order("material_id")
      .order("min_dimension");
    
    if (!wrError && wrData) {
      wastageRules = wrData;
    }

    return { 
      items: (materials ?? []).map((r: any) => {
        const materialRules = wastageRules.filter((wr: any) => wr.material_id === r.id);
        // Priority: dimension-based rules > wastage_rules table (legacy) > materials.wastage_pct column
        return {
          ...serialize(r),
          wastage_rules: materialRules.length > 0 ? materialRules : 
            (r.wastage_pct != null && r.wastage_pct > 0 ? [{ min_dimension: 0, max_dimension: null, wastage_pct: Number(r.wastage_pct) }] : []),
        };
      }) 
    };
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name_ar: z.string().min(1).max(255),
  name_en: z.string().min(1).max(255),
  type: z.string().min(1).max(64),
  unit: z.string().min(1).max(32),
  price_per_unit: z.number().nonnegative(),
  wastage_pct: z.number().nonnegative().nullable().optional(),
  supplier_id: z.string().uuid().nullable().optional(),
  country_of_origin: z.string().max(128).nullable().optional(),
  active: z.boolean().optional(),
});

export const upsertMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => upsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const values = {
      name_ar: data.name_ar,
      name_en: data.name_en || data.name_ar,
      type: data.type || "wood",
      unit: data.unit || "m²",
      price_per_unit: data.price_per_unit,
      wastage_pct: data.wastage_pct ?? null,
      supplier_id: data.supplier_id ?? null,
      country_of_origin: data.country_of_origin ?? null,
      active: data.active ?? true,
    };

    let materialId = data.id;
    let result;

    if (materialId) {
      result = await supabase
        .from("materials")
        .update(values)
        .eq("id", materialId)
        .select()
        .single();
    } else {
      result = await supabase
        .from("materials")
        .insert(values)
        .select()
        .single();
    }

    if (result.error) throw new Error(result.error.message);
    materialId = result.data.id;

    // Auto-create/update wastage rule for this material (if material_id column exists)
    const wastagePct = data.wastage_pct ?? 0;
    if (wastagePct > 0) {
      const { error: wrError } = await supabase
        .from("wastage_rules")
        .upsert({
          material_id: materialId,
          min_dimension: 0,
          max_dimension: null,
          wastage_pct: wastagePct,
          active: true,
        }, { onConflict: "material_id,min_dimension" });
      // Ignore error if material_id column doesn't exist yet
      if (wrError && !wrError.message.includes("material_id") && !wrError.message.includes("min_dimension")) {
        console.error("[upsertMaterial] wastage rule upsert error:", wrError);
      }
    }

    return { item: serialize(result.data) };
  });

export const deleteMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("materials").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Get wastage percentage for a specific material at a given dimension
export const getMaterialWastage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ materialId: z.string().uuid(), dimension: z.number().nonnegative() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    
    // Try dimension-based rules first
    const { data: rule, error } = await supabase
      .from("wastage_rules")
      .select("wastage_pct")
      .eq("material_id", data.materialId)
      .eq("active", true)
      .lte("min_dimension", data.dimension)
      .or(`max_dimension.is.null,max_dimension.gt.${data.dimension}`)
      .order("min_dimension", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (!error && rule) {
      return { wastagePct: Number(rule.wastage_pct), source: "dimension_rule" };
    }
    
    // Fallback: material's own wastage_pct column
    const { data: mat } = await supabase
      .from("materials")
      .select("wastage_pct")
      .eq("id", data.materialId)
      .single();
    
    return { wastagePct: mat?.wastage_pct ? Number(mat.wastage_pct) : 0, source: "material_column" };
  });