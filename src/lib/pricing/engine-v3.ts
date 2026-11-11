// Pricing engine v3 — bottom-up hierarchy pricing.
// Walks quotation_products → sections → units → components, resolving costs
// via the componentAmount leaf-pricing function, then aggregates upward.
//
// Pure — no DB, no side effects. All data passed in via CatalogLookup.
//
// Deterministic: identical input MUST yield byte-identical output.
//   - Children sorted by id before processing.
//   - All monetary amounts go through round2().

import {
  componentAmount,
  componentAmountDetails,
  type ComponentLike,
  type CatalogEntityLike,
  type WastageLookup,
  type WastageResult,
} from "./componentAmount";
import {
  applyUnitFactors,
  computeQuoteBreakdown,
  type PricingFactor,
  type UnitFactorLine,
  type QuoteBreakdown,
  type DiscountInput,
  type FeesCreditEntry,
} from "./factors";

// Re-export factors for consumers
export { FACTOR_ORDER, VAT_RATE } from "./factors";
export type { FactorKey, UnitFactorLine, QuoteBreakdown, DiscountInput } from "./factors";

// ── Deterministic rounding ───────────────────────────────────────────────────

/** Round to 2 decimal places. All monetary outputs pass through this. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ── Input types ──────────────────────────────────────────────────────────────

export interface ComponentInput {
  id: string;
  kind: "material" | "hardware" | "accessory" | "manufacturing" | "edge_band" | "veneer" | "finish";
  catalogId: string | null;
  qty: number;
  unitOfMeasure: string;
  areaFunctionKey?: string | null;
  multiplicationMode?: "one_time" | "per_unit";
}

export interface UnitInput {
  id: string;
  unitTypeId: string | null;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  lengthMm?: number;
  qty: number;
  finishId?: string | null;
  overrideFactorKeys?: Record<string, number>;
  components: ComponentInput[];
}

export interface SectionInput {
  id: string;
  label?: string | null;
  materialId?: string | null;
  finishId?: string | null;
  veneerId?: string | null;
  components?: ComponentInput[];
  units: UnitInput[];
}

export interface ProductInput {
  id: string;
  sections: SectionInput[];
}

export interface QuoteInput {
  products: ProductInput[];
  /** Per-quotation discount. undefined = no discount. */
  discount?: {
    amount: number;
    maxValue?: number | null;
  };
}

// ── Catalog lookups (flat maps, keyed by catalog row id) ──────────────────────

export interface CatalogMaterial {
  id: string;
  name?: string;
  pricingUnit: string;
  pricePerUnit: number;
  defaultWastagePct: number;
  coefficient?: number | null;
  boardPrice?: number | null;
}

export interface CatalogHardware {
  id: string;
  name?: string;
  pricePerPiece: number;
  pricingUnit?: string;
}

export interface CatalogAccessory {
  id: string;
  name?: string;
  pricePerPiece: number;
}

export interface CatalogManufacturingOp {
  id: string;
  name?: string;
  rateUnit: string;
  rate: number;
}

export interface WastageRule {
  scope: string;
  ref: string;
  pct: number;
}

export interface FeesCredit {
  code: string;
  sign: "plus" | "minus";
  amount: number | null;
  formulaKey: string | null;
}

export interface CatalogLookup {
  materials: Record<string, CatalogMaterial>;
  hardware: Record<string, CatalogHardware>;
  accessories: Record<string, CatalogAccessory>;
  manufacturingOps: Record<string, CatalogManufacturingOp>;
  veneers: Record<string, CatalogMaterial>;
  finishes: Record<string, CatalogMaterial>;
  edgeBands: Record<string, CatalogMaterial>;
  pricingFactors: PricingFactor[];
  wastageRules: WastageRule[];
  feesCredits: FeesCredit[];
}

// ── Output types ─────────────────────────────────────────────────────────────

export interface ComponentOutput {
  id: string;
  kind: string;
  computedAmount: number;
  consumption?: number;
  totalConsumption?: number;
  consumptionUnit?: string;
  unitPrice?: number;
  pricingBasis?: string;
  wastageCost?: number;
  wastagePct?: number;
  pricingStatus?: "priced" | "pricing_required";
  errorMessage?: string;
  multiplicationMode?: "one_time" | "per_unit";
}

export interface UnitOutput {
  id: string;
  qty: number;
  computedUnitCost: number;
  computedUnitPrice: number;
  computedTotalCost: number;
  computedTotalPrice: number;
  components: ComponentOutput[];
  factorLines?: UnitFactorLine[];
}

export interface SectionOutput {
  id: string;
  computedCost: number;
  computedPrice: number;
  components?: ComponentOutput[];
  units: UnitOutput[];
}

export interface ProductOutput {
  id: string;
  computedCost: number;
  computedPrice: number;
  sections: SectionOutput[];
}

export interface FactorLine {
  label: string;
  amount: number;
}

export interface QuoteOutput {
  computedCost: number;
  computedPrice: number;
  factorLines: FactorLine[];
  feesCreditsTotal: number;
  products: ProductOutput[];
  /** Full auditable breakdown with VAT, discount, fees/credits. */
  breakdown: QuoteBreakdown;
}

// ── WastageLookup builder ───────────────────────────────────────────────────

/**
 * Build a WastageLookup function from a flat WastageRule[].
 *
 * Precedence: material scope wins over material_type scope.
 * When multiple rules match the same (scope, ref), the LAST one wins
 * (last-write-wins, matching tenant_wastage_rules insert order).
 */
function buildWastageLookup(rules: WastageRule[]): WastageLookup {
  const map = new Map<string, WastageResult>();
  for (const r of rules) {
    map.set(`${r.scope}:${r.ref}`, { pct: r.pct });
  }

  return (scope, ref) => {
    const materialResult = map.get(`material:${ref}`);
    if (materialResult) return materialResult;
    return map.get(`material_type:${ref}`) ?? null;
  };
}

// ── Catalog entity adapters ──────────────────────────────────────────────────

function materialToEntity(mat: CatalogMaterial): CatalogEntityLike {
  return {
    pricingUnit: mat.pricingUnit,
    pricePerUnit: mat.pricePerUnit,
    defaultWastagePct: mat.defaultWastagePct,
    coefficient: mat.coefficient,
    boardPrice: mat.boardPrice,
  };
}

function hardwareToEntity(hw: CatalogHardware): CatalogEntityLike {
  return { pricePerPiece: hw.pricePerPiece, pricingUnit: hw.pricingUnit };
}

function accessoryToEntity(acc: CatalogAccessory): CatalogEntityLike {
  return { pricePerPiece: acc.pricePerPiece };
}

function manufacturingToEntity(op: CatalogManufacturingOp): CatalogEntityLike {
  return { rateUnit: op.rateUnit, rate: op.rate };
}

// ── Component pricing helper ──────────────────────────────────────────────────

function resolveCatalogEntity(
  comp: ComponentInput,
  catalog: CatalogLookup,
): CatalogEntityLike | null {
  let entity: CatalogEntityLike | null = null;

  if (comp.catalogId) {
    switch (comp.kind) {
      case "material":
        entity = catalog.materials[comp.catalogId]
          ? materialToEntity(catalog.materials[comp.catalogId])
          : null;
        break;
      case "hardware":
        entity = catalog.hardware[comp.catalogId]
          ? hardwareToEntity(catalog.hardware[comp.catalogId])
          : null;
        break;
      case "accessory":
        entity = catalog.accessories[comp.catalogId]
          ? accessoryToEntity(catalog.accessories[comp.catalogId])
          : null;
        break;
      case "manufacturing":
        entity = catalog.manufacturingOps[comp.catalogId]
          ? manufacturingToEntity(catalog.manufacturingOps[comp.catalogId])
          : null;
        break;
      case "edge_band":
        entity = catalog.edgeBands[comp.catalogId]
          ? materialToEntity(catalog.edgeBands[comp.catalogId])
          : null;
        break;
      case "veneer":
        entity = catalog.veneers[comp.catalogId]
          ? materialToEntity(catalog.veneers[comp.catalogId])
          : null;
        break;
      case "finish":
        entity = catalog.finishes[comp.catalogId]
          ? materialToEntity(catalog.finishes[comp.catalogId])
          : null;
        break;
    }
  }

  return entity;
}

function priceComponent(
  comp: ComponentInput,
  dims: { w: number; h: number; d: number },
  catalog: CatalogLookup,
  wastageLookup: WastageLookup,
  isSectionComponent: boolean = false,
  multiplier: number = 1,
): ComponentOutput {
  const entity = resolveCatalogEntity(comp, catalog);

  if (!entity) {
    return {
      id: comp.id,
      kind: comp.kind,
      computedAmount: 0,
      pricingStatus: "pricing_required",
      errorMessage: "Pricing information required (unlinked catalog item)",
      multiplicationMode: comp.multiplicationMode ?? "one_time",
    };
  }

  // Determine area function:
  // For section components: if no area function or "direct", use "direct" (Strategy A).
  // If explicitly specified and not "direct", use Strategy C with aggregated dimensions.
  // For unit components: default to standard area key if applicable.
  let effectiveAreaKey = comp.areaFunctionKey;
  if (!effectiveAreaKey) {
    if (isSectionComponent) {
      effectiveAreaKey = "direct";
    } else {
      effectiveAreaKey =
        comp.kind === "edge_band"
          ? "edge_band"
          : (comp.kind === "material" && (comp.unitOfMeasure === "m2" || comp.unitOfMeasure === "m")) ||
            comp.kind === "veneer" ||
            comp.kind === "finish"
          ? "door_panel"
          : null;
    }
  }

  const compLike: ComponentLike = {
    kind: comp.kind,
    catalogId: comp.catalogId,
    qty: comp.qty,
    unitOfMeasure: comp.unitOfMeasure,
    areaFunctionKey: effectiveAreaKey,
  };

  // Dimensions check: If an area function (other than "direct") is used and dimensions are missing/non-positive,
  // we do NOT fall back to dummy 1000x1000x600. We trigger explicit pricing_required.
  const requiresDims =
    effectiveAreaKey &&
    effectiveAreaKey !== "direct" &&
    (comp.kind === "material" ||
      comp.kind === "edge_band" ||
      comp.kind === "veneer" ||
      comp.kind === "finish" ||
      comp.kind === "manufacturing");

  if (requiresDims && (dims.w <= 0 || dims.h <= 0)) {
    return {
      id: comp.id,
      kind: comp.kind,
      computedAmount: 0,
      pricingStatus: "pricing_required",
      errorMessage: isSectionComponent
        ? "Section has no units with valid dimensions to calculate area-based component."
        : "Unit dimensions must be positive to calculate area-based component.",
      multiplicationMode: comp.multiplicationMode ?? "one_time",
    };
  }

  try {
    const details = componentAmountDetails(compLike, entity, dims, wastageLookup);
    const effectiveMultiplier = Math.max(1, multiplier);
    const amount = round2(details.amount * effectiveMultiplier);
    const totalConsumption = round4((details.totalConsumption ?? 0) * effectiveMultiplier);
    const wastageCost = round2((details.wastageCost ?? 0) * effectiveMultiplier);

    return {
      id: comp.id,
      kind: comp.kind,
      computedAmount: amount,
      consumption: details.consumptionPerItem,
      totalConsumption,
      consumptionUnit: details.consumptionUnit,
      unitPrice: details.unitPrice,
      pricingBasis: details.pricingBasis,
      wastageCost,
      wastagePct: details.wastagePct,
      pricingStatus: "priced",
      multiplicationMode: comp.multiplicationMode ?? "one_time",
    };
  } catch (err: any) {
    return {
      id: comp.id,
      kind: comp.kind,
      computedAmount: 0,
      pricingStatus: "pricing_required",
      errorMessage: err?.message ?? "Pricing information required",
      multiplicationMode: comp.multiplicationMode ?? "one_time",
    };
  }
}

// ── Unit pricing ─────────────────────────────────────────────────────────────

function priceUnit(
  unit: UnitInput,
  catalog: CatalogLookup,
  wastageLookup: WastageLookup,
  inheritedFinishId?: string | null,
  inheritedMaterialId?: string | null,
  inheritedVeneerId?: string | null,
): UnitOutput {
  const dims = { w: unit.widthMm, h: unit.heightMm, d: unit.depthMm };

  // Sort components by id for deterministic output
  const sortedComponents = [...unit.components].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  const components: ComponentOutput[] = sortedComponents.map((comp) => {
    let resolvedComp = comp;
    if (!comp.catalogId) {
      if (comp.kind === "finish" && (unit.finishId || inheritedFinishId)) {
        resolvedComp = { ...comp, catalogId: unit.finishId || inheritedFinishId || null };
      } else if (comp.kind === "material" && inheritedMaterialId) {
        resolvedComp = { ...comp, catalogId: inheritedMaterialId || null };
      } else if (comp.kind === "veneer" && inheritedVeneerId) {
        resolvedComp = { ...comp, catalogId: inheritedVeneerId || null };
      }
    }
    return priceComponent(resolvedComp, dims, catalog, wastageLookup, false, 1);
  });

  const computedUnitCost = round2(
    components.reduce((sum, c) => sum + c.computedAmount, 0),
  );

  // Apply per-unit factors in locked order via factors.ts
  const factorResult = applyUnitFactors(
    computedUnitCost,
    catalog.pricingFactors,
    unit.overrideFactorKeys,
  );

  const qty = unit.qty > 0 ? unit.qty : 1;
  const computedTotalCost = round2(computedUnitCost * qty);
  const computedTotalPrice = round2(factorResult.finalPrice * qty);

  return {
    id: unit.id,
    qty,
    computedUnitCost,
    computedUnitPrice: factorResult.finalPrice,
    computedTotalCost,
    computedTotalPrice,
    components,
    factorLines: factorResult.lines,
  };
}

// ── Bottom-up aggregation ────────────────────────────────────────────────────

function priceSection(
  section: SectionInput,
  catalog: CatalogLookup,
  wastageLookup: WastageLookup,
): SectionOutput {
  // Sort units by id for deterministic output
  const sortedUnits = [...section.units].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  const units = sortedUnits.map((u) =>
    priceUnit(
      u,
      catalog,
      wastageLookup,
      section.finishId,
      section.materialId,
      section.veneerId,
    ),
  );

  const sortedComponents = [...(section.components || [])].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  // Derive section run dimensions from child units:
  // w = sum(w_i * q_i), h = max(h_i), d = max(d_i)
  let sectionW = 0;
  let sectionH = 0;
  let sectionD = 0;
  let totalUnitQty = 0;

  for (const u of section.units) {
    const uQty = u.qty > 0 ? u.qty : 1;
    totalUnitQty += uQty;
    const w = u.widthMm || 0;
    const h = u.heightMm || 0;
    const d = u.depthMm || 0;
    sectionW += w * uQty;
    if (h > sectionH) sectionH = h;
    if (d > sectionD) sectionD = d;
  }

  const sectionDims = { w: sectionW, h: sectionH, d: sectionD };

  const components = sortedComponents.map((c) => {
    let resolvedComp = c;
    if (!c.catalogId) {
      if (c.kind === "finish" && section.finishId) {
        resolvedComp = { ...c, catalogId: section.finishId };
      } else if (c.kind === "material" && section.materialId) {
        resolvedComp = { ...c, catalogId: section.materialId };
      } else if (c.kind === "veneer" && section.veneerId) {
        resolvedComp = { ...c, catalogId: section.veneerId };
      }
    }

    const mult =
      c.multiplicationMode === "per_unit"
        ? Math.max(1, totalUnitQty)
        : 1;

    return priceComponent(
      resolvedComp,
      sectionDims,
      catalog,
      wastageLookup,
      true, // isSectionComponent
      mult,
    );
  });

  const sectionComponentCost = round2(
    components.reduce((sum, c) => sum + c.computedAmount, 0),
  );

  const factorResult = applyUnitFactors(
    sectionComponentCost,
    catalog.pricingFactors,
    {},
  );
  const sectionComponentPrice = factorResult.finalPrice;

  const unitsCost = round2(
    units.reduce((sum, u) => sum + u.computedTotalCost, 0),
  );
  const unitsPrice = round2(
    units.reduce((sum, u) => sum + u.computedTotalPrice, 0),
  );

  const computedCost = round2(unitsCost + sectionComponentCost);
  const computedPrice = round2(unitsPrice + sectionComponentPrice);

  return {
    id: section.id,
    computedCost,
    computedPrice,
    components,
    units,
  };
}

function priceProduct(
  product: ProductInput,
  catalog: CatalogLookup,
  wastageLookup: WastageLookup,
): ProductOutput {
  // Sort sections by id for deterministic output
  const sortedSections = [...product.sections].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  const sections = sortedSections.map((s) => priceSection(s, catalog, wastageLookup));

  const computedCost = round2(
    sections.reduce((sum, s) => sum + s.computedCost, 0),
  );
  const computedPrice = round2(
    sections.reduce((sum, s) => sum + s.computedPrice, 0),
  );

  return {
    id: product.id,
    computedCost,
    computedPrice,
    sections,
  };
}

// ── Global factor application (legacy — kept for reference) ─────────────────

function applyGlobalFactors(
  baseCost: number,
  factors: PricingFactor[],
): { price: number; lines: FactorLine[] } {
  let price = baseCost;
  const lines: FactorLine[] = [];

  // Sort factors by key for deterministic order
  const sorted = [...factors].sort((a, b) =>
    a.factorKey.localeCompare(b.factorKey),
  );

  for (const f of sorted) {
    const amount = round2(baseCost * (f.percent / 100));
    if (amount !== 0) {
      lines.push({ label: f.factorKey, amount });
      price += amount;
    }
  }

  return { price: round2(price), lines };
}

// ── Main entry point ─────────────────────────────────────────────────────────

export function priceQuote(
  quote: QuoteInput,
  catalog: CatalogLookup,
): QuoteOutput {
  const wastageLookup = buildWastageLookup(catalog.wastageRules);

  // Sort products by id for deterministic output
  const sortedProducts = [...quote.products].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  // 1. Price all products bottom-up (factors applied per-unit in locked order)
  const products = sortedProducts.map((p) =>
    priceProduct(p, catalog, wastageLookup),
  );

  // 2. Sum raw cost and price across products
  const rawCost = round2(products.reduce((sum, p) => sum + p.computedCost, 0));
  const rawPrice = round2(products.reduce((sum, p) => sum + p.computedPrice, 0));

  // 3. Compute quote-level breakdown (discount, VAT, fees/credits)
  const discountInput: DiscountInput = {
    amount: quote.discount?.amount ?? 0,
    maxValue: quote.discount?.maxValue ?? null,
  };

  const feesCreditsEntries: FeesCreditEntry[] = catalog.feesCredits.map((fc) => ({
    code: fc.code,
    sign: fc.sign,
    amount: fc.amount,
    formulaKey: fc.formulaKey,
  }));

  const breakdown = computeQuoteBreakdown(rawPrice, discountInput, feesCreditsEntries);

  // 4. Legacy factorLines — factors are now applied per-unit, but we keep
  //    this field populated for backward compatibility. It will be empty
  //    because factors moved to unit level. Use breakdown for full audit trail.
  const factorLines: FactorLine[] = [];

  return {
    computedCost: rawCost,
    computedPrice: breakdown.total,
    factorLines,
    feesCreditsTotal: breakdown.feesCreditsTotal,
    products,
    breakdown,
  };
}
