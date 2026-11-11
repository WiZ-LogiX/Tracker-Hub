import { describe, it, expect } from "vitest";
import {
  componentAmount,
  componentAmountDetails,
  type ComponentLike,
  type CatalogEntityLike,
} from "./componentAmount";
import {
  priceQuote,
  type CatalogLookup,
  type QuoteInput,
  type UnitInput,
} from "./engine-v3";

describe("Task 20: Catalog Pricing Architecture Rebuild", () => {
  const noWastageRule = () => null;

  // ── CASE 1: Single Panel (600x800mm, Qty 1, 500 EGP/m², 0% wastage) ──────
  describe("CASE 1: Single Panel 600x800mm, Qty 1, 500 EGP/m², 0% wastage", () => {
    const comp: ComponentLike = {
      kind: "material",
      catalogId: "mat-mdf-500",
      qty: 1,
      unitOfMeasure: "m2",
      areaFunctionKey: "door_panel",
    };
    const entity: CatalogEntityLike = {
      pricingUnit: "m2",
      pricePerUnit: 500,
      defaultWastagePct: 0,
    };
    const dims = { w: 600, h: 800, d: 600 };

    it("calculates exact area of 0.48 m²", () => {
      const details = componentAmountDetails(comp, entity, dims, noWastageRule);
      expect(details.consumptionPerItem).toBe(0.48);
      expect(details.totalConsumption).toBe(0.48);
      expect(details.consumptionUnit).toBe("m²");
    });

    it("calculates exact manufacturing cost of 240.00 EGP with zero wastage", () => {
      const details = componentAmountDetails(comp, entity, dims, noWastageRule);
      expect(details.baseCost).toBe(240);
      expect(details.wastageCost).toBe(0);
      expect(details.amount).toBe(240);
      expect(details.pricingBasis).toBe("500.00 EGP / m²");
      expect(componentAmount(comp, entity, dims, noWastageRule)).toBe(240);
    });
  });

  // ── CASE 2: Same Panel with 10% Wastage ──────────────────────────────────
  describe("CASE 2: Same Panel with 10% Wastage", () => {
    const comp: ComponentLike = {
      kind: "material",
      catalogId: "mat-mdf-500-w10",
      qty: 1,
      unitOfMeasure: "m2",
      areaFunctionKey: "door_panel",
    };
    const entity: CatalogEntityLike = {
      pricingUnit: "m2",
      pricePerUnit: 500,
      defaultWastagePct: 10,
    };
    const dims = { w: 600, h: 800, d: 600 };

    it("calculates base cost of 240 EGP + 10% wastage = 264.00 EGP", () => {
      const details = componentAmountDetails(comp, entity, dims, noWastageRule);
      expect(details.baseCost).toBe(240);
      expect(details.wastagePct).toBe(10);
      expect(details.wastageCost).toBe(24);
      expect(details.amount).toBe(264);
      expect(componentAmount(comp, entity, dims, noWastageRule)).toBe(264);
    });
  });

  // ── CASE 3: Three Panels (Qty 3) with 10% Wastage ─────────────────────────
  describe("CASE 3: Three Panels (Qty 3) with 10% Wastage", () => {
    const comp: ComponentLike = {
      kind: "material",
      catalogId: "mat-mdf-500-w10",
      qty: 3,
      unitOfMeasure: "m2",
      areaFunctionKey: "door_panel",
    };
    const entity: CatalogEntityLike = {
      pricingUnit: "m2",
      pricePerUnit: 500,
      defaultWastagePct: 10,
    };
    const dims = { w: 600, h: 800, d: 600 };

    it("calculates total consumption of 1.44 m² (3 x 0.48 m²)", () => {
      const details = componentAmountDetails(comp, entity, dims, noWastageRule);
      expect(details.consumptionPerItem).toBe(0.48);
      expect(details.totalConsumption).toBe(1.44);
    });

    it("calculates base cost 720 EGP + 72 EGP wastage = 792.00 EGP", () => {
      const details = componentAmountDetails(comp, entity, dims, noWastageRule);
      expect(details.baseCost).toBe(720);
      expect(details.wastageCost).toBe(72);
      expect(details.amount).toBeCloseTo(792, 2);
      expect(componentAmount(comp, entity, dims, noWastageRule)).toBeCloseTo(792, 2);
    });
  });

  // ── CASE 4: Hardware Hinge 120 EGP/pc, Qty 4 ─────────────────────────────
  describe("CASE 4: Hardware Hinge 120 EGP/pc, Qty 4", () => {
    const comp: ComponentLike = {
      kind: "hardware",
      catalogId: "hw-hinge-soft",
      qty: 4,
      unitOfMeasure: "pcs",
    };
    const entity: CatalogEntityLike = {
      pricingUnit: "piece",
      pricePerPiece: 120,
    };
    const dims = { w: 600, h: 800, d: 600 };

    it("calculates 4 x 120 = 480.00 EGP with unit label pc", () => {
      const details = componentAmountDetails(comp, entity, dims, noWastageRule);
      expect(details.consumptionPerItem).toBe(1);
      expect(details.totalConsumption).toBe(4);
      expect(details.consumptionUnit).toBe("pc");
      expect(details.unitPrice).toBe(120);
      expect(details.pricingBasis).toBe("120.00 EGP / pc");
      expect(details.amount).toBe(480);
      expect(componentAmount(comp, entity, dims, noWastageRule)).toBe(480);
    });
  });

  // ── CASE 5: Hardware Runner 350 EGP/set, Qty 2 ───────────────────────────
  describe("CASE 5: Hardware Runner 350 EGP/set, Qty 2", () => {
    const comp: ComponentLike = {
      kind: "hardware",
      catalogId: "hw-runner-undermount",
      qty: 2,
      unitOfMeasure: "set",
    };
    const entity: CatalogEntityLike = {
      pricingUnit: "set",
      pricePerPiece: 350,
    };
    const dims = { w: 600, h: 800, d: 600 };

    it("calculates 2 x 350 = 700.00 EGP with unit label set", () => {
      const details = componentAmountDetails(comp, entity, dims, noWastageRule);
      expect(details.consumptionPerItem).toBe(1);
      expect(details.totalConsumption).toBe(2);
      expect(details.consumptionUnit).toBe("set");
      expect(details.unitPrice).toBe(350);
      expect(details.pricingBasis).toBe("350.00 EGP / set");
      expect(details.amount).toBe(700);
      expect(componentAmount(comp, entity, dims, noWastageRule)).toBe(700);
    });
  });

  // ── CASE 6: Multiple Components in One Unit (240 + 480 + 350 = 1070 EGP) ──
  describe("CASE 6: Multiple Components in One Unit", () => {
    const catalog: CatalogLookup = {
      materials: {
        "mat-1": { id: "mat-1", pricingUnit: "m2", pricePerUnit: 500, defaultWastagePct: 0 },
      },
      hardware: {
        "hw-hinge": { id: "hw-hinge", pricePerPiece: 120, pricingUnit: "piece" },
        "hw-runner": { id: "hw-runner", pricePerPiece: 350, pricingUnit: "set" },
      },
      accessories: {},
      manufacturingOps: {},
      veneers: {},
      finishes: {},
      edgeBands: {},
      pricingFactors: [],
      wastageRules: [],
      feesCredits: [],
    };

    const unit: UnitInput = {
      id: "unit-case6",
      unitTypeId: null,
      widthMm: 600,
      heightMm: 800,
      depthMm: 600,
      qty: 1,
      components: [
        { id: "c1", kind: "material", catalogId: "mat-1", qty: 1, unitOfMeasure: "m2", areaFunctionKey: "door_panel" },
        { id: "c2", kind: "hardware", catalogId: "hw-hinge", qty: 4, unitOfMeasure: "pcs" },
        { id: "c3", kind: "hardware", catalogId: "hw-runner", qty: 1, unitOfMeasure: "set" },
      ],
    };

    it("sums components accurately: 240 + 480 + 350 = 1070.00 EGP", () => {
      const quoteInput: QuoteInput = {
        products: [
          {
            id: "p1",
            sections: [
              {
                id: "s1",
                units: [unit],
              },
            ],
          },
        ],
      };

      const result = priceQuote(quoteInput, catalog);
      const computedUnit = result.products[0].sections[0].units[0];

      expect(computedUnit.components[0].computedAmount).toBe(240);
      expect(computedUnit.components[1].computedAmount).toBe(480);
      expect(computedUnit.components[2].computedAmount).toBe(350);
      expect(computedUnit.computedUnitCost).toBe(1070);
      expect(computedUnit.computedUnitPrice).toBe(1070);
      expect(result.breakdown.subTotal).toBe(1070);
    });
  });

  // ── CASE 7: Multi-Unit Multipliers and Isolation ─────────────────────────
  describe("CASE 7: Multi-Unit Multipliers and Isolation", () => {
    const catalog: CatalogLookup = {
      materials: {
        "mat-1": { id: "mat-1", pricingUnit: "m2", pricePerUnit: 500, defaultWastagePct: 0 },
      },
      hardware: {
        "hw-hinge": { id: "hw-hinge", pricePerPiece: 120, pricingUnit: "piece" },
      },
      accessories: {},
      manufacturingOps: {},
      veneers: {},
      finishes: {},
      edgeBands: {},
      pricingFactors: [],
      wastageRules: [],
      feesCredits: [],
    };

    const quoteInput: QuoteInput = {
      products: [
        {
          id: "p1",
          sections: [
            {
              id: "s1",
              units: [
                // Unit 1: Qty 2 (Cost 240 + 480 = 720 EGP/unit * 2 = 1440 EGP)
                {
                  id: "u1",
                  unitTypeId: null,
                  widthMm: 600,
                  heightMm: 800,
                  depthMm: 600,
                  qty: 2,
                  components: [
                    { id: "c1", kind: "material", catalogId: "mat-1", qty: 1, unitOfMeasure: "m2", areaFunctionKey: "door_panel" },
                    { id: "c2", kind: "hardware", catalogId: "hw-hinge", qty: 4, unitOfMeasure: "pcs" },
                  ],
                },
                // Unit 2: Qty 1 (Cost 240 EGP/unit * 1 = 240 EGP)
                {
                  id: "u2",
                  unitTypeId: null,
                  widthMm: 600,
                  heightMm: 800,
                  depthMm: 600,
                  qty: 1,
                  components: [
                    { id: "c3", kind: "material", catalogId: "mat-1", qty: 1, unitOfMeasure: "m2", areaFunctionKey: "door_panel" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    it("multiplies unit costs by unit qty without double-multiplying components", () => {
      const result = priceQuote(quoteInput, catalog);
      const s = result.products[0].sections[0];

      expect(s.units[0].computedUnitCost).toBe(720);
      expect(s.units[0].computedTotalCost).toBe(1440); // 720 * 2
      expect(s.units[0].computedTotalPrice).toBe(1440);

      expect(s.units[1].computedUnitCost).toBe(240);
      expect(s.units[1].computedTotalCost).toBe(240);

      expect(s.computedCost).toBe(1680); // 1440 + 240
      expect(s.computedPrice).toBe(1680);
      expect(result.breakdown.subTotal).toBe(1680);
    });
  });

  // ── CASE 8: Multi-Product and Tenant Isolation ────────────────────────────
  describe("CASE 8: Multi-Product Hierarchy and Tenant Isolation", () => {
    const tenantACatalog: CatalogLookup = {
      materials: {
        "tenantA-mat": { id: "tenantA-mat", pricingUnit: "m2", pricePerUnit: 400, defaultWastagePct: 0 },
      },
      hardware: {},
      accessories: {},
      manufacturingOps: {},
      veneers: {},
      finishes: {},
      edgeBands: {},
      pricingFactors: [],
      wastageRules: [],
      feesCredits: [],
    };

    it("isolates multiple products cleanly in quote output", () => {
      const quoteInput: QuoteInput = {
        products: [
          {
            id: "p1",
            sections: [
              {
                id: "s1",
                units: [
                  {
                    id: "u1",
                    unitTypeId: null,
                    widthMm: 1000,
                    heightMm: 1000,
                    depthMm: 600,
                    qty: 1,
                    components: [
                      { id: "c1", kind: "material", catalogId: "tenantA-mat", qty: 1, unitOfMeasure: "m2", areaFunctionKey: "door_panel" },
                    ],
                  },
                ],
              },
            ],
          },
          {
            id: "p2",
            sections: [
              {
                id: "s2",
                units: [
                  {
                    id: "u2",
                    unitTypeId: null,
                    widthMm: 1000,
                    heightMm: 1000,
                    depthMm: 600,
                    qty: 2,
                    components: [
                      { id: "c2", kind: "material", catalogId: "tenantA-mat", qty: 1, unitOfMeasure: "m2", areaFunctionKey: "door_panel" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = priceQuote(quoteInput, tenantACatalog);
      expect(result.products[0].computedPrice).toBe(400); // 1 * 1m² * 400
      expect(result.products[1].computedPrice).toBe(800); // 2 * 1m² * 400
      expect(result.breakdown.subTotal).toBe(1200);
    });

    it("rejects cross-tenant catalog IDs with pricing_required status instead of silent 0", () => {
      const quoteInput: QuoteInput = {
        products: [
          {
            id: "p1",
            sections: [
              {
                id: "s1",
                units: [
                  {
                    id: "u1",
                    unitTypeId: null,
                    widthMm: 1000,
                    heightMm: 1000,
                    depthMm: 600,
                    qty: 1,
                    components: [
                      // Catalog ID from Tenant B not in Tenant A lookup
                      { id: "c-cross", kind: "material", catalogId: "tenantB-secret-mat", qty: 1, unitOfMeasure: "m2" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = priceQuote(quoteInput, tenantACatalog);
      const compOut = result.products[0].sections[0].units[0].components[0];

      expect(compOut.pricingStatus).toBe("pricing_required");
      expect(compOut.errorMessage).toContain("Pricing information required");
      expect(compOut.computedAmount).toBe(0);
    });
  });

  // ── Edge Band Linear Metres ──────────────────────────────────────────────
  describe("Edge Band Perimeter Pricing", () => {
    const comp: ComponentLike = {
      kind: "edge_band",
      catalogId: "eb-pvc-1mm",
      qty: 1,
      unitOfMeasure: "m",
      areaFunctionKey: "edge_band",
    };
    const entity: CatalogEntityLike = {
      pricingUnit: "m",
      pricePerUnit: 15,
      defaultWastagePct: 0,
    };
    const dims = { w: 600, h: 800, d: 600 };

    it("calculates perimeter 2 x (0.6 + 0.8) = 2.8 linear metres", () => {
      const details = componentAmountDetails(comp, entity, dims, noWastageRule);
      expect(details.consumptionPerItem).toBe(2.8);
      expect(details.totalConsumption).toBe(2.8);
      expect(details.consumptionUnit).toBe("m");
      expect(details.baseCost).toBe(42); // 2.8 * 15
      expect(details.amount).toBe(42);
    });
  });

  // ── Unlinked Custom Component Zero Silent Drop Protection ─────────────────
  describe("Unlinked Custom Component Protection", () => {
    it("flags null catalogId with pricing_required", () => {
      const catalog: CatalogLookup = {
        materials: {},
        hardware: {},
        accessories: {},
        manufacturingOps: {},
        veneers: {},
        finishes: {},
        edgeBands: {},
        pricingFactors: [],
        wastageRules: [],
        feesCredits: [],
      };

      const quoteInput: QuoteInput = {
        products: [
          {
            id: "p1",
            sections: [
              {
                id: "s1",
                units: [
                  {
                    id: "u1",
                    unitTypeId: null,
                    widthMm: 800,
                    heightMm: 720,
                    depthMm: 600,
                    qty: 1,
                    components: [
                      { id: "custom-comp", kind: "material", catalogId: null, qty: 1, unitOfMeasure: "m2" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = priceQuote(quoteInput, catalog);
      const compOut = result.products[0].sections[0].units[0].components[0];

      expect(compOut.pricingStatus).toBe("pricing_required");
      expect(compOut.errorMessage).toBe("Pricing information required (unlinked catalog item)");
    });
  });

  // ── Catalog Replacement / Swapping ────────────────────────────────────────
  describe("Catalog Item Replacement / Swapping", () => {
    const catalog: CatalogLookup = {
      materials: {
        "mat-standard": { id: "mat-standard", pricingUnit: "m2", pricePerUnit: 500, defaultWastagePct: 0 },
        "mat-premium": { id: "mat-premium", pricingUnit: "m2", pricePerUnit: 800, defaultWastagePct: 0 },
      },
      hardware: {},
      accessories: {},
      manufacturingOps: {},
      veneers: {},
      finishes: {},
      edgeBands: {},
      pricingFactors: [],
      wastageRules: [],
      feesCredits: [],
    };

    it("swapping standard material to premium material updates cost from 240 to 384 EGP", () => {
      const dims = { widthMm: 600, heightMm: 800, depthMm: 600 };

      // Initial quote with standard material
      const initialQuote: QuoteInput = {
        products: [
          {
            id: "p1",
            sections: [
              {
                id: "s1",
                units: [
                  {
                    id: "u1",
                    unitTypeId: null,
                    ...dims,
                    qty: 1,
                    components: [
                      { id: "comp-1", kind: "material", catalogId: "mat-standard", qty: 1, unitOfMeasure: "m2", areaFunctionKey: "door_panel" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const resInitial = priceQuote(initialQuote, catalog);
      expect(resInitial.breakdown.subTotal).toBe(240); // 0.48 * 500

      // Replace catalog item on the same component
      const updatedQuote: QuoteInput = {
        products: [
          {
            id: "p1",
            sections: [
              {
                id: "s1",
                units: [
                  {
                    id: "u1",
                    unitTypeId: null,
                    ...dims,
                    qty: 1,
                    components: [
                      { id: "comp-1", kind: "material", catalogId: "mat-premium", qty: 1, unitOfMeasure: "m2", areaFunctionKey: "door_panel" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const resUpdated = priceQuote(updatedQuote, catalog);
      expect(resUpdated.breakdown.subTotal).toBe(384); // 0.48 * 800
    });
  });
});
