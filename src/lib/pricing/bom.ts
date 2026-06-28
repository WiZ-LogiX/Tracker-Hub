/**
 * BOM resolution — expands unit_type_bom rows into concrete component
 * descriptors ready for engine-v3 pricing.
 *
 * Pure validation + DB read. No pricing logic here.
 *
 * SECURITY: Accepts a Supabase client parameter (never uses supabaseAdmin).
 * Caller is responsible for providing an RLS-enforcing client.
 */

import { listAreaKeys } from "./areaFunctions";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ComponentDescriptor {
  /** Stable id (BOM row uuid). */
  id: string;
  kind: "material" | "hardware" | "accessory" | "manufacturing" | "edge_band";
  /** catalog_ref uuid — null when area_function_key is set. */
  catalogId: string | null;
  /** default_qty from BOM, parsed to number. */
  qty: number;
  /** Derived: "m2" for area-based materials, "pcs" otherwise. */
  unitOfMeasure: string;
  /** Area function key — null when catalog_ref is set. */
  areaFunctionKey: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const validAreaKeys = new Set(listAreaKeys());

function validateAreaKey(key: string): void {
  if (!validAreaKeys.has(key)) {
    throw new Error(
      `Unknown area function key: "${key}". Available: ${[...validAreaKeys].join(", ")}.`,
    );
  }
}

function unitOfMeasure(
  kind: string,
  areaFunctionKey: string | null,
): string {
  if (kind === "edge_band") return "m";
  if (kind === "material" && areaFunctionKey) return "m2";
  return "pcs";
}

// ── resolveBom ─────────────────────────────────────────────────────────────

/**
 * Read unit_type_bom rows for a given unit type and expand each into a
 * ComponentDescriptor. Sorted by position ascending.
 *
 * KNOWN LIMITATION: Wastage rules are keyed by areaFunctionKey (e.g.
 * "cabinet_side"), not by the catalog material itself. This means two
 * different materials sharing the same area function key share wastage
 * rules. This is acceptable for Egyptian-market furniture where wastage
 * is primarily driven by panel geometry, not material type. If a future
 * market requires per-material wastage, extend wastage_rules to support
 * an optional material FK override.
 *
 * @param client  Supabase client (RLS-enforcing, from context.supabase)
 * @throws if unit_type has no BOM rows
 * @throws if an area_function_key is not in the area function registry
 * @warns if a catalog_ref points to an archived catalog row
 */
export async function resolveBom(
  unitTypeId: string,
  tenantId: string,
  client: any,
): Promise<ComponentDescriptor[]> {
  const { data: rows, error } = await client
    .from("unit_type_bom" as any)
    .select("id, kind, catalog_ref, area_function_key, default_qty, position")
    .eq("unit_type_id", unitTypeId)
    .eq("tenant_id", tenantId)
    .order("position", { ascending: true });

  if (error) {
    throw new Error(`Failed to read BOM for unit type ${unitTypeId}: ${error.message}`);
  }

  if (!rows || rows.length === 0) {
    throw new Error(
      `Unit type ${unitTypeId} has no BOM rows. ` +
        "Cannot create a unit from a type with an empty bill of materials.",
    );
  }

  // Validate area function keys and check for archived catalog refs
  const archivedCatalogRefs: string[] = [];

  for (const row of rows as any[]) {
    if (row.area_function_key) {
      validateAreaKey(row.area_function_key);
    }

    if (row.catalog_ref) {
      // Check if the catalog item is archived
      const { data: catalogRow } = await client
        .from("catalog_materials" as any)
        .select("id, archived_at")
        .eq("id", row.catalog_ref)
        .maybeSingle();

      if (catalogRow && (catalogRow as any).archived_at) {
        archivedCatalogRefs.push(row.catalog_ref);
      }
    }
  }

  if (archivedCatalogRefs.length > 0) {
    console.warn(
      `[bom] BOM for unit type ${unitTypeId} references archived catalog items: ${archivedCatalogRefs.join(", ")}. Pricing layer should handle gracefully.`,
    );
  }

  // Build descriptors
  return (rows as any[]).map((row) => ({
    id: row.id as string,
    kind: row.kind as ComponentDescriptor["kind"],
    catalogId: (row.catalog_ref as string) ?? null,
    qty: parseFloat(row.default_qty as string) || 1,
    unitOfMeasure: unitOfMeasure(row.kind, row.area_function_key),
    areaFunctionKey: (row.area_function_key as string) ?? null,
  }));
}
