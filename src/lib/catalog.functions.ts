import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { setTenantGuc } from "@/lib/tenant";
import type { TenantContext } from "@/lib/tenant-context";

/**
 * Catalog CRUD — tenant-scoped via requireTenant middleware + RLS-enforcing
 * context.supabase client. App-layer .eq('tenant_id') filter is the
 * primary tenant isolation guard; RLS provides defense-in-depth.
 *
 * Every handler:
 *   1. Extracts ctx from context.tenantContext
 *   2. Calls setTenantGuc(ctx.tenantId) for RLS GUC setup
 *   3. Filters all queries by tenant_id
 */

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

const DiscountRow = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1),
  type: z.string().min(1),
  value: z.number(),
  max_value: z.number().nullable().optional(),
  valid_from: z.string().nullable().optional(),
  valid_to: z.string().nullable().optional(),
  usage_count: z.number().optional(),
  max_uses: z.number().nullable().optional(),
  active: z.boolean(),
});

const WorkerRow = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  role: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
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

// ---------------- materials ----------------

export const listMaterials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    const { data, error } = await (context as any).supabase
      .from("materials")
      .select(
        "id, name_ar, name_en, type, unit, price_per_unit, wastage_pct, supplier_id, country_of_origin, active, created_at, tenant_id",
      )
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const upsertMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => MaterialRow.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    if (data.id) {
      const { error } = await (context as any).supabase
        .from("materials")
        .update(data)
        .eq("id", data.id)
        .eq("tenant_id", ctx.tenantId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await (context as any).supabase
      .from("materials")
      .insert({ ...data, tenant_id: ctx.tenantId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row?.id ?? null };
  });

export const deleteMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    const { error } = await (context as any).supabase
      .from("materials")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- suppliers ----------------

export const listSuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    const { data, error } = await (context as any).supabase
      .from("suppliers")
      .select("id, name, country, notes, active")
      .eq("tenant_id", ctx.tenantId)
      .order("name");
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const upsertSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => SupplierRow.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    if (data.id) {
      const { error } = await (context as any).supabase
        .from("suppliers")
        .update(data)
        .eq("id", data.id)
        .eq("tenant_id", ctx.tenantId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await (context as any).supabase
      .from("suppliers")
      .insert({ ...data, tenant_id: ctx.tenantId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row?.id ?? null };
  });

export const deleteSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    const { error } = await (context as any).supabase
      .from("suppliers")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- finishes ----------------

export const listFinishes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    const { data, error } = await (context as any).supabase
      .from("finishes")
      .select(
        "id, name_ar, name_en, price_modifier_pct, price_modifier_fixed, active",
      )
      .eq("tenant_id", ctx.tenantId)
      .order("name_ar");
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const upsertFinish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => FinishRow.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    if (data.id) {
      const { error } = await (context as any).supabase
        .from("finishes")
        .update(data)
        .eq("id", data.id)
        .eq("tenant_id", ctx.tenantId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await (context as any).supabase
      .from("finishes")
      .insert({ ...data, tenant_id: ctx.tenantId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row?.id ?? null };
  });

export const deleteFinish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    const { error } = await (context as any).supabase
      .from("finishes")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- veneers ----------------

export const listVeneers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    const { data, error } = await (context as any).supabase
      .from("veneers")
      .select("id, name_ar, name_en, price_per_m2")
      .eq("tenant_id", ctx.tenantId)
      .order("name_ar");
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const upsertVeneer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => VeneerRow.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    if (data.id) {
      const { error } = await (context as any).supabase
        .from("veneers")
        .update(data)
        .eq("id", data.id)
        .eq("tenant_id", ctx.tenantId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await (context as any).supabase
      .from("veneers")
      .insert({ ...data, tenant_id: ctx.tenantId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row?.id ?? null };
  });

export const deleteVeneer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    const { error } = await (context as any).supabase
      .from("veneers")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- accessories ----------------

export const listAccessories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    const { data, error } = await (context as any).supabase
      .from("accessories")
      .select("id, name_ar, name_en, unit_price, active")
      .eq("tenant_id", ctx.tenantId)
      .order("name_ar");
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const upsertAccessory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => AccessoryRow.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    if (data.id) {
      const { error } = await (context as any).supabase
        .from("accessories")
        .update(data)
        .eq("id", data.id)
        .eq("tenant_id", ctx.tenantId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await (context as any).supabase
      .from("accessories")
      .insert({ ...data, tenant_id: ctx.tenantId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row?.id ?? null };
  });

export const deleteAccessory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    const { error } = await (context as any).supabase
      .from("accessories")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- discounts ----------------

export const listDiscounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    const { data, error } = await (context as any).supabase
      .from("discounts")
      .select(
        "id, code, type, value, max_value, valid_from, valid_to, usage_count, max_uses, active, created_at",
      )
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const upsertDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => DiscountRow.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    if (data.id) {
      const { error } = await (context as any).supabase
        .from("discounts")
        .update(data)
        .eq("id", data.id)
        .eq("tenant_id", ctx.tenantId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await (context as any).supabase
      .from("discounts")
      .insert({ ...data, tenant_id: ctx.tenantId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row?.id ?? null };
  });

export const deleteDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    const { error } = await (context as any).supabase
      .from("discounts")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- workers ----------------

export const listWorkers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    const { data, error } = await (context as any).supabase
      .from("workers")
      .select("id, name, role, phone, active, created_at")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const upsertWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => WorkerRow.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    if (data.id) {
      const { error } = await (context as any).supabase
        .from("workers")
        .update(data)
        .eq("id", data.id)
        .eq("tenant_id", ctx.tenantId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await (context as any).supabase
      .from("workers")
      .insert({ ...data, tenant_id: ctx.tenantId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row?.id ?? null };
  });

export const deleteWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    const { error } = await (context as any).supabase
      .from("workers")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- wastage_rules ----------------

export const listWastageRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    const { data, error } = await (context as any).supabase
      .from("wastage_rules")
      .select(
        "id, material_id, material_type, min_dimension, max_dimension, wastage_pct, active",
      )
      .eq("tenant_id", ctx.tenantId)
      .order("material_type");
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const upsertWastageRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => WastageRuleRow.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    if (data.id) {
      const { error } = await (context as any).supabase
        .from("wastage_rules")
        .update(data)
        .eq("id", data.id)
        .eq("tenant_id", ctx.tenantId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await (context as any).supabase
      .from("wastage_rules")
      .insert({ ...data, tenant_id: ctx.tenantId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row?.id ?? null };
  });

export const deleteWastageRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    const { error } = await (context as any).supabase
      .from("wastage_rules")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- pricing_rules ----------------

export const listPricingRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    const { data, error } = await (context as any).supabase
      .from("pricing_rules")
      .select(
        "id, name, version, status, formula, effective_from, effective_to",
      )
      .eq("tenant_id", ctx.tenantId)
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const upsertPricingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => PricingRuleRow.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    if (data.id) {
      const { error } = await (context as any).supabase
        .from("pricing_rules")
        .update(data)
        .eq("id", data.id)
        .eq("tenant_id", ctx.tenantId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await (context as any).supabase
      .from("pricing_rules")
      .insert({ ...data, tenant_id: ctx.tenantId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row?.id ?? null };
  });

export const deletePricingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    const { error } = await (context as any).supabase
      .from("pricing_rules")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ═══════════════════════════════════════════════════════════════════════════
//  CATALOG V2 CRUD — RLS-enforcing client, tenant_id from session
// ═══════════════════════════════════════════════════════════════════════════
//
// SECURITY: These functions use `context.supabase` (the user-scoped client
// from auth-middleware, which enforces RLS). tenant_id is ALWAYS derived
// from the authenticated session — never from client input.
//
// Hard deletes are blocked for catalog rows. Use archive instead.
//
// These functions operate on the NEW catalog_* / tenant_* tables (T2.x),
// NOT on the legacy tables above.

import { canWrite } from "@/lib/tenant-context";
import { recordPriceChangeIfDifferent } from "./priceHistory";

function requireWriteRole(ctx: TenantContext) {
  if (!canWrite(ctx.role)) {
    throw new Error("Forbidden: insufficient role for catalog write");
  }
}

function requireAdminRole(ctx: TenantContext) {
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    throw new Error("Forbidden: only owner or admin may archive/delete catalog rows");
  }
}

function catalogNow() {
  return new Date().toISOString();
}

function blockHardDelete(): never {
  throw new Error("Hard delete is not allowed for catalog rows. Use archive instead.");
}

async function getArchivedAt(client: any, table: string, id: string, tenantId: string): Promise<string | null> {
  const { data, error } = await client
    .from(table)
    .select("archived_at")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`${table} row ${id} not found or access denied`);
  return (data as any).archived_at ?? null;
}

function blockIfArchived(archivedAt: string | null, table: string, id: string) {
  if (archivedAt) {
    throw new Error(`Cannot modify archived ${table} row ${id}. Unarchive first.`);
  }
}

// ─── Zod schemas ───────────────────────────────────────────────────────────

const PricingUnit = z.enum(["piece", "m", "m2", "minute", "linear_meter", "square_meter", "unit"]);

const MaterialCreate = z.object({
  code: z.string().trim().min(1).max(64),
  labelI18nKey: z.string().trim().min(1).max(128),
  pricingUnit: PricingUnit,
  pricePerUnit: z.coerce.number().min(0),
  defaultWastagePct: z.coerce.number().min(0).max(100).optional(),
  supplierId: z.string().uuid().optional(),
}).strict();

const MaterialUpdate = z.object({
  id: z.string().uuid(),
  code: z.string().trim().min(1).max(64).optional(),
  labelI18nKey: z.string().trim().min(1).max(128).optional(),
  pricingUnit: PricingUnit.optional(),
  pricePerUnit: z.coerce.number().min(0).optional(),
  defaultWastagePct: z.coerce.number().min(0).max(100).optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
}).strict();

const FinishCreate = z.object({
  code: z.string().trim().min(1).max(64),
  pricePerUnit: z.coerce.number().min(0),
}).strict();

const FinishUpdate = z.object({
  id: z.string().uuid(),
  code: z.string().trim().min(1).max(64).optional(),
  pricePerUnit: z.coerce.number().min(0).optional(),
}).strict();

const VeneerCreate = z.object({
  code: z.string().trim().min(1).max(64),
  pricePerM2: z.coerce.number().min(0),
}).strict();

const VeneerUpdate = z.object({
  id: z.string().uuid(),
  code: z.string().trim().min(1).max(64).optional(),
  pricePerM2: z.coerce.number().min(0).optional(),
}).strict();

const HardwareCreate = z.object({
  code: z.string().trim().min(1).max(64),
  pricePerPiece: z.coerce.number().min(0),
}).strict();

const HardwareUpdate = z.object({
  id: z.string().uuid(),
  code: z.string().trim().min(1).max(64).optional(),
  pricePerPiece: z.coerce.number().min(0).optional(),
}).strict();

const AccessoryCreateV2 = z.object({
  code: z.string().trim().min(1).max(64),
  pricePerPiece: z.coerce.number().min(0),
}).strict();

const AccessoryUpdateV2 = z.object({
  id: z.string().uuid(),
  code: z.string().trim().min(1).max(64).optional(),
  pricePerPiece: z.coerce.number().min(0).optional(),
}).strict();

const MfgRateUnit = z.enum(["piece", "m", "m2", "minute"]);

const ManufacturingOpCreate = z.object({
  code: z.string().trim().min(1).max(64),
  rateUnit: MfgRateUnit,
  rate: z.coerce.number().min(0),
}).strict();

const ManufacturingOpUpdate = z.object({
  id: z.string().uuid(),
  code: z.string().trim().min(1).max(64).optional(),
  rateUnit: MfgRateUnit.optional(),
  rate: z.coerce.number().min(0).optional(),
}).strict();

const PricingFactorKey = z.enum(["labor", "overhead", "margin", "luxury", "complexity", "rush", "wastage"]);

const PricingFactorCreate = z.object({
  factorKey: PricingFactorKey,
  percent: z.coerce.number().min(0).max(100),
}).strict();

const PricingFactorUpdate = z.object({
  id: z.string().uuid(),
  factorKey: PricingFactorKey.optional(),
  percent: z.coerce.number().min(0).max(100).optional(),
}).strict();

const WastageScope = z.enum(["material", "material_type"]);

const WastageRuleCreateV2 = z.object({
  scope: WastageScope,
  ref: z.string().trim().max(128).optional(),
  pct: z.coerce.number().min(0),
}).strict();

const WastageRuleUpdateV2 = z.object({
  id: z.string().uuid(),
  scope: WastageScope.optional(),
  ref: z.string().trim().max(128).optional().nullable(),
  pct: z.coerce.number().min(0).optional(),
}).strict();

const DiscountType = z.enum(["percentage", "fixed"]);

const DiscountCreateV2 = z.object({
  code: z.string().trim().min(1).max(64),
  type: DiscountType,
  value: z.coerce.number().min(0),
  maxValue: z.coerce.number().min(0).optional(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").optional(),
}).strict();

const DiscountUpdateV2 = z.object({
  id: z.string().uuid(),
  code: z.string().trim().min(1).max(64).optional(),
  type: DiscountType.optional(),
  value: z.coerce.number().min(0).optional(),
  maxValue: z.coerce.number().min(0).optional().nullable(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
}).strict();

const FeeSign = z.enum(["plus", "minus"]);

const FeesCreditCreate = z.object({
  code: z.string().trim().min(1).max(64),
  labelI18nKey: z.string().trim().min(1).max(128),
  sign: FeeSign,
  amount: z.coerce.number().optional(),
  formulaKey: z.string().trim().max(128).optional(),
}).strict().refine(
  (d) => d.amount != null || d.formulaKey != null,
  { message: "At least one of amount or formulaKey must be provided" },
);

const FeesCreditUpdate = z.object({
  id: z.string().uuid(),
  code: z.string().trim().min(1).max(64).optional(),
  labelI18nKey: z.string().trim().min(1).max(128).optional(),
  sign: FeeSign.optional(),
  amount: z.coerce.number().optional().nullable(),
  formulaKey: z.string().trim().max(128).optional().nullable(),
}).strict();

const ArchiveInput = z.object({ id: z.string().uuid() }).strict();

// ═══════════════════════════════════════════════════════════════════════════
//  CATALOG MATERIALS (catalog_materials)
// ═══════════════════════════════════════════════════════════════════════════

export const createCatalogMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => MaterialCreate.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireWriteRole(ctx);
    const client = (context as any).supabase;
    const payload = {
      tenant_id: ctx.tenantId,
      code: data.code,
      label_i18n_key: data.labelI18nKey,
      pricing_unit: data.pricingUnit,
      price_per_unit: String(data.pricePerUnit),
      default_wastage_pct: data.defaultWastagePct != null ? String(data.defaultWastagePct) : null,
      supplier_id: data.supplierId ?? null,
    };
    const { data: row, error } = await client
      .from("catalog_materials")
      .insert(payload)
      .select("id, code, label_i18n_key, pricing_unit, price_per_unit, default_wastage_pct, supplier_id, archived_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Material not created");
    return row;
  });

export const updateCatalogMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => MaterialUpdate.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireWriteRole(ctx);
    const client = (context as any).supabase;
    const { id, ...fields } = data;
    const archivedAt = await getArchivedAt(client, "catalog_materials", id, ctx.tenantId);
    blockIfArchived(archivedAt, "catalog_materials", id);
    const payload: Record<string, unknown> = { updated_at: catalogNow() };
    if (fields.code !== undefined) payload.code = fields.code;
    if (fields.labelI18nKey !== undefined) payload.label_i18n_key = fields.labelI18nKey;
    if (fields.pricingUnit !== undefined) payload.pricing_unit = fields.pricingUnit;
    if (fields.pricePerUnit !== undefined) payload.price_per_unit = String(fields.pricePerUnit);
    if (fields.defaultWastagePct !== undefined) payload.default_wastage_pct = fields.defaultWastagePct != null ? String(fields.defaultWastagePct) : null;
    if (fields.supplierId !== undefined) payload.supplier_id = fields.supplierId ?? null;
    const { data: row, error } = await client
      .from("catalog_materials")
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", ctx.tenantId)
      .select("id, code, label_i18n_key, pricing_unit, price_per_unit, default_wastage_pct, supplier_id, archived_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Record price change if price_per_unit was updated
    if (fields.pricePerUnit !== undefined && row) {
      await recordPriceChangeIfDifferent(
        client, ctx.tenantId, "material", id,
        "catalog_materials", "price_per_unit", fields.pricePerUnit,
      );
    }

    return row;
  });

export const archiveCatalogMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ArchiveInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireAdminRole(ctx);
    const client = (context as any).supabase;
    const archivedAt = await getArchivedAt(client, "catalog_materials", data.id, ctx.tenantId);
    blockIfArchived(archivedAt, "catalog_materials", data.id);
    const { data: row, error } = await client
      .from("catalog_materials")
      .update({ archived_at: catalogNow(), updated_at: catalogNow() })
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Material not found");
    return { archived: true };
  });

export const hardDeleteCatalogMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ArchiveInput.parse(d))
  .handler(() => blockHardDelete());

// ═══════════════════════════════════════════════════════════════════════════
//  CATALOG FINISHES (catalog_finishes)
// ═══════════════════════════════════════════════════════════════════════════

export const createCatalogFinish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => FinishCreate.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireWriteRole(ctx);
    const client = (context as any).supabase;
    const payload = {
      tenant_id: ctx.tenantId,
      code: data.code,
      price_per_unit: String(data.pricePerUnit),
    };
    const { data: row, error } = await client
      .from("catalog_finishes")
      .insert(payload)
      .select("id, code, price_per_unit, archived_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Finish not created");
    return row;
  });

export const updateCatalogFinish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => FinishUpdate.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireWriteRole(ctx);
    const client = (context as any).supabase;
    const { id, ...fields } = data;
    const archivedAt = await getArchivedAt(client, "catalog_finishes", id, ctx.tenantId);
    blockIfArchived(archivedAt, "catalog_finishes", id);
    const payload: Record<string, unknown> = { updated_at: catalogNow() };
    if (fields.code !== undefined) payload.code = fields.code;
    if (fields.pricePerUnit !== undefined) payload.price_per_unit = String(fields.pricePerUnit);
    const { data: row, error } = await client
      .from("catalog_finishes")
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", ctx.tenantId)
      .select("id, code, price_per_unit, archived_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Record price change if price_per_unit was updated
    if (fields.pricePerUnit !== undefined && row) {
      await recordPriceChangeIfDifferent(
        client, ctx.tenantId, "finish", id,
        "catalog_finishes", "price_per_unit", fields.pricePerUnit,
      );
    }

    return row;
  });

export const archiveCatalogFinish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ArchiveInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireAdminRole(ctx);
    const client = (context as any).supabase;
    const archivedAt = await getArchivedAt(client, "catalog_finishes", data.id, ctx.tenantId);
    blockIfArchived(archivedAt, "catalog_finishes", data.id);
    const { data: row, error } = await client
      .from("catalog_finishes")
      .update({ archived_at: catalogNow(), updated_at: catalogNow() })
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Finish not found");
    return { archived: true };
  });

export const hardDeleteCatalogFinish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ArchiveInput.parse(d))
  .handler(() => blockHardDelete());

// ═══════════════════════════════════════════════════════════════════════════
//  CATALOG VENEERS (catalog_veneers)
// ═══════════════════════════════════════════════════════════════════════════

export const createCatalogVeneer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => VeneerCreate.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireWriteRole(ctx);
    const client = (context as any).supabase;
    const payload = {
      tenant_id: ctx.tenantId,
      code: data.code,
      price_per_m2: String(data.pricePerM2),
    };
    const { data: row, error } = await client
      .from("catalog_veneers")
      .insert(payload)
      .select("id, code, price_per_m2, archived_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Veneer not created");
    return row;
  });

export const updateCatalogVeneer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => VeneerUpdate.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireWriteRole(ctx);
    const client = (context as any).supabase;
    const { id, ...fields } = data;
    const archivedAt = await getArchivedAt(client, "catalog_veneers", id, ctx.tenantId);
    blockIfArchived(archivedAt, "catalog_veneers", id);
    const payload: Record<string, unknown> = { updated_at: catalogNow() };
    if (fields.code !== undefined) payload.code = fields.code;
    if (fields.pricePerM2 !== undefined) payload.price_per_m2 = String(fields.pricePerM2);
    const { data: row, error } = await client
      .from("catalog_veneers")
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", ctx.tenantId)
      .select("id, code, price_per_m2, archived_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Record price change if price_per_m2 was updated
    if (fields.pricePerM2 !== undefined && row) {
      await recordPriceChangeIfDifferent(
        client, ctx.tenantId, "veneer", id,
        "catalog_veneers", "price_per_m2", fields.pricePerM2,
      );
    }

    return row;
  });

export const archiveCatalogVeneer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ArchiveInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireAdminRole(ctx);
    const client = (context as any).supabase;
    const archivedAt = await getArchivedAt(client, "catalog_veneers", data.id, ctx.tenantId);
    blockIfArchived(archivedAt, "catalog_veneers", data.id);
    const { data: row, error } = await client
      .from("catalog_veneers")
      .update({ archived_at: catalogNow(), updated_at: catalogNow() })
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Veneer not found");
    return { archived: true };
  });

export const hardDeleteCatalogVeneer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ArchiveInput.parse(d))
  .handler(() => blockHardDelete());

// ═══════════════════════════════════════════════════════════════════════════
//  CATALOG HARDWARE (catalog_hardware)
// ═══════════════════════════════════════════════════════════════════════════

export const createCatalogHardware = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => HardwareCreate.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireWriteRole(ctx);
    const client = (context as any).supabase;
    const payload = {
      tenant_id: ctx.tenantId,
      code: data.code,
      price_per_piece: String(data.pricePerPiece),
    };
    const { data: row, error } = await client
      .from("catalog_hardware")
      .insert(payload)
      .select("id, code, price_per_piece, archived_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Hardware not created");
    return row;
  });

export const updateCatalogHardware = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => HardwareUpdate.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireWriteRole(ctx);
    const client = (context as any).supabase;
    const { id, ...fields } = data;
    const archivedAt = await getArchivedAt(client, "catalog_hardware", id, ctx.tenantId);
    blockIfArchived(archivedAt, "catalog_hardware", id);
    const payload: Record<string, unknown> = { updated_at: catalogNow() };
    if (fields.code !== undefined) payload.code = fields.code;
    if (fields.pricePerPiece !== undefined) payload.price_per_piece = String(fields.pricePerPiece);
    const { data: row, error } = await client
      .from("catalog_hardware")
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", ctx.tenantId)
      .select("id, code, price_per_piece, archived_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Record price change if price_per_piece was updated
    if (fields.pricePerPiece !== undefined && row) {
      await recordPriceChangeIfDifferent(
        client, ctx.tenantId, "hardware", id,
        "catalog_hardware", "price_per_piece", fields.pricePerPiece,
      );
    }

    return row;
  });

export const archiveCatalogHardware = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ArchiveInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireAdminRole(ctx);
    const client = (context as any).supabase;
    const archivedAt = await getArchivedAt(client, "catalog_hardware", data.id, ctx.tenantId);
    blockIfArchived(archivedAt, "catalog_hardware", data.id);
    const { data: row, error } = await client
      .from("catalog_hardware")
      .update({ archived_at: catalogNow(), updated_at: catalogNow() })
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Hardware not found");
    return { archived: true };
  });

export const hardDeleteCatalogHardware = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ArchiveInput.parse(d))
  .handler(() => blockHardDelete());

// ═══════════════════════════════════════════════════════════════════════════
//  CATALOG ACCESSORIES V2 (catalog_accessories)
// ═══════════════════════════════════════════════════════════════════════════

export const createCatalogAccessory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => AccessoryCreateV2.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireWriteRole(ctx);
    const client = (context as any).supabase;
    const payload = {
      tenant_id: ctx.tenantId,
      code: data.code,
      price_per_piece: String(data.pricePerPiece),
    };
    const { data: row, error } = await client
      .from("catalog_accessories")
      .insert(payload)
      .select("id, code, price_per_piece, archived_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Accessory not created");
    return row;
  });

export const updateCatalogAccessory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => AccessoryUpdateV2.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireWriteRole(ctx);
    const client = (context as any).supabase;
    const { id, ...fields } = data;
    const archivedAt = await getArchivedAt(client, "catalog_accessories", id, ctx.tenantId);
    blockIfArchived(archivedAt, "catalog_accessories", id);
    const payload: Record<string, unknown> = { updated_at: catalogNow() };
    if (fields.code !== undefined) payload.code = fields.code;
    if (fields.pricePerPiece !== undefined) payload.price_per_piece = String(fields.pricePerPiece);
    const { data: row, error } = await client
      .from("catalog_accessories")
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", ctx.tenantId)
      .select("id, code, price_per_piece, archived_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Record price change if price_per_piece was updated
    if (fields.pricePerPiece !== undefined && row) {
      await recordPriceChangeIfDifferent(
        client, ctx.tenantId, "accessory", id,
        "catalog_accessories", "price_per_piece", fields.pricePerPiece,
      );
    }

    return row;
  });

export const archiveCatalogAccessory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ArchiveInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireAdminRole(ctx);
    const client = (context as any).supabase;
    const archivedAt = await getArchivedAt(client, "catalog_accessories", data.id, ctx.tenantId);
    blockIfArchived(archivedAt, "catalog_accessories", data.id);
    const { data: row, error } = await client
      .from("catalog_accessories")
      .update({ archived_at: catalogNow(), updated_at: catalogNow() })
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Accessory not found");
    return { archived: true };
  });

export const hardDeleteCatalogAccessory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ArchiveInput.parse(d))
  .handler(() => blockHardDelete());

// ═══════════════════════════════════════════════════════════════════════════
//  CATALOG MANUFACTURING OPERATIONS (catalog_manufacturing_operations)
// ═══════════════════════════════════════════════════════════════════════════

export const createCatalogManufacturingOp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ManufacturingOpCreate.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireWriteRole(ctx);
    const client = (context as any).supabase;
    const payload = {
      tenant_id: ctx.tenantId,
      code: data.code,
      rate_unit: data.rateUnit,
      rate: String(data.rate),
    };
    const { data: row, error } = await client
      .from("catalog_manufacturing_operations")
      .insert(payload)
      .select("id, code, rate_unit, rate, archived_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Manufacturing operation not created");
    return row;
  });

export const updateCatalogManufacturingOp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ManufacturingOpUpdate.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireWriteRole(ctx);
    const client = (context as any).supabase;
    const { id, ...fields } = data;
    const archivedAt = await getArchivedAt(client, "catalog_manufacturing_operations", id, ctx.tenantId);
    blockIfArchived(archivedAt, "catalog_manufacturing_operations", id);
    const payload: Record<string, unknown> = { updated_at: catalogNow() };
    if (fields.code !== undefined) payload.code = fields.code;
    if (fields.rateUnit !== undefined) payload.rate_unit = fields.rateUnit;
    if (fields.rate !== undefined) payload.rate = String(fields.rate);
    const { data: row, error } = await client
      .from("catalog_manufacturing_operations")
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", ctx.tenantId)
      .select("id, code, rate_unit, rate, archived_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Record price change if rate was updated
    if (fields.rate !== undefined && row) {
      await recordPriceChangeIfDifferent(
        client, ctx.tenantId, "manufacturing", id,
        "catalog_manufacturing_operations", "rate", fields.rate,
      );
    }

    return row;
  });

export const archiveCatalogManufacturingOp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ArchiveInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireAdminRole(ctx);
    const client = (context as any).supabase;
    const archivedAt = await getArchivedAt(client, "catalog_manufacturing_operations", data.id, ctx.tenantId);
    blockIfArchived(archivedAt, "catalog_manufacturing_operations", data.id);
    const { data: row, error } = await client
      .from("catalog_manufacturing_operations")
      .update({ archived_at: catalogNow(), updated_at: catalogNow() })
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Manufacturing operation not found");
    return { archived: true };
  });

export const hardDeleteCatalogManufacturingOp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ArchiveInput.parse(d))
  .handler(() => blockHardDelete());

// ═══════════════════════════════════════════════════════════════════════════
//  PRICING FACTORS (tenant_pricing_factors)
// ═══════════════════════════════════════════════════════════════════════════

export const createCatalogPricingFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => PricingFactorCreate.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireWriteRole(ctx);
    const client = (context as any).supabase;
    const payload = {
      tenant_id: ctx.tenantId,
      factor_key: data.factorKey,
      percent: String(data.percent),
    };
    const { data: row, error } = await client
      .from("tenant_pricing_factors")
      .insert(payload)
      .select("id, tenant_id, factor_key, percent, archived_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Pricing factor not created");
    return row;
  });

export const updateCatalogPricingFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => PricingFactorUpdate.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireWriteRole(ctx);
    const client = (context as any).supabase;
    const { id, ...fields } = data;
    const archivedAt = await getArchivedAt(client, "tenant_pricing_factors", id, ctx.tenantId);
    blockIfArchived(archivedAt, "tenant_pricing_factors", id);
    const payload: Record<string, unknown> = { updated_at: catalogNow() };
    if (fields.factorKey !== undefined) payload.factor_key = fields.factorKey;
    if (fields.percent !== undefined) payload.percent = String(fields.percent);
    const { data: row, error } = await client
      .from("tenant_pricing_factors")
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", ctx.tenantId)
      .select("id, tenant_id, factor_key, percent, archived_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const archiveCatalogPricingFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ArchiveInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireAdminRole(ctx);
    const client = (context as any).supabase;
    const archivedAt = await getArchivedAt(client, "tenant_pricing_factors", data.id, ctx.tenantId);
    blockIfArchived(archivedAt, "tenant_pricing_factors", data.id);
    const { data: row, error } = await client
      .from("tenant_pricing_factors")
      .update({ archived_at: catalogNow(), updated_at: catalogNow() })
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Pricing factor not found");
    return { archived: true };
  });

export const hardDeleteCatalogPricingFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ArchiveInput.parse(d))
  .handler(() => blockHardDelete());

// ═══════════════════════════════════════════════════════════════════════════
//  WASTAGE RULES V2 (tenant_wastage_rules)
// ═══════════════════════════════════════════════════════════════════════════

export const createCatalogWastageRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => WastageRuleCreateV2.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireWriteRole(ctx);
    const client = (context as any).supabase;
    const payload = {
      tenant_id: ctx.tenantId,
      scope: data.scope,
      ref: data.ref ?? null,
      pct: String(data.pct),
    };
    const { data: row, error } = await client
      .from("tenant_wastage_rules")
      .insert(payload)
      .select("id, tenant_id, scope, ref, pct, archived_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Wastage rule not created");
    return row;
  });

export const updateCatalogWastageRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => WastageRuleUpdateV2.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireWriteRole(ctx);
    const client = (context as any).supabase;
    const { id, ...fields } = data;
    const archivedAt = await getArchivedAt(client, "tenant_wastage_rules", id, ctx.tenantId);
    blockIfArchived(archivedAt, "tenant_wastage_rules", id);
    const payload: Record<string, unknown> = { updated_at: catalogNow() };
    if (fields.scope !== undefined) payload.scope = fields.scope;
    if (fields.ref !== undefined) payload.ref = fields.ref ?? null;
    if (fields.pct !== undefined) payload.pct = String(fields.pct);
    const { data: row, error } = await client
      .from("tenant_wastage_rules")
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", ctx.tenantId)
      .select("id, tenant_id, scope, ref, pct, archived_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const archiveCatalogWastageRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ArchiveInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireAdminRole(ctx);
    const client = (context as any).supabase;
    const archivedAt = await getArchivedAt(client, "tenant_wastage_rules", data.id, ctx.tenantId);
    blockIfArchived(archivedAt, "tenant_wastage_rules", data.id);
    const { data: row, error } = await client
      .from("tenant_wastage_rules")
      .update({ archived_at: catalogNow(), updated_at: catalogNow() })
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Wastage rule not found");
    return { archived: true };
  });

export const hardDeleteCatalogWastageRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ArchiveInput.parse(d))
  .handler(() => blockHardDelete());

// ═══════════════════════════════════════════════════════════════════════════
//  DISCOUNTS V2 (tenant_discounts)
// ═══════════════════════════════════════════════════════════════════════════

export const createCatalogDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => DiscountCreateV2.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireWriteRole(ctx);
    const client = (context as any).supabase;
    const payload = {
      tenant_id: ctx.tenantId,
      code: data.code,
      type: data.type,
      value: String(data.value),
      max_value: data.maxValue != null ? String(data.maxValue) : null,
      valid_from: data.validFrom,
      valid_to: data.validTo ?? null,
    };
    const { data: row, error } = await client
      .from("tenant_discounts")
      .insert(payload)
      .select("id, tenant_id, code, type, value, max_value, valid_from, valid_to, archived_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Discount not created");
    return row;
  });

export const updateCatalogDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => DiscountUpdateV2.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireWriteRole(ctx);
    const client = (context as any).supabase;
    const { id, ...fields } = data;
    const archivedAt = await getArchivedAt(client, "tenant_discounts", id, ctx.tenantId);
    blockIfArchived(archivedAt, "tenant_discounts", id);
    const payload: Record<string, unknown> = { updated_at: catalogNow() };
    if (fields.code !== undefined) payload.code = fields.code;
    if (fields.type !== undefined) payload.type = fields.type;
    if (fields.value !== undefined) payload.value = String(fields.value);
    if (fields.maxValue !== undefined) payload.max_value = fields.maxValue != null ? String(fields.maxValue) : null;
    if (fields.validFrom !== undefined) payload.valid_from = fields.validFrom;
    if (fields.validTo !== undefined) payload.valid_to = fields.validTo ?? null;
    const { data: row, error } = await client
      .from("tenant_discounts")
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", ctx.tenantId)
      .select("id, tenant_id, code, type, value, max_value, valid_from, valid_to, archived_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const archiveCatalogDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ArchiveInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireAdminRole(ctx);
    const client = (context as any).supabase;
    const archivedAt = await getArchivedAt(client, "tenant_discounts", data.id, ctx.tenantId);
    blockIfArchived(archivedAt, "tenant_discounts", data.id);
    const { data: row, error } = await client
      .from("tenant_discounts")
      .update({ archived_at: catalogNow(), updated_at: catalogNow() })
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Discount not found");
    return { archived: true };
  });

export const hardDeleteCatalogDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ArchiveInput.parse(d))
  .handler(() => blockHardDelete());

// ═══════════════════════════════════════════════════════════════════════════
//  FEES & CREDITS (fees_credits)
// ═══════════════════════════════════════════════════════════════════════════

export const createCatalogFeesCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => FeesCreditCreate.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireWriteRole(ctx);
    const client = (context as any).supabase;
    const payload = {
      tenant_id: ctx.tenantId,
      code: data.code,
      label_i18n_key: data.labelI18nKey,
      sign: data.sign,
      amount: data.amount != null ? String(data.amount) : null,
      formula_key: data.formulaKey ?? null,
    };
    const { data: row, error } = await client
      .from("fees_credits")
      .insert(payload)
      .select("id, tenant_id, code, label_i18n_key, sign, amount, formula_key, archived_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Fee/credit not created");
    return row;
  });

export const updateCatalogFeesCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => FeesCreditUpdate.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireWriteRole(ctx);
    const client = (context as any).supabase;
    const { id, ...fields } = data;
    const archivedAt = await getArchivedAt(client, "fees_credits", id, ctx.tenantId);
    blockIfArchived(archivedAt, "fees_credits", id);
    const payload: Record<string, unknown> = { updated_at: catalogNow() };
    if (fields.code !== undefined) payload.code = fields.code;
    if (fields.labelI18nKey !== undefined) payload.label_i18n_key = fields.labelI18nKey;
    if (fields.sign !== undefined) payload.sign = fields.sign;
    if (fields.amount !== undefined) payload.amount = fields.amount != null ? String(fields.amount) : null;
    if (fields.formulaKey !== undefined) payload.formula_key = fields.formulaKey ?? null;
    const { data: row, error } = await client
      .from("fees_credits")
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", ctx.tenantId)
      .select("id, tenant_id, code, label_i18n_key, sign, amount, formula_key, archived_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const archiveCatalogFeesCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ArchiveInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireAdminRole(ctx);
    const client = (context as any).supabase;
    const archivedAt = await getArchivedAt(client, "fees_credits", data.id, ctx.tenantId);
    blockIfArchived(archivedAt, "fees_credits", data.id);
    const { data: row, error } = await client
      .from("fees_credits")
      .update({ archived_at: catalogNow(), updated_at: catalogNow() })
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Fee/credit not found");
    return { archived: true };
  });

export const hardDeleteCatalogFeesCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ArchiveInput.parse(d))
  .handler(() => blockHardDelete());
