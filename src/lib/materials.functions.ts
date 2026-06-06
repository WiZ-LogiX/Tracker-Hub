// Materials CRUD via Drizzle (provider-agnostic Postgres layer).
// Auth/tenant resolution still uses Supabase; data queries use Drizzle so
// switching DB providers later is a connection-string change, not a rewrite.
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client.server";
import { materials } from "@/db/schema";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function resolveTenantId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data?.tenant_id ?? null;
}

function serialize(r: typeof materials.$inferSelect) {
  return {
    id: r.id,
    name_ar: r.nameAr,
    name_en: r.nameEn,
    type: r.type,
    unit: r.unit,
    price_per_unit: Number(r.pricePerUnit),
    wastage_pct: r.wastagePct == null ? null : Number(r.wastagePct),
    supplier_id: r.supplierId,
    country_of_origin: r.countryOfOrigin,
    active: r.active,
    created_at: r.createdAt?.toISOString?.() ?? null,
  };
}

export const listMaterials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveTenantId(supabase, userId);
    if (!tenantId) return { items: [] };
    const rows = await db
      .select()
      .from(materials)
      .where(eq(materials.tenantId, tenantId))
      .orderBy(desc(materials.createdAt));
    return { items: rows.map(serialize) };
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
    const { supabase, userId } = context;
    const tenantId = await resolveTenantId(supabase, userId);
    if (!tenantId) throw new Error("No tenant for user");

    const values = {
      tenantId,
      companyId: "00000000-0000-0000-0000-000000000001",
      nameAr: data.name_ar,
      nameEn: data.name_en || data.name_ar,
      type: data.type || "wood",
      unit: data.unit || "m²",
      pricePerUnit: String(data.price_per_unit),
      wastagePct: data.wastage_pct == null ? null : String(data.wastage_pct),
      supplierId: data.supplier_id || null,
      countryOfOrigin: data.country_of_origin || null,
      active: data.active ?? true,
    };

    if (data.id) {
      const [row] = await db
        .update(materials)
        .set({
          nameAr: values.nameAr,
          nameEn: values.nameEn,
          type: values.type,
          unit: values.unit,
          pricePerUnit: values.pricePerUnit,
          wastagePct: values.wastagePct,
          supplierId: values.supplierId,
          countryOfOrigin: values.countryOfOrigin,
          active: values.active,
        })
        .where(and(eq(materials.id, data.id), eq(materials.tenantId, tenantId)))
        .returning();
      if (!row) throw new Error("Material not found");
      return { item: serialize(row) };
    }

    const [row] = await db.insert(materials).values(values).returning();
    return { item: serialize(row) };
  });

export const deleteMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveTenantId(supabase, userId);
    if (!tenantId) throw new Error("No tenant for user");
    await db
      .delete(materials)
      .where(and(eq(materials.id, data.id), eq(materials.tenantId, tenantId)));
    return { ok: true };
  });
