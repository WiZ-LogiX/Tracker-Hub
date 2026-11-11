/**
 * Rate-card import server functions — tenant-scoped, dry-run/confirm pattern.
 *
 * importRateCard: parses an xlsx buffer, computes a diff (creates/updates/conflicts),
 * and either returns the diff (dryRun=true) or commits the writes (dryRun=false).
 *
 * SECURITY: Requires owner/admin role for confirm writes.
 * All writes and queries are strictly tenant-scoped via requireTenant middleware.
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
import { recordPriceChange } from "./priceHistory";

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

/** Map finish code + unit type to a material variant code for board-yield. */
export function variantName(finishCode: FinishCode, unitType: UnitTypeSlug): string {
  return `${finishCode}_${unitType}`;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function decodeBase64(b64: string): Buffer {
  return Buffer.from(b64, "base64");
}

async function queryExistingFinishes(
  client: any,
  tenantId: string,
): Promise<Map<string, { id: string; code: string; price_per_unit: number }>> {
  const { data } = await client
    .from("catalog_finishes")
    .select("id, code, price_per_unit")
    .eq("tenant_id", tenantId)
    .is("archived_at", null);

  const map = new Map<string, { id: string; code: string; price_per_unit: number }>();
  for (const row of data ?? []) {
    map.set(row.code, { ...row, price_per_unit: Number(row.price_per_unit) });
  }
  return map;
}

async function queryExistingMaterials(
  client: any,
  tenantId: string,
): Promise<Map<string, { id: string; code: string; price_per_unit: number }>> {
  const { data } = await client
    .from("catalog_materials")
    .select("id, code, price_per_unit")
    .eq("tenant_id", tenantId)
    .is("archived_at", null);

  const map = new Map<string, { id: string; code: string; price_per_unit: number }>();
  for (const row of data ?? []) {
    map.set(row.code, { ...row, price_per_unit: Number(row.price_per_unit) });
  }
  return map;
}

async function queryExistingHardware(
  client: any,
  tenantId: string,
): Promise<Map<string, { id: string; code: string; price_per_piece: number }>> {
  const { data } = await client
    .from("catalog_hardware")
    .select("id, code, price_per_piece")
    .eq("tenant_id", tenantId)
    .is("archived_at", null);

  const map = new Map<string, { id: string; code: string; price_per_piece: number }>();
  for (const row of data ?? []) {
    map.set(row.code, { ...row, price_per_piece: Number(row.price_per_piece) });
  }
  return map;
}

async function queryExistingAccessories(
  client: any,
  tenantId: string,
): Promise<Map<string, { id: string; code: string; price_per_piece: number }>> {
  const { data } = await client
    .from("catalog_accessories")
    .select("id, code, price_per_piece")
    .eq("tenant_id", tenantId)
    .is("archived_at", null);

  const map = new Map<string, { id: string; code: string; price_per_piece: number }>();
  for (const row of data ?? []) {
    map.set(row.code, { ...row, price_per_piece: Number(row.price_per_piece) });
  }
  return map;
}

async function queryExistingPricingFactors(
  client: any,
  tenantId: string,
): Promise<Map<string, { id: string; factor_key: string; percent: number }>> {
  const { data } = await client
    .from("tenant_pricing_factors")
    .select("id, factor_key, percent")
    .eq("tenant_id", tenantId)
    .is("archived_at", null);

  const map = new Map<string, { id: string; factor_key: string; percent: number }>();
  for (const row of data ?? []) {
    map.set(row.factor_key, { ...row, percent: Number(row.percent) });
  }
  return map;
}

// ── Diff computation ────────────────────────────────────────────────────────

export async function computeDiff(
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
    if (addon.category === "fee") {
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

    const existingHw = existingHardware.get(addon.slug);
    const existingAcc = existingAccessories.get(addon.slug);
    const existing = existingHw ?? existingAcc;

    if (existing) {
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
    const factorKey = coeff.finishCode.toLowerCase();
    const existingFactor = existingFactors.get(factorKey);

    if (existingFactor) {
      if (existingFactor.percent === coeff.coefficient * 100) {
        coeffDiff.push({
          action: "skip",
          finishCode: coeff.finishCode,
          currentCoefficient: existingFactor.percent / 100,
          newCoefficient: coeff.coefficient,
          label: coeff.label,
        });
      } else {
        coeffDiff.push({
          action: "update",
          finishCode: coeff.finishCode,
          currentCoefficient: existingFactor.percent / 100,
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

export async function commitWrites(
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
      .select("id, price_per_unit")
      .eq("tenant_id", tenantId)
      .eq("code", variantKey)
      .is("archived_at", null)
      .maybeSingle();

    if (existing) {
      if (Number(existing.price_per_unit) !== rec.price) {
        await client
          .from("catalog_materials")
          .update({ price_per_unit: rec.price, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
          .eq("tenant_id", tenantId);
        await recordPriceChange(client, tenantId, "material", existing.id, rec.price);
      }
    } else {
      const { data: inserted } = await client
        .from("catalog_materials")
        .insert({
          tenant_id: tenantId,
          code: variantKey,
          label_i18n_key: `catalog.material.${variantKey.toLowerCase()}`,
          pricing_unit: "m2",
          price_per_unit: rec.price,
          default_wastage_pct: 10,
        })
        .select("id")
        .maybeSingle();

      if (inserted) {
        await recordPriceChange(client, tenantId, "material", inserted.id, rec.price);
      }
    }
    pricesWritten++;
  }

  // Upsert hardware/accessories
  for (const addon of addons) {
    if (addon.category === "fee") continue;

    const table = addon.category === "hardware" ? "catalog_hardware" : "catalog_accessories";
    const entityType = addon.category === "hardware" ? ("hardware" as const) : ("accessory" as const);

    const { data: existing } = await client
      .from(table)
      .select("id, price_per_piece")
      .eq("tenant_id", tenantId)
      .eq("code", addon.slug)
      .is("archived_at", null)
      .maybeSingle();

    if (existing) {
      if (Number(existing.price_per_piece) !== addon.price) {
        await client
          .from(table)
          .update({ price_per_piece: addon.price, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
          .eq("tenant_id", tenantId);
        await recordPriceChange(client, tenantId, entityType, existing.id, addon.price);
      }
    } else {
      const { data: inserted } = await client
        .from(table)
        .insert({
          tenant_id: tenantId,
          code: addon.slug,
          label_i18n_key: `catalog.${entityType}.${addon.slug.toLowerCase()}`,
          price_per_piece: addon.price,
        })
        .select("id")
        .maybeSingle();

      if (inserted) {
        await recordPriceChange(client, tenantId, entityType, inserted.id, addon.price);
      }
    }
    addonsWritten++;
  }

  // Upsert pricing factors (coefficients)
  const validFactorKeys = new Set([
    "labor",
    "overhead",
    "margin",
    "luxury",
    "complexity",
    "rush",
    "wastage",
  ]);

  for (const coeff of coefficients) {
    const factorKey = coeff.finishCode.toLowerCase();
    if (validFactorKeys.has(factorKey)) {
      const { data: existing } = await client
        .from("tenant_pricing_factors")
        .select("id, percent")
        .eq("tenant_id", tenantId)
        .eq("factor_key", factorKey)
        .is("archived_at", null)
        .maybeSingle();

      if (existing) {
        if (Number(existing.percent) !== coeff.coefficient * 100) {
          await client
            .from("tenant_pricing_factors")
            .update({
              percent: coeff.coefficient * 100,
              value_type: "percent",
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id)
            .eq("tenant_id", tenantId);
        }
      } else {
        await client.from("tenant_pricing_factors").insert({
          tenant_id: tenantId,
          factor_key: factorKey,
          percent: coeff.coefficient * 100,
          value_type: "percent",
          fixed_amount: 0,
        });
      }
      coefficientsWritten++;
    }
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

    const client = (context as any).supabase;
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
