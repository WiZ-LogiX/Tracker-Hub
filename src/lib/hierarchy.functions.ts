/**
 * Hierarchy CRUD server functions — tenant-scoped.
 *
 * Handles the Quotation → Product → Section → Unit → Component tree.
 * Uses context.supabase (RLS-enforcing client) for all reads/writes.
 * FK cascade handles parent deletes (DB level).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import type { TenantContext } from "@/lib/tenant-context";

// ── Input schemas ──────────────────────────────────────────────────────────

const quotationIdInput = z.object({ quotationId: z.string().uuid() });

const productInput = z.object({
  quotationId: z.string().uuid(),
  productTypeCode: z.string().min(1),
  label: z.string().nullable().optional(),
  position: z.number().int().optional(),
});

const productUpdateInput = z.object({
  id: z.string().uuid(),
  label: z.string().nullable().optional(),
  position: z.number().int().optional(),
  productTypeCode: z.string().min(1).optional(),
});

const sectionInput = z.object({
  quotationProductId: z.string().uuid(),
  label: z.string().nullable().optional(),
  materialId: z.string().uuid().nullable().optional(),
  finishId: z.string().uuid().nullable().optional(),
  veneerId: z.string().uuid().nullable().optional(),
  position: z.number().int().optional(),
});

const sectionUpdateInput = z.object({
  id: z.string().uuid(),
  label: z.string().nullable().optional(),
  materialId: z.string().uuid().nullable().optional(),
  finishId: z.string().uuid().nullable().optional(),
  veneerId: z.string().uuid().nullable().optional(),
  position: z.number().int().optional(),
});

const unitInput = z.object({
  sectionId: z.string().uuid(),
  unitTypeId: z.string().uuid().nullable().optional(),
  widthMm: z.number().int().optional(),
  heightMm: z.number().int().optional(),
  depthMm: z.number().int().optional(),
  lengthMm: z.number().default(0).optional(),
  dimensionUnit: z.enum(["mm", "m", "m2"]).default("mm").optional(),
  qty: z.number().int().min(1).optional(),
  finishId: z.string().uuid().nullable().optional(),
  widthTier: z.enum(["narrow", "standard", "wide", "extra_wide"]).nullable().optional(),
  position: z.number().int().optional(),
  overrideFactorKeys: z.record(z.number()).optional(),
});

const unitUpdateInput = z.object({
  id: z.string().uuid(),
  unitTypeId: z.string().uuid().nullable().optional(),
  widthMm: z.number().int().optional(),
  heightMm: z.number().int().optional(),
  depthMm: z.number().int().optional(),
  lengthMm: z.number().default(0).optional(),
  dimensionUnit: z.enum(["mm", "m", "m2"]).default("mm").optional(),
  qty: z.number().int().min(1).optional(),
  finishId: z.string().uuid().nullable().optional(),
  widthTier: z.enum(["narrow", "standard", "wide", "extra_wide"]).nullable().optional(),
  position: z.number().int().optional(),
  overrideFactorKeys: z.record(z.number()).optional(),
});

const componentInput = z.object({
  unitId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  kind: z.enum(["material", "hardware", "accessory", "manufacturing", "edge_band", "veneer", "finish"]),
  catalogId: z.string().uuid().nullable().optional(),
  qty: z.number().min(0).optional(),
  unitOfMeasure: z.string().optional(),
  areaFunctionKey: z.string().optional(),
  multiplicationMode: z.enum(["one_time", "per_unit"]).optional(),
  position: z.number().int().optional(),
});

const componentUpdateInput = z.object({
  id: z.string().uuid(),
  kind: z.enum(["material", "hardware", "accessory", "manufacturing", "edge_band", "veneer", "finish"]).optional(),
  catalogId: z.string().uuid().nullable().optional(),
  qty: z.number().min(0).optional(),
  unitOfMeasure: z.string().optional(),
  areaFunctionKey: z.string().nullable().optional(),
  multiplicationMode: z.enum(["one_time", "per_unit"]).optional(),
  position: z.number().int().optional(),
});

const deleteInput = z.object({ id: z.string().uuid() });

const reorderInput = z.object({
  ids: z.array(z.string().uuid()),
});

// ── Catalog Tenant Validation Helper ───────────────────────────────────────

export async function validateCatalogItemTenant(
  supabase: any,
  tenantId: string,
  kind: string,
  catalogId: string,
): Promise<void> {
  const tableMap: Record<string, string> = {
    material: "catalog_materials",
    hardware: "catalog_hardware",
    accessory: "catalog_accessories",
    manufacturing: "catalog_manufacturing_operations",
    edge_band: "catalog_edge_bands",
    veneer: "catalog_veneers",
    finish: "catalog_finishes",
  };

  const tableName = tableMap[kind];
  if (!tableName) return;

  const { data, error } = await supabase
    .from(tableName)
    .select("id")
    .eq("id", catalogId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      `Catalog item "${catalogId}" not found or does not belong to tenant "${tenantId}".`,
    );
  }
}

// ── Load full hierarchy tree ───────────────────────────────────────────────

export const loadHierarchy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => quotationIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const tid = ctx.tenantId;
    const qid = data.quotationId;

    // Step 1: Load products for this quotation (scoped by quotation_id)
    const productsRes = await (context as any).supabase
      .from("quotation_products")
      .select("id, quotation_id, product_type_code, label, position")
      .eq("quotation_id", qid)
      .eq("tenant_id", tid)
      .order("position");

    if (productsRes.error) throw new Error(`Failed to load products: ${productsRes.error.message}`);
    const productIds = (productsRes.data ?? []).map((p: any) => p.id);

    // Step 2: Load sections scoped to these products
    const sectionsRes = productIds.length > 0
      ? await (context as any).supabase
          .from("sections")
          .select("id, quotation_product_id, label, material_id, finish_id, veneer_id, position")
          .in("quotation_product_id", productIds)
          .eq("tenant_id", tid)
          .order("position")
      : { data: [], error: null };

    if (sectionsRes.error) throw new Error(`Failed to load sections: ${sectionsRes.error.message}`);
    const sectionIds = (sectionsRes.data ?? []).map((s: any) => s.id);

    // Step 3: Load units scoped to these sections
    const unitsRes = sectionIds.length > 0
      ? await (context as any).supabase
          .from("units")
          .select("id, section_id, unit_type_id, width_mm, height_mm, depth_mm, length_mm, dimension_unit, qty, finish_id, width_tier, override_factor_keys, position")
          .in("section_id", sectionIds)
          .eq("tenant_id", tid)
          .order("position")
      : { data: [], error: null };

    if (unitsRes.error) throw new Error(`Failed to load units: ${unitsRes.error.message}`);
    const unitIds = (unitsRes.data ?? []).map((u: any) => u.id);

    // Step 4: Load components scoped to these units
    let componentsRes = unitIds.length > 0
      ? await (context as any).supabase
          .from("components")
          .select("id, unit_id, kind, catalog_id, qty, unit_of_measure, area_function_key, multiplication_mode, position")
          .in("unit_id", unitIds)
          .eq("tenant_id", tid)
          .order("position")
      : { data: [], error: null };

    if (componentsRes.error) {
      componentsRes = await (context as any).supabase
        .from("components")
        .select("id, unit_id, kind, catalog_id, qty, unit_of_measure, area_function_key, position")
        .in("unit_id", unitIds)
        .eq("tenant_id", tid)
        .order("position");
    }

    if (componentsRes.error) throw new Error(`Failed to load components: ${componentsRes.error.message}`);

    // Step 4b: Load section-level components if supported
    let sectionComponentsRes: { data: any[]; error: any } = { data: [], error: null };
    if (sectionIds.length > 0) {
      try {
        let res = await (context as any).supabase
          .from("components")
          .select("id, section_id, kind, catalog_id, qty, unit_of_measure, area_function_key, multiplication_mode, position")
          .in("section_id", sectionIds)
          .eq("tenant_id", tid)
          .order("position");
        if (res.error) {
          res = await (context as any).supabase
            .from("components")
            .select("id, section_id, kind, catalog_id, qty, unit_of_measure, area_function_key, position")
            .in("section_id", sectionIds)
            .eq("tenant_id", tid)
            .order("position");
        }
        if (!res.error) {
          sectionComponentsRes = res;
        }
      } catch {
        // Fallback if section_id column not yet present in remote DB
      }
    }

    // Index children by parent id
    const sectionsByProduct = new Map<string, typeof sectionsRes.data>();
    for (const s of sectionsRes.data ?? []) {
      const list = sectionsByProduct.get(s.quotation_product_id) ?? [];
      list.push(s);
      sectionsByProduct.set(s.quotation_product_id, list);
    }

    const unitsBySection = new Map<string, typeof unitsRes.data>();
    for (const u of unitsRes.data ?? []) {
      const list = unitsBySection.get(u.section_id) ?? [];
      list.push(u);
      unitsBySection.set(u.section_id, list);
    }

    const componentsByUnit = new Map<string, typeof componentsRes.data>();
    for (const c of componentsRes.data ?? []) {
      const list = componentsByUnit.get(c.unit_id) ?? [];
      list.push(c);
      componentsByUnit.set(c.unit_id, list);
    }

    const componentsBySection = new Map<string, any[]>();
    for (const c of sectionComponentsRes.data ?? []) {
      const list = componentsBySection.get(c.section_id) ?? [];
      list.push(c);
      componentsBySection.set(c.section_id, list);
    }

    // Assemble tree
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tree = (productsRes.data ?? []).map((p: any) => ({
      ...p,
      sections: (sectionsByProduct.get(p.id) ?? [])
        .sort((a: any, b: any) => a.position - b.position)
        .map((s: any) => ({
          ...s,
          components: (componentsBySection.get(s.id) ?? [])
            .sort((a: any, b: any) => a.position - b.position),
          units: (unitsBySection.get(s.id) ?? [])
            .sort((a: any, b: any) => a.position - b.position)
            .map((u: any) => ({
              ...u,
              components: (componentsByUnit.get(u.id) ?? [])
                .sort((a: any, b: any) => a.position - b.position),
            })),
        })),
    }));

    return tree;
  });

// ── Product CRUD ───────────────────────────────────────────────────────────

export const addProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => productInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { data: row, error } = await (context as any).supabase
      .from("quotation_products")
      .insert({
        quotation_id: data.quotationId,
        product_type_code: data.productTypeCode,
        label: data.label ?? null,
        position: data.position ?? 0,
        tenant_id: ctx.tenantId,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => productUpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { id, ...patch } = data;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.label !== undefined) updates.label = patch.label;
    if (patch.position !== undefined) updates.position = patch.position;
    if (patch.productTypeCode !== undefined) updates.product_type_code = patch.productTypeCode;

    const { error } = await (context as any).supabase
      .from("quotation_products")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", ctx.tenantId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => deleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { error } = await (context as any).supabase
      .from("quotation_products")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => reorderInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    // Update each product's position in order
    const updates = data.ids.map((id, i) =>
      (context as any).supabase
        .from("quotation_products")
        .update({ position: i, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", ctx.tenantId),
    );
    const results = await Promise.all(updates);
    const err = results.find((r) => r.error);
    if (err?.error) throw new Error(err.error.message);
    return { ok: true };
  });

// ── Section CRUD ───────────────────────────────────────────────────────────

export const addSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => sectionInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    if (data.materialId) {
      await validateCatalogItemTenant((context as any).supabase, ctx.tenantId, "material", data.materialId);
    }
    if (data.finishId) {
      await validateCatalogItemTenant((context as any).supabase, ctx.tenantId, "finish", data.finishId);
    }
    if (data.veneerId) {
      await validateCatalogItemTenant((context as any).supabase, ctx.tenantId, "veneer", data.veneerId);
    }

    const { data: row, error } = await (context as any).supabase
      .from("sections")
      .insert({
        quotation_product_id: data.quotationProductId,
        label: data.label ?? null,
        material_id: data.materialId ?? null,
        finish_id: data.finishId ?? null,
        veneer_id: data.veneerId ?? null,
        position: data.position ?? 0,
        tenant_id: ctx.tenantId,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => sectionUpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { id, ...patch } = data;
    if (patch.materialId) {
      await validateCatalogItemTenant((context as any).supabase, ctx.tenantId, "material", patch.materialId);
    }
    if (patch.finishId) {
      await validateCatalogItemTenant((context as any).supabase, ctx.tenantId, "finish", patch.finishId);
    }
    if (patch.veneerId) {
      await validateCatalogItemTenant((context as any).supabase, ctx.tenantId, "veneer", patch.veneerId);
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.label !== undefined) updates.label = patch.label;
    if (patch.materialId !== undefined) updates.material_id = patch.materialId;
    if (patch.finishId !== undefined) updates.finish_id = patch.finishId;
    if (patch.veneerId !== undefined) updates.veneer_id = patch.veneerId;
    if (patch.position !== undefined) updates.position = patch.position;

    const { error } = await (context as any).supabase
      .from("sections")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", ctx.tenantId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => deleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { error } = await (context as any).supabase
      .from("sections")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => reorderInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const updates = data.ids.map((id, i) =>
      (context as any).supabase
        .from("sections")
        .update({ position: i, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", ctx.tenantId),
    );
    const results = await Promise.all(updates);
    const err = results.find((r) => r.error);
    if (err?.error) throw new Error(err.error.message);
    return { ok: true };
  });

// ── Unit CRUD ──────────────────────────────────────────────────────────────

export const addUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => unitInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    if (data.finishId) {
      await validateCatalogItemTenant((context as any).supabase, ctx.tenantId, "finish", data.finishId);
    }

    const { data: row, error } = await (context as any).supabase
      .from("units")
      .insert({
        section_id: data.sectionId,
        unit_type_id: data.unitTypeId ?? null,
        width_mm: data.widthMm ?? 600,
        height_mm: data.heightMm ?? 720,
        depth_mm: data.depthMm ?? 600,
        length_mm: data.lengthMm ?? 0,
        dimension_unit: data.dimensionUnit ?? "mm",
        qty: data.qty ?? 1,
        finish_id: data.finishId ?? null,
        width_tier: data.widthTier ?? null,
        override_factor_keys: data.overrideFactorKeys ?? {},
        position: data.position ?? 0,
        tenant_id: ctx.tenantId,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => unitUpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { id, ...patch } = data;
    if (patch.finishId) {
      await validateCatalogItemTenant((context as any).supabase, ctx.tenantId, "finish", patch.finishId);
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.unitTypeId !== undefined) updates.unit_type_id = patch.unitTypeId;
    if (patch.widthMm !== undefined) updates.width_mm = patch.widthMm;
    if (patch.heightMm !== undefined) updates.height_mm = patch.heightMm;
    if (patch.depthMm !== undefined) updates.depth_mm = patch.depthMm;
    if (patch.lengthMm !== undefined) updates.length_mm = patch.lengthMm;
    if (patch.dimensionUnit !== undefined) updates.dimension_unit = patch.dimensionUnit;
    if (patch.qty !== undefined) updates.qty = patch.qty;
    if (patch.finishId !== undefined) updates.finish_id = patch.finishId;
    if (patch.widthTier !== undefined) updates.width_tier = patch.widthTier;
    if (patch.position !== undefined) updates.position = patch.position;
    if (patch.overrideFactorKeys !== undefined) updates.override_factor_keys = patch.overrideFactorKeys;

    const { error } = await (context as any).supabase
      .from("units")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", ctx.tenantId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => deleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { error } = await (context as any).supabase
      .from("units")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderUnits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => reorderInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const updates = data.ids.map((id, i) =>
      (context as any).supabase
        .from("units")
        .update({ position: i, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", ctx.tenantId),
    );
    const results = await Promise.all(updates);
    const err = results.find((r) => r.error);
    if (err?.error) throw new Error(err.error.message);
    return { ok: true };
  });

// ── Component CRUD ─────────────────────────────────────────────────────────

export const addComponent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => componentInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    if (data.catalogId) {
      await validateCatalogItemTenant((context as any).supabase, ctx.tenantId, data.kind, data.catalogId);
    }

    const insertPayload: Record<string, any> = {
      kind: data.kind,
      catalog_id: data.catalogId ?? null,
      qty: data.qty ?? 1,
      unit_of_measure: data.unitOfMeasure ?? "pcs",
      area_function_key: data.areaFunctionKey ?? null,
      multiplication_mode: data.multiplicationMode ?? "one_time",
      position: data.position ?? 0,
      tenant_id: ctx.tenantId,
    };
    if (data.unitId) insertPayload.unit_id = data.unitId;
    if (data.sectionId) insertPayload.section_id = data.sectionId;

    let { data: row, error } = await (context as any).supabase
      .from("components")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error && error.message?.includes("multiplication_mode")) {
      delete insertPayload.multiplication_mode;
      const res = await (context as any).supabase
        .from("components")
        .insert(insertPayload)
        .select("id")
        .single();
      row = res.data;
      error = res.error;
    }

    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateComponent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => componentUpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { id, ...patch } = data;

    if (patch.catalogId) {
      let compKind = patch.kind;
      if (!compKind) {
        const { data: existing } = await (context as any).supabase
          .from("components")
          .select("kind")
          .eq("id", id)
          .eq("tenant_id", ctx.tenantId)
          .maybeSingle();
        compKind = existing?.kind;
      }
      if (compKind) {
        await validateCatalogItemTenant((context as any).supabase, ctx.tenantId, compKind, patch.catalogId);
      }
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.kind !== undefined) updates.kind = patch.kind;
    if (patch.catalogId !== undefined) updates.catalog_id = patch.catalogId;
    if (patch.qty !== undefined) updates.qty = patch.qty;
    if (patch.unitOfMeasure !== undefined) updates.unit_of_measure = patch.unitOfMeasure;
    if (patch.areaFunctionKey !== undefined) updates.area_function_key = patch.areaFunctionKey;
    if (patch.multiplicationMode !== undefined) updates.multiplication_mode = patch.multiplicationMode;
    if (patch.position !== undefined) updates.position = patch.position;

    let { error } = await (context as any).supabase
      .from("components")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", ctx.tenantId);

    if (error && error.message?.includes("multiplication_mode")) {
      delete updates.multiplication_mode;
      const res = await (context as any).supabase
        .from("components")
        .update(updates)
        .eq("id", id)
        .eq("tenant_id", ctx.tenantId);
      error = res.error;
    }

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteComponent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => deleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { error } = await (context as any).supabase
      .from("components")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderComponents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => reorderInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const updates = data.ids.map((id, i) =>
      (context as any).supabase
        .from("components")
        .update({ position: i, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", ctx.tenantId),
    );
    const results = await Promise.all(updates);
    const err = results.find((r) => r.error);
    if (err?.error) throw new Error(err.error.message);
    return { ok: true };
  });
