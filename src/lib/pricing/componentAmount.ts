/**
 * Leaf-pricing function — computes a single component's monetary amount.
 *
 * Handles every pricing_unit / rate_unit combination plus board-yield
 * (coefficient × board_price) costing. Returns a number in EGP.
 *
 * Pure — no DB, no side effects.
 */

import { getArea } from "./areaFunctions";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ComponentLike {
  kind: "material" | "hardware" | "accessory" | "manufacturing" | "edge_band";
  qty: number;
  unitOfMeasure: string;
  areaFunctionKey?: string | null;
}

/**
 * Minimal catalog entity shape. Fields used depend on `kind`:
 *
 * material  — pricingUnit, pricePerUnit, defaultWastagePct,
 *             coefficient?, boardPrice?
 * hardware  — pricePerPiece
 * accessory — pricePerPiece
 * manufacturing — rateUnit, rate
 */
export interface CatalogEntityLike {
  // material
  pricingUnit?: string;
  pricePerUnit?: number;
  defaultWastagePct?: number;
  coefficient?: number | null;
  boardPrice?: number | null;
  // hardware / accessory
  pricePerPiece?: number;
  // manufacturing
  rateUnit?: string;
  rate?: number;
}

export interface WastageResult {
  /** Wastage percentage (e.g. 10 means +10 %). */
  pct: number;
  /** Decimal-places for rounding (undefined → no rounding). */
  precision?: number;
}

/**
 * Resolves the effective wastage for a component.
 *
 * Precedence (encapsulated by caller):
 *   1. material scope  (ref = material catalog id)
 *   2. material_type scope (ref = material type / category code)
 *   3. null → fallback to catalog defaultWastagePct
 */
export type WastageLookup = (
  scope: "material" | "material_type",
  ref: string,
) => WastageResult | null;

// ── Helpers ────────────────────────────────────────────────────────────────

function requireFinite(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number, got ${value}.`);
  }
}

function applyWastage(
  baseCost: number,
  wastagePct: number,
  precision?: number,
): number {
  const adjusted = baseCost * (1 + wastagePct / 100);
  if (precision === undefined || precision === null) return adjusted;
  const factor = 10 ** precision;
  return Math.round(adjusted * factor) / factor;
}

// ── Pricing strategies ─────────────────────────────────────────────────────

function priceMaterial(
  comp: ComponentLike,
  entity: CatalogEntityLike,
  dims: { w: number; h: number; d: number },
  wastageLookup: WastageLookup,
): number {
  const pricingUnit = entity.pricingUnit ?? "pcs";
  const price = entity.pricePerUnit;

  if (price == null || !Number.isFinite(price) || price < 0) {
    throw new Error(
      `Material catalog ${comp.areaFunctionKey ?? "entity"} is missing pricePerUnit.`,
    );
  }

  // ── Board-yield (coefficient × board_price) ────────────────────────────
  if (entity.coefficient != null && entity.boardPrice != null) {
    requireFinite(entity.coefficient, "coefficient");
    requireFinite(entity.boardPrice, "boardPrice");

    const raw = comp.qty * entity.coefficient * entity.boardPrice;

    // Resolve wastage to determine rounding precision
    let wastagePct = entity.defaultWastagePct ?? 0;
    let precision: number | undefined;

    if (comp.areaFunctionKey) {
      const rule = wastageLookup("material", comp.areaFunctionKey);
      if (rule) {
        wastagePct = rule.pct;
        precision = rule.precision;
      }
    }

    return applyWastage(raw, wastagePct, precision);
  }

  // ── Dimension-based pricing (m2, m) ────────────────────────────────────
  if (pricingUnit === "m2" || pricingUnit === "m") {
    if (!comp.areaFunctionKey) {
      throw new Error(
        `Material with pricingUnit "${pricingUnit}" requires an areaFunctionKey.`,
      );
    }
    const area = getArea(comp.areaFunctionKey, dims); // m² — throws on bad dims

    const raw =
      pricingUnit === "m"
        ? comp.qty * (dims.w / 1000) * price // linear metres (width only)
        : comp.qty * area * price;            // square metres

    // Resolve wastage
    let wastagePct = entity.defaultWastagePct ?? 0;
    const rule = wastageLookup("material", comp.areaFunctionKey);
    if (rule) wastagePct = rule.pct;

    return applyWastage(raw, wastagePct);
  }

  // ── Quantity-based pricing (pcs, piece) ────────────────────────────────
  const raw = comp.qty * price;

  let wastagePct = entity.defaultWastagePct ?? 0;
  if (comp.areaFunctionKey) {
    const rule = wastageLookup("material", comp.areaFunctionKey);
    if (rule) wastagePct = rule.pct;
  }

  return applyWastage(raw, wastagePct);
}

function priceHardware(comp: ComponentLike, entity: CatalogEntityLike): number {
  const price = entity.pricePerPiece;
  if (price == null || !Number.isFinite(price) || price < 0) {
    throw new Error("Hardware catalog entity is missing pricePerPiece.");
  }
  return comp.qty * price;
}

function priceAccessory(comp: ComponentLike, entity: CatalogEntityLike): number {
  const price = entity.pricePerPiece;
  if (price == null || !Number.isFinite(price) || price < 0) {
    throw new Error("Accessory catalog entity is missing pricePerPiece.");
  }
  return comp.qty * price;
}

function priceManufacturing(
  comp: ComponentLike,
  entity: CatalogEntityLike,
  dims: { w: number; h: number; d: number },
): number {
  const rate = entity.rate;
  const rateUnit = entity.rateUnit ?? "piece";

  if (rate == null || !Number.isFinite(rate) || rate < 0) {
    throw new Error("Manufacturing catalog entity is missing rate.");
  }

  switch (rateUnit) {
    case "piece":
    case "minute":
      return comp.qty * rate;
    case "m":
      return comp.qty * (dims.w / 1000) * rate;
    case "m2": {
      const area = comp.areaFunctionKey
        ? getArea(comp.areaFunctionKey, dims)
        : (dims.w / 1000) * (dims.h / 1000);
      return comp.qty * area * rate;
    }
    default:
      throw new Error(`Unknown manufacturing rate_unit: "${rateUnit}".`);
  }
}

function priceEdgeBand(
  comp: ComponentLike,
  entity: CatalogEntityLike,
  dims: { w: number; h: number; d: number },
  wastageLookup: WastageLookup,
): number {
  const price = entity.pricePerUnit;

  if (price == null || !Number.isFinite(price) || price < 0) {
    throw new Error(
      `Edge band catalog ${comp.areaFunctionKey ?? "entity"} is missing pricePerUnit (price per linear metre).`,
    );
  }

  if (!comp.areaFunctionKey) {
    throw new Error(
      "Edge band component requires an areaFunctionKey to compute linear metres.",
    );
  }

  // edge_band area function returns linear metres (perimeter)
  const linearMetres = getArea(comp.areaFunctionKey, dims);
  const raw = comp.qty * linearMetres * price;

  // Resolve wastage
  let wastagePct = entity.defaultWastagePct ?? 0;
  const rule = wastageLookup("material", comp.areaFunctionKey);
  if (rule) wastagePct = rule.pct;

  return applyWastage(raw, wastagePct);
}

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Compute the monetary amount for a single component.
 *
 * @throws if qty is negative
 * @throws if price is missing or negative
 * @throws if dimensions are non-positive (delegated to area_functions)
 * @throws if an unknown area_function_key is referenced
 * @returns 0 when qty is 0 (treated as deleted upstream)
 */
export function componentAmount(
  comp: ComponentLike,
  entity: CatalogEntityLike,
  dims: { w: number; h: number; d: number },
  wastageLookup: WastageLookup,
): number {
  if (comp.qty < 0) {
    throw new Error(`Component qty must be >= 0, got ${comp.qty}.`);
  }
  if (comp.qty === 0) return 0;

  switch (comp.kind) {
    case "material":
      return priceMaterial(comp, entity, dims, wastageLookup);
    case "hardware":
      return priceHardware(comp, entity);
    case "accessory":
      return priceAccessory(comp, entity);
    case "manufacturing":
      return priceManufacturing(comp, entity, dims);
    case "edge_band":
      return priceEdgeBand(comp, entity, dims, wastageLookup);
    default:
      throw new Error(`Unknown component kind: "${comp.kind}".`);
  }
}
