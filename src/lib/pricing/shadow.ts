/**
 * Pricing shadow comparison — legacy vs v3 engine.
 *
 * Computes both legacy total (from stored quote) and v3 total (re-run engine),
 * writes a comparison row to pricing_shadow_runs.
 *
 * Invoked on quote save ONLY when tenant feature flag `pricing_shadow` is on.
 * Never blocks the user; errors are logged only.
 *
 * SECURITY: Accepts a Supabase client parameter for all reads/writes.
 * The caller (quote.functions.ts) passes the RLS-enforcing context.supabase.
 */

import {
  priceQuote,
  type QuoteInput,
  type CatalogLookup,
  type FeesCredit,
} from "./engine-v3";
import { log } from "@/lib/log";

const DEFAULT_TOLERANCE = 0.5; // EGP

export interface ShadowRunOptions {
  /** Override default tolerance (0.5 EGP). */
  tolerance?: number;
}

export interface ShadowRunResult {
  /** Whether the comparison was within tolerance. */
  withinTolerance: boolean;
  /** Legacy total (null if hierarchy missing or engine error). */
  legacyTotal: number | null;
  /** V3 computed total. */
  v3Total: number;
  /** Absolute difference (null if legacyTotal is null). */
  diff: number | null;
  /** Error message (if any). */
  error?: string;
}

// ── Pure comparison function (testable without DB) ───────────────────────────

/**
 * Compare a legacy total against a v3 re-computation.
 * Pure function — no DB, no side effects.
 */
export function comparePricing(
  legacyTotal: number,
  v3Total: number,
  tolerance: number,
): { diff: number; withinTolerance: boolean } {
  const diff = Math.abs(legacyTotal - v3Total);
  return { diff, withinTolerance: diff <= tolerance };
}

// ── Shadow run entry point ───────────────────────────────────────────────────

/**
 * Run shadow pricing comparison for a quotation.
 *
 * 1. Load the quote's stored legacy total (quotes.total).
 * 2. Load the hierarchy tree (quotation_products → sections → units → components).
 * 3. Load catalog data + pricing factors.
 * 4. Re-run v3 engine → computedPrice.
 * 5. Compute diff = |legacy - v3|.
 * 6. Write row to pricing_shadow_runs.
 *
 * Returns ShadowRunResult for testing/logging; never throws.
 */
export async function runShadow(
  quotationId: string,
  tenantId: string,
  options?: ShadowRunOptions,
  client?: any,
): Promise<ShadowRunResult> {
  const tolerance = options?.tolerance ?? DEFAULT_TOLERANCE;

  // 1. Load quote → legacy total
  const { data: quote, error: quoteErr } = await client
    .from("quotes")
    .select("total")
    .eq("id", quotationId)
    .eq("tenant_id", tenantId)
    .single();

  if (quoteErr || !quote) {
    const err = `Failed to load quote: ${quoteErr?.message ?? "not found"}`;
    log.error("pricing_shadow: " + err, { tenantId, quotationId });
    return {
      withinTolerance: false,
      legacyTotal: null,
      v3Total: 0,
      diff: null,
      error: err,
    };
  }

  const legacyTotal = Number(quote.total);

  // 2. Load hierarchy + catalog, build tree, run v3 engine
  const { tree, catalog, error: loadErr } = await loadHierarchyAndCatalog(quotationId, tenantId, client);

  if (loadErr) {
    log.warn("pricing_shadow: " + loadErr, { tenantId, quotationId });
    await writeShadowRow(tenantId, quotationId, null, 0, loadErr, client);
    return {
      withinTolerance: false,
      legacyTotal: null,
      v3Total: 0,
      diff: null,
      error: loadErr,
    };
  }

  // 3. Run v3 engine
  let v3Total: number;
  try {
    const result = priceQuote(tree, catalog);
    v3Total = Number(result.computedPrice);
  } catch (e) {
    const err = `v3 engine error: ${e instanceof Error ? e.message : String(e)}`;
    log.error("pricing_shadow: " + err, { tenantId, quotationId });
    await writeShadowRow(tenantId, quotationId, legacyTotal, 0, err, client);
    return {
      withinTolerance: false,
      legacyTotal,
      v3Total: 0,
      diff: null,
      error: err,
    };
  }

  // 4. Compare
  const { diff, withinTolerance } = comparePricing(legacyTotal, v3Total, tolerance);

  // 5. Write shadow row
  await writeShadowRow(tenantId, quotationId, legacyTotal, v3Total, null, client, diff, withinTolerance);

  log.info("pricing_shadow: comparison complete", {
    tenantId,
    quotationId,
    legacyTotal,
    v3Total,
    diff,
    withinTolerance,
  });

  return { withinTolerance, legacyTotal, v3Total, diff };
}

// ── Hierarchy + catalog loader ───────────────────────────────────────────────

interface LoadResult {
  tree: QuoteInput;
  catalog: CatalogLookup;
  error?: string;
}

async function loadHierarchyAndCatalog(quotationId: string, tenantId: string, client: any): Promise<LoadResult> {
  // Load hierarchy
  const { data: products, error: prodErr } = await client
    .from("quotation_products")
    .select("id, product_type_code, label, position")
    .eq("quotation_id", quotationId)
    .eq("tenant_id", tenantId)
    .order("position");

  if (prodErr || !products || products.length === 0) {
    return {
      tree: { products: [] },
      catalog: emptyCatalog(),
      error: `No hierarchy data: ${prodErr?.message ?? "empty tree"}`,
    };
  }

  const productIds = products.map((p: any) => p.id);

  const { data: sections } = await client
    .from("sections")
    .select("id, quotation_product_id, position")
    .in("quotation_product_id", productIds)
    .eq("tenant_id", tenantId)
    .order("position");

  const sectionIds = (sections ?? []).map((s: any) => s.id);

  const { data: units } = sectionIds.length > 0
    ? await client
        .from("units")
        .select("id, section_id, length_mm, width_mm, height_mm, depth_mm, qty, override_factor_keys")
        .in("section_id", sectionIds)
        .eq("tenant_id", tenantId)
    : { data: [] };

  const unitIds = (units ?? []).map((u: any) => u.id);

  const { data: components } = unitIds.length > 0
    ? await client
        .from("components")
        .select("id, unit_id, kind, catalog_id, qty, unit_of_measure")
        .in("unit_id", unitIds)
        .eq("tenant_id", tenantId)
    : { data: [] };

  // Build tree
  const sectionsArr = sections ?? [];
  const unitsArr = units ?? [];
  const compsArr = components ?? [];

  const compByUnit = new Map<string, typeof compsArr>();
  for (const c of compsArr) {
    const list = compByUnit.get(c.unit_id) ?? [];
    list.push(c);
    compByUnit.set(c.unit_id, list);
  }

  const tree: QuoteInput = {
    products: products.map((p: any) => ({
      id: p.id,
      sections: sectionsArr
        .filter((s: any) => s.quotation_product_id === p.id)
        .sort((a: any, b: any) => a.position - b.position)
        .map((s: any) => ({
          id: s.id,
          units: unitsArr
            .filter((u: any) => u.section_id === s.id)
            .sort((a: any, b: any) => a.id.localeCompare(b.id))
            .map((u: any) => ({
              id: u.id,
              unitTypeId: null,
              lengthMm: u.length_mm ?? 0,
              widthMm: u.width_mm,
              heightMm: u.height_mm,
              depthMm: u.depth_mm,
              qty: u.qty,
              overrideFactorKeys: (u.override_factor_keys as Record<string, number>) ?? {},
              components: (compByUnit.get(u.id) ?? []).map((c: any) => ({
                id: c.id,
                kind: c.kind as "material" | "hardware" | "accessory" | "manufacturing" | "edge_band" | "veneer" | "finish",
                catalogId: c.catalog_id,
                qty: Number(c.qty),
                unitOfMeasure: c.unit_of_measure,
              })),
            })),
        })),
    })),
  };

  // Load catalog
  const catalog = await loadCatalog(tenantId, client);

  return { tree, catalog };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function writeShadowRow(
  tenantId: string,
  quotationId: string,
  legacyTotal: number | null,
  v3Total: number,
  legacyError: string | null,
  client: any,
  diff?: number,
  withinTolerance?: boolean,
): Promise<void> {
  const { error } = await client.from("pricing_shadow_runs").insert({
    tenant_id: tenantId,
    quotation_id: quotationId,
    legacy_total: legacyTotal,
    v3_total: v3Total,
    diff: diff ?? null,
    within_tolerance: withinTolerance ?? false,
    legacy_error: legacyError,
  });

  if (error) {
    log.error("pricing_shadow: failed to write shadow row", {
      tenantId,
      quotationId,
      error: error.message,
    });
  }
}

function emptyCatalog(): CatalogLookup {
  return {
    materials: {},
    hardware: {},
    accessories: {},
    manufacturingOps: {},
    veneers: {},
    finishes: {},
    pricingFactors: [],
    wastageRules: [],
    feesCredits: [],
  };
}

async function loadCatalog(tenantId: string, client: any): Promise<CatalogLookup> {
  const [materialsRes, hardwareRes, accessoriesRes, mfgOpsRes, veneersRes, finishesRes, factorsRes, wastageRes, feesRes] =
    await Promise.all([
      client
        .from("catalog_materials")
        .select("id, pricing_unit, price_per_unit, default_wastage_pct")
        .eq("tenant_id", tenantId)
        .is("archived_at", null),
      client
        .from("catalog_hardware")
        .select("id, price_per_piece")
        .eq("tenant_id", tenantId)
        .is("archived_at", null),
      client
        .from("catalog_accessories")
        .select("id, price_per_piece")
        .eq("tenant_id", tenantId)
        .is("archived_at", null),
      client
        .from("catalog_manufacturing_operations")
        .select("id, rate_unit, rate")
        .eq("tenant_id", tenantId)
        .is("archived_at", null),
      client
        .from("catalog_veneers")
        .select("id, price_per_m2")
        .eq("tenant_id", tenantId)
        .is("archived_at", null),
      client
        .from("catalog_finishes")
        .select("id, price_per_unit")
        .eq("tenant_id", tenantId)
        .is("archived_at", null),
      client
        .from("tenant_pricing_factors")
        .select("factor_key, percent")
        .eq("tenant_id", tenantId)
        .is("archived_at", null),
      client
        .from("tenant_wastage_rules")
        .select("scope, ref, pct")
        .eq("tenant_id", tenantId)
        .is("archived_at", null),
      client
        .from("fees_credits")
        .select("code, sign, amount, formula_key")
        .eq("tenant_id", tenantId)
        .is("archived_at", null),
    ]);

  for (const [label, res] of [
    ["materials", materialsRes],
    ["hardware", hardwareRes],
    ["accessories", accessoriesRes],
    ["manufacturingOps", mfgOpsRes],
    ["veneers", veneersRes],
    ["finishes", finishesRes],
    ["pricingFactors", factorsRes],
    ["wastageRules", wastageRes],
    ["feesCredits", feesRes],
  ] as const) {
    if (res.error) {
      throw new Error(`Failed to load ${label}: ${res.error.message}`);
    }
  }

  return {
    materials: Object.fromEntries(
      (materialsRes.data ?? []).map((m: any) => [
        m.id,
        {
          id: m.id,
          pricingUnit: m.pricing_unit,
          pricePerUnit: m.price_per_unit,
          defaultWastagePct: m.default_wastage_pct,
        },
      ]),
    ),
    hardware: Object.fromEntries(
      (hardwareRes.data ?? []).map((h: any) => [h.id, { id: h.id, pricePerPiece: h.price_per_piece }]),
    ),
    accessories: Object.fromEntries(
      (accessoriesRes.data ?? []).map((a: any) => [
        a.id,
        { id: a.id, pricePerPiece: a.price_per_piece },
      ]),
    ),
    manufacturingOps: Object.fromEntries(
      (mfgOpsRes.data ?? []).map((o: any) => [
        o.id,
        { id: o.id, rateUnit: o.rate_unit, rate: o.rate },
      ]),
    ),
    veneers: Object.fromEntries(
      (veneersRes.data ?? []).map((v: any) => [
        v.id,
        {
          id: v.id,
          pricingUnit: "m2",
          pricePerUnit: v.price_per_m2,
          defaultWastagePct: 0,
        },
      ]),
    ),
    finishes: Object.fromEntries(
      (finishesRes.data ?? []).map((f: any) => [
        f.id,
        {
          id: f.id,
          pricingUnit: "m2",
          pricePerUnit: f.price_per_unit,
          defaultWastagePct: 0,
        },
      ]),
    ),
    pricingFactors: (factorsRes.data ?? []).map((f: any) => ({
      factorKey: f.factor_key,
      percent: f.percent,
    })),
    wastageRules: (wastageRes.data ?? []).map((w: any) => ({
      scope: w.scope,
      ref: w.ref,
      pct: w.pct,
    })),
    feesCredits: (feesRes.data ?? []).map((fc: any) => ({
      code: fc.code,
      sign: fc.sign as "plus" | "minus",
      amount: fc.amount,
      formulaKey: fc.formula_key,
    })),
  };
}
