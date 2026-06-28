/**
 * Rate-card import server functions — tenant-scoped, dry-run/confirm pattern.
 *
 * importRateCard: parses an xlsx buffer, computes a diff (creates/updates/conflicts),
 * and either returns the diff (dryRun=true) or commits the writes (dryRun=false).
 *
 * SECURITY: Requires owner/admin role for confirm writes.
 * All writes are tenant-scoped via requireTenant middleware.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { requireRole } from "@/lib/tenant-context";
import type { TenantContext } from "@/lib/tenant-context";
import {
  parseRateCard,
  type NormalizedPriceRecord,
  type AddonRecord,
  type FinishCode,
  type UnitTypeSlug,
} from "@/lib/import/rateCard";

// ── Types ───────────────────────────────────────────────────────────────────

export interface PriceDiffItem {
  action: "create" | "update" | "skip";
  unitType: string;
  finishCode: string;
  widthTier: string;
  widthCm: number | null;
  currentPrice: number | null;
  newPrice: number;
  isFixed: boolean;
}

export interface AddonDiffItem {
  action: "create" | "update" | "skip";
  slug: string;
  label: string;
  currentPrice: number | null;
  newPrice: number;
  category: string;
}

export interface CoefficientDiffItem {
  action: "create" | "update" | "skip";
  finishCode: string;
  currentCoefficient: number | null;
  newCoefficient: number;
  label: string;
}

export interface ImportDiff {
  prices: PriceDiffItem[];
  addons: AddonDiffItem[];
  coefficients: CoefficientDiffItem[];
  conflicts: string[];
  summary: {
    pricesCreated: number;
    pricesUpdated: number;
    pricesSkipped: number;
    addonsCreated: number;
    addonsUpdated: number;
    coefficientsCreated: number;
    coefficientsUpdated: number;
    totalConflicts: number;
  };
}

// ── Unit-type + finish → catalog table mapping ──────────────────────────────

const UNIT_TYPE_FINISH_TO_TABLE: Record<
  string,
  Record<FinishCode, string>
> = {
  base: {
    HPL: "catalog_finishes",
    PVC: "catalog_finishes",
    GLOSS_MAX: "catalog_finishes",
    POLYLAC: "catalog_finishes",
    EGGER_ALVIC: "catalog_finishes",
  },
  upper: {
    HPL: "catalog_finishes",
    PVC: "catalog_finishes",
    GLOSS_MAX: "catalog_finishes",
    POLYLAC: "catalog_finishes",
    EGGER_ALVIC: "catalog_finishes",
  },
  tall: {
    HPL: "catalog_finishes",
    PVC: "catalog_finishes",
    GLOSS_MAX: "catalog_finishes",
    POLYLAC: "catalog_finishes",
    EGGER_ALVIC: "catalog_finishes",
  },
};

/** Map finish code + unit type to a material variant name for board-yield. */
function variantName(finishCode: FinishCode, unitType: UnitTypeSlug): string {
  return `${finishCode}_${unitType}`;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function decodeBase64(b64: string): Buffer {
  return Buffer.from(b64, "base64");
}

async function queryExistingFinishes(
  client: any,
  tenantId: string,
): Promise<Map<string, { id: string; name: string; price_per_unit: number }>> {
  const { data } = await client
    .from("catalog_finishes")
    .select("id, name, price_per_unit")
    .eq("tenant_id", tenantId)
    .is("archived_at", null);

  const map = new Map<string, { id: string; name: string; price_per_unit: number }>();
  for (const row of data ?? []) {
    map.set(row.name, row);
  }
  return map;
}

async function queryExistingMaterials(
  client: any,
  tenantId: string,
): Promise<Map<string, { id: string; name: string; price_per_unit: number }>> {
  const { data } = await client
    .from("catalog_materials")
    .select("id, name, price_per_unit")
    .eq("tenant_id", tenantId)
    .is("archived_at", null);

  const map = new Map<string, { id: string; name: string; price_per_unit: number }>();
  for (const row of data ?? []) {
    map.set(row.name, row);
  }
  return map;
}

async function queryExistingHardware(
  client: any,
  tenantId: string,
): Promise<Map<string, { id: string; name: string; price_per_piece: number }>> {
  const { data } = await client
    .from("catalog_hardware")
    .select("id, name, price_per_piece")
    .eq("tenant_id", tenantId)
    .is("archived_at", null);

  const map = new Map<string, { id: string; name: string; price_per_piece: number }>();
  for (const row of data ?? []) {
    map.set(row.name, row);
  }
  return map;
}

async function queryExistingAccessories(
  client: any,
  tenantId: string,
): Promise<Map<string, { id: string; name: string; price_per_piece: number }>> {
  const { data } = await client
    .from("catalog_accessories")
    .select("id, name, price_per_piece")
    .eq("tenant_id", tenantId)
    .is("archived_at", null);

  const map = new Map<string, { id: string; name: string; price_per_piece: number }>();
  for (const row of data ?? []) {
    map.set(row.name, row);
  }
  return map;
}

async function queryExistingPricingFactors(
  client: any,
  tenantId: string,
): Promise<Map<string, { id: string; key: string; pct: number }>> {
  const { data } = await client
    .from("tenant_pricing_factors")
    .select("id, key, pct")
    .eq("tenant_id", tenantId);

  const map = new Map<string, { id: string; key: string; pct: number }>();
  for (const row of data ?? []) {
    map.set(row.key, row);
  }
  return map;
}

// ── Diff computation ────────────────────────────────────────────────────────

async function computeDiff(
  client: any,
  tenantId: string,
  prices: NormalizedPriceRecord[],
  addons: AddonRecord[],
  coefficients: { finishCode: FinishCode; coefficient: number; label: string }[],
): Promise<ImportDiff> {
  const conflicts: string[] = [];

  // Load existing data
  const existingFinishes = await queryExistingFinishes(client, tenantId);
  const existingMaterials = await queryExistingMaterials(client, tenantId);
  const existingHardware = await queryExistingHardware(client, tenantId);
  const existingAccessories = await queryExistingAccessories(client, tenantId);
  const existingFactors = await queryExistingPricingFactors(client, tenantId);

  // ── Price diff ────────────────────────────────────────────────────────
  const priceDiff: PriceDiffItem[] = [];
  let pricesCreated = 0;
  let pricesUpdated = 0;
  let pricesSkipped = 0;

  for (const rec of prices) {
    // The price goes into catalog_finishes.price_per_unit for that finish
    // We store per-unit-type prices in a separate mapping structure
    const key = `${rec.unitType}:${rec.finishCode}:${rec.widthTier}:${rec.isFixed ? "fixed" : rec.widthCm}`;
    const finishRec = existingFinishes.get(rec.finishCode);

    if (!finishRec) {
      conflicts.push(`Finish not found in catalog: ${rec.finishCode} (record: ${key})`);
      priceDiff.push({
        action: "skip",
        unitType: rec.unitType,
        finishCode: rec.finishCode,
        widthTier: rec.widthTier,
        widthCm: rec.widthCm,
        currentPrice: null,
        newPrice: rec.price,
        isFixed: rec.isFixed,
      });
      pricesSkipped++;
      continue;
    }

    // For the diff, we compare against the finish's base price
    // The actual per-width pricing is stored in material_variants
    const variantKey = variantName(rec.finishCode, rec.unitType);
    const existingVariant = existingMaterials.get(variantKey);

    if (existingVariant) {
      if (existingVariant.price_per_unit === rec.price) {
        priceDiff.push({
          action: "skip",
          unitType: rec.unitType,
          finishCode: rec.finishCode,
          widthTier: rec.widthTier,
          widthCm: rec.widthCm,
          currentPrice: existingVariant.price_per_unit,
          newPrice: rec.price,
          isFixed: rec.isFixed,
        });
        pricesSkipped++;
      } else {
        priceDiff.push({
          action: "update",
          unitType: rec.unitType,
          finishCode: rec.finishCode,
          widthTier: rec.widthTier,
          widthCm: rec.widthCm,
          currentPrice: existingVariant.price_per_unit,
          newPrice: rec.price,
          isFixed: rec.isFixed,
        });
        pricesUpdated++;
      }
    } else {
      priceDiff.push({
        action: "create",
        unitType: rec.unitType,
        finishCode: rec.finishCode,
        widthTier: rec.widthTier,
        widthCm: rec.widthCm,
        currentPrice: null,
        newPrice: rec.price,
        isFixed: rec.isFixed,
      });
      pricesCreated++;
    }
  }

  // ── Addon diff ────────────────────────────────────────────────────────
  const addonDiff: AddonDiffItem[] = [];
  let addonsCreated = 0;
  let addonsUpdated = 0;

  for (const addon of addons) {
    // Try hardware first, then accessories
    const existingHw = existingHardware.get(addon.label);
    const existingAcc = existingAccessories.get(addon.label);

    if (addon.category === "fee") {
      // Fees go to fees_credentials, skip for now
      addonDiff.push({
        action: "skip",
        slug: addon.slug,
        label: addon.label,
        currentPrice: null,
        newPrice: addon.price,
        category: addon.category,
      });
      continue;
    }

    const existing = existingHw ?? existingAcc;
    if (existing) {
      const priceField = addon.category === "hardware" ? "price_per_piece" : "price_per_piece";
      if (existing.price_per_piece === addon.price) {
        addonDiff.push({
          action: "skip",
          slug: addon.slug,
          label: addon.label,
          currentPrice: existing.price_per_piece,
          newPrice: addon.price,
          category: addon.category,
        });
      } else {
        addonDiff.push({
          action: "update",
          slug: addon.slug,
          label: addon.label,
          currentPrice: existing.price_per_piece,
          newPrice: addon.price,
          category: addon.category,
        });
        addonsUpdated++;
      }
    } else {
      addonDiff.push({
        action: "create",
        slug: addon.slug,
        label: addon.label,
        currentPrice: null,
        newPrice: addon.price,
        category: addon.category,
      });
      addonsCreated++;
    }
  }

  // ── Coefficient diff ──────────────────────────────────────────────────
  const coeffDiff: CoefficientDiffItem[] = [];
  let coeffCreated = 0;
  let coeffUpdated = 0;

  for (const coeff of coefficients) {
    const existingFactor = existingFactors.get(coeff.finishCode);

    if (existingFactor) {
      if (existingFactor.pct === coeff.coefficient * 100) {
        coeffDiff.push({
          action: "skip",
          finishCode: coeff.finishCode,
          currentCoefficient: existingFactor.pct / 100,
          newCoefficient: coeff.coefficient,
          label: coeff.label,
        });
      } else {
        coeffDiff.push({
          action: "update",
          finishCode: coeff.finishCode,
          currentCoefficient: existingFactor.pct / 100,
          newCoefficient: coeff.coefficient,
          label: coeff.label,
        });
        coeffUpdated++;
      }
    } else {
      coeffDiff.push({
        action: "create",
        finishCode: coeff.finishCode,
        currentCoefficient: null,
        newCoefficient: coeff.coefficient,
        label: coeff.label,
      });
      coeffCreated++;
    }
  }

  return {
    prices: priceDiff,
    addons: addonDiff,
    coefficients: coeffDiff,
    conflicts,
    summary: {
      pricesCreated,
      pricesUpdated,
      pricesSkipped,
      addonsCreated,
      addonsUpdated,
      coefficientsCreated: coeffCreated,
      coefficientsUpdated: coeffUpdated,
      totalConflicts: conflicts.length,
    },
  };
}

// ── Commit writes ───────────────────────────────────────────────────────────

async function commitWrites(
  client: any,
  tenantId: string,
  prices: NormalizedPriceRecord[],
  addons: AddonRecord[],
  coefficients: { finishCode: FinishCode; coefficient: number; label: string }[],
): Promise<{ pricesWritten: number; addonsWritten: number; coefficientsWritten: number }> {
  let pricesWritten = 0;
  let addonsWritten = 0;
  let coefficientsWritten = 0;

  // Upsert material variants for each price record
  for (const rec of prices) {
    const variantKey = variantName(rec.finishCode, rec.unitType);

    // Check if variant exists
    const { data: existing } = await client
      .from("catalog_materials")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("name", variantKey)
      .maybeSingle();

    if (existing) {
      await client
        .from("catalog_materials")
        .update({ price_per_unit: rec.price })
        .eq("id", existing.id)
        .eq("tenant_id", tenantId);
    } else {
      await client.from("catalog_materials").insert({
        tenant_id: tenantId,
        name: variantKey,
        type: "board",
        unit: "m²",
        price_per_unit: rec.price,
        active: true,
      });
    }
    pricesWritten++;
  }

  // Upsert hardware/accessories
  for (const addon of addons) {
    if (addon.category === "fee") continue;

    const table =
      addon.category === "hardware" ? "catalog_hardware" : "catalog_accessories";
    const priceCol =
      addon.category === "hardware" ? "price_per_piece" : "price_per_piece";

    const { data: existing } = await client
      .from(table)
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("name", addon.label)
      .maybeSingle();

    if (existing) {
      await client
        .from(table)
        .update({ [priceCol]: addon.price })
        .eq("id", existing.id)
        .eq("tenant_id", tenantId);
    } else {
      const insert: Record<string, any> = {
        tenant_id: tenantId,
        name: addon.label,
        active: true,
      };
      insert[priceCol] = addon.price;
      await client.from(table).insert(insert);
    }
    addonsWritten++;
  }

  // Upsert pricing factors (coefficients)
  for (const coeff of coefficients) {
    const { data: existing } = await client
      .from("tenant_pricing_factors")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("key", coeff.finishCode)
      .maybeSingle();

    if (existing) {
      await client
        .from("tenant_pricing_factors")
        .update({ pct: coeff.coefficient * 100 })
        .eq("id", existing.id)
        .eq("tenant_id", tenantId);
    } else {
      await client.from("tenant_pricing_factors").insert({
        tenant_id: tenantId,
        key: coeff.finishCode,
        pct: coeff.coefficient * 100,
        label: coeff.label,
      });
    }
    coefficientsWritten++;
  }

  return { pricesWritten, addonsWritten, coefficientsWritten };
}

// ── Server functions ────────────────────────────────────────────────────────

/**
 * Dry-run: parse xlsx buffer and return diff without writing.
 * Confirm: parse xlsx buffer and commit all changes.
 *
 * @param fileBufferBase64  Base64-encoded xlsx file contents
 * @param dryRun            If true, only compute diff (default: true)
 */
export const importRateCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator(
    z.object({
      fileBufferBase64: z.string().min(1),
      dryRun: z.boolean().default(true),
    }),
  )
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;

    // Only owner/admin can commit writes
    if (!data.dryRun) {
      requireRole(ctx, ["owner", "admin"]);
    }

    const client = context.supabase;
    const buf = decodeBase64(data.fileBufferBase64);

    // Parse the workbook
    const parsed = parseRateCard(buf);

    if (parsed.conflicts.length > 0 && !data.dryRun) {
      // Block confirm if there are unresolved conflicts
      throw new Error(
        `Cannot import: ${parsed.conflicts.length} unresolved conflicts. Fix the spreadsheet and try again.`,
      );
    }

    // Compute diff
    const diff = await computeDiff(
      client,
      ctx.tenantId,
      parsed.prices,
      parsed.addons,
      parsed.coefficients,
    );

    if (data.dryRun) {
      return { diff, committed: false };
    }

    // Commit writes
    const result = await commitWrites(
      client,
      ctx.tenantId,
      parsed.prices,
      parsed.addons,
      parsed.coefficients,
    );

    return {
      diff,
      committed: true,
      result,
    };
  });
