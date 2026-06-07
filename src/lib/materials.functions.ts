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
    try {
      const { data: rules, error: wrError } = await supabase
        .from("wastage_rules")
        .select("material_id, wastage_pct, min_dimension, max_dimension")
        .eq("active", true);
      
      if (!wrError && rules) {
        wastageRules = rules;
      }
    } catch (e) {
      // Ignore if material_id column doesn't exist
    }

    // Group wastage rules by material_id
    const wastageByMaterial = new Map<string, any[]>();
    for (const wr of wastageRules) {
      if (wr.material_id) {
        const existing = wastageByMaterial.get(wr.material_id) || [];
        existing.push({
          wastage_pct: Number(wr.wastage_pct),
          min_dimension: wr.min_dimension == null ? null : Number(wr.min_dimension),
          max_dimension: wr.max_dimension == null ? null : Number(wr.max_dimension),
        });
        wastageByMaterial.set(wr.material_id, existing);
      }
    }

    return { 
      items: (materials ?? []).map((r: any) => ({
        ...serialize(r),
        wastage_rules: wastageByMaterial.get(r.id) || 
          (r.wastage_pct != null && r.wastage_pct > 0 
            ? [{ wastage_pct: Number(r.wastage_pct), min_dimension: null, max_dimension: null }] 
            : []),
      })) 
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

    // Try to create/update wastage rule for this material (if material_id column exists)
    try {
      const wastagePct = data.wastage_pct ?? 0;
      if (wastagePct > 0) {
        const { error: wrError } = await supabase
          .from("wastage_rules")
          .upsert({
            material_id: materialId,
            wastage_pct: wastagePct,
            min_dimension: null,
            max_dimension: null,
            active: true,
          }, { onConflict: "material_id,min_dimension,max_dimension" });
        if (wrError && !wrError.message.includes("material_id")) {
          console.error("[upsertMaterial] wastage rule upsert error:", wrError);
        }
      }
    } catch (e) {
      // Ignore if material_id column doesn't exist yet
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

// Get wastage rule for a specific material and dimension
export const getMaterialWastage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ 
    materialId: z.string().uuid(),
    dimension: z.number().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Try wastage_rules table first - find matching dimension range
    try {
      let query = supabase
        .from("wastage_rules")
        .select("wastage_pct, min_dimension, max_dimension")
        .eq("material_id", data.materialId)
        .eq("active", true);

      if (data.dimension != null) {
        // Match rules where dimension falls within range
        query = query.or(`min_dimension.is.null,max_dimension.is.null,and(min_dimension.lte.${data.dimension},max_dimension.gte.${data.dimension})`);
      } else {
        // Get default rule (no dimension constraints)
        query = query.is("min_dimension", null).is("max_dimension", null);
      }

      const { data: rules, error } = await query;
      
      if (!error && rules && rules.length > 0) {
        // Return the most specific rule (smallest range)
        const rule = rules.sort((a, b) => {
          const aRange = (a.max_dimension ?? Infinity) - (a.min_dimension ?? -Infinity);
          const bRange = (b.max_dimension ?? Infinity) - (b.min_dimension ?? -Infinity);
          return aRange - bRange;
        })[0];
        return { 
          wastagePct: Number(rule.wastage_pct),
          minDimension: rule.min_dimension,
          maxDimension: rule.max_dimension,
        };
      }
    } catch (e) {
      // Fall through to materials table
    }

    // Fallback to materials table
    const { data: mat, error } = await supabase
      .from("materials")
      .select("wastage_pct")
      .eq("id", data.materialId)
      .single();
    if (error) throw new Error(error.message);
    return { wastagePct: mat?.wastage_pct ? Number(mat.wastage_pct) : 0 };
  });

// Wastage rules CRUD for dimension-based rules
const wastageRuleSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  material_id: z.string().uuid(),
  wastage_pct: z.number().nonnegative().max(100),
  min_dimension: z.number().nullable().optional(),
  max_dimension: z.number().nullable().optional(),
  active: z.boolean().optional(),
});

export const listWastageRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ materialId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rules, error } = await supabase
      .from("wastage_rules")
      .select("*")
      .eq("material_id", data.materialId)
      .order("min_dimension", { ascending: true, nullsFirst: true });
    if (error) throw new Error(error.message);
    return { items: rules ?? [] };
  });

export const upsertWastageRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => wastageRuleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const values = {
      material_id: data.material_id,
      wastage_pct: data.wastage_pct,
      min_dimension: data.min_dimension ?? null,
      max_dimension: data.max_dimension ?? null,
      active: data.active ?? true,
    };

    let ruleId = data.id;
    let result;

    if (ruleId) {
      result = await supabase
        .from("wastage_rules")
        .update(values)
        .eq("id", ruleId)
        .select()
        .single();
    } else {
      result = await supabase
        .from("wastage_rules")
        .insert(values)
        .select()
        .single();
    }

    if (result.error) throw new Error(result.error.message);
    return { item: result.data };
  });

export const deleteWastageRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("wastage_rules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });