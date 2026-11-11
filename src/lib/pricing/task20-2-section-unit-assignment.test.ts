import { describe, it, expect } from "vitest";
import {
  priceQuote,
  type CatalogLookup,
  type QuoteInput,
  type SectionInput,
  type UnitInput,
  type ComponentInput,
} from "./engine-v3";
import {
  componentAmount,
  componentAmountDetails,
  type ComponentLike,
  type CatalogEntityLike,
} from "./componentAmount";

describe("Task 20.2: Section & Unit Material and Component Assignment", () => {
  const mockCatalog: CatalogLookup = {
    materials: {
      "mat-mdf-18": {
        id: "mat-mdf-18",
        pricingUnit: "m2",
        pricePerUnit: 400,
        defaultWastagePct: 10,
      },
      "mat-ply-18": {
        id: "mat-ply-18",
        pricingUnit: "m2",
        pricePerUnit: 600,
        defaultWastagePct: 5,
      },
    },
    hardware: {
      "hw-hinge-soft": {
        id: "hw-hinge-soft",
        pricePerPiece: 45,
        pricingUnit: "pair",
      },
      "hw-drawer-slide": {
        id: "hw-drawer-slide",
        pricePerPiece: 120,
        pricingUnit: "set",
      },
    },
    accessories: {
      "acc-handle-black": {
        id: "acc-handle-black",
        pricePerPiece: 35,
      },
    },
    manufacturingOps: {
      "op-cnc-cut": {
        id: "op-cnc-cut",
        rateUnit: "minute",
        rate: 8,
      },
      "op-assembly": {
        id: "op-assembly",
        rateUnit: "piece",
        rate: 150,
      },
    },
    finishes: {
      "fin-polyurethane": {
        id: "fin-polyurethane",
        pricingUnit: "m2",
        pricePerUnit: 180,
        defaultWastagePct: 0,
      },
      "fin-lacquer": {
        id: "fin-lacquer",
        pricingUnit: "m2",
        pricePerUnit: 250,
        defaultWastagePct: 0,
      },
    },
    veneers: {
      "ven-oak": {
        id: "ven-oak",
        pricingUnit: "m2",
        pricePerUnit: 320,
        defaultWastagePct: 0,
      },
    },
    edgeBands: {
      "eb-pvc-2mm": {
        id: "eb-pvc-2mm",
        pricingUnit: "m",
        pricePerUnit: 15,
        defaultWastagePct: 5,
      },
    },
    pricingFactors: [],
    wastageRules: [],
    feesCredits: [],
  };

  describe("1. Section-level Finish and Material Inheritance", () => {
    it("inherits Section finish when Unit has no explicit finishId", () => {
      const quote: QuoteInput = {
        products: [
          {
            id: "p1",
            sections: [
              {
                id: "s1",
                label: "Kitchen Base Cabinets",
                materialId: "mat-mdf-18",
                finishId: "fin-polyurethane",
                veneerId: "ven-oak",
                units: [
                  {
                    id: "u1",
                    unitTypeId: null,
                    widthMm: 800,
                    heightMm: 900,
                    depthMm: 600,
                    qty: 1,
                    finishId: null, // Inherits from s1
                    components: [
                      {
                        id: "c1",
                        kind: "finish",
                        catalogId: null, // Should pick up inherited finish if resolved
                        qty: 1,
                        unitOfMeasure: "m2",
                        areaFunctionKey: "door_panel",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const priced = priceQuote(quote, mockCatalog);
      expect(priced).toBeDefined();
      expect(priced.products.length).toBe(1);
      const section = priced.products[0].sections[0];
      expect(section.units.length).toBe(1);
      const unit = section.units[0];
      // Unit has no finishId, but inherited finishId "fin-polyurethane" from section (180 EGP/m²)
      // Dims: 800x900 mm => 0.72 m² * 180 = 129.6 EGP
      expect(unit.components[0].computedAmount).toBe(129.6);
    });

    it("overrides Section finish when Unit specifies explicit finishId", () => {
      const quote: QuoteInput = {
        products: [
          {
            id: "p1",
            sections: [
              {
                id: "s1",
                label: "Kitchen Wall Cabinets",
                finishId: "fin-polyurethane", // 180 EGP/m2
                units: [
                  {
                    id: "u1",
                    unitTypeId: null,
                    widthMm: 1000,
                    heightMm: 1000,
                    depthMm: 400,
                    qty: 1,
                    finishId: "fin-lacquer", // 250 EGP/m2 explicit override
                    components: [
                      {
                        id: "c1",
                        kind: "finish",
                        catalogId: "fin-lacquer",
                        qty: 1,
                        unitOfMeasure: "m2",
                        areaFunctionKey: "door_panel", // 1.0m * 1.0m = 1.0 m2
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const priced = priceQuote(quote, mockCatalog);
      const unit = priced.products[0].sections[0].units[0];
      // Door panel of 1000x1000 = 1 m² at 250 EGP/m² = 250 EGP base cost
      expect(unit.components[0].computedAmount).toBe(250);
    });
  });

  describe("2. Section-level Shared Components in engine-v3", () => {
    it("prices shared hardware, operations, and finishes attached directly to Section", () => {
      const quote: QuoteInput = {
        products: [
          {
            id: "p1",
            sections: [
              {
                id: "s1",
                label: "Master Wardrobe",
                components: [
                  // Shared structural hardware for the entire section
                  {
                    id: "sc-hw-1",
                    kind: "hardware",
                    catalogId: "hw-drawer-slide",
                    qty: 4,
                    unitOfMeasure: "set",
                  },
                  // Shared section-level assembly operation
                  {
                    id: "sc-op-1",
                    kind: "manufacturing",
                    catalogId: "op-assembly",
                    qty: 2,
                    unitOfMeasure: "piece",
                  },
                ],
                units: [
                  {
                    id: "u1",
                    unitTypeId: null,
                    widthMm: 1000,
                    heightMm: 2200,
                    depthMm: 600,
                    qty: 1,
                    components: [
                      {
                        id: "uc-1",
                        kind: "material",
                        catalogId: "mat-mdf-18",
                        qty: 1,
                        unitOfMeasure: "m2",
                        areaFunctionKey: "door_panel",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const priced = priceQuote(quote, mockCatalog);
      const section = priced.products[0].sections[0];

      // Section components:
      // sc-hw-1: 4 sets * 120 EGP = 480 EGP
      // sc-op-1: 2 pieces * 150 EGP = 300 EGP
      // Total section shared components cost = 780 EGP
      expect(section.components).toBeDefined();
      expect(section.components?.length).toBe(2);

      const hwComp = section.components?.find((c) => c.id === "sc-hw-1");
      expect(hwComp?.computedAmount).toBe(480);

      const opComp = section.components?.find((c) => c.id === "sc-op-1");
      expect(opComp?.computedAmount).toBe(300);

      // Section subtotal includes both section-level components and units
      const unitCost = section.units[0].computedTotalCost;
      const expectedSectionCost = Math.round((780 + unitCost) * 100) / 100;
      expect(section.computedCost).toBe(expectedSectionCost);
    });

    it("handles section with only shared components and zero units", () => {
      const quote: QuoteInput = {
        products: [
          {
            id: "p1",
            sections: [
              {
                id: "s1",
                label: "On-site Installation Section",
                components: [
                  {
                    id: "sc-op-onsite",
                    kind: "manufacturing",
                    catalogId: "op-cnc-cut",
                    qty: 60, // 60 minutes
                    unitOfMeasure: "minute",
                  },
                ],
                units: [],
              },
            ],
          },
        ],
      };

      const priced = priceQuote(quote, mockCatalog);
      const section = priced.products[0].sections[0];

      // 60 minutes * 8 EGP = 480 EGP
      expect(section.components?.length).toBe(1);
      expect(section.components?.[0].computedAmount).toBe(480);
      expect(section.computedCost).toBe(480);
      expect(priced.computedCost).toBe(480);
    });
  });

  describe("3. All 7 Component Kinds Pricing Accuracy", () => {
    const safeDims = { w: 1000, h: 2000, d: 500 };
    const noWastageRule = () => null;

    it("prices material with area and wastage accurately", () => {
      const comp: ComponentLike = {
        kind: "material",
        catalogId: "mat-mdf-18",
        qty: 1,
        unitOfMeasure: "m2",
        areaFunctionKey: "door_panel", // 1.0m * 2.0m = 2.0 m²
      };
      const entity: CatalogEntityLike = {
        pricingUnit: "m2",
        pricePerUnit: 400,
        defaultWastagePct: 10,
      };

      const details = componentAmountDetails(comp, entity, safeDims, noWastageRule);
      // Area = 2.0 m2, baseCost = 2.0 * 400 = 800 EGP, wastage 10% = 80 EGP, total = 880 EGP
      expect(details.totalConsumption).toBe(2.0);
      expect(details.baseCost).toBe(800);
      expect(details.wastageCost).toBe(80);
      expect(details.amount).toBeCloseTo(880, 2);
      expect(componentAmount(comp, entity, safeDims, noWastageRule)).toBeCloseTo(880, 2);
    });

    it("prices edge_band with linear perimeter accurately", () => {
      const comp: ComponentLike = {
        kind: "edge_band",
        catalogId: "eb-pvc-2mm",
        qty: 1,
        unitOfMeasure: "m",
        areaFunctionKey: "edge_band", // Perimeter 2*(1.0 + 2.0) = 6.0 m
      };
      const entity: CatalogEntityLike = {
        pricingUnit: "m",
        pricePerUnit: 15,
        defaultWastagePct: 5,
      };

      const details = componentAmountDetails(comp, entity, safeDims, noWastageRule);
      // Perimeter = 6 m, baseCost = 6 * 15 = 90 EGP, wastage 5% = 4.5 EGP, total = 94.5 EGP
      expect(details.totalConsumption).toBe(6.0);
      expect(details.baseCost).toBe(90);
      expect(details.wastageCost).toBe(4.5);
      expect(details.amount).toBe(94.5);
      expect(componentAmount(comp, entity, safeDims, noWastageRule)).toBe(94.5);
    });

    it("prices hardware strictly per discrete piece/pair/set without area scaling", () => {
      const comp: ComponentLike = {
        kind: "hardware",
        catalogId: "hw-hinge-soft",
        qty: 6,
        unitOfMeasure: "pair",
      };
      const entity: CatalogEntityLike = {
        pricingUnit: "pair",
        pricePerPiece: 45,
        defaultWastagePct: 0,
      };

      const details = componentAmountDetails(comp, entity, safeDims, noWastageRule);
      // 6 pairs * 45 EGP = 270 EGP (no area dependency)
      expect(details.baseCost).toBe(270);
      expect(details.wastageCost).toBe(0);
      expect(details.amount).toBe(270);
      expect(details.pricingBasis).toBe("45.00 EGP / pair");
      expect(componentAmount(comp, entity, safeDims, noWastageRule)).toBe(270);
    });

    it("prices accessories per piece without area scaling", () => {
      const comp: ComponentLike = {
        kind: "accessory",
        catalogId: "acc-handle-black",
        qty: 4,
        unitOfMeasure: "piece",
      };
      const entity: CatalogEntityLike = {
        pricingUnit: "piece",
        pricePerPiece: 35,
      };

      const details = componentAmountDetails(comp, entity, safeDims, noWastageRule);
      // 4 * 35 = 140 EGP
      expect(details.baseCost).toBe(140);
      expect(details.amount).toBe(140);
      expect(componentAmount(comp, entity, safeDims, noWastageRule)).toBe(140);
    });

    it("prices manufacturing operations by minutes", () => {
      const comp: ComponentLike = {
        kind: "manufacturing",
        catalogId: "op-cnc-cut",
        qty: 45,
        unitOfMeasure: "minute",
      };
      const entity: CatalogEntityLike = {
        rateUnit: "minute",
        rate: 8,
      };

      const details = componentAmountDetails(comp, entity, safeDims, noWastageRule);
      // 45 minutes * 8 EGP = 360 EGP
      expect(details.baseCost).toBe(360);
      expect(details.amount).toBe(360);
      expect(componentAmount(comp, entity, safeDims, noWastageRule)).toBe(360);
    });

    it("prices veneer per m2 surface area", () => {
      const comp: ComponentLike = {
        kind: "veneer",
        catalogId: "ven-oak",
        qty: 1,
        unitOfMeasure: "m2",
        areaFunctionKey: "door_panel", // 1.0m * 2.0m = 2.0 m²
      };
      const entity: CatalogEntityLike = {
        pricingUnit: "m2",
        pricePerUnit: 320,
        defaultWastagePct: 0,
      };

      const details = componentAmountDetails(comp, entity, safeDims, noWastageRule);
      // 2.0 m2 * 320 EGP = 640 EGP
      expect(details.totalConsumption).toBe(2.0);
      expect(details.amount).toBe(640);
      expect(componentAmount(comp, entity, safeDims, noWastageRule)).toBe(640);
    });

    it("prices finish per m2 surface area", () => {
      const comp: ComponentLike = {
        kind: "finish",
        catalogId: "fin-lacquer",
        qty: 1,
        unitOfMeasure: "m2",
        areaFunctionKey: "door_panel", // 1.0m * 2.0m = 2.0 m²
      };
      const entity: CatalogEntityLike = {
        pricingUnit: "m2",
        pricePerUnit: 250,
        defaultWastagePct: 0,
      };

      const details = componentAmountDetails(comp, entity, safeDims, noWastageRule);
      // 2.0 m2 * 250 EGP = 500 EGP
      expect(details.totalConsumption).toBe(2.0);
      expect(details.amount).toBe(500);
      expect(componentAmount(comp, entity, safeDims, noWastageRule)).toBe(500);
    });
  });

  describe("4. Exact Penny Parity and Determinism", () => {
    it("produces identical sums regardless of tree traversal and verifies round2 safety", () => {
      const quote: QuoteInput = {
        products: [
          {
            id: "p1",
            sections: [
              {
                id: "s1",
                label: "S1",
                components: [
                  {
                    id: "sc1",
                    kind: "hardware",
                    catalogId: "hw-hinge-soft",
                    qty: 3,
                    unitOfMeasure: "pair",
                  },
                ],
                units: [
                  {
                    id: "u1",
                    unitTypeId: null,
                    widthMm: 600,
                    heightMm: 720,
                    depthMm: 300,
                    qty: 2,
                    components: [
                      {
                        id: "c1",
                        kind: "material",
                        catalogId: "mat-mdf-18",
                        qty: 1,
                        unitOfMeasure: "m2",
                        areaFunctionKey: "door_panel", // 0.6 * 0.72 = 0.432 m2 -> 0.43 m2
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const run1 = priceQuote(quote, mockCatalog);
      const run2 = priceQuote(quote, mockCatalog);

      expect(run1.computedCost).toBe(run2.computedCost);
      expect(run1.computedPrice).toBe(run2.computedPrice);
      expect(Number.isFinite(run1.computedPrice)).toBe(true);
      // Subtotal must equal sum of product totals
      const productTotal = run1.products.reduce((acc, p) => acc + p.computedPrice, 0);
      expect(Math.round(productTotal * 100) / 100).toBe(run1.breakdown.subTotal);
    });
  });

  describe("5. Task 20.3: Pricing Integrity, Strategy A & C, and Multiplication Modes", () => {
    it("Strategy A: prices section-level material with direct consumption (no areaFunctionKey)", () => {
      const quote: QuoteInput = {
        products: [
          {
            id: "p1",
            sections: [
              {
                id: "s1",
                label: "Cladding Section",
                components: [
                  {
                    id: "sc-direct-mat",
                    kind: "material",
                    catalogId: "mat-ply-18",
                    qty: 2.5,
                    unitOfMeasure: "m2",
                    areaFunctionKey: "direct",
                  },
                ],
                units: [],
              },
            ],
          },
        ],
      };

      const priced = priceQuote(quote, mockCatalog);
      const section = priced.products[0].sections[0];
      const comp = section.components?.[0];

      // 2.5 m² * 600 EGP/m² = 1500 EGP base + 5% wastage = 1575 EGP
      expect(comp?.pricingStatus).toBe("priced");
      expect(comp?.computedAmount).toBe(1575);
      expect(comp?.totalConsumption).toBe(2.5);
      expect(section.computedCost).toBe(1575);
    });

    it("Strategy C: aggregates child unit run dimensions (w=sum(w*q), h=max(h), d=max(d))", () => {
      const quote: QuoteInput = {
        products: [
          {
            id: "p1",
            sections: [
              {
                id: "s1",
                label: "Run Section",
                components: [
                  {
                    id: "sc-top-finish",
                    kind: "finish",
                    catalogId: "fin-polyurethane", // 180 EGP/m², 0% wastage
                    qty: 1,
                    unitOfMeasure: "m2",
                    areaFunctionKey: "door_panel", // w * h
                  },
                ],
                units: [
                  {
                    id: "u1",
                    unitTypeId: null,
                    widthMm: 600,
                    heightMm: 800,
                    depthMm: 400,
                    qty: 2, // run width += 1200
                    components: [],
                  },
                  {
                    id: "u2",
                    unitTypeId: null,
                    widthMm: 800,
                    heightMm: 900, // max h = 900
                    depthMm: 500, // max d = 500
                    qty: 1, // run width += 800 => total w = 2000 mm
                    components: [],
                  },
                ],
              },
            ],
          },
        ],
      };

      const priced = priceQuote(quote, mockCatalog);
      const section = priced.products[0].sections[0];
      const comp = section.components?.[0];

      // Aggregated section dims: w = 2000 mm (2.0 m), h = 900 mm (0.9 m)
      // door_panel area = 2.0 * 0.9 = 1.8 m²
      // Cost = 1.8 * 180 = 324 EGP
      expect(comp?.pricingStatus).toBe("priced");
      expect(comp?.totalConsumption).toBe(1.8);
      expect(comp?.computedAmount).toBe(324);
    });

    it("Strategy C: zero-unit section with areaFunctionKey triggers pricing_required and zero computedAmount", () => {
      const quote: QuoteInput = {
        products: [
          {
            id: "p1",
            sections: [
              {
                id: "s1",
                label: "Empty Section",
                components: [
                  {
                    id: "sc-empty-area",
                    kind: "finish",
                    catalogId: "fin-polyurethane",
                    qty: 1,
                    unitOfMeasure: "m2",
                    areaFunctionKey: "door_panel",
                  },
                ],
                units: [],
              },
            ],
          },
        ],
      };

      const priced = priceQuote(quote, mockCatalog);
      const section = priced.products[0].sections[0];
      const comp = section.components?.[0];

      // Zero units => dimensions are 0 => never use dummy 1000 fallback!
      expect(comp?.pricingStatus).toBe("pricing_required");
      expect(comp?.computedAmount).toBe(0);
      expect(comp?.errorMessage).toContain("Section has no units with valid dimensions");
      expect(section.computedCost).toBe(0);
    });

    it("multiplicationMode: supports one_time (flat) vs per_unit (multiplied by sum unit.qty)", () => {
      const quote: QuoteInput = {
        products: [
          {
            id: "p1",
            sections: [
              {
                id: "s1",
                label: "Multiplication Test Section",
                components: [
                  {
                    id: "sc-onetime",
                    kind: "hardware",
                    catalogId: "hw-hinge-soft", // 45 EGP / pair
                    qty: 1,
                    unitOfMeasure: "pair",
                    multiplicationMode: "one_time",
                  },
                  {
                    id: "sc-perunit",
                    kind: "hardware",
                    catalogId: "hw-hinge-soft", // 45 EGP / pair
                    qty: 1,
                    unitOfMeasure: "pair",
                    multiplicationMode: "per_unit",
                  },
                ],
                units: [
                  {
                    id: "u1",
                    unitTypeId: null,
                    widthMm: 600,
                    heightMm: 720,
                    depthMm: 600,
                    qty: 2,
                    components: [],
                  },
                  {
                    id: "u2",
                    unitTypeId: null,
                    widthMm: 600,
                    heightMm: 720,
                    depthMm: 600,
                    qty: 2,
                    components: [],
                  },
                ],
              },
            ],
          },
        ],
      };

      // Total unit qty = 2 + 2 = 4
      const priced = priceQuote(quote, mockCatalog);
      const section = priced.products[0].sections[0];

      const oneTimeComp = section.components?.find((c) => c.id === "sc-onetime");
      const perUnitComp = section.components?.find((c) => c.id === "sc-perunit");

      // one_time: 1 * 45 = 45 EGP
      expect(oneTimeComp?.computedAmount).toBe(45);
      expect(oneTimeComp?.totalConsumption).toBe(1);

      // per_unit: 1 * 45 * 4 = 180 EGP
      expect(perUnitComp?.computedAmount).toBe(180);
      expect(perUnitComp?.totalConsumption).toBe(4);
    });

    it("inherits Section veneer when unit veneer component has no catalogId", () => {
      const quote: QuoteInput = {
        products: [
          {
            id: "p1",
            sections: [
              {
                id: "s1",
                label: "Veneer Section",
                veneerId: "ven-oak", // 320 EGP/m²
                units: [
                  {
                    id: "u1",
                    unitTypeId: null,
                    widthMm: 1000,
                    heightMm: 1000,
                    depthMm: 600,
                    qty: 1,
                    components: [
                      {
                        id: "uc-veneer",
                        kind: "veneer",
                        catalogId: null, // inherits from section.veneerId
                        qty: 1,
                        unitOfMeasure: "m2",
                        areaFunctionKey: "door_panel", // 1.0 * 1.0 = 1.0 m²
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const priced = priceQuote(quote, mockCatalog);
      const unit = priced.products[0].sections[0].units[0];
      const comp = unit.components[0];

      // 1.0 m² * 320 EGP/m² = 320 EGP
      expect(comp.pricingStatus).toBe("priced");
      expect(comp.computedAmount).toBe(320);
    });
  });
});
