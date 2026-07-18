/**
 * New catalog server functions — tenant-scoped read-only list fns
 * for the T2 catalog tables (materials, hardware, accessories, etc.).
 *
 * These are separate from the legacy catalog.functions.ts which queries
 * the old Supabase tables with different column shapes.
 *
 * SECURITY: Uses `context.supabase` (RLS-enforcing client) instead of
 * `supabaseAdmin`. This provides defense-in-depth: even if a bug skips
 * the .eq("tenant_id") filter, RLS prevents cross-tenant reads.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { setTenantGuc } from "@/lib/tenant";
import type { TenantContext } from "@/lib/tenant-context";

// ── Shared helpers ──────────────────────────────────────────────────────────

async function tenantQuery(
  client: any,
  tenantId: string,
  table: string,
  select: string,
  opts?: { order?: string; ascending?: boolean },
) {
  let query = client
    .from(table as any)
    .select(select)
    .eq("tenant_id", tenantId)
    .is("archived_at", null);

  if (opts?.order) {
    query = query.order(opts.order, { ascending: opts.ascending ?? true });
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list ${table}: ${error.message}`);
  return data ?? [];
}

// ── listMaterials ───────────────────────────────────────────────────────────

export const listMaterials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    const client = (context as any).supabase;
    await setTenantGuc(ctx.tenantId);
    return tenantQuery(client, ctx.tenantId, "catalog_materials",
      "id, code, label_i18n_key, pricing_unit, price_per_unit, default_wastage_pct, supplier_id, archived_at, created_at, updated_at",
      { order: "code" },
    );
  });

// ── listMaterialVariants ────────────────────────────────────────────────────

export const listMaterialVariants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => z.object({ materialId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const client = (context as any).supabase;
    await setTenantGuc(ctx.tenantId);
    return client
      .from("catalog_material_variants" as any)
      .select("id, material_id, thickness_mm, finish_code, price_modifier, archived_at, created_at, updated_at")
      .eq("tenant_id", ctx.tenantId)
      .eq("material_id", data.materialId)
      .is("archived_at", null)
      .order("thickness_mm", { ascending: true })
      .then(({ data, error }: any) => {
        if (error) throw new Error(error.message);
        return data ?? [];
      });
  });

// ── listFinishes ────────────────────────────────────────────────────────────

export const listFinishes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    const client = (context as any).supabase;
    await setTenantGuc(ctx.tenantId);
    return tenantQuery(client, ctx.tenantId, "catalog_finishes",
      "id, code, price_per_unit, archived_at, created_at, updated_at",
      { order: "code" },
    );
  });

// ── listVeneers ─────────────────────────────────────────────────────────────

export const listVeneers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    const client = (context as any).supabase;
    await setTenantGuc(ctx.tenantId);
    return tenantQuery(client, ctx.tenantId, "catalog_veneers",
      "id, code, price_per_m2, archived_at, created_at, updated_at",
      { order: "code" },
    );
  });

// ── listHardware ────────────────────────────────────────────────────────────

export const listHardware = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    const client = (context as any).supabase;
    await setTenantGuc(ctx.tenantId);
    return tenantQuery(client, ctx.tenantId, "catalog_hardware",
      "id, code, price_per_piece, archived_at, created_at, updated_at",
      { order: "code" },
    );
  });

// ── listAccessories ─────────────────────────────────────────────────────────

export const listAccessories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    const client = (context as any).supabase;
    await setTenantGuc(ctx.tenantId);
    return tenantQuery(client, ctx.tenantId, "catalog_accessories",
      "id, code, price_per_piece, archived_at, created_at, updated_at",
      { order: "code" },
    );
  });

// ── listManufacturingOperations ─────────────────────────────────────────────

export const listManufacturingOperations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    const client = (context as any).supabase;
    await setTenantGuc(ctx.tenantId);
    return tenantQuery(client, ctx.tenantId, "catalog_manufacturing_operations",
      "id, code, rate_unit, rate, archived_at, created_at, updated_at",
      { order: "code" },
    );
  });

// ── listSuppliers ───────────────────────────────────────────────────────────

export const listSuppliers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    const client = (context as any).supabase;
    await setTenantGuc(ctx.tenantId);
    return tenantQuery(client, ctx.tenantId, "catalog_suppliers",
      "id, name, archived_at, created_at, updated_at",
      { order: "name" },
    );
  });

// ── listAllCatalogItems ─────────────────────────────────────────────────────
// Lightweight lookup: returns {id, code, kind} for all non-archived catalog items.
// Used by TreeConfigurator to show catalog names next to linked components.

export const listAllCatalogItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    const client = (context as any).supabase;
    await setTenantGuc(ctx.tenantId);

    const [materials, hardware, accessories, manufacturing, veneers, finishes] = await Promise.all([
      tenantQuery(client, ctx.tenantId, "catalog_materials", "id, code", { order: "code" }),
      tenantQuery(client, ctx.tenantId, "catalog_hardware", "id, code", { order: "code" }),
      tenantQuery(client, ctx.tenantId, "catalog_accessories", "id, code", { order: "code" }),
      tenantQuery(client, ctx.tenantId, "catalog_manufacturing_operations", "id, code", { order: "code" }),
      tenantQuery(client, ctx.tenantId, "catalog_veneers", "id, code", { order: "code" }),
      tenantQuery(client, ctx.tenantId, "catalog_finishes", "id, code", { order: "code" }),
    ]);

    return [
      ...materials.map((r: any) => ({ id: r.id, code: r.code, kind: "material" as const })),
      ...hardware.map((r: any) => ({ id: r.id, code: r.code, kind: "hardware" as const })),
      ...accessories.map((r: any) => ({ id: r.id, code: r.code, kind: "accessory" as const })),
      ...manufacturing.map((r: any) => ({ id: r.id, code: r.code, kind: "manufacturing" as const })),
      ...veneers.map((r: any) => ({ id: r.id, code: r.code, kind: "veneer" as const })),
      ...finishes.map((r: any) => ({ id: r.id, code: r.code, kind: "finish" as const })),
    ];
  });
