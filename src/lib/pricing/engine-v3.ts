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

// ── Input types ──────────────────────────────────────────────────────────────

export interface ComponentInput {
  id: string;
  kind: "material" | "hardware" | "accessory" | "manufacturing" | "edge_band";
  catalogId: string | null;
  qty: number;
  unitOfMeasure: string;
  areaFunctionKey?: string | null;
}

export interface UnitInput {
  id: string;
  unitTypeId: string | null;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  qty: number;
  overrideFactorKeys?: Record<string, number>;
  components: ComponentInput[];
}

export interface SectionInput {
  id: string;
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
  pricingUnit: string;
  pricePerUnit: number;
  defaultWastagePct: number;
  coefficient?: number | null;
  boardPrice?: number | null;
}

export interface CatalogHardware {
  id: string;
  pricePerPiece: number;
}

export interface CatalogAccessory {
  id: string;
  pricePerPiece: number;
}

export interface CatalogManufacturingOp {
  id: string;
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
  pricingFactors: PricingFactor[];
  wastageRules: WastageRule[];
  feesCredits: FeesCredit[];
}

// ── Output types ─────────────────────────────────────────────────────────────

export interface ComponentOutput {
  id: string;
  kind: string;
  computedAmount: number;
}

export interface UnitOutput {
  id: string;
  computedUnitCost: number;
  computedUnitPrice: number;
  components: ComponentOutput[];
}

export interface SectionOutput {
  id: string;
  computedCost: number;
  computedPrice: number;
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
  return { pricePerPiece: hw.pricePerPiece };
}

function accessoryToEntity(acc: CatalogAccessory): CatalogEntityLike {
  return { pricePerPiece: acc.pricePerPiece };
}

function manufacturingToEntity(op: CatalogManufacturingOp): CatalogEntityLike {
  return { rateUnit: op.rateUnit, rate: op.rate };
}

// ── Unit pricing ─────────────────────────────────────────────────────────────

function priceUnit(
  unit: UnitInput,
  catalog: CatalogLookup,
  wastageLookup: WastageLookup,
): UnitOutput {
  const dims = { w: unit.widthMm, h: unit.heightMm, d: unit.depthMm };

  // Sort components by id for deterministic output
  const sortedComponents = [...unit.components].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  const components: ComponentOutput[] = sortedComponents.map((comp) => {
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
          entity = catalog.materials[comp.catalogId]
            ? materialToEntity(catalog.materials[comp.catalogId])
            : null;
          break;
      }
    }

    if (!entity) {
      return { id: comp.id, kind: comp.kind, computedAmount: 0 };
    }

    const compLike: ComponentLike = {
      kind: comp.kind,
      qty: comp.qty,
      unitOfMeasure: comp.unitOfMeasure,
      areaFunctionKey: comp.areaFunctionKey,
    };

    try {
      const amount = componentAmount(compLike, entity, dims, wastageLookup);
      return { id: comp.id, kind: comp.kind, computedAmount: round2(amount) };
    } catch {
      return { id: comp.id, kind: comp.kind, computedAmount: 0 };
    }
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

  return {
    id: unit.id,
    computedUnitCost,
    computedUnitPrice: factorResult.finalPrice,
    components,
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

  const units = sortedUnits.map((u) => priceUnit(u, catalog, wastageLookup));

  const computedCost = round2(
    units.reduce((sum, u) => sum + u.computedUnitCost, 0),
  );
  const computedPrice = round2(
    units.reduce((sum, u) => sum + u.computedUnitPrice, 0),
  );

  return {
    id: section.id,
    computedCost,
    computedPrice,
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
