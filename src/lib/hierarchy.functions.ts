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
  position: z.number().int().optional(),
});

const sectionUpdateInput = z.object({
  id: z.string().uuid(),
  label: z.string().nullable().optional(),
  position: z.number().int().optional(),
});

const unitInput = z.object({
  sectionId: z.string().uuid(),
  unitTypeId: z.string().uuid().nullable().optional(),
  widthMm: z.number().int().optional(),
  heightMm: z.number().int().optional(),
  depthMm: z.number().int().optional(),
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
  qty: z.number().int().min(1).optional(),
  finishId: z.string().uuid().nullable().optional(),
  widthTier: z.enum(["narrow", "standard", "wide", "extra_wide"]).nullable().optional(),
  position: z.number().int().optional(),
  overrideFactorKeys: z.record(z.number()).optional(),
});

const componentInput = z.object({
  unitId: z.string().uuid(),
  kind: z.enum(["material", "hardware", "accessory", "manufacturing", "edge_band"]),
  catalogId: z.string().uuid().nullable().optional(),
  qty: z.number().min(0).optional(),
  unitOfMeasure: z.string().optional(),
  position: z.number().int().optional(),
});

const componentUpdateInput = z.object({
  id: z.string().uuid(),
  kind: z.enum(["material", "hardware", "accessory", "manufacturing", "edge_band"]).optional(),
  catalogId: z.string().uuid().nullable().optional(),
  qty: z.number().min(0).optional(),
  unitOfMeasure: z.string().optional(),
  position: z.number().int().optional(),
});

const deleteInput = z.object({ id: z.string().uuid() });

const reorderInput = z.object({
  ids: z.array(z.string().uuid()),
});

// ── Load full hierarchy tree ───────────────────────────────────────────────

export const loadHierarchy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => quotationIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const tid = ctx.tenantId;
    const qid = data.quotationId;

    // Load all 4 levels in parallel
    const [productsRes, sectionsRes, unitsRes, componentsRes] = await Promise.all([
      (context as any).supabase
        .from("quotation_products")
        .select("id, quotation_id, product_type_code, label, position")
        .eq("quotation_id", qid)
        .eq("tenant_id", tid)
        .order("position"),
      (context as any).supabase
        .from("sections")
        .select("id, quotation_product_id, label, position")
        .eq("tenant_id", tid)
        .order("position"),
      (context as any).supabase
        .from("units")
        .select("id, section_id, unit_type_id, width_mm, height_mm, depth_mm, qty, finish_id, width_tier, override_factor_keys, position")
        .eq("tenant_id", tid)
        .order("position"),
      (context as any).supabase
        .from("components")
        .select("id, unit_id, kind, catalog_id, qty, unit_of_measure, position")
        .eq("tenant_id", tid)
        .order("position"),
    ]);

    if (productsRes.error) throw new Error(`Failed to load products: ${productsRes.error.message}`);
    if (sectionsRes.error) throw new Error(`Failed to load sections: ${sectionsRes.error.message}`);
    if (unitsRes.error) throw new Error(`Failed to load units: ${unitsRes.error.message}`);
    if (componentsRes.error) throw new Error(`Failed to load components: ${componentsRes.error.message}`);

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

    // Assemble tree
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tree = (productsRes.data ?? []).map((p: any) => ({
      ...p,
      sections: (sectionsByProduct.get(p.id) ?? [])
        .sort((a: any, b: any) => a.position - b.position)
        .map((s: any) => ({
          ...s,
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
    const { data: row, error } = await (context as any).supabase
      .from("sections")
      .insert({
        quotation_product_id: data.quotationProductId,
        label: data.label ?? null,
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
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.label !== undefined) updates.label = patch.label;
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
    const { data: row, error } = await (context as any).supabase
      .from("units")
      .insert({
        section_id: data.sectionId,
        unit_type_id: data.unitTypeId ?? null,
        width_mm: data.widthMm ?? 600,
        height_mm: data.heightMm ?? 720,
        depth_mm: data.depthMm ?? 600,
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
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.unitTypeId !== undefined) updates.unit_type_id = patch.unitTypeId;
    if (patch.widthMm !== undefined) updates.width_mm = patch.widthMm;
    if (patch.heightMm !== undefined) updates.height_mm = patch.heightMm;
    if (patch.depthMm !== undefined) updates.depth_mm = patch.depthMm;
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
    const { data: row, error } = await (context as any).supabase
      .from("components")
      .insert({
        unit_id: data.unitId,
        kind: data.kind,
        catalog_id: data.catalogId ?? null,
        qty: data.qty ?? 1,
        unit_of_measure: data.unitOfMeasure ?? "pcs",
        position: data.position ?? 0,
        tenant_id: ctx.tenantId,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateComponent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => componentUpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { id, ...patch } = data;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.kind !== undefined) updates.kind = patch.kind;
    if (patch.catalogId !== undefined) updates.catalog_id = patch.catalogId;
    if (patch.qty !== undefined) updates.qty = patch.qty;
    if (patch.unitOfMeasure !== undefined) updates.unit_of_measure = patch.unitOfMeasure;
    if (patch.position !== undefined) updates.position = patch.position;

    const { error } = await (context as any).supabase
      .from("components")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", ctx.tenantId);

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
