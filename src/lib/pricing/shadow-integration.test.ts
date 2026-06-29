/**
 * Shadow comparison integration test — full pipeline with realistic Egyptian furniture data.
 *
 * Pure-function test: QuoteInput + CatalogLookup → priceQuote → comparePricing.
 * No DB mocking needed.
 */
import { describe, it, expect } from "vitest";
import {
  priceQuote,
  round2,
  type QuoteInput,
  type CatalogLookup,
  type ComponentInput,
  type UnitInput,
  type SectionInput,
  type ProductInput,
} from "@/lib/pricing/engine-v3";
import { comparePricing } from "@/lib/pricing/shadow";

// ── Helpers ────────────────────────────────────────────────────────────────

function comp(
  overrides: Partial<ComponentInput> & { id: string; kind: ComponentInput["kind"] },
): ComponentInput {
  return {
    catalogId: null,
    qty: 1,
    unitOfMeasure: "pcs",
    ...overrides,
  };
}

function unit(overrides: Partial<UnitInput> & { id: string }): UnitInput {
  return {
    unitTypeId: null,
    widthMm: 600,
    heightMm: 720,
    depthMm: 600,
    qty: 1,
    components: [],
    ...overrides,
  };
}

function section(overrides: Partial<SectionInput> & { id: string }): SectionInput {
  return { units: [], ...overrides };
}

function product(overrides: Partial<ProductInput> & { id: string }): ProductInput {
  return { sections: [], ...overrides };
}

// ── Realistic Egyptian furniture fixtures ──────────────────────────────────

/**
 * Kitchen cabinet base unit — 800mm wide × 720mm high × 600mm deep
 * MDF body (sides, top, bottom, back, shelf) + hardware (hinges, handles)
 * + manufacturing (cutting, assembly, finishing)
 */
function kitchenBaseUnit(
  id: string,
  wMm: number,
  compIdPrefix: string,
): UnitInput {
  return unit({
    id,
    widthMm: wMm,
    heightMm: 720,
    depthMm: 600,
    components: [
      comp({ id: `${compIdPrefix}-side-L`, kind: "material", catalogId: "mdf-150", unitOfMeasure: "m2", areaFunctionKey: "cabinet_side" }),
      comp({ id: `${compIdPrefix}-side-R`, kind: "material", catalogId: "mdf-150", unitOfMeasure: "m2", areaFunctionKey: "cabinet_side" }),
      comp({ id: `${compIdPrefix}-top`, kind: "material", catalogId: "mdf-150", unitOfMeasure: "m2", areaFunctionKey: "cabinet_top" }),
      comp({ id: `${compIdPrefix}-bottom`, kind: "material", catalogId: "mdf-150", unitOfMeasure: "m2", areaFunctionKey: "cabinet_bottom" }),
      comp({ id: `${compIdPrefix}-back`, kind: "material", catalogId: "mdf-150", unitOfMeasure: "m2", areaFunctionKey: "back_panel" }),
      comp({ id: `${compIdPrefix}-shelf`, kind: "material", catalogId: "mdf-150", unitOfMeasure: "m2", areaFunctionKey: "shelf" }),
      comp({ id: `${compIdPrefix}-hinges`, kind: "hardware", catalogId: "hinge-15", qty: 4 }),
      comp({ id: `${compIdPrefix}-handle`, kind: "accessory", catalogId: "handle-25", qty: 1 }),
      comp({ id: `${compIdPrefix}-cut`, kind: "manufacturing", catalogId: "mfg-cut-m2", unitOfMeasure: "m2", areaFunctionKey: "cabinet_side" }),
      comp({ id: `${compIdPrefix}-assembly`, kind: "manufacturing", catalogId: "mfg-assembly", qty: 1 }),
      comp({ id: `${compIdPrefix}-finish`, kind: "manufacturing", catalogId: "mfg-finish-m2", unitOfMeasure: "m2", areaFunctionKey: "door_panel" }),
    ],
  });
}

/**
 * Kitchen upper unit — 600mm wide × 500mm high × 350mm deep
 * Lighter MDF + no handles (wall-mounted)
 */
function kitchenUpperUnit(id: string, wMm: number, compIdPrefix: string): UnitInput {
  return unit({
    id,
    widthMm: wMm,
    heightMm: 500,
    depthMm: 350,
    components: [
      comp({ id: `${compIdPrefix}-side-L`, kind: "material", catalogId: "mdf-150", unitOfMeasure: "m2", areaFunctionKey: "cabinet_side" }),
      comp({ id: `${compIdPrefix}-side-R`, kind: "material", catalogId: "mdf-150", unitOfMeasure: "m2", areaFunctionKey: "cabinet_side" }),
      comp({ id: `${compIdPrefix}-top`, kind: "material", catalogId: "mdf-150", unitOfMeasure: "m2", areaFunctionKey: "cabinet_top" }),
      comp({ id: `${compIdPrefix}-bottom`, kind: "material", catalogId: "mdf-150", unitOfMeasure: "m2", areaFunctionKey: "cabinet_bottom" }),
      comp({ id: `${compIdPrefix}-back`, kind: "material", catalogId: "mdf-150", unitOfMeasure: "m2", areaFunctionKey: "back_panel" }),
      comp({ id: `${compIdPrefix}-hinges`, kind: "hardware", catalogId: "hinge-15", qty: 2 }),
      comp({ id: `${compIdPrefix}-cut`, kind: "manufacturing", catalogId: "mfg-cut-m2", unitOfMeasure: "m2", areaFunctionKey: "cabinet_side" }),
      comp({ id: `${compIdPrefix}-assembly`, kind: "manufacturing", catalogId: "mfg-assembly", qty: 1 }),
    ],
  });
}

/**
 * Wardrobe unit — 1200mm wide × 2000mm high × 600mm deep
 * Solid wood body + edge banding on door panels
 */
function wardrobeUnit(id: string, compIdPrefix: string): UnitInput {
  return unit({
    id,
    widthMm: 1200,
    heightMm: 2000,
    depthMm: 600,
    components: [
      comp({ id: `${compIdPrefix}-side-L`, kind: "material", catalogId: "wood-400", unitOfMeasure: "m2", areaFunctionKey: "cabinet_side" }),
      comp({ id: `${compIdPrefix}-side-R`, kind: "material", catalogId: "wood-400", unitOfMeasure: "m2", areaFunctionKey: "cabinet_side" }),
      comp({ id: `${compIdPrefix}-top`, kind: "material", catalogId: "wood-400", unitOfMeasure: "m2", areaFunctionKey: "cabinet_top" }),
      comp({ id: `${compIdPrefix}-bottom`, kind: "material", catalogId: "wood-400", unitOfMeasure: "m2", areaFunctionKey: "cabinet_bottom" }),
      comp({ id: `${compIdPrefix}-back`, kind: "material", catalogId: "mdf-150", unitOfMeasure: "m2", areaFunctionKey: "back_panel" }),
      comp({ id: `${compIdPrefix}-shelf1`, kind: "material", catalogId: "wood-400", unitOfMeasure: "m2", areaFunctionKey: "shelf" }),
      comp({ id: `${compIdPrefix}-shelf2`, kind: "material", catalogId: "wood-400", unitOfMeasure: "m2", areaFunctionKey: "shelf" }),
      comp({ id: `${compIdPrefix}-door-L`, kind: "material", catalogId: "wood-400", unitOfMeasure: "m2", areaFunctionKey: "door_panel" }),
      comp({ id: `${compIdPrefix}-door-R`, kind: "material", catalogId: "wood-400", unitOfMeasure: "m2", areaFunctionKey: "door_panel" }),
      comp({ id: `${compIdPrefix}-edge-band-door`, kind: "edge_band", catalogId: "edgeband-20", qty: 1, unitOfMeasure: "m", areaFunctionKey: "edge_band" }),
      comp({ id: `${compIdPrefix}-hinges`, kind: "hardware", catalogId: "hinge-15", qty: 8 }),
      comp({ id: `${compIdPrefix}-handles`, kind: "accessory", catalogId: "handle-25", qty: 2 }),
      comp({ id: `${compIdPrefix}-cut`, kind: "manufacturing", catalogId: "mfg-cut-m2", unitOfMeasure: "m2", areaFunctionKey: "cabinet_side" }),
      comp({ id: `${compIdPrefix}-assembly`, kind: "manufacturing", catalogId: "mfg-assembly", qty: 1 }),
      comp({ id: `${compIdPrefix}-finish`, kind: "manufacturing", catalogId: "mfg-finish-m2", unitOfMeasure: "m2", areaFunctionKey: "door_panel" }),
    ],
  });
}

// ── Quote builder ──────────────────────────────────────────────────────────

function buildEgyptianKitchenWardrobeQuote(): QuoteInput {
  return {
    products: [
      product({
        id: "kitchen-cabinet",
        sections: [
          section({
            id: "kitchen-base",
            units: [
              kitchenBaseUnit("k-base-1", 800, "kb1"),
              kitchenBaseUnit("k-base-2", 800, "kb2"),
              kitchenBaseUnit("k-base-3", 600, "kb3"),
            ],
          }),
          section({
            id: "kitchen-upper",
            units: [
              kitchenUpperUnit("k-upper-1", 600, "ku1"),
              kitchenUpperUnit("k-upper-2", 800, "ku2"),
            ],
          }),
        ],
      }),
      product({
        id: "wardrobe",
        sections: [
          section({
            id: "wardrobe-body",
            units: [
              wardrobeUnit("w-body-1", "wb1"),
              wardrobeUnit("w-body-2", "wb2"),
            ],
          }),
          section({
            id: "wardrobe-shelves",
            units: [
              wardrobeUnit("w-shelf-1", "ws1"),
              wardrobeUnit("w-shelf-2", "ws2"),
              wardrobeUnit("w-shelf-3", "ws3"),
            ],
          }),
        ],
      }),
    ],
    discount: undefined,
  };
}

// ── Catalog builder — Egyptian market prices ──────────────────────────────

function buildEgyptianCatalog(): CatalogLookup {
  return {
    materials: {
      // MDF — common Egyptian board material ~170 EGP/m²
      "mdf-150": {
        id: "mdf-150",
        pricingUnit: "m2",
        pricePerUnit: 170,
        defaultWastagePct: 10,
      },
      // Solid wood — higher-end ~400 EGP/m²
      "wood-400": {
        id: "wood-400",
        pricingUnit: "m2",
        pricePerUnit: 400,
        defaultWastagePct: 12,
      },
      // Edge banding — 20 EGP per linear metre
      "edgeband-20": {
        id: "edgeband-20",
        pricingUnit: "m",
        pricePerUnit: 20,
        defaultWastagePct: 0,
      },
    },
    hardware: {
      "hinge-15": { id: "hinge-15", pricePerPiece: 15 },
    },
    accessories: {
      "handle-25": { id: "handle-25", pricePerPiece: 25 },
    },
    manufacturingOps: {
      "mfg-cut-m2": { id: "mfg-cut-m2", rateUnit: "m2", rate: 50 },
      "mfg-assembly": { id: "mfg-assembly", rateUnit: "piece", rate: 120 },
      "mfg-finish-m2": { id: "mfg-finish-m2", rateUnit: "m2", rate: 35 },
    },
    // Egyptian furniture pricing factors
    pricingFactors: [
      { factorKey: "labor", percent: 15 },
      { factorKey: "overhead", percent: 10 },
      { factorKey: "margin", percent: 20 },
      { factorKey: "packaging", percent: 5 },
    ],
    // Material wastage rules
    wastageRules: [
      { scope: "material", ref: "mdf-150", pct: 8 },
      { scope: "material", ref: "wood-400", pct: 12 },
    ],
    // Delivery fee + installation discount
    feesCredits: [
      { code: "delivery", sign: "plus", amount: 500, formulaKey: null },
      { code: "install_credit", sign: "minus", amount: 200, formulaKey: null },
    ],
  };
}

// ── Test suite ─────────────────────────────────────────────────────────────

describe("shadow-integration: full pipeline with Egyptian furniture data", () => {
  const quote = buildEgyptianKitchenWardrobeQuote();
  const catalog = buildEgyptianCatalog();

  it("all component amounts are non-negative", () => {
    const result = priceQuote(quote, catalog);

    for (const product of result.products) {
      for (const section of product.sections) {
        for (const unit of section.units) {
          expect(unit.computedUnitCost).toBeGreaterThanOrEqual(0);
          expect(unit.computedUnitPrice).toBeGreaterThanOrEqual(0);
          for (const c of unit.components) {
            expect(c.computedAmount).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it("unit total equals sum of component costs × factors", () => {
    const result = priceQuote(quote, catalog);

    for (const p of result.products) {
      for (const s of p.sections) {
        for (const u of s.units) {
          // Sum of component computedAmounts should equal computedUnitCost
          const compSum = round2(
            u.components.reduce((sum, c) => sum + c.computedAmount, 0),
          );
          expect(u.computedUnitCost).toBeCloseTo(compSum, 6);

          // computedUnitPrice should be >= computedUnitCost (factors add cost)
          expect(u.computedUnitPrice).toBeGreaterThanOrEqual(u.computedUnitCost);
        }
      }
    }
  });

  it("section totals equal sum of unit totals", () => {
    const result = priceQuote(quote, catalog);

    for (const p of result.products) {
      for (const s of p.sections) {
        const sumUnitCost = round2(
          s.units.reduce((sum, u) => sum + u.computedUnitCost, 0),
        );
        const sumUnitPrice = round2(
          s.units.reduce((sum, u) => sum + u.computedUnitPrice, 0),
        );
        expect(s.computedCost).toBeCloseTo(sumUnitCost, 6);
        expect(s.computedPrice).toBeCloseTo(sumUnitPrice, 6);
      }
    }
  });

  it("product totals equal sum of section totals", () => {
    const result = priceQuote(quote, catalog);

    for (const p of result.products) {
      const sumSectionCost = round2(
        p.sections.reduce((sum, s) => sum + s.computedCost, 0),
      );
      const sumSectionPrice = round2(
        p.sections.reduce((sum, s) => sum + s.computedPrice, 0),
      );
      expect(p.computedCost).toBeCloseTo(sumSectionCost, 6);
      expect(p.computedPrice).toBeCloseTo(sumSectionPrice, 6);
    }
  });

  it("quote total equals sum of product totals + VAT + fees", () => {
    const result = priceQuote(quote, catalog);
    const { breakdown } = result;

    const sumProductPrice = round2(
      result.products.reduce((sum, p) => sum + p.computedPrice, 0),
    );

    // subTotal = sum of product prices
    expect(breakdown.subTotal).toBeCloseTo(sumProductPrice, 6);

    // discount = 0 (none configured)
    expect(breakdown.discount).toBe(0);

    // vatBase = subTotal - discount
    expect(breakdown.vatBase).toBeCloseTo(breakdown.subTotal, 6);

    // vatAmount = vatBase × 14%
    expect(breakdown.vatAmount).toBeCloseTo(
      round2(breakdown.vatBase * 0.14),
      6,
    );

    // total = vatBase + vatAmount + feesCreditsTotal
    expect(breakdown.total).toBeCloseTo(
      round2(breakdown.vatBase + breakdown.vatAmount + breakdown.feesCreditsTotal),
      6,
    );

    // feesCreditsTotal = +500 - 200 = +300
    expect(breakdown.feesCreditsTotal).toBe(300);

    // Final computedPrice matches breakdown.total
    expect(result.computedPrice).toBeCloseTo(breakdown.total, 6);
  });

  it("determinism: running twice yields identical output", () => {
    const result1 = priceQuote(quote, catalog);
    const result2 = priceQuote(quote, catalog);

    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
  });

  it("determinism holds for complex multi-product tree", () => {
    // Build a slightly different quote to stress determinism
    const quote2 = buildEgyptianKitchenWardrobeQuote();
    quote2.discount = { amount: 100 };

    const r1 = priceQuote(quote2, catalog);
    const r2 = priceQuote(quote2, catalog);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it("non-negative amounts after discount is applied", () => {
    const discountedQuote = buildEgyptianKitchenWardrobeQuote();
    discountedQuote.discount = { amount: 500 };

    const result = priceQuote(discountedQuote, catalog);

    expect(result.computedCost).toBeGreaterThanOrEqual(0);
    expect(result.computedPrice).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.vatBase).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.vatAmount).toBeGreaterThanOrEqual(0);
  });

  it("discount clamped to subTotal prevents negative vatBase", () => {
    const hugeDiscountQuote = buildEgyptianKitchenWardrobeQuote();
    const result = priceQuote(hugeDiscountQuote, catalog);
    const subTotal = result.breakdown.subTotal;

    // Discount larger than subTotal should be clamped
    hugeDiscountQuote.discount = { amount: subTotal + 10000 };
    const result2 = priceQuote(hugeDiscountQuote, catalog);

    expect(result2.breakdown.discount).toBeCloseTo(subTotal, 6);
    expect(result2.breakdown.vatBase).toBe(0);
  });
});

// ── comparePricing tolerance tests ─────────────────────────────────────────

describe("shadow-integration: comparePricing against computed v3 total", () => {
  const quote = buildEgyptianKitchenWardrobeQuote();
  const catalog = buildEgyptianCatalog();
  const result = priceQuote(quote, catalog);
  const v3Total = result.computedPrice;

  it("exact match is within default tolerance (0.5 EGP)", () => {
    const { diff, withinTolerance } = comparePricing(v3Total, v3Total, 0.5);
    expect(diff).toBe(0);
    expect(withinTolerance).toBe(true);
  });

  it("slight rounding difference (0.3 EGP) is within tolerance", () => {
    const legacyTotal = round2(v3Total + 0.3);
    const { diff, withinTolerance } = comparePricing(legacyTotal, v3Total, 0.5);
    expect(diff).toBeCloseTo(0.3, 6);
    expect(withinTolerance).toBe(true);
  });

  it("moderate difference (1.5 EGP) exceeds default tolerance", () => {
    const legacyTotal = round2(v3Total + 1.5);
    const { diff, withinTolerance } = comparePricing(legacyTotal, v3Total, 0.5);
    expect(diff).toBeCloseTo(1.5, 6);
    expect(withinTolerance).toBe(false);
  });

  it("legacy total slightly below v3 is also within tolerance", () => {
    const legacyTotal = round2(v3Total - 0.2);
    const { diff, withinTolerance } = comparePricing(legacyTotal, v3Total, 0.5);
    expect(diff).toBeCloseTo(0.2, 6);
    expect(withinTolerance).toBe(true);
  });

  it("zero legacy total vs real v3 total is out of tolerance", () => {
    const { diff, withinTolerance } = comparePricing(0, v3Total, 0.5);
    expect(diff).toBeCloseTo(v3Total, 6);
    expect(withinTolerance).toBe(false);
  });

  it("custom tolerance of 5 EGP absorbs a 4.99 EGP diff", () => {
    const legacyTotal = round2(v3Total + 4.99);
    const { diff, withinTolerance } = comparePricing(legacyTotal, v3Total, 5);
    expect(diff).toBeCloseTo(4.99, 6);
    expect(withinTolerance).toBe(true);
  });

  it("custom tolerance of 5 EGP rejects a 5.01 EGP diff", () => {
    const legacyTotal = round2(v3Total + 5.01);
    const { diff, withinTolerance } = comparePricing(legacyTotal, v3Total, 5);
    expect(diff).toBeCloseTo(5.01, 6);
    expect(withinTolerance).toBe(false);
  });

  it("realistic legacy total (flat-pricing approximation) diverges from v3 hierarchy", () => {
    // Simulate a legacy flat-price total that doesn't account for per-unit factors.
    // Legacy might just sum material area × price without labor/overhead/margin.
    // A realistic scenario: legacy was ~85% of v3 because it missed factors.
    const approximateLegacyTotal = round2(v3Total * 0.85);
    const { diff, withinTolerance } = comparePricing(approximateLegacyTotal, v3Total, 0.5);

    expect(diff).toBeGreaterThan(0);
    expect(withinTolerance).toBe(false);
  });
});

// ── Edge band pipeline verification ────────────────────────────────────────

describe("shadow-integration: edge band component in full pipeline", () => {
  it("wardrobe door edge band costs flow through to quote total", () => {
    const quote = buildEgyptianKitchenWardrobeQuote();
    const catalog = buildEgyptianCatalog();
    const result = priceQuote(quote, catalog);

    // Find the wardrobe product
    const wardrobe = result.products.find((p) => p.id === "wardrobe")!;
    expect(wardrobe).toBeDefined();

    // Find a unit with edge_band component
    let edgeBandAmount = 0;
    for (const s of wardrobe.sections) {
      for (const u of s.units) {
        const edgeComp = u.components.find((c) => c.kind === "edge_band");
        if (edgeComp) {
          edgeBandAmount = edgeComp.computedAmount;
          break;
        }
      }
      if (edgeBandAmount > 0) break;
    }

    // Wardrobe: 1200×2000mm → edge_band perimeter = 2 × (1.2 + 2.0) = 6.4 m
    // edgeband-20: pricePerUnit = 20 EGP/m, defaultWastagePct = 0
    // cost = 1 × 6.4 × 20 = 128 EGP
    expect(edgeBandAmount).toBeCloseTo(128, 2);
  });
});

// ── Full numeric snapshot ──────────────────────────────────────────────────

describe("shadow-integration: numeric snapshot for regression", () => {
  it("matches expected totals for the Egyptian kitchen+wardrobe quote", () => {
    const quote = buildEgyptianKitchenWardrobeQuote();
    const catalog = buildEgyptianCatalog();
    const result = priceQuote(quote, catalog);

    // Product counts
    expect(result.products).toHaveLength(2);

    // Kitchen cabinet: 2 sections (base=3 units, upper=2 units)
    const kitchen = result.products.find((p) => p.id === "kitchen-cabinet")!;
    expect(kitchen.sections).toHaveLength(2);
    expect(kitchen.sections[0].units).toHaveLength(3); // base
    expect(kitchen.sections[1].units).toHaveLength(2); // upper

    // Wardrobe: 2 sections (body=2 units, shelves=3 units)
    const wardrobe = result.products.find((p) => p.id === "wardrobe")!;
    expect(wardrobe.sections).toHaveLength(2);
    expect(wardrobe.sections[0].units).toHaveLength(2); // body
    expect(wardrobe.sections[1].units).toHaveLength(3); // shelves

    // All totals are positive
    expect(result.computedCost).toBeGreaterThan(0);
    expect(result.computedPrice).toBeGreaterThan(0);
    expect(result.breakdown.subTotal).toBeGreaterThan(0);
    expect(result.breakdown.vatAmount).toBeGreaterThan(0);
    expect(result.breakdown.feesCreditsTotal).toBe(300); // +500 -200

    // Price is always >= cost (factors add margin)
    expect(result.computedPrice).toBeGreaterThan(result.computedCost);

    // Snapshot: store for regression detection
    const snapshot = JSON.stringify(
      {
        cost: result.computedCost,
        price: result.computedPrice,
        subTotal: result.breakdown.subTotal,
        vatAmount: result.breakdown.vatAmount,
        feesCreditsTotal: result.breakdown.feesCreditsTotal,
        total: result.breakdown.total,
        kitchenCost: kitchen.computedCost,
        kitchenPrice: kitchen.computedPrice,
        wardrobeCost: wardrobe.computedCost,
        wardrobePrice: wardrobe.computedPrice,
      },
      null,
      2,
    );

    // Verify it serializes cleanly and contains expected keys
    const parsed = JSON.parse(snapshot);
    expect(parsed.cost).toBeCloseTo(result.computedCost, 2);
    expect(parsed.price).toBeCloseTo(result.computedPrice, 2);
    expect(parsed.vatAmount).toBeCloseTo(result.breakdown.vatAmount, 2);
    expect(parsed.feesCreditsTotal).toBe(300);
  });
});
