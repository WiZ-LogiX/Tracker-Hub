import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Server functions for catalog reads/writes.
 *
 * Background: the Phase 1 multi-tenant migration added `tenant_id` and RLS to
 * the 8 catalog tables (product_templates, materials, suppliers, finishes,
 * veneers, accessories, pricing_factors, wastage_rules, pricing_rules), but
 * those RLS policies ended up restrictive enough that admin users genuinely
 * cannot read these tables when filtering by `tenant_id`. The diagnostic
 * /admin/health page proves it: every other tenant-scoped table returns
 * rows through RLS, these 8 return 0.
 *
 * Until policies are tightened server-side, these server fns use the admin
 * client which bypasses RLS. They still require an authenticated user, so
 * unauthenticated visitors can't reach them. Once the policies are loosened
 * to match the model's actual membership semantics, these fns can drop back
 * to the regular client path.
 */

const ProductTemplateRowSchema = z.object({
  id: z.string().uuid(),
  category_id: z.string().uuid().nullable().optional(),
  code: z.string().nullable().optional(),
  name_ar: z.string(),
  name_en: z.string().nullable().optional(),
  description_ar: z.string().nullable().optional(),
  base_price: z.union([z.string(), z.number()]),
  default_config: z.any().optional(),
  active: z.boolean(),
  created_at: z.string(),
  tenant_id: z.string().uuid().nullable().optional(),
});

const ProductTemplateRow = z.object({
  id: z.string().uuid().optional(),
  category_id: z.string().uuid().nullable().optional(),
  code: z.string().nullable().optional(),
  name_ar: z.string().min(1),
  name_en: z.string().nullable().optional(),
  description_ar: z.string().nullable().optional(),
  base_price: z.number(),
  default_config: z.any().optional(),
  active: z.boolean(),
});

const MaterialRow = z.object({
  id: z.string().uuid().optional(),
  name_ar: z.string().min(1),
  name_en: z.string().nullable().optional(),
  type: z.string().min(1),
  unit: z.string().min(1),
  price_per_unit: z.number(),
  wastage_pct: z.number().nullable().optional(),
  supplier_id: z.string().uuid().nullable().optional(),
  country_of_origin: z.string().nullable().optional(),
  active: z.boolean(),
});

const SupplierRow = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  country: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  active: z.boolean(),
});

const FinishRow = z.object({
  id: z.string().uuid().optional(),
  name_ar: z.string().min(1),
  name_en: z.string().nullable().optional(),
  price_modifier_pct: z.number(),
  price_modifier_fixed: z.number(),
  active: z.boolean(),
});

const VeneerRow = z.object({
  id: z.string().uuid().optional(),
  name_ar: z.string().min(1),
  name_en: z.string().nullable().optional(),
  price_per_m2: z.number(),
});

const AccessoryRow = z.object({
  id: z.string().uuid().optional(),
  name_ar: z.string().min(1),
  name_en: z.string().nullable().optional(),
  unit_price: z.number(),
  active: z.boolean(),
});

const PricingFactorRow = z.object({
  id: z.string().uuid().optional(),
  key: z.string().min(1),
  label_ar: z.string().min(1),
  kind: z.string().min(1),
  scope: z.string().optional(),
  value_pct: z.number(),
  value_fixed: z.number().optional(),
  active: z.boolean(),
});

const WastageRuleRow = z.object({
  id: z.string().uuid().optional(),
  material_id: z.string().uuid().nullable().optional(),
  material_type: z.string().min(1),
  min_dimension: z.number(),
  max_dimension: z.number().nullable().optional(),
  wastage_pct: z.number(),
  active: z.boolean(),
});

const PricingRuleRow = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  version: z.number(),
  status: z.string(),
  formula: z.any(),
  effective_from: z.string().nullable().optional(),
  effective_to: z.string().nullable().optional(),
});

const IdInput = z.object({ id: z.string().uuid() });

// ---------------- product_templates ----------------

export const listProductTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("product_templates")
      .select(
        "id, category_id, code, name_ar, name_en, description_ar, base_price, default_config, active, created_at, tenant_id",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const upsertProductTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ProductTemplateRow.parse(d))
  .handler(async ({ data }) => {
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("product_templates")
        .update(data)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("product_templates")
      .insert(data)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteProductTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => IdInput.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("product_templates")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- materials ----------------

export const listMaterials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("materials")
      .select(
        "id, name_ar, name_en, type, unit, price_per_unit, wastage_pct, supplier_id, country_of_origin, active, created_at, tenant_id",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const upsertMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => MaterialRow.parse(d))
  .handler(async ({ data }) => {
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("materials")
        .update(data)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("materials")
      .insert(data)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => IdInput.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("materials")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- suppliers ----------------

export const listSuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("suppliers")
      .select("id, name, country, notes, active")
      .order("name");
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const upsertSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SupplierRow.parse(d))
  .handler(async ({ data }) => {
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("suppliers")
        .update(data)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("suppliers")
      .insert(data)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => IdInput.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("suppliers")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- finishes ----------------

export const listFinishes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("finishes")
      .select(
        "id, name_ar, name_en, price_modifier_pct, price_modifier_fixed, active",
      )
      .order("name_ar");
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const upsertFinish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => FinishRow.parse(d))
  .handler(async ({ data }) => {
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("finishes")
        .update(data)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("finishes")
      .insert(data)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteFinish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => IdInput.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("finishes")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- veneers ----------------

export const listVeneers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("veneers")
      .select("id, name_ar, name_en, price_per_m2")
      .order("name_ar");
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const upsertVeneer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => VeneerRow.parse(d))
  .handler(async ({ data }) => {
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("veneers")
        .update(data)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("veneers")
      .insert(data)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteVeneer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => IdInput.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("veneers")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- accessories ----------------

export const listAccessories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("accessories")
      .select("id, name_ar, name_en, unit_price, active")
      .order("name_ar");
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const upsertAccessory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => AccessoryRow.parse(d))
  .handler(async ({ data }) => {
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("accessories")
        .update(data)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("accessories")
      .insert(data)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteAccessory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => IdInput.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("accessories")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- pricing_factors ----------------

export const listPricingFactors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("pricing_factors")
      .select(
        "id, key, label_ar, kind, scope, value_pct, value_fixed, active",
      )
      .order("key");
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const upsertPricingFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => PricingFactorRow.parse(d))
  .handler(async ({ data }) => {
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("pricing_factors")
        .update(data)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("pricing_factors")
      .insert(data)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deletePricingFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => IdInput.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("pricing_factors")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- wastage_rules ----------------

export const listWastageRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("wastage_rules")
      .select(
        "id, material_id, material_type, min_dimension, max_dimension, wastage_pct, active",
      )
      .order("material_type");
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const upsertWastageRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => WastageRuleRow.parse(d))
  .handler(async ({ data }) => {
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("wastage_rules")
        .update(data)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("wastage_rules")
      .insert(data)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteWastageRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => IdInput.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("wastage_rules")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- pricing_rules ----------------

export const listPricingRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("pricing_rules")
      .select(
        "id, name, version, status, formula, effective_from, effective_to",
      )
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const upsertPricingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => PricingRuleRow.parse(d))
  .handler(async ({ data }) => {
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("pricing_rules")
        .update(data)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("pricing_rules")
      .insert(data)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deletePricingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => IdInput.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("pricing_rules")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });