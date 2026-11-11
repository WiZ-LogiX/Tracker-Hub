import { describe, it, expect } from "vitest";
import { priceQuote, round2, type CatalogLookup, type QuoteInput, type UnitInput } from "./engine-v3";
import { applyUnitFactors, computeQuoteBreakdown, FACTOR_ORDER, VAT_RATE } from "./factors";
import { componentAmount, type ComponentLike, type CatalogEntityLike } from "./componentAmount";
import { computeProfitAndMargin } from "../cost-analysis-types";

function makeMinimalCatalog(overrides: Partial<CatalogLookup> = {}): CatalogLookup {
  return {
    materials: {
      "mat-mdf-18": {
        id: "mat-mdf-18",
        pricingUnit: "m2",
        pricePerUnit: 200,
        defaultWastagePct: 10,
      },
      "mat-oak-board": {
        id: "mat-oak-board",
        pricingUnit: "pcs",
        pricePerUnit: 1500,
        defaultWastagePct: 0,
        coefficient: 1.2,
        boardPrice: 1000,
      },
    },
    hardware: {
      "hw-hinge": {
        id: "hw-hinge",
        pricePerPiece: 25,
      },
    },
    accessories: {
      "acc-handle": {
        id: "acc-handle",
        pricePerPiece: 50,
      },
    },
    manufacturingOps: {
      "op-cut": {
        id: "op-cut",
        rateUnit: "piece",
        rate: 30,
      },
      "op-cnc": {
        id: "op-cnc",
        rateUnit: "m2",
        rate: 40,
      },
    },
    veneers: {
      "ven-walnut": {
        id: "ven-walnut",
        pricingUnit: "m2",
        pricePerUnit: 120,
        defaultWastagePct: 0,
      },
    },
    finishes: {
      "fin-poly": {
        id: "fin-poly",
        pricingUnit: "m2",
        pricePerUnit: 80,
        defaultWastagePct: 0,
      },
    },
    edgeBands: {
      "eb-pvc": {
        id: "eb-pvc",
        pricingUnit: "m",
        pricePerUnit: 15,
        defaultWastagePct: 5,
      },
    },
    pricingFactors: [
      { factorKey: "labor", percent: 15 },
      { factorKey: "overhead", percent: 10 },
      { factorKey: "margin", percent: 25 },
    ],
    wastageRules: [
      { scope: "material", ref: "mat-mdf-18", pct: 12 },
    ],
    feesCredits: [],
    ...overrides,
  };
}

describe("Task 19 — V2 Quotation Builder & Pricing Accuracy Hardening", () => {
  // ── 1. Unit Multiplier (u.qty) Verification ───────────────────────────────
  describe("1. Unit Multipliers and Quantity Scaling", () => {
    it("correctly multiplies unit cost and selling price by unit quantity in section", () => {
      const catalog = makeMinimalCatalog();

      const unitWithQty3: UnitInput = {
        id: "unit-base-60",
        unitTypeId: "base-cabinet",
        widthMm: 600,
        heightMm: 720,
        depthMm: 600,
        qty: 3, // 3 identical units
        components: [
          {
            id: "c-hinge",
            kind: "hardware",
            catalogId: "hw-hinge",
            qty: 4, // 4 hinges per unit
            unitOfMeasure: "pcs",
          },
        ],
      };

      const quote: QuoteInput = {
        products: [
          {
            id: "prod-kitchen",
            sections: [
              {
                id: "sec-base",
                units: [unitWithQty3],
              },
            ],
          },
        ],
      };

      const result = priceQuote(quote, catalog);
      const unitOut = result.products[0].sections[0].units[0];
      const sectionOut = result.products[0].sections[0];
      const productOut = result.products[0];

      // Single unit cost: 4 hinges × 25 = 100 EGP
      expect(unitOut.computedUnitCost).toBe(100);

      // Unit factors: labor (15%) + overhead (10%) + margin (25%) = 50%
      // 100 + 50 = 150 EGP per unit
      expect(unitOut.computedUnitPrice).toBe(150);

      // Line total for 3 units:
      expect(unitOut.qty).toBe(3);
      expect(unitOut.computedTotalCost).toBe(300);
      expect(unitOut.computedTotalPrice).toBe(450);

      // Section total must be multiplied by qty = 3!
      expect(sectionOut.computedCost).toBe(300);
      expect(sectionOut.computedPrice).toBe(450);

      // Product and Quote total
      expect(productOut.computedCost).toBe(300);
      expect(productOut.computedPrice).toBe(450);
      expect(result.computedCost).toBe(300);
      expect(result.breakdown.subTotal).toBe(450);
    });
  });

  // ── 2. Fallback Area Key for Custom Components ───────────────────────────
  describe("2. Fallback Area Calculation for Custom Components", () => {
    it("prices m2 material without explicit areaFunctionKey using width × height fallback", () => {
      const catalog = makeMinimalCatalog();

      const unit: UnitInput = {
        id: "unit-custom",
        unitTypeId: null,
        widthMm: 1000,
        heightMm: 2000,
        depthMm: 600,
        qty: 1,
        components: [
          {
            id: "comp-custom-mdf",
            kind: "material",
            catalogId: "mat-mdf-18",
            qty: 1,
            unitOfMeasure: "m2",
            areaFunctionKey: null, // No predefined template
          },
        ],
      };

      const quote: QuoteInput = {
        products: [
          {
            id: "p1",
            sections: [{ id: "s1", units: [unit] }],
          },
        ],
      };

      const result = priceQuote(quote, catalog);
      const compOut = result.products[0].sections[0].units[0].components[0];

      // Area = (1000/1000) × (2000/1000) = 2.0 m²
      // Material base: 2.0 × 200 = 400 EGP
      // Wastage: 10% default wastage (or wastage rule) = 440 EGP
      expect(compOut.computedAmount).toBeGreaterThan(0);
      expect(compOut.computedAmount).toBe(440); // 400 * 1.10
    });
  });

  // ── 3. Wastage Application ───────────────────────────────────────────────
  describe("3. Wastage Application Accuracy", () => {
    it.each([0, 5, 10, 15, 100])("applies %d% wastage exactly once on materials", (wastagePct) => {
      const comp: ComponentLike = {
        kind: "material",
        qty: 2,
        unitOfMeasure: "pcs",
        areaFunctionKey: null,
      };
      const entity: CatalogEntityLike = {
        pricingUnit: "pcs",
        pricePerUnit: 100,
        defaultWastagePct: wastagePct,
      };

      const res = componentAmount(comp, entity, { w: 600, h: 720, d: 600 }, () => null);
      const expected = round2(200 * (1 + wastagePct / 100));
      expect(round2(res)).toBe(expected);
    });

    it("does not apply wastage to hardware or accessories", () => {
      const hwComp: ComponentLike = { kind: "hardware", qty: 4, unitOfMeasure: "pcs" };
      const hwEntity: CatalogEntityLike = { pricePerPiece: 25 };
      expect(componentAmount(hwComp, hwEntity, { w: 600, h: 720, d: 600 }, () => null)).toBe(100);

      const accComp: ComponentLike = { kind: "accessory", qty: 2, unitOfMeasure: "pcs" };
      const accEntity: CatalogEntityLike = { pricePerPiece: 50 };
      expect(componentAmount(accComp, accEntity, { w: 600, h: 720, d: 600 }, () => null)).toBe(100);
    });
  });

  // ── 4. Pricing Factors & Factor Order ────────────────────────────────────
  describe("4. Pricing Factors & Locked Order Invariant", () => {
    it("applies factors in invariant order on base cost", () => {
      const baseCost = 1000;
      const factors = [
        { factorKey: "rush", percent: 10 },
        { factorKey: "labor", percent: 20 },
        { factorKey: "margin", percent: 30 },
      ];

      const res = applyUnitFactors(baseCost, factors);

      // Locked order: labor (200) -> rush (100) -> margin (300)
      expect(res.baseCost).toBe(1000);
      expect(res.finalPrice).toBe(1600); // 1000 + 200 + 100 + 300
      expect(res.lines.map((l) => l.factorKey)).toEqual(["labor", "rush", "margin"]);
    });

    it("supports unit-level factor overrides", () => {
      const baseCost = 1000;
      const factors = [{ factorKey: "margin", percent: 20 }];
      const overrides = { margin: 35 }; // Override margin to 35%

      const res = applyUnitFactors(baseCost, factors, overrides);
      expect(res.finalPrice).toBe(1350);
    });
  });

  // ── 5. Margin vs Discount ────────────────────────────────────────────────
  describe("5. Margin vs Discount Separation", () => {
    it("distinguishes manufacturing cost from discount and computes gross margin correctly", () => {
      const subTotal = 10000; // Total selling price of units
      const discount = { amount: 1000, maxValue: null }; // 1,000 EGP discount
      const breakdown = computeQuoteBreakdown(subTotal, discount, []);

      expect(breakdown.subTotal).toBe(10000);
      expect(breakdown.discount).toBe(1000);
      expect(breakdown.vatBase).toBe(9000);
      expect(breakdown.vatAmount).toBe(1260); // 9000 × 14%
      expect(breakdown.total).toBe(10260); // 9000 + 1260

      // Cost analysis profit and margin
      const totalManufacturingCost = 6000;
      const sellingPriceBeforeVat = Math.max(0, breakdown.subTotal - breakdown.discount); // 9000
      const { grossProfit, grossMarginPct } = computeProfitAndMargin(sellingPriceBeforeVat, totalManufacturingCost);

      expect(grossProfit).toBe(3000); // 9000 - 6000
      expect(grossMarginPct).toBeCloseTo(33.33, 1); // (3000 / 9000) * 100
    });
  });

  // ── 6. VAT Calculation ───────────────────────────────────────────────────
  describe("6. VAT (14%) Accuracy", () => {
    it("calculates 14% VAT strictly on the post-discount taxable amount", () => {
      const breakdown1 = computeQuoteBreakdown(5000, { amount: 0, maxValue: null }, []);
      expect(breakdown1.vatAmount).toBe(700); // 5000 * 0.14
      expect(breakdown1.total).toBe(5700);

      const breakdown2 = computeQuoteBreakdown(5000, { amount: 1000, maxValue: null }, []);
      expect(breakdown2.vatAmount).toBe(560); // 4000 * 0.14
      expect(breakdown2.total).toBe(4560);
    });
  });

  // ── 7. Rounding & Floating-Point Stability ───────────────────────────────
  describe("7. Rounding Stability", () => {
    it.each([
      [0.1, 0.1],
      [0.3, 0.3],
      [1.006, 1.01],
      [12.345, 12.35],
      [99.999, 100],
      [1234.567, 1234.57],
    ])("round2(%f) produces %f deterministically", (input, expected) => {
      expect(round2(input)).toBe(expected);
    });
  });

  // ── 8. Multi-Product & Multi-Section Consistency ─────────────────────────
  describe("8. Multi-Product and Multi-Section Tree Consistency", () => {
    it("produces identical byte-deterministic output regardless of product/section input order", () => {
      const catalog = makeMinimalCatalog();

      const unitA: UnitInput = {
        id: "u-a",
        unitTypeId: null,
        widthMm: 600,
        heightMm: 720,
        depthMm: 600,
        qty: 2,
        components: [{ id: "c1", kind: "hardware", catalogId: "hw-hinge", qty: 2, unitOfMeasure: "pcs" }],
      };

      const unitB: UnitInput = {
        id: "u-b",
        unitTypeId: null,
        widthMm: 800,
        heightMm: 720,
        depthMm: 600,
        qty: 1,
        components: [{ id: "c2", kind: "accessory", catalogId: "acc-handle", qty: 2, unitOfMeasure: "pcs" }],
      };

      const quote1: QuoteInput = {
        products: [
          { id: "p1", sections: [{ id: "s1", units: [unitA] }] },
          { id: "p2", sections: [{ id: "s2", units: [unitB] }] },
        ],
      };

      const quote2: QuoteInput = {
        products: [
          { id: "p2", sections: [{ id: "s2", units: [unitB] }] },
          { id: "p1", sections: [{ id: "s1", units: [unitA] }] },
        ],
      };

      const res1 = priceQuote(quote1, catalog);
      const res2 = priceQuote(quote2, catalog);

      expect(res1.computedCost).toBe(res2.computedCost);
      expect(res1.computedPrice).toBe(res2.computedPrice);
      expect(res1.breakdown.total).toBe(res2.breakdown.total);
    });
  });
});
