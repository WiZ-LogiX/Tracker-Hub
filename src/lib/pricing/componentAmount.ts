/**
 * Leaf-pricing function — computes a single component's monetary amount and calculation details.
 *
 * Handles every pricing_unit / rate_unit combination plus board-yield
 * (coefficient × board_price) costing. Returns a number in EGP.
 *
 * Pure — no DB, no side effects.
 */

import { getArea } from "./areaFunctions";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ComponentLike {
  kind: "material" | "hardware" | "accessory" | "manufacturing" | "edge_band" | "veneer" | "finish";
  catalogId?: string | null;
  qty: number;
  unitOfMeasure: string;
  areaFunctionKey?: string | null;
}

/**
 * Minimal catalog entity shape. Fields used depend on `kind`:
 *
 * material  — pricingUnit, pricePerUnit, defaultWastagePct,
 *             coefficient?, boardPrice?
 * hardware  — pricePerPiece, pricingUnit?
 * accessory — pricePerPiece, pricingUnit?
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

export interface ComponentCalculationDetails {
  amount: number;
  baseCost: number;
  wastageCost: number;
  wastagePct: number;
  consumptionPerItem: number; // e.g. 0.48 for 0.48 m² per component
  totalConsumption: number;   // e.g. 1.44 for 3 components
  consumptionUnit: string;    // "m²", "m", "pcs", "set", "pair", "min"
  unitPrice: number;
  pricingBasis: string;       // e.g. "500.00 EGP / m²"
}

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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ── Detailed calculation strategies ────────────────────────────────────────

function calculateMaterial(
  comp: ComponentLike,
  entity: CatalogEntityLike,
  dims: { w: number; h: number; d: number },
  wastageLookup: WastageLookup,
): ComponentCalculationDetails {
  const rawUnit = (entity.pricingUnit ?? "pcs").toLowerCase();
  const isArea = rawUnit === "m2" || rawUnit === "square_meter";
  const isLinear = rawUnit === "m" || rawUnit === "linear_meter";

  // ── Board-yield (coefficient × board_price) ────────────────────────────
  if (entity.coefficient != null && entity.boardPrice != null) {
    requireFinite(entity.coefficient, "coefficient");
    requireFinite(entity.boardPrice, "boardPrice");

    const baseCost = comp.qty * entity.coefficient * entity.boardPrice;
    let wastagePct = entity.defaultWastagePct ?? 0;
    let precision: number | undefined;

    if (comp.areaFunctionKey) {
      const rule = wastageLookup("material", comp.areaFunctionKey);
      if (rule) {
        wastagePct = rule.pct;
        precision = rule.precision;
      }
    }

    const amount = applyWastage(baseCost, wastagePct, precision);
    return {
      amount,
      baseCost,
      wastageCost: round2(Math.max(0, amount - baseCost)),
      wastagePct,
      consumptionPerItem: round4(entity.coefficient),
      totalConsumption: round4(comp.qty * entity.coefficient),
      consumptionUnit: "board",
      unitPrice: entity.boardPrice,
      pricingBasis: `${entity.boardPrice.toFixed(2)} EGP / board`,
    };
  }

  const price = entity.pricePerUnit;
  if (price == null || !Number.isFinite(price) || price < 0) {
    throw new Error(
      `Material catalog ${comp.areaFunctionKey ?? "entity"} is missing pricePerUnit.`,
    );
  }

  if (rawUnit === "sheet") {
    throw new Error(
      `Material pricing unit "sheet" is not supported without board dimensions/coefficient. Sheet materials must be priced by square meter (m²) or configured with board yield parameters.`,
    );
  }

  // ── Dimension-based pricing (m2, m) ────────────────────────────────────
  if (isArea || isLinear) {
    if (comp.areaFunctionKey === "direct") {
      const consumptionPerItem = 1;
      const totalConsumption = round4(comp.qty);
      const consumptionUnit = isLinear ? "m" : "m²";
      const baseCost = comp.qty * price;

      let wastagePct = entity.defaultWastagePct ?? 0;
      const rule = wastageLookup("material", "direct");
      if (rule) wastagePct = rule.pct;

      const amount = applyWastage(baseCost, wastagePct);
      return {
        amount,
        baseCost,
        wastageCost: round2(Math.max(0, amount - baseCost)),
        wastagePct,
        consumptionPerItem,
        totalConsumption,
        consumptionUnit,
        unitPrice: price,
        pricingBasis: `${price.toFixed(2)} EGP / ${consumptionUnit}`,
      };
    }

    if (!comp.areaFunctionKey) {
      throw new Error(
        `Material with pricingUnit "${entity.pricingUnit}" requires an areaFunctionKey.`,
      );
    }
    const area = getArea(comp.areaFunctionKey, dims); // m² — throws on bad dims

    let consumptionPerItem: number;
    let totalConsumption: number;
    let consumptionUnit: string;
    let baseCost: number;

    if (isLinear) {
      consumptionPerItem = round4(dims.w / 1000);
      totalConsumption = round4(comp.qty * consumptionPerItem);
      consumptionUnit = "m";
      baseCost = comp.qty * (dims.w / 1000) * price;
    } else {
      consumptionPerItem = round4(area);
      totalConsumption = round4(comp.qty * area);
      consumptionUnit = "m²";
      baseCost = comp.qty * area * price;
    }

    // Resolve wastage
    let wastagePct = entity.defaultWastagePct ?? 0;
    const rule = wastageLookup("material", comp.areaFunctionKey);
    if (rule) wastagePct = rule.pct;

    const amount = applyWastage(baseCost, wastagePct);
    return {
      amount,
      baseCost,
      wastageCost: round2(Math.max(0, amount - baseCost)),
      wastagePct,
      consumptionPerItem,
      totalConsumption,
      consumptionUnit,
      unitPrice: price,
      pricingBasis: `${price.toFixed(2)} EGP / ${consumptionUnit}`,
    };
  }

  // ── Quantity-based pricing (pcs, piece) ────────────────────────────────
  const baseCost = comp.qty * price;
  let wastagePct = entity.defaultWastagePct ?? 0;
  if (comp.areaFunctionKey) {
    const rule = wastageLookup("material", comp.areaFunctionKey);
    if (rule) wastagePct = rule.pct;
  }

  const amount = applyWastage(baseCost, wastagePct);
  return {
    amount,
    baseCost,
    wastageCost: round2(Math.max(0, amount - baseCost)),
    wastagePct,
    consumptionPerItem: 1,
    totalConsumption: comp.qty,
    consumptionUnit: "pcs",
    unitPrice: price,
    pricingBasis: `${price.toFixed(2)} EGP / pc`,
  };
}

function calculateHardware(
  comp: ComponentLike,
  entity: CatalogEntityLike,
): ComponentCalculationDetails {
  const price = entity.pricePerPiece ?? entity.pricePerUnit;
  if (price == null || !Number.isFinite(price) || price < 0) {
    throw new Error("Hardware catalog entity is missing pricePerPiece.");
  }
  const uom = (entity.pricingUnit ?? comp.unitOfMeasure ?? "pcs").toLowerCase();
  const unitLabel = uom === "set" ? "set" : uom === "pair" ? "pair" : "pc";
  const baseCost = comp.qty * price;

  return {
    amount: baseCost,
    baseCost,
    wastageCost: 0,
    wastagePct: 0,
    consumptionPerItem: 1,
    totalConsumption: comp.qty,
    consumptionUnit: unitLabel,
    unitPrice: price,
    pricingBasis: `${price.toFixed(2)} EGP / ${unitLabel}`,
  };
}

function calculateAccessory(
  comp: ComponentLike,
  entity: CatalogEntityLike,
): ComponentCalculationDetails {
  const price = entity.pricePerPiece ?? entity.pricePerUnit;
  if (price == null || !Number.isFinite(price) || price < 0) {
    throw new Error("Accessory catalog entity is missing pricePerPiece.");
  }
  const uom = (entity.pricingUnit ?? comp.unitOfMeasure ?? "pcs").toLowerCase();
  const unitLabel = uom === "set" ? "set" : uom === "pair" ? "pair" : "pc";
  const baseCost = comp.qty * price;

  return {
    amount: baseCost,
    baseCost,
    wastageCost: 0,
    wastagePct: 0,
    consumptionPerItem: 1,
    totalConsumption: comp.qty,
    consumptionUnit: unitLabel,
    unitPrice: price,
    pricingBasis: `${price.toFixed(2)} EGP / ${unitLabel}`,
  };
}

function calculateManufacturing(
  comp: ComponentLike,
  entity: CatalogEntityLike,
  dims: { w: number; h: number; d: number },
): ComponentCalculationDetails {
  const rate = entity.rate;
  const rateUnit = entity.rateUnit ?? "piece";

  if (rate == null || !Number.isFinite(rate) || rate < 0) {
    throw new Error("Manufacturing catalog entity is missing rate.");
  }

  let consumptionPerItem = 1;
  let consumptionUnit = "pc";
  let baseCost = comp.qty * rate;

  switch (rateUnit) {
    case "piece":
      consumptionPerItem = 1;
      consumptionUnit = "pc";
      baseCost = comp.qty * rate;
      break;
    case "minute":
      consumptionPerItem = 1;
      consumptionUnit = "min";
      baseCost = comp.qty * rate;
      break;
    case "m": {
      if (comp.areaFunctionKey === "direct") {
        consumptionPerItem = 1;
        consumptionUnit = "m";
        baseCost = comp.qty * rate;
      } else {
        if (dims.w <= 0) {
          throw new Error("Dimensions required to calculate linear manufacturing operation.");
        }
        consumptionPerItem = round4(dims.w / 1000);
        consumptionUnit = "m";
        baseCost = comp.qty * (dims.w / 1000) * rate;
      }
      break;
    }
    case "m2": {
      if (comp.areaFunctionKey === "direct") {
        consumptionPerItem = 1;
        consumptionUnit = "m²";
        baseCost = comp.qty * rate;
      } else {
        const area = comp.areaFunctionKey
          ? getArea(comp.areaFunctionKey, dims)
          : (dims.w / 1000) * (dims.h / 1000);
        consumptionPerItem = round4(area);
        consumptionUnit = "m²";
        baseCost = comp.qty * area * rate;
      }
      break;
    }
    default:
      throw new Error(`Unknown manufacturing rate_unit: "${rateUnit}".`);
  }

  return {
    amount: baseCost,
    baseCost,
    wastageCost: 0,
    wastagePct: 0,
    consumptionPerItem,
    totalConsumption: round4(comp.qty * consumptionPerItem),
    consumptionUnit,
    unitPrice: rate,
    pricingBasis: `${rate.toFixed(2)} EGP / ${consumptionUnit}`,
  };
}

function calculateEdgeBand(
  comp: ComponentLike,
  entity: CatalogEntityLike,
  dims: { w: number; h: number; d: number },
  wastageLookup: WastageLookup,
): ComponentCalculationDetails {
  const price = entity.pricePerUnit;

  if (price == null || !Number.isFinite(price) || price < 0) {
    throw new Error(
      `Edge band catalog ${comp.areaFunctionKey ?? "entity"} is missing pricePerUnit (price per linear metre).`,
    );
  }

  if (comp.areaFunctionKey === "direct") {
    const baseCost = comp.qty * price;
    let wastagePct = entity.defaultWastagePct ?? 0;
    const rule = wastageLookup("material", "direct");
    if (rule) wastagePct = rule.pct;

    const amount = applyWastage(baseCost, wastagePct);
    return {
      amount,
      baseCost,
      wastageCost: round2(Math.max(0, amount - baseCost)),
      wastagePct,
      consumptionPerItem: 1,
      totalConsumption: round4(comp.qty),
      consumptionUnit: "m",
      unitPrice: price,
      pricingBasis: `${price.toFixed(2)} EGP / m`,
    };
  }

  if (!comp.areaFunctionKey) {
    throw new Error(
      "Edge band component requires an areaFunctionKey to compute linear metres.",
    );
  }

  // edge_band area function returns linear metres (perimeter)
  const linearMetres = getArea(comp.areaFunctionKey, dims);
  const baseCost = comp.qty * linearMetres * price;

  // Resolve wastage
  let wastagePct = entity.defaultWastagePct ?? 0;
  const rule = wastageLookup("material", comp.areaFunctionKey);
  if (rule) wastagePct = rule.pct;

  const amount = applyWastage(baseCost, wastagePct);
  return {
    amount,
    baseCost,
    wastageCost: round2(Math.max(0, amount - baseCost)),
    wastagePct,
    consumptionPerItem: round4(linearMetres),
    totalConsumption: round4(comp.qty * linearMetres),
    consumptionUnit: "m",
    unitPrice: price,
    pricingBasis: `${price.toFixed(2)} EGP / m`,
  };
}

function calculateVeneer(
  comp: ComponentLike,
  entity: CatalogEntityLike,
  dims: { w: number; h: number; d: number },
  wastageLookup: WastageLookup,
): ComponentCalculationDetails {
  const price = entity.pricePerUnit;

  if (price == null || !Number.isFinite(price) || price < 0) {
    throw new Error(
      `Veneer catalog ${comp.areaFunctionKey ?? "entity"} is missing pricePerUnit (price per m²).`,
    );
  }

  if (comp.areaFunctionKey === "direct") {
    const baseCost = comp.qty * price;
    let wastagePct = entity.defaultWastagePct ?? 0;
    const rule = wastageLookup("material", "direct");
    if (rule) wastagePct = rule.pct;

    const amount = applyWastage(baseCost, wastagePct);
    return {
      amount,
      baseCost,
      wastageCost: round2(Math.max(0, amount - baseCost)),
      wastagePct,
      consumptionPerItem: 1,
      totalConsumption: round4(comp.qty),
      consumptionUnit: "m²",
      unitPrice: price,
      pricingBasis: `${price.toFixed(2)} EGP / m²`,
    };
  }

  if (!comp.areaFunctionKey) {
    throw new Error(
      "Veneer component requires an areaFunctionKey to compute area in m².",
    );
  }

  const area = getArea(comp.areaFunctionKey, dims);
  const baseCost = comp.qty * area * price;

  let wastagePct = entity.defaultWastagePct ?? 0;
  const rule = wastageLookup("material", comp.areaFunctionKey);
  if (rule) wastagePct = rule.pct;

  const amount = applyWastage(baseCost, wastagePct);
  return {
    amount,
    baseCost,
    wastageCost: round2(Math.max(0, amount - baseCost)),
    wastagePct,
    consumptionPerItem: round4(area),
    totalConsumption: round4(comp.qty * area),
    consumptionUnit: "m²",
    unitPrice: price,
    pricingBasis: `${price.toFixed(2)} EGP / m²`,
  };
}

function calculateFinish(
  comp: ComponentLike,
  entity: CatalogEntityLike,
  dims: { w: number; h: number; d: number },
  wastageLookup: WastageLookup,
): ComponentCalculationDetails {
  const price = entity.pricePerUnit;

  if (price == null || !Number.isFinite(price) || price < 0) {
    throw new Error(
      `Finish catalog ${comp.areaFunctionKey ?? "entity"} is missing pricePerUnit (price per m²).`,
    );
  }

  if (comp.areaFunctionKey === "direct") {
    const baseCost = comp.qty * price;
    let wastagePct = entity.defaultWastagePct ?? 0;
    const rule = wastageLookup("material", "direct");
    if (rule) wastagePct = rule.pct;

    const amount = applyWastage(baseCost, wastagePct);
    return {
      amount,
      baseCost,
      wastageCost: round2(Math.max(0, amount - baseCost)),
      wastagePct,
      consumptionPerItem: 1,
      totalConsumption: round4(comp.qty),
      consumptionUnit: "m²",
      unitPrice: price,
      pricingBasis: `${price.toFixed(2)} EGP / m²`,
    };
  }

  if (!comp.areaFunctionKey) {
    throw new Error(
      "Finish component requires an areaFunctionKey to compute area in m².",
    );
  }

  const area = getArea(comp.areaFunctionKey, dims);
  const baseCost = comp.qty * area * price;

  let wastagePct = entity.defaultWastagePct ?? 0;
  const rule = wastageLookup("material", comp.areaFunctionKey);
  if (rule) wastagePct = rule.pct;

  const amount = applyWastage(baseCost, wastagePct);
  return {
    amount,
    baseCost,
    wastageCost: round2(Math.max(0, amount - baseCost)),
    wastagePct,
    consumptionPerItem: round4(area),
    totalConsumption: round4(comp.qty * area),
    consumptionUnit: "m²",
    unitPrice: price,
    pricingBasis: `${price.toFixed(2)} EGP / m²`,
  };
}

// ── Main entry points ──────────────────────────────────────────────────────

/**
 * Compute the full calculation details for a single component.
 */
export function componentAmountDetails(
  comp: ComponentLike,
  entity: CatalogEntityLike,
  dims: { w: number; h: number; d: number },
  wastageLookup: WastageLookup,
): ComponentCalculationDetails {
  if (comp.qty < 0) {
    throw new Error(`Component qty must be >= 0, got ${comp.qty}.`);
  }
  if (comp.qty === 0) {
    return {
      amount: 0,
      baseCost: 0,
      wastageCost: 0,
      wastagePct: 0,
      consumptionPerItem: 0,
      totalConsumption: 0,
      consumptionUnit: comp.unitOfMeasure || "pcs",
      unitPrice: 0,
      pricingBasis: "0.00 EGP",
    };
  }

  switch (comp.kind) {
    case "material":
      return calculateMaterial(comp, entity, dims, wastageLookup);
    case "hardware":
      return calculateHardware(comp, entity);
    case "accessory":
      return calculateAccessory(comp, entity);
    case "manufacturing":
      return calculateManufacturing(comp, entity, dims);
    case "edge_band":
      return calculateEdgeBand(comp, entity, dims, wastageLookup);
    case "veneer":
      return calculateVeneer(comp, entity, dims, wastageLookup);
    case "finish":
      return calculateFinish(comp, entity, dims, wastageLookup);
    default:
      throw new Error(`Unknown component kind: "${comp.kind}".`);
  }
}

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
  return componentAmountDetails(comp, entity, dims, wastageLookup).amount;
}
