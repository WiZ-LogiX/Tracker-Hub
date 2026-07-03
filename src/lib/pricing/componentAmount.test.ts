/**
 * componentAmount tests.
 *
 * One test per pricing_unit + coefficient case, wastage precedence,
 * missing-price rejection, and edge cases.
 */
import { describe, it, expect } from "vitest";
import {
  componentAmount,
  type ComponentLike,
  type CatalogEntityLike,
  type WastageLookup,
  type WastageResult,
} from "@/lib/pricing/componentAmount";

// ── Helpers ────────────────────────────────────────────────────────────────

const DIMS_600_720_600 = { w: 600, h: 720, d: 600 };
const DIMS_800_600_500 = { w: 800, h: 600, d: 500 };

function noWastageLookup(): WastageLookup {
  return () => null;
}

function wastageWithPrecision(pct: number, precision: number): WastageLookup {
  return () => ({ pct, precision });
}

function precedenceWastage(
  materialRules: Record<string, WastageResult>,
  typeRules: Record<string, WastageResult>,
): WastageLookup {
  // Handles full precedence in one call:
  //   1. material scope (ref = material id)
  //   2. material_type scope with "default" key (catch-all)
  return (_scope, ref) => {
    if (materialRules[ref]) return materialRules[ref];
    if (typeRules["default"]) return typeRules["default"];
    return null;
  };
}

function mat(
  overrides: Partial<CatalogEntityLike> & { pricePerUnit: number },
): CatalogEntityLike {
  return {
    pricingUnit: "m2",
    defaultWastagePct: 0,
    coefficient: null,
    boardPrice: null,
    ...overrides,
  };
}

function hw(price: number): CatalogEntityLike {
  return { pricePerPiece: price };
}

function acc(price: number): CatalogEntityLike {
  return { pricePerPiece: price };
}

function mfg(rateUnit: string, rate: number): CatalogEntityLike {
  return { rateUnit, rate };
}

const NO_W = noWastageLookup();

// ── 1. Material — m2 pricing ───────────────────────────────────────────────

describe("material — m2 pricing", () => {
  it("area × price with no wastage", () => {
    const comp: ComponentLike = {
      kind: "material",
      qty: 1,
      unitOfMeasure: "m2",
      areaFunctionKey: "cabinet_side",
    };
    const entity = mat({ pricingUnit: "m2", pricePerUnit: 100 });
    const result = componentAmount(comp, entity, DIMS_600_720_600, NO_W);
    expect(result).toBeCloseTo(43.2, 6);
  });

  it("area × price × (1 + wastage%)", () => {
    const comp: ComponentLike = {
      kind: "material",
      qty: 1,
      unitOfMeasure: "m2",
      areaFunctionKey: "cabinet_side",
    };
    const entity = mat({ pricingUnit: "m2", pricePerUnit: 100, defaultWastagePct: 10 });
    const result = componentAmount(comp, entity, DIMS_600_720_600, NO_W);
    expect(result).toBeCloseTo(47.52, 6);
  });

  it("qty > 1 multiplies area", () => {
    const comp: ComponentLike = {
      kind: "material",
      qty: 2,
      unitOfMeasure: "m2",
      areaFunctionKey: "cabinet_side",
    };
    const entity = mat({ pricingUnit: "m2", pricePerUnit: 100 });
    const result = componentAmount(comp, entity, DIMS_600_720_600, NO_W);
    expect(result).toBeCloseTo(86.4, 6);
  });
});

// ── 2. Material — m pricing ────────────────────────────────────────────────

describe("material — m pricing (linear metres)", () => {
  it("width/1000 × qty × price", () => {
    const comp: ComponentLike = {
      kind: "material",
      qty: 1,
      unitOfMeasure: "m",
      areaFunctionKey: "cabinet_side",
    };
    const entity = mat({ pricingUnit: "m", pricePerUnit: 50 });
    const result = componentAmount(comp, entity, DIMS_600_720_600, NO_W);
    expect(result).toBeCloseTo(30, 6);
  });
});

// ── 3. Material — pcs pricing ──────────────────────────────────────────────

describe("material — pcs pricing (quantity)", () => {
  it("qty × price", () => {
    const comp: ComponentLike = {
      kind: "material",
      qty: 4,
      unitOfMeasure: "pcs",
    };
    const entity = mat({ pricingUnit: "pcs", pricePerUnit: 25 });
    const result = componentAmount(comp, entity, DIMS_600_720_600, NO_W);
    expect(result).toBe(100);
  });
});

// ── 4. Material — piece pricing (alias for pcs) ────────────────────────────

describe("material — piece pricing", () => {
  it("qty × price (piece alias)", () => {
    const comp: ComponentLike = {
      kind: "material",
      qty: 3,
      unitOfMeasure: "piece",
    };
    const entity = mat({ pricingUnit: "piece", pricePerUnit: 20 });
    const result = componentAmount(comp, entity, DIMS_600_720_600, NO_W);
    expect(result).toBe(60);
  });
});

// ── 5. Board-yield (coefficient × board_price) ─────────────────────────────

describe("board-yield (coefficient × board_price)", () => {
  it("qty × coefficient × board_price with no rounding", () => {
    const comp: ComponentLike = {
      kind: "material",
      qty: 1,
      unitOfMeasure: "m2",
      areaFunctionKey: "cabinet_side",
    };
    const entity = mat({
      pricePerUnit: 100,
      coefficient: 0.133,
      boardPrice: 1500,
    });
    const result = componentAmount(comp, entity, DIMS_600_720_600, NO_W);
    expect(result).toBeCloseTo(199.5, 6);
  });

  it("rounds to precision from wastage rule", () => {
    const comp: ComponentLike = {
      kind: "material",
      qty: 1,
      unitOfMeasure: "m2",
      areaFunctionKey: "cabinet_side",
    };
    const entity = mat({
      pricePerUnit: 100,
      coefficient: 0.21,
      boardPrice: 1500,
    });
    const lookup = wastageWithPrecision(5, 0);
    const result = componentAmount(comp, entity, DIMS_600_720_600, lookup);
    expect(result).toBe(331);
  });

  it("qty > 1 multiplies coefficient × board_price", () => {
    const comp: ComponentLike = {
      kind: "material",
      qty: 2,
      unitOfMeasure: "m2",
      areaFunctionKey: "shelf",
    };
    const entity = mat({
      pricePerUnit: 100,
      coefficient: 0.25,
      boardPrice: 2000,
    });
    const result = componentAmount(comp, entity, DIMS_600_720_600, NO_W);
    expect(result).toBe(1000);
  });
});

// ── 6. Hardware ─────────────────────────────────────────────────────────────

describe("hardware — qty × price_per_piece", () => {
  it("6 hinges × 15 = 90", () => {
    const comp: ComponentLike = {
      kind: "hardware",
      qty: 6,
      unitOfMeasure: "pcs",
    };
    const result = componentAmount(comp, hw(15), DIMS_600_720_600, NO_W);
    expect(result).toBe(90);
  });
});

// ── 7. Accessory ────────────────────────────────────────────────────────────

describe("accessory — qty × price_per_piece", () => {
  it("2 handles × 50 = 100", () => {
    const comp: ComponentLike = {
      kind: "accessory",
      qty: 2,
      unitOfMeasure: "pcs",
    };
    const result = componentAmount(comp, acc(50), DIMS_600_720_600, NO_W);
    expect(result).toBe(100);
  });
});

// ── 8. Manufacturing — piece rate ──────────────────────────────────────────

describe("manufacturing — piece rate", () => {
  it("qty × rate", () => {
    const comp: ComponentLike = {
      kind: "manufacturing",
      qty: 3,
      unitOfMeasure: "pcs",
    };
    const result = componentAmount(comp, mfg("piece", 30), DIMS_600_720_600, NO_W);
    expect(result).toBe(90);
  });
});

// ── 9. Manufacturing — minute rate ─────────────────────────────────────────

describe("manufacturing — minute rate", () => {
  it("qty × rate (time-based)", () => {
    const comp: ComponentLike = {
      kind: "manufacturing",
      qty: 5,
      unitOfMeasure: "pcs",
    };
    const result = componentAmount(comp, mfg("minute", 10), DIMS_600_720_600, NO_W);
    expect(result).toBe(50);
  });
});

// ── 10. Manufacturing — m rate ─────────────────────────────────────────────

describe("manufacturing — m rate (linear metres)", () => {
  it("qty × (w/1000) × rate", () => {
    const comp: ComponentLike = {
      kind: "manufacturing",
      qty: 1,
      unitOfMeasure: "m",
    };
    const result = componentAmount(comp, mfg("m", 20), DIMS_600_720_600, NO_W);
    expect(result).toBeCloseTo(12, 6);
  });
});

// ── 11. Manufacturing — m2 rate ────────────────────────────────────────────

describe("manufacturing — m2 rate", () => {
  it("with areaFunctionKey: qty × area × rate", () => {
    const comp: ComponentLike = {
      kind: "manufacturing",
      qty: 1,
      unitOfMeasure: "m2",
      areaFunctionKey: "cabinet_side",
    };
    const result = componentAmount(comp, mfg("m2", 20), DIMS_600_720_600, NO_W);
    expect(result).toBeCloseTo(8.64, 6);
  });

  it("without areaFunctionKey: w×h fallback", () => {
    const comp: ComponentLike = {
      kind: "manufacturing",
      qty: 1,
      unitOfMeasure: "m2",
    };
    const result = componentAmount(comp, mfg("m2", 20), DIMS_800_600_500, NO_W);
    expect(result).toBeCloseTo(9.6, 6);
  });
});

// ── 12. Wastage precedence ─────────────────────────────────────────────────

describe("wastage precedence", () => {
  const comp: ComponentLike = {
    kind: "material",
    qty: 1,
    unitOfMeasure: "m2",
    areaFunctionKey: "cabinet_side",
  };
  const entity = mat({ pricingUnit: "m2", pricePerUnit: 100 });

  it("material rule beats material_type rule", () => {
    const lookup = precedenceWastage(
      { cabinet_side: { pct: 20 } },
      { default: { pct: 5 } },
    );
    const result = componentAmount(comp, entity, DIMS_600_720_600, lookup);
    expect(result).toBeCloseTo(51.84, 6);
  });

  it("material_type rule used when no material rule exists", () => {
    const lookup = precedenceWastage(
      {},
      { default: { pct: 8 } },
    );
    const result = componentAmount(comp, entity, DIMS_600_720_600, lookup);
    expect(result).toBeCloseTo(46.656, 6);
  });

  it("catalog defaultWastagePct used when no rule matches", () => {
    const entityWithDefault = mat({
      pricingUnit: "m2",
      pricePerUnit: 100,
      defaultWastagePct: 12,
    });
    const lookup = precedenceWastage({}, {});
    const result = componentAmount(comp, entityWithDefault, DIMS_600_720_600, lookup);
    expect(result).toBeCloseTo(48.384, 6);
  });
});

// ── 13. Missing price rejection ────────────────────────────────────────────

describe("missing price → throws", () => {
  it("material with undefined pricePerUnit", () => {
    const comp: ComponentLike = {
      kind: "material",
      qty: 1,
      unitOfMeasure: "m2",
      areaFunctionKey: "cabinet_side",
    };
    const entity: CatalogEntityLike = { pricingUnit: "m2", defaultWastagePct: 0 };
    expect(() =>
      componentAmount(comp, entity, DIMS_600_720_600, NO_W),
    ).toThrow(/missing pricePerUnit/i);
  });

  it("hardware with undefined pricePerPiece", () => {
    const comp: ComponentLike = {
      kind: "hardware",
      qty: 1,
      unitOfMeasure: "pcs",
    };
    expect(() =>
      componentAmount(comp, {}, DIMS_600_720_600, NO_W),
    ).toThrow(/missing pricePerPiece/i);
  });

  it("accessory with undefined pricePerPiece", () => {
    const comp: ComponentLike = {
      kind: "accessory",
      qty: 1,
      unitOfMeasure: "pcs",
    };
    expect(() =>
      componentAmount(comp, {}, DIMS_600_720_600, NO_W),
    ).toThrow(/missing pricePerPiece/i);
  });

  it("manufacturing with undefined rate", () => {
    const comp: ComponentLike = {
      kind: "manufacturing",
      qty: 1,
      unitOfMeasure: "pcs",
    };
    expect(() =>
      componentAmount(comp, {}, DIMS_600_720_600, NO_W),
    ).toThrow(/missing rate/i);
  });

  it("material with m2 pricingUnit and no areaFunctionKey", () => {
    const comp: ComponentLike = {
      kind: "material",
      qty: 1,
      unitOfMeasure: "m2",
    };
    const entity = mat({ pricingUnit: "m2", pricePerUnit: 100 });
    expect(() =>
      componentAmount(comp, entity, DIMS_600_720_600, NO_W),
    ).toThrow(/requires an areaFunctionKey/i);
  });
});

// ── 14. Edge banding — linear metres pricing ────────────────────────────────

describe("edge_band — linear metres pricing", () => {
  it("perimeter × qty × price with no wastage", () => {
    const comp: ComponentLike = {
      kind: "edge_band",
      qty: 1,
      unitOfMeasure: "m",
      areaFunctionKey: "edge_band",
    };
    const entity: CatalogEntityLike = {
      pricingUnit: "m",
      pricePerUnit: 25,
      defaultWastagePct: 0,
    };
    // 600×720: perimeter = 2 × (0.6 + 0.72) = 2.64 m
    const result = componentAmount(comp, entity, DIMS_600_720_600, NO_W);
    expect(result).toBeCloseTo(66, 6); // 2.64 × 1 × 25
  });

  it("perimeter × qty × price with wastage", () => {
    const comp: ComponentLike = {
      kind: "edge_band",
      qty: 1,
      unitOfMeasure: "m",
      areaFunctionKey: "edge_band",
    };
    const entity: CatalogEntityLike = {
      pricingUnit: "m",
      pricePerUnit: 25,
      defaultWastagePct: 10,
    };
    const result = componentAmount(comp, entity, DIMS_600_720_600, NO_W);
    expect(result).toBeCloseTo(72.6, 6); // 2.64 × 25 × 1.10
  });

  it("qty > 1 multiplies linear metres", () => {
    const comp: ComponentLike = {
      kind: "edge_band",
      qty: 3,
      unitOfMeasure: "m",
      areaFunctionKey: "edge_band",
    };
    const entity: CatalogEntityLike = {
      pricingUnit: "m",
      pricePerUnit: 20,
      defaultWastagePct: 0,
    };
    // 2.64 × 3 × 20 = 158.4
    const result = componentAmount(comp, entity, DIMS_600_720_600, NO_W);
    expect(result).toBeCloseTo(158.4, 6);
  });

  it("wastage lookup overrides catalog default", () => {
    const comp: ComponentLike = {
      kind: "edge_band",
      qty: 1,
      unitOfMeasure: "m",
      areaFunctionKey: "edge_band",
    };
    const entity: CatalogEntityLike = {
      pricingUnit: "m",
      pricePerUnit: 25,
      defaultWastagePct: 5,
    };
    const lookup: WastageLookup = () => ({ pct: 15 });
    const result = componentAmount(comp, entity, DIMS_600_720_600, lookup);
    // 2.64 × 25 = 66; × 1.15 = 75.9
    expect(result).toBeCloseTo(75.9, 6);
  });
});

// ── 14b. Veneer — m² pricing ───────────────────────────────────────────────

describe("veneer — m² pricing", () => {
  it("area × price with no wastage", () => {
    const comp: ComponentLike = {
      kind: "veneer",
      qty: 1,
      unitOfMeasure: "m2",
      areaFunctionKey: "door_panel",
    };
    const entity: CatalogEntityLike = {
      pricingUnit: "m2",
      pricePerUnit: 120,
      defaultWastagePct: 0,
    };
    // door_panel: 800 × 600 = 0.48 m²
    const result = componentAmount(comp, entity, DIMS_800_600_500, NO_W);
    expect(result).toBeCloseTo(57.6, 6);
  });

  it("area × price × (1 + wastage%)", () => {
    const comp: ComponentLike = {
      kind: "veneer",
      qty: 1,
      unitOfMeasure: "m2",
      areaFunctionKey: "cabinet_side",
    };
    const entity: CatalogEntityLike = {
      pricingUnit: "m2",
      pricePerUnit: 120,
      defaultWastagePct: 15,
    };
    // cabinet_side: 600 × 720 = 0.432 m²; 0.432 × 120 = 51.84; × 1.15 = 59.616
    const result = componentAmount(comp, entity, DIMS_600_720_600, NO_W);
    expect(result).toBeCloseTo(59.616, 6);
  });

  it("qty > 1 multiplies area", () => {
    const comp: ComponentLike = {
      kind: "veneer",
      qty: 3,
      unitOfMeasure: "m2",
      areaFunctionKey: "cabinet_side",
    };
    const entity: CatalogEntityLike = {
      pricingUnit: "m2",
      pricePerUnit: 100,
      defaultWastagePct: 0,
    };
    // 0.432 × 3 × 100 = 129.6
    const result = componentAmount(comp, entity, DIMS_600_720_600, NO_W);
    expect(result).toBeCloseTo(129.6, 6);
  });

  it("wastage lookup overrides catalog default", () => {
    const comp: ComponentLike = {
      kind: "veneer",
      qty: 1,
      unitOfMeasure: "m2",
      areaFunctionKey: "cabinet_side",
    };
    const entity: CatalogEntityLike = {
      pricingUnit: "m2",
      pricePerUnit: 100,
      defaultWastagePct: 5,
    };
    const lookup: WastageLookup = () => ({ pct: 20 });
    const result = componentAmount(comp, entity, DIMS_600_720_600, lookup);
    // 0.432 × 100 = 43.2; × 1.20 = 51.84
    expect(result).toBeCloseTo(51.84, 6);
  });
});

// ── 14c. Veneer — error cases ───────────────────────────────────────────────

describe("veneer — error cases", () => {
  it("missing pricePerUnit throws", () => {
    const comp: ComponentLike = {
      kind: "veneer",
      qty: 1,
      unitOfMeasure: "m2",
      areaFunctionKey: "door_panel",
    };
    const entity: CatalogEntityLike = { pricingUnit: "m2", defaultWastagePct: 0 };
    expect(() =>
      componentAmount(comp, entity, DIMS_800_600_500, NO_W),
    ).toThrow(/missing pricePerUnit/i);
  });

  it("missing areaFunctionKey throws", () => {
    const comp: ComponentLike = {
      kind: "veneer",
      qty: 1,
      unitOfMeasure: "m2",
    };
    const entity: CatalogEntityLike = {
      pricingUnit: "m2",
      pricePerUnit: 120,
      defaultWastagePct: 0,
    };
    expect(() =>
      componentAmount(comp, entity, DIMS_800_600_500, NO_W),
    ).toThrow(/requires an areaFunctionKey/i);
  });
});

// ── 14d. Finish — m² pricing ────────────────────────────────────────────────

describe("finish — m² pricing", () => {
  it("area × price with no wastage", () => {
    const comp: ComponentLike = {
      kind: "finish",
      qty: 1,
      unitOfMeasure: "m2",
      areaFunctionKey: "cabinet_side",
    };
    const entity: CatalogEntityLike = {
      pricingUnit: "m2",
      pricePerUnit: 80,
      defaultWastagePct: 0,
    };
    // cabinet_side: 600 × 720 = 0.432 m²; × 80 = 34.56
    const result = componentAmount(comp, entity, DIMS_600_720_600, NO_W);
    expect(result).toBeCloseTo(34.56, 6);
  });

  it("area × price × (1 + wastage%)", () => {
    const comp: ComponentLike = {
      kind: "finish",
      qty: 1,
      unitOfMeasure: "m2",
      areaFunctionKey: "door_panel",
    };
    const entity: CatalogEntityLike = {
      pricingUnit: "m2",
      pricePerUnit: 80,
      defaultWastagePct: 10,
    };
    // door_panel: 800 × 600 = 0.48 m²; × 80 = 38.4; × 1.10 = 42.24
    const result = componentAmount(comp, entity, DIMS_800_600_500, NO_W);
    expect(result).toBeCloseTo(42.24, 6);
  });

  it("qty > 1 multiplies area", () => {
    const comp: ComponentLike = {
      kind: "finish",
      qty: 4,
      unitOfMeasure: "m2",
      areaFunctionKey: "cabinet_side",
    };
    const entity: CatalogEntityLike = {
      pricingUnit: "m2",
      pricePerUnit: 100,
      defaultWastagePct: 0,
    };
    // 0.432 × 4 × 100 = 172.8
    const result = componentAmount(comp, entity, DIMS_600_720_600, NO_W);
    expect(result).toBeCloseTo(172.8, 6);
  });
});

// ── 14e. Finish — error cases ───────────────────────────────────────────────

describe("finish — error cases", () => {
  it("missing pricePerUnit throws", () => {
    const comp: ComponentLike = {
      kind: "finish",
      qty: 1,
      unitOfMeasure: "m2",
      areaFunctionKey: "cabinet_side",
    };
    const entity: CatalogEntityLike = { pricingUnit: "m2", defaultWastagePct: 0 };
    expect(() =>
      componentAmount(comp, entity, DIMS_600_720_600, NO_W),
    ).toThrow(/missing pricePerUnit/i);
  });

  it("missing areaFunctionKey throws", () => {
    const comp: ComponentLike = {
      kind: "finish",
      qty: 1,
      unitOfMeasure: "m2",
    };
    const entity: CatalogEntityLike = {
      pricingUnit: "m2",
      pricePerUnit: 80,
      defaultWastagePct: 0,
    };
    expect(() =>
      componentAmount(comp, entity, DIMS_600_720_600, NO_W),
    ).toThrow(/requires an areaFunctionKey/i);
  });
});

// ── 15. Edge banding — error cases ──────────────────────────────────────────

describe("edge_band — error cases", () => {
  it("missing pricePerUnit throws", () => {
    const comp: ComponentLike = {
      kind: "edge_band",
      qty: 1,
      unitOfMeasure: "m",
      areaFunctionKey: "edge_band",
    };
    const entity: CatalogEntityLike = { pricingUnit: "m", defaultWastagePct: 0 };
    expect(() =>
      componentAmount(comp, entity, DIMS_600_720_600, NO_W),
    ).toThrow(/missing pricePerUnit/i);
  });

  it("missing areaFunctionKey throws", () => {
    const comp: ComponentLike = {
      kind: "edge_band",
      qty: 1,
      unitOfMeasure: "m",
    };
    const entity: CatalogEntityLike = {
      pricingUnit: "m",
      pricePerUnit: 25,
      defaultWastagePct: 0,
    };
    expect(() =>
      componentAmount(comp, entity, DIMS_600_720_600, NO_W),
    ).toThrow(/requires an areaFunctionKey/i);
  });
});

// ── 18. Edge cases ─────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("qty = 0 returns 0", () => {
    const comp: ComponentLike = {
      kind: "material",
      qty: 0,
      unitOfMeasure: "m2",
      areaFunctionKey: "cabinet_side",
    };
    const entity = mat({ pricingUnit: "m2", pricePerUnit: 100 });
    expect(componentAmount(comp, entity, DIMS_600_720_600, NO_W)).toBe(0);
  });

  it("negative qty throws", () => {
    const comp: ComponentLike = {
      kind: "material",
      qty: -1,
      unitOfMeasure: "m2",
      areaFunctionKey: "cabinet_side",
    };
    const entity = mat({ pricingUnit: "m2", pricePerUnit: 100 });
    expect(() =>
      componentAmount(comp, entity, DIMS_600_720_600, NO_W),
    ).toThrow(/qty must be >= 0/);
  });

  it("unknown kind throws", () => {
    const comp = {
      kind: "unknown" as any,
      qty: 1,
      unitOfMeasure: "pcs",
    };
    expect(() =>
      componentAmount(comp, {}, DIMS_600_720_600, NO_W),
    ).toThrow(/Unknown component kind/);
  });

  it("manufacturing with unknown rateUnit throws", () => {
    const comp: ComponentLike = {
      kind: "manufacturing",
      qty: 1,
      unitOfMeasure: "pcs",
    };
    expect(() =>
      componentAmount(comp, mfg("unknown_unit", 10), DIMS_600_720_600, NO_W),
    ).toThrow(/Unknown manufacturing rate_unit/);
  });
});

// ── 17. Full integration: base cabinet components ──────────────────────────

describe("full integration: base cabinet 600×720×600 with edge banding", () => {
  it("prices all panels + edge banding", () => {
    const matEntity = mat({ pricingUnit: "m2", pricePerUnit: 150, defaultWastagePct: 5 });
    const edgeEntity: CatalogEntityLike = {
      pricingUnit: "m",
      pricePerUnit: 25,
      defaultWastagePct: 0,
    };

    // Panel components (m2)
    const panels: Array<{ areaFn: string; expectedArea: number }> = [
      { areaFn: "cabinet_side", expectedArea: 0.432 },
      { areaFn: "cabinet_side", expectedArea: 0.432 },
      { areaFn: "cabinet_top", expectedArea: 0.36 },
      { areaFn: "cabinet_bottom", expectedArea: 0.36 },
      { areaFn: "back_panel", expectedArea: 0.432 },
      { areaFn: "shelf", expectedArea: 0.36 },
    ];

    let totalArea = 0;
    for (const { areaFn, expectedArea } of panels) {
      const comp: ComponentLike = {
        kind: "material",
        qty: 1,
        unitOfMeasure: "m2",
        areaFunctionKey: areaFn,
      };
      const amount = componentAmount(comp, matEntity, DIMS_600_720_600, NO_W);
      expect(amount).toBeCloseTo(expectedArea * 150 * 1.05, 2);
      totalArea += expectedArea;
    }
    expect(totalArea).toBeCloseTo(2.376, 6);

    // Edge banding: perimeter of the cabinet panel = 2 × (0.6 + 0.72) = 2.64 m
    // In practice, the BOM would define edge banding per component (sides, top, shelf)
    // with qty representing the linear metres of that specific edge.
    // Here we test one full perimeter as a single edge_band component.
    const edgeComp: ComponentLike = {
      kind: "edge_band",
      qty: 1,
      unitOfMeasure: "m",
      areaFunctionKey: "edge_band",
    };
    const edgeAmount = componentAmount(edgeComp, edgeEntity, DIMS_600_720_600, NO_W);
    expect(edgeAmount).toBeCloseTo(66, 2); // 2.64 × 1 × 25
  });
});
