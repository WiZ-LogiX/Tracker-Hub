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

// ── Test fixtures ────────────────────────────────────────────────────────────

const BASE_CABINET_DIMS = { w: 600, h: 720, d: 600 };

const EMPTY_CATALOG: CatalogLookup = {
  materials: {},
  hardware: {},
  accessories: {},
  manufacturingOps: {},
  pricingFactors: [],
  wastageRules: [],
  feesCredits: [],
};

function makeCatalog(overrides: Partial<CatalogLookup> = {}): CatalogLookup {
  return { ...EMPTY_CATALOG, ...overrides };
}

function makeComponent(
  overrides: Partial<ComponentInput> & { id: string; kind: ComponentInput["kind"] },
): ComponentInput {
  return {
    catalogId: null,
    qty: 1,
    unitOfMeasure: "pcs",
    ...overrides,
  };
}

function makeUnit(overrides: Partial<UnitInput> & { id: string }): UnitInput {
  return {
    unitTypeId: null,
    widthMm: BASE_CABINET_DIMS.w,
    heightMm: BASE_CABINET_DIMS.h,
    depthMm: BASE_CABINET_DIMS.d,
    qty: 1,
    components: [],
    ...overrides,
  };
}

function makeSection(overrides: Partial<SectionInput> & { id: string }): SectionInput {
  return { units: [], ...overrides };
}

function makeProduct(overrides: Partial<ProductInput> & { id: string }): ProductInput {
  return { sections: [], ...overrides };
}

// ── Component cost resolution ────────────────────────────────────────────────

describe("engine-v3", () => {
  describe("material component — area-based (m2)", () => {
    it("computes cost from area × price_per_unit", () => {
      const catalog = makeCatalog({
        materials: {
          "mat-1": {
            id: "mat-1",
            pricingUnit: "m2",
            pricePerUnit: 100, // 100 EGP per m2
            defaultWastagePct: 0,
          },
        },
      });

      const comp = makeComponent({
        id: "c1",
        kind: "material",
        catalogId: "mat-1",
        qty: 1,
        unitOfMeasure: "m2",
        areaFunctionKey: "cabinet_side",
      });

      const unit = makeUnit({ id: "u1", components: [comp] });
      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] })],
      };

      const result = priceQuote(quote, catalog);

      // cabinet_side: 0.600 × 0.720 = 0.432 m2 × 100 = 43.2
      expect(result.products[0].sections[0].units[0].components[0].computedAmount).toBeCloseTo(43.2, 2);
    });
  });

  describe("material component — quantity-based (pcs)", () => {
    it("computes cost from qty × price_per_unit", () => {
      const catalog = makeCatalog({
        materials: {
          "mat-2": {
            id: "mat-2",
            pricingUnit: "pcs",
            pricePerUnit: 25,
            defaultWastagePct: 0,
          },
        },
      });

      const comp = makeComponent({
        id: "c1",
        kind: "material",
        catalogId: "mat-2",
        qty: 4,
        unitOfMeasure: "pcs",
      });

      const unit = makeUnit({ id: "u1", components: [comp] });
      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] })],
      };

      const result = priceQuote(quote, catalog);

      // 4 × 25 = 100
      expect(result.products[0].sections[0].units[0].components[0].computedAmount).toBe(100);
    });
  });

  describe("material wastage", () => {
    it("applies default_wastage_pct from material catalog", () => {
      const catalog = makeCatalog({
        materials: {
          "mat-1": {
            id: "mat-1",
            pricingUnit: "pcs",
            pricePerUnit: 100,
            defaultWastagePct: 10, // 10% wastage
          },
        },
      });

      const comp = makeComponent({
        id: "c1",
        kind: "material",
        catalogId: "mat-1",
        qty: 1,
      });

      const unit = makeUnit({ id: "u1", components: [comp] });
      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] })],
      };

      const result = priceQuote(quote, catalog);

      // 100 × 1.10 = 110
      expect(result.products[0].sections[0].units[0].components[0].computedAmount).toBeCloseTo(110, 2);
    });
  });

  describe("hardware component", () => {
    it("computes cost from qty × price_per_piece", () => {
      const catalog = makeCatalog({
        hardware: {
          "hw-1": { id: "hw-1", pricePerPiece: 15 },
        },
      });

      const comp = makeComponent({
        id: "c1",
        kind: "hardware",
        catalogId: "hw-1",
        qty: 6,
      });

      const unit = makeUnit({ id: "u1", components: [comp] });
      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] })],
      };

      const result = priceQuote(quote, catalog);

      // 6 × 15 = 90
      expect(result.products[0].sections[0].units[0].components[0].computedAmount).toBe(90);
    });
  });

  describe("accessory component", () => {
    it("computes cost from qty × price_per_piece", () => {
      const catalog = makeCatalog({
        accessories: {
          "acc-1": { id: "acc-1", pricePerPiece: 50 },
        },
      });

      const comp = makeComponent({
        id: "c1",
        kind: "accessory",
        catalogId: "acc-1",
        qty: 2,
      });

      const unit = makeUnit({ id: "u1", components: [comp] });
      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] })],
      };

      const result = priceQuote(quote, catalog);

      // 2 × 50 = 100
      expect(result.products[0].sections[0].units[0].components[0].computedAmount).toBe(100);
    });
  });

  describe("manufacturing component", () => {
    it("piece rate: qty × rate", () => {
      const catalog = makeCatalog({
        manufacturingOps: {
          "mfg-1": { id: "mfg-1", rateUnit: "piece", rate: 30 },
        },
      });

      const comp = makeComponent({
        id: "c1",
        kind: "manufacturing",
        catalogId: "mfg-1",
        qty: 2,
        unitOfMeasure: "pcs",
      });

      const unit = makeUnit({ id: "u1", components: [comp] });
      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] })],
      };

      const result = priceQuote(quote, catalog);

      // 2 × 30 = 60
      expect(result.products[0].sections[0].units[0].components[0].computedAmount).toBe(60);
    });

    it("m2 rate with area_function_key: area × qty × rate", () => {
      const catalog = makeCatalog({
        manufacturingOps: {
          "mfg-2": { id: "mfg-2", rateUnit: "m2", rate: 20 },
        },
      });

      const comp = makeComponent({
        id: "c1",
        kind: "manufacturing",
        catalogId: "mfg-2",
        qty: 1,
        unitOfMeasure: "m2",
        areaFunctionKey: "cabinet_side",
      });

      const unit = makeUnit({ id: "u1", components: [comp] });
      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] })],
      };

      const result = priceQuote(quote, catalog);

      // cabinet_side: 0.432 m2 × 1 × 20 = 8.64
      expect(result.products[0].sections[0].units[0].components[0].computedAmount).toBeCloseTo(8.64, 2);
    });

    it("m rate: (w/1000) × qty × rate", () => {
      const catalog = makeCatalog({
        manufacturingOps: {
          "mfg-3": { id: "mfg-3", rateUnit: "m", rate: 10 },
        },
      });

      const comp = makeComponent({
        id: "c1",
        kind: "manufacturing",
        catalogId: "mfg-3",
        qty: 1,
        unitOfMeasure: "m",
      });

      const unit = makeUnit({ id: "u1", widthMm: 1200, heightMm: 720, depthMm: 600, components: [comp] });
      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] })],
      };

      const result = priceQuote(quote, catalog);

      // 1200/1000 = 1.2m × 1 × 10 = 12
      expect(result.products[0].sections[0].units[0].components[0].computedAmount).toBe(12);
    });
  });

  describe("missing catalog entry", () => {
    it("returns 0 for component with no catalog_id", () => {
      const comp = makeComponent({ id: "c1", kind: "material", catalogId: null });
      const unit = makeUnit({ id: "u1", components: [comp] });
      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] })],
      };

      const result = priceQuote(quote, EMPTY_CATALOG);
      expect(result.products[0].sections[0].units[0].components[0].computedAmount).toBe(0);
    });

    it("returns 0 for component with unknown catalog_id", () => {
      const comp = makeComponent({ id: "c1", kind: "material", catalogId: "nonexistent" });
      const unit = makeUnit({ id: "u1", components: [comp] });
      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] })],
      };

      const result = priceQuote(quote, EMPTY_CATALOG);
      expect(result.products[0].sections[0].units[0].components[0].computedAmount).toBe(0);
    });
  });

  // ── Unit factor overrides ────────────────────────────────────────────────

  describe("unit factor overrides", () => {
    it("applies percentage overrides to unit price", () => {
      const catalog = makeCatalog({
        materials: {
          "mat-1": { id: "mat-1", pricingUnit: "pcs", pricePerUnit: 100, defaultWastagePct: 0 },
        },
      });

      const comp = makeComponent({ id: "c1", kind: "material", catalogId: "mat-1", qty: 1 });
      const unit = makeUnit({
        id: "u1",
        components: [comp],
        overrideFactorKeys: { rush: 20 }, // +20%
      });
      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] })],
      };

      const result = priceQuote(quote, catalog);
      const unitOut = result.products[0].sections[0].units[0];

      expect(unitOut.computedUnitCost).toBe(100);
      expect(unitOut.computedUnitPrice).toBeCloseTo(120, 2); // 100 + 20%
    });
  });

  // ── Bottom-up aggregation ────────────────────────────────────────────────

  describe("aggregation", () => {
    it("section sums unit prices", () => {
      const catalog = makeCatalog({
        materials: {
          "mat-1": { id: "mat-1", pricingUnit: "pcs", pricePerUnit: 100, defaultWastagePct: 0 },
        },
      });

      const comp1 = makeComponent({ id: "c1", kind: "material", catalogId: "mat-1", qty: 1 });
      const comp2 = makeComponent({ id: "c2", kind: "material", catalogId: "mat-1", qty: 1 });
      const unit1 = makeUnit({ id: "u1", components: [comp1] });
      const unit2 = makeUnit({ id: "u2", components: [comp2] });

      const quote: QuoteInput = {
        products: [makeProduct({
          id: "p1",
          sections: [makeSection({ id: "s1", units: [unit1, unit2] })],
        })],
      };

      const result = priceQuote(quote, catalog);
      const section = result.products[0].sections[0];

      expect(section.computedCost).toBe(200); // 100 + 100
      expect(section.computedPrice).toBe(200);
    });

    it("product sums section prices", () => {
      const catalog = makeCatalog({
        materials: {
          "mat-1": { id: "mat-1", pricingUnit: "pcs", pricePerUnit: 50, defaultWastagePct: 0 },
        },
      });

      const comp = makeComponent({ id: "c1", kind: "material", catalogId: "mat-1", qty: 1 });
      const unit = makeUnit({ id: "u1", components: [comp] });

      const quote: QuoteInput = {
        products: [makeProduct({
          id: "p1",
          sections: [
            makeSection({ id: "s1", units: [unit] }),
            makeSection({ id: "s2", units: [unit] }),
          ],
        })],
      };

      const result = priceQuote(quote, catalog);

      expect(result.products[0].computedCost).toBe(100); // 50 + 50
    });

    it("quote sums product prices with VAT", () => {
      const catalog = makeCatalog({
        materials: {
          "mat-1": { id: "mat-1", pricingUnit: "pcs", pricePerUnit: 25, defaultWastagePct: 0 },
        },
      });

      const comp = makeComponent({ id: "c1", kind: "material", catalogId: "mat-1", qty: 1 });
      const unit = makeUnit({ id: "u1", components: [comp] });

      const quote: QuoteInput = {
        products: [
          makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] }),
          makeProduct({ id: "p2", sections: [makeSection({ id: "s2", units: [unit] })] }),
        ],
      };

      const result = priceQuote(quote, catalog);

      expect(result.computedCost).toBe(50); // 25 + 25
      // subTotal = 50, VAT = 50 × 0.14 = 7, total = 57
      expect(result.breakdown.subTotal).toBe(50);
      expect(result.breakdown.vatAmount).toBe(7);
      expect(result.computedPrice).toBe(57);
    });
  });

  // ── Global pricing factors ───────────────────────────────────────────────

  describe("global pricing factors", () => {
    it("applies factors in locked order at unit level (additive on base cost)", () => {
      const catalog = makeCatalog({
        materials: {
          "mat-1": { id: "mat-1", pricingUnit: "pcs", pricePerUnit: 1000, defaultWastagePct: 0 },
        },
        pricingFactors: [
          { factorKey: "labor", percent: 15 },
          { factorKey: "margin", percent: 25 },
        ],
      });

      const comp = makeComponent({ id: "c1", kind: "material", catalogId: "mat-1", qty: 1 });
      const unit = makeUnit({ id: "u1", components: [comp] });
      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] })],
      };

      const result = priceQuote(quote, catalog);

      expect(result.computedCost).toBe(1000);
      // Each factor is % of base cost (additive):
      //   labor: 1000 × 0.15 = 150, margin: 1000 × 0.25 = 250
      //   unitPrice = 1000 + 150 + 250 = 1400
      // VAT: 1400 × 0.14 = 196
      // total: 1400 + 196 = 1596
      expect(result.breakdown.subTotal).toBe(1400);
      expect(result.breakdown.vatAmount).toBe(196);
      expect(result.computedPrice).toBe(1596);
    });
  });

  // ── Fees and credits ─────────────────────────────────────────────────────

  describe("fees and credits", () => {
    it("adds plus fees and subtracts minus credits with VAT", () => {
      const catalog = makeCatalog({
        materials: {
          "mat-1": { id: "mat-1", pricingUnit: "pcs", pricePerUnit: 1000, defaultWastagePct: 0 },
        },
        feesCredits: [
          { code: "delivery", sign: "plus", amount: 200, formulaKey: null },
          { code: "discount_credit", sign: "minus", amount: 100, formulaKey: null },
        ],
      });

      const comp = makeComponent({ id: "c1", kind: "material", catalogId: "mat-1", qty: 1 });
      const unit = makeUnit({ id: "u1", components: [comp] });
      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] })],
      };

      const result = priceQuote(quote, catalog);

      // subTotal = 1000, no discount
      // vatBase = 1000, vatAmount = 140
      // fees: +200 - 100 = +100
      // total = 1000 + 140 + 100 = 1240
      expect(result.breakdown.subTotal).toBe(1000);
      expect(result.breakdown.vatAmount).toBe(140);
      expect(result.breakdown.feesCreditsTotal).toBe(100);
      expect(result.computedPrice).toBe(1240);
    });
  });

  // ── Empty tree ───────────────────────────────────────────────────────────

  describe("empty tree", () => {
    it("returns zeros for empty quote", () => {
      const result = priceQuote({ products: [] }, EMPTY_CATALOG);

      expect(result.computedCost).toBe(0);
      expect(result.computedPrice).toBe(0);
      expect(result.factorLines).toHaveLength(0);
      expect(result.feesCreditsTotal).toBe(0);
      expect(result.products).toHaveLength(0);
    });
  });

  // ── Full integration: base cabinet 600×720×600 ──────────────────────────

  describe("full integration: base cabinet", () => {
    it("prices a cabinet with 2 sides + top + bottom + back + shelf", () => {
      const catalog = makeCatalog({
        materials: {
          "mdf": { id: "mdf", pricingUnit: "m2", pricePerUnit: 150, defaultWastagePct: 5 },
        },
      });

      // BOM: 2 sides (w×h) + top (w×d) + bottom (w×d) + back (w×h) + shelf (w×d)
      const components: ComponentInput[] = [
        makeComponent({ id: "side1", kind: "material", catalogId: "mdf", unitOfMeasure: "m2", areaFunctionKey: "cabinet_side" }),
        makeComponent({ id: "side2", kind: "material", catalogId: "mdf", unitOfMeasure: "m2", areaFunctionKey: "cabinet_side" }),
        makeComponent({ id: "top", kind: "material", catalogId: "mdf", unitOfMeasure: "m2", areaFunctionKey: "cabinet_top" }),
        makeComponent({ id: "bottom", kind: "material", catalogId: "mdf", unitOfMeasure: "m2", areaFunctionKey: "cabinet_bottom" }),
        makeComponent({ id: "back", kind: "material", catalogId: "mdf", unitOfMeasure: "m2", areaFunctionKey: "back_panel" }),
        makeComponent({ id: "shelf", kind: "material", catalogId: "mdf", unitOfMeasure: "m2", areaFunctionKey: "shelf" }),
      ];

      const unit = makeUnit({ id: "u1", components });
      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] })],
      };

      const result = priceQuote(quote, catalog);
      const unitOut = result.products[0].sections[0].units[0];

      // Areas: side=0.432, top=0.36, bottom=0.36, back=0.432, shelf=0.36
      // Total area: 0.432 + 0.432 + 0.36 + 0.36 + 0.432 + 0.36 = 2.376 m2
      // Base cost: 2.376 × 150 = 356.4
      // With 5% wastage: 356.4 × 1.05 = 374.22
      expect(unitOut.computedUnitCost).toBeCloseTo(374.22, 2);
      expect(unitOut.computedUnitPrice).toBeCloseTo(374.22, 2);
      expect(result.computedCost).toBeCloseTo(374.22, 2);
    });
  });

  // ── round2 utility ────────────────────────────────────────────────────────

  describe("round2", () => {
    it("rounds to 2 decimal places", () => {
      expect(round2(1.004)).toBe(1.0);
      expect(round2(1.006)).toBe(1.01);
      expect(round2(2.675)).toBe(2.68);
      expect(round2(0.1 + 0.2)).toBe(0.3);
      expect(round2(100)).toBe(100);
      expect(round2(-1.555)).toBe(-1.55);
      expect(round2(0)).toBe(0);
    });
  });

  // ── Determinism ─────────────────────────────────────────────────────────

  describe("determinism", () => {
    it("same input yields identical output on consecutive runs", () => {
      const catalog = makeCatalog({
        materials: {
          "mat-1": {
            id: "mat-1",
            pricingUnit: "m2",
            pricePerUnit: 150,
            defaultWastagePct: 5,
          },
        },
        hardware: { "hw-1": { id: "hw-1", pricePerPiece: 15 } },
        pricingFactors: [
          { factorKey: "labor", percent: 15 },
          { factorKey: "margin", percent: 25 },
        ],
        wastageRules: [],
        feesCredits: [
          { code: "delivery", sign: "plus", amount: 200, formulaKey: null },
        ],
      });

      const components: ComponentInput[] = [
        makeComponent({ id: "side1", kind: "material", catalogId: "mat-1", unitOfMeasure: "m2", areaFunctionKey: "cabinet_side" }),
        makeComponent({ id: "top", kind: "material", catalogId: "mat-1", unitOfMeasure: "m2", areaFunctionKey: "cabinet_top" }),
        makeComponent({ id: "hinges", kind: "hardware", catalogId: "hw-1", qty: 4 }),
      ];

      const unit = makeUnit({ id: "u1", components });
      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] })],
      };

      const run1 = priceQuote(quote, catalog);
      const run2 = priceQuote(quote, catalog);

      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
    });
  });

  // ── Wastage rule precedence ────────────────────────────────────────────

  describe("wastage rule precedence", () => {
    it("material scope wins over material_type scope", () => {
      const catalog = makeCatalog({
        materials: {
          "mat-1": { id: "mat-1", pricingUnit: "pcs", pricePerUnit: 100, defaultWastagePct: 0 },
        },
        wastageRules: [
          { scope: "material_type", ref: "mdf", pct: 20 },
          { scope: "material", ref: "side-panel", pct: 10 },
        ],
      });

      // componentAmount uses areaFunctionKey as the wastage ref
      const comp = makeComponent({
        id: "c1",
        kind: "material",
        catalogId: "mat-1",
        qty: 1,
        areaFunctionKey: "side-panel",
      });

      const unit = makeUnit({ id: "u1", components: [comp] });
      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] })],
      };

      const result = priceQuote(quote, catalog);

      // material scope: 10% wastage → 100 × 1.10 = 110
      expect(result.products[0].sections[0].units[0].components[0].computedAmount).toBe(110);
    });

    it("falls back to defaultWastagePct when no rule matches", () => {
      const catalog = makeCatalog({
        materials: {
          "mat-1": { id: "mat-1", pricingUnit: "pcs", pricePerUnit: 100, defaultWastagePct: 15 },
        },
        wastageRules: [
          { scope: "material", ref: "other-mat", pct: 50 },
        ],
      });

      const comp = makeComponent({
        id: "c1",
        kind: "material",
        catalogId: "mat-1",
        qty: 1,
      });

      const unit = makeUnit({ id: "u1", components: [comp] });
      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] })],
      };

      const result = priceQuote(quote, catalog);

      // Falls back to entity.defaultWastagePct = 15 → 100 × 1.15 = 115
      expect(result.products[0].sections[0].units[0].components[0].computedAmount).toBe(115);
    });
  });

  // ── Board-yield costing ────────────────────────────────────────────────

  describe("board-yield costing", () => {
    it("computes qty × coefficient × boardPrice", () => {
      const catalog = makeCatalog({
        materials: {
          "board-1": {
            id: "board-1",
            pricingUnit: "m2",
            pricePerUnit: 0,
            defaultWastagePct: 0,
            coefficient: 1.5,
            boardPrice: 200,
          },
        },
      });

      const comp = makeComponent({
        id: "c1",
        kind: "material",
        catalogId: "board-1",
        qty: 2,
      });

      const unit = makeUnit({ id: "u1", components: [comp] });
      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] })],
      };

      const result = priceQuote(quote, catalog);

      // 2 × 1.5 × 200 = 600
      expect(result.products[0].sections[0].units[0].components[0].computedAmount).toBe(600);
    });

    it("applies wastage rule to board-yield cost", () => {
      const catalog = makeCatalog({
        materials: {
          "board-1": {
            id: "board-1",
            pricingUnit: "m2",
            pricePerUnit: 0,
            defaultWastagePct: 0,
            coefficient: 1,
            boardPrice: 100,
          },
        },
        wastageRules: [
          { scope: "material", ref: "shelf-panel", pct: 10 },
        ],
      });

      // componentAmount uses areaFunctionKey as the wastage ref
      const comp = makeComponent({
        id: "c1",
        kind: "material",
        catalogId: "board-1",
        qty: 1,
        areaFunctionKey: "shelf-panel",
      });

      const unit = makeUnit({ id: "u1", components: [comp] });
      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] })],
      };

      const result = priceQuote(quote, catalog);

      // 1 × 1 × 100 = 100; wastage 10% → 110
      expect(result.products[0].sections[0].units[0].components[0].computedAmount).toBe(110);
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("empty section preserves 0 cost/price", () => {
      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [] })] })],
      };

      const result = priceQuote(quote, EMPTY_CATALOG);
      const section = result.products[0].sections[0];

      expect(section.computedCost).toBe(0);
      expect(section.computedPrice).toBe(0);
      expect(section.units).toHaveLength(0);
    });

    it("qty=0 components contribute 0 cost", () => {
      const catalog = makeCatalog({
        materials: {
          "mat-1": { id: "mat-1", pricingUnit: "pcs", pricePerUnit: 100, defaultWastagePct: 0 },
        },
      });

      const comp = makeComponent({ id: "c1", kind: "material", catalogId: "mat-1", qty: 0 });
      const unit = makeUnit({ id: "u1", components: [comp] });
      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] })],
      };

      const result = priceQuote(quote, catalog);
      expect(result.products[0].sections[0].units[0].components[0].computedAmount).toBe(0);
    });

    it("missing catalog entry returns 0", () => {
      const comp = makeComponent({ id: "c1", kind: "hardware", catalogId: "nonexistent", qty: 1 });
      const unit = makeUnit({ id: "u1", components: [comp] });
      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] })],
      };

      const result = priceQuote(quote, EMPTY_CATALOG);
      expect(result.products[0].sections[0].units[0].components[0].computedAmount).toBe(0);
    });

    it("unsorted input produces sorted output", () => {
      const catalog = makeCatalog({
        materials: {
          "mat-1": { id: "mat-1", pricingUnit: "pcs", pricePerUnit: 10, defaultWastagePct: 0 },
        },
      });

      const compC = makeComponent({ id: "c-comp", kind: "material", catalogId: "mat-1", qty: 3 });
      const compA = makeComponent({ id: "a-comp", kind: "material", catalogId: "mat-1", qty: 1 });
      const compB = makeComponent({ id: "b-comp", kind: "material", catalogId: "mat-1", qty: 2 });

      const unitU2 = makeUnit({ id: "u2", components: [compC] });
      const unitU1 = makeUnit({ id: "u1", components: [compA, compB] });

      const sectionS2 = makeSection({ id: "s2", units: [unitU2] });
      const sectionS1 = makeSection({ id: "s1", units: [unitU1] });

      const productP2 = makeProduct({ id: "p2", sections: [sectionS2] });
      const productP1 = makeProduct({ id: "p1", sections: [sectionS1] });

      const quote: QuoteInput = { products: [productP2, productP1] };

      const result = priceQuote(quote, catalog);

      // Products sorted by id: p1, p2
      expect(result.products[0].id).toBe("p1");
      expect(result.products[1].id).toBe("p2");

      // Sections within p1 sorted: s1
      expect(result.products[0].sections[0].id).toBe("s1");

      // Units within s1 sorted: u1
      expect(result.products[0].sections[0].units[0].id).toBe("u1");

      // Components within u1 sorted: a-comp, b-comp
      expect(result.products[0].sections[0].units[0].components[0].id).toBe("a-comp");
      expect(result.products[0].sections[0].units[0].components[1].id).toBe("b-comp");
    });
  });

  // ── Level reconciliation ───────────────────────────────────────────────

  describe("level reconciliation", () => {
    it("section.computedCost equals sum of unit costs", () => {
      const catalog = makeCatalog({
        materials: {
          "mat-1": { id: "mat-1", pricingUnit: "pcs", pricePerUnit: 100, defaultWastagePct: 0 },
        },
      });

      const comp1 = makeComponent({ id: "c1", kind: "material", catalogId: "mat-1", qty: 1 });
      const comp2 = makeComponent({ id: "c2", kind: "material", catalogId: "mat-1", qty: 2 });
      const unit1 = makeUnit({ id: "u1", components: [comp1] });
      const unit2 = makeUnit({ id: "u2", components: [comp2] });

      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit1, unit2] })] })],
      };

      const result = priceQuote(quote, catalog);
      const section = result.products[0].sections[0];

      const sumOfUnitCosts = section.units.reduce(
        (sum, u) => sum + u.computedUnitCost,
        0,
      );

      expect(section.computedCost).toBeCloseTo(sumOfUnitCosts, 6);
      expect(section.computedPrice).toBeCloseTo(sumOfUnitCosts, 6);
    });

    it("product.computedCost equals sum of section costs", () => {
      const catalog = makeCatalog({
        materials: {
          "mat-1": { id: "mat-1", pricingUnit: "pcs", pricePerUnit: 50, defaultWastagePct: 0 },
        },
      });

      const comp = makeComponent({ id: "c1", kind: "material", catalogId: "mat-1", qty: 1 });
      const unit = makeUnit({ id: "u1", components: [comp] });

      const quote: QuoteInput = {
        products: [makeProduct({
          id: "p1",
          sections: [
            makeSection({ id: "s1", units: [unit] }),
            makeSection({ id: "s2", units: [unit] }),
          ],
        })],
      };

      const result = priceQuote(quote, catalog);
      const product = result.products[0];

      const sumOfSectionCosts = product.sections.reduce(
        (sum, s) => sum + s.computedCost,
        0,
      );

      expect(product.computedCost).toBeCloseTo(sumOfSectionCosts, 6);
    });

    it("quote.computedCost equals sum of product costs", () => {
      const catalog = makeCatalog({
        materials: {
          "mat-1": { id: "mat-1", pricingUnit: "pcs", pricePerUnit: 25, defaultWastagePct: 0 },
        },
      });

      const comp = makeComponent({ id: "c1", kind: "material", catalogId: "mat-1", qty: 1 });
      const unit = makeUnit({ id: "u1", components: [comp] });

      const quote: QuoteInput = {
        products: [
          makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] }),
          makeProduct({ id: "p2", sections: [makeSection({ id: "s2", units: [unit] })] }),
        ],
      };

      const result = priceQuote(quote, catalog);

      const sumOfProductCosts = result.products.reduce(
        (sum, p) => sum + p.computedCost,
        0,
      );

      expect(result.computedCost).toBeCloseTo(sumOfProductCosts, 6);
    });
  });

  // ── Golden file ────────────────────────────────────────────────────────

  describe("golden file", () => {
    it("produces expected output for a known tree", () => {
      const catalog = makeCatalog({
        materials: {
          "mdf-1": {
            id: "mdf-1",
            pricingUnit: "m2",
            pricePerUnit: 150,
            defaultWastagePct: 5,
          },
        },
        hardware: {
          "hinge-1": { id: "hinge-1", pricePerPiece: 15 },
        },
        accessories: {
          "handle-1": { id: "handle-1", pricePerPiece: 25 },
        },
        manufacturingOps: {
          "cut-1": { id: "cut-1", rateUnit: "m2", rate: 20 },
        },
        pricingFactors: [
          { factorKey: "labor", percent: 10 },
          { factorKey: "margin", percent: 20 },
        ],
        wastageRules: [
          { scope: "material", ref: "mdf-1", pct: 8 },
        ],
        feesCredits: [
          { code: "delivery", sign: "plus", amount: 150, formulaKey: null },
          { code: "discount", sign: "minus", amount: 50, formulaKey: null },
        ],
      });

      const quote: QuoteInput = {
        products: [
          makeProduct({
            id: "base-cabinet",
            sections: [
              makeSection({
                id: "kitchen-row",
                units: [
                  makeUnit({
                    id: "unit-1",
                    widthMm: 600,
                    heightMm: 720,
                    depthMm: 600,
                    qty: 1,
                    components: [
                      makeComponent({ id: "side-L", kind: "material", catalogId: "mdf-1", unitOfMeasure: "m2", areaFunctionKey: "cabinet_side" }),
                      makeComponent({ id: "side-R", kind: "material", catalogId: "mdf-1", unitOfMeasure: "m2", areaFunctionKey: "cabinet_side" }),
                      makeComponent({ id: "top-p", kind: "material", catalogId: "mdf-1", unitOfMeasure: "m2", areaFunctionKey: "cabinet_top" }),
                      makeComponent({ id: "bottom-p", kind: "material", catalogId: "mdf-1", unitOfMeasure: "m2", areaFunctionKey: "cabinet_bottom" }),
                      makeComponent({ id: "back-p", kind: "material", catalogId: "mdf-1", unitOfMeasure: "m2", areaFunctionKey: "back_panel" }),
                      makeComponent({ id: "hinge", kind: "hardware", catalogId: "hinge-1", qty: 4 }),
                      makeComponent({ id: "handle", kind: "accessory", catalogId: "handle-1", qty: 1 }),
                      makeComponent({ id: "cut-op", kind: "manufacturing", catalogId: "cut-1", unitOfMeasure: "m2", areaFunctionKey: "cabinet_side" }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      };

      const result = priceQuote(quote, catalog);

      // Material area calc:
      //   componentAmount uses areaFunctionKey as wastage ref, not catalogId.
      //   Wastage rule ref "mdf-1" won't match → falls back to entity.defaultWastagePct = 5%.
      //   side-L: 0.432 × 150 × 1.05 = 68.04
      //   side-R: 0.432 × 150 × 1.05 = 68.04
      //   top:   0.36  × 150 × 1.05 = 56.70  (cabinet_top = 0.6 × 0.6)
      //   bottom: 0.36 × 150 × 1.05 = 56.70
      //   back:  0.432 × 150 × 1.05 = 68.04
      //   raw material subtotal: 317.52
      // Hardware: 4 × 15 = 60
      // Accessory: 1 × 25 = 25
      // Manufacturing: 0.432 × 1 × 20 = 8.64
      // Unit cost: 317.52 + 60 + 25 + 8.64 = 411.16
      //
      // Locked factor order (additive on base cost): labor (10%) → margin (20%)
      //   labor: 411.16 × 0.10 = 41.116 → round2 = 41.12
      //   margin: 411.16 × 0.20 = 82.232 → round2 = 82.23
      //   unitPrice = 411.16 + 41.12 + 82.23 = 534.51
      // subTotal = 534.51
      // VAT: 534.51 × 0.14 = 74.8314 → round2 = 74.83
      // Fees: +150, -50 = +100
      // total: 534.51 + 74.83 + 100 = 709.34

      const unitOut = result.products[0].sections[0].units[0];

      expect(unitOut.computedUnitCost).toBeCloseTo(411.16, 1);
      expect(unitOut.computedUnitPrice).toBeCloseTo(534.51, 1);

      expect(result.breakdown.subTotal).toBeCloseTo(534.51, 1);
      expect(result.breakdown.vatBase).toBeCloseTo(534.51, 1);
      expect(result.breakdown.vatAmount).toBeCloseTo(74.83, 1);
      expect(result.breakdown.feesCreditsTotal).toBe(100);
      expect(result.computedPrice).toBeCloseTo(709.34, 1);

      // Verify golden snapshot can be serialized
      const snapshot = JSON.stringify(result, null, 2);
      expect(snapshot).toContain("base-cabinet");
      expect(snapshot).toContain("kitchen-row");
      expect(snapshot).toContain("unit-1");

      // Re-run and verify deterministic
      const result2 = priceQuote(quote, catalog);
      expect(JSON.stringify(result)).toBe(JSON.stringify(result2));
    });
  });

  // ── Per-unit factor overrides with componentAmount ──────────────────────

  describe("per-unit factor overrides with componentAmount integration", () => {
    it("rush factor on a unit with board-yield material", () => {
      const catalog = makeCatalog({
        materials: {
          "board-1": {
            id: "board-1",
            pricingUnit: "m2",
            pricePerUnit: 0,
            defaultWastagePct: 0,
            coefficient: 1,
            boardPrice: 100,
          },
        },
        pricingFactors: [
          { factorKey: "margin", percent: 30 },
        ],
      });

      const comp = makeComponent({
        id: "c1",
        kind: "material",
        catalogId: "board-1",
        qty: 2,
      });

      const unit = makeUnit({
        id: "u1",
        components: [comp],
        overrideFactorKeys: { rush: 25 },
      });

      const quote: QuoteInput = {
        products: [makeProduct({ id: "p1", sections: [makeSection({ id: "s1", units: [unit] })] })],
      };

      const result = priceQuote(quote, catalog);

      // Board-yield: 2 × 1 × 100 = 200
      // Each factor is % of base cost (additive, locked order):
      //   margin: 200 × 0.30 = 60, rush: 200 × 0.25 = 50
      //   unitPrice = 200 + 60 + 50 = 310
      expect(result.products[0].sections[0].units[0].computedUnitCost).toBe(200);
      expect(result.products[0].sections[0].units[0].computedUnitPrice).toBe(310);

      // VAT: 310 × 0.14 = 43.40
      // total: 310 + 43.40 = 353.40
      expect(result.breakdown.vatAmount).toBe(43.40);
      expect(result.computedPrice).toBe(353.40);
    });
  });
});
