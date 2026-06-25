import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { setTenantGuc } from "@/lib/tenant";
import type { TenantContext } from "@/lib/tenant-context";
import { resolveBom, type ComponentDescriptor } from "@/lib/pricing/bom";

/**
 * Unit type templates — tenant-scoped, read-only.
 *
 * listUnitTypes returns reusable unit_type rows with their BOM (bill of
 * materials) children. Archived types are excluded by default.
 *
 * Input: { categoryCode? } — optional filter by category.
 *
 * Row shape:
 *   { ...unitType, unitTypeBom: [...bomRow] }
 */

const ListUnitTypesInput = z.object({
  categoryCode: z.string().optional(),
});

export type UnitTypeRow = {
  id: string;
  tenantId: string;
  code: string;
  labelI18nKey: string;
  categoryCode: string | null;
  nominalWidthMm: number | null;
  nominalHeightMm: number | null;
  nominalDepthMm: number | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  unitTypeBom: Array<{
    id: string;
    tenantId: string;
    unitTypeId: string;
    kind: string;
    catalogRef: string | null;
    areaFunctionKey: string | null;
    defaultQty: string;
    position: number;
    createdAt: string;
  }>;
};

export const listUnitTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ListUnitTypesInput.parse(d))
  .handler(async ({ data, context }): Promise<UnitTypeRow[]> => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);

    let query = supabaseAdmin
      .from("unit_types" as any)
      .select(`
        *,
        unitTypeBom:unit_type_bom(*)
      `)
      .eq("tenant_id", ctx.tenantId)
      .is("archived_at", null)
      .order("code", { ascending: true });

    if (data.categoryCode) {
      query = query.eq("category_code", data.categoryCode);
    }

    const { data: rows, error } = await query;

    if (error) {
      throw new Error(`Failed to list unit types: ${error.message}`);
    }

    if (!rows || rows.length === 0) {
      return [];
    }

    // Sort BOM children by position and normalise Supabase relation shape
    return rows.map((row: any) => {
      const bom = Array.isArray(row.unitTypeBom)
        ? row.unitTypeBom
        : row.unitTypeBom
          ? [row.unitTypeBom]
          : [];

      const sortedBom = bom
        .slice()
        .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));

      return { ...row, unitTypeBom: sortedBom };
    });
  });

/**
 * resolveBom — expand a unit_type's BOM into concrete component descriptors.
 *
 * Returns components sorted by position. Throws if the unit type has no BOM
 * rows (rejects empty/zero-cost builds upstream).
 *
 * Input: { unitTypeId }
 */
const ResolveBomInput = z.object({
  unitTypeId: z.string().uuid(),
});

export const resolveBomFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ResolveBomInput.parse(d))
  .handler(async ({ data, context }): Promise<ComponentDescriptor[]> => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    return resolveBom(data.unitTypeId, ctx.tenantId);
  });
