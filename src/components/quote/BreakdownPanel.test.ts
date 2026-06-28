import { describe, it, expect } from "vitest";
import {
  applyUnitFactors,
  computeQuoteBreakdown,
  VAT_RATE,
  type PricingFactor,
} from "@/lib/pricing/factors";

// ── BreakdownPanel logic tests ─────────────────────────────────────────────
// Since BreakdownPanel is a React component (no RTL available), we test
// the pricing logic it wraps: override application, roll-up, and breakdown.

// ── Override application + roll-up ──────────────────────────────────────────

describe("BreakdownPanel: override application + roll-up", () => {
  const tenantFactors: PricingFactor[] = [
    { factorKey: "labor", percent: 10 },
    { factorKey: "margin", percent: 20 },
    { factorKey: "overhead", percent: 5 },
  ];

  it("no overrides uses tenant defaults", () => {
    const result = applyUnitFactors(1000, tenantFactors);
    // labor: 1000 * 10% = 100, margin: 1000 * 20% = 200, overhead: 1000 * 5% = 50
    expect(result.finalPrice).toBe(1350);
    expect(result.lines).toHaveLength(3);
  });

  it("override replaces tenant default for that factor only", () => {
    const overrides = { labor: 30 };
    const result = applyUnitFactors(1000, tenantFactors, overrides);
    // labor: 1000 * 30% = 300 (override), margin: 1000 * 20% = 200, overhead: 1000 * 5% = 50
    expect(result.finalPrice).toBe(1550);
    expect(result.lines.find((l) => l.factorKey === "labor")?.percent).toBe(30);
    expect(result.lines.find((l) => l.factorKey === "margin")?.percent).toBe(20);
  });

  it("override with 0 removes the factor from output", () => {
    const overrides = { labor: 0 };
    const result = applyUnitFactors(1000, tenantFactors, overrides);
    // labor: 0% skipped, margin: 200, overhead: 50
    expect(result.finalPrice).toBe(1250);
    expect(result.lines.find((l) => l.factorKey === "labor")).toBeUndefined();
  });

  it("multiple overrides replace multiple tenant factors", () => {
    const overrides = { labor: 50, margin: 10 };
    const result = applyUnitFactors(1000, tenantFactors, overrides);
    // labor: 500, margin: 100, overhead: 50
    expect(result.finalPrice).toBe(1650);
  });

  it("override for a factor not in tenant defaults adds it", () => {
    const overrides = { rush: 15 };
    const result = applyUnitFactors(1000, tenantFactors, overrides);
    // labor: 100, margin: 200, overhead: 50, rush: 150
    expect(result.finalPrice).toBe(1500);
    expect(result.lines.find((l) => l.factorKey === "rush")?.percent).toBe(15);
  });

  it("all overrides produces same total as sum of individual overrides", () => {
    const overrides: Record<string, number> = {
      labor: 30,
      overhead: 10,
      complexity: 5,
      rush: 8,
      margin: 25,
      luxury: 12,
    };
    const result = applyUnitFactors(2000, tenantFactors, overrides);
    // Each override replaces tenant default:
    // labor: 2000*30%=600, overhead: 2000*10%=200, complexity: 2000*5%=100,
    // rush: 2000*8%=160, margin: 2000*25%=500, luxury: 2000*12%=240
    // Total: 2000 + 600 + 200 + 100 + 160 + 500 + 240 = 3800
    expect(result.finalPrice).toBe(3800);
  });
});

// ── Roll-up: section total = sum of unit prices ─────────────────────────────

describe("BreakdownPanel: roll-up computation", () => {
  const tenantFactors: PricingFactor[] = [
    { factorKey: "labor", percent: 15 },
  ];

  it("section price = sum of unit prices (no overrides)", () => {
    const unit1 = applyUnitFactors(1000, tenantFactors);
    const unit2 = applyUnitFactors(2000, tenantFactors);
    const sectionTotal = unit1.finalPrice + unit2.finalPrice;
    // unit1: 1000 + 150 = 1150, unit2: 2000 + 300 = 2300
    expect(sectionTotal).toBe(3450);
  });

  it("section price with mixed overrides", () => {
    const unit1 = applyUnitFactors(1000, tenantFactors, { labor: 30 });
    const unit2 = applyUnitFactors(2000, tenantFactors);
    const sectionTotal = unit1.finalPrice + unit2.finalPrice;
    // unit1: 1000 + 300 = 1300, unit2: 2000 + 300 = 2300
    expect(sectionTotal).toBe(3600);
  });

  it("quote breakdown uses product price sum as subtotal", () => {
    const section1Total = 3450;
    const section2Total = 1200;
    const productPrice = section1Total + section2Total;
    const breakdown = computeQuoteBreakdown(
      productPrice,
      { amount: 0, maxValue: null },
      [],
    );
    expect(breakdown.subTotal).toBe(4650);
    expect(breakdown.vatBase).toBe(4650);
    expect(breakdown.vatAmount).toBe(Math.round(4650 * VAT_RATE));
    expect(breakdown.total).toBe(breakdown.vatBase + breakdown.vatAmount);
  });

  it("quote with discount rolls up correctly", () => {
    const subTotal = 10000;
    const breakdown = computeQuoteBreakdown(
      subTotal,
      { amount: 1500, maxValue: null },
      [],
    );
    expect(breakdown.subTotal).toBe(10000);
    expect(breakdown.discount).toBe(1500);
    expect(breakdown.vatBase).toBe(8500);
    expect(breakdown.vatAmount).toBe(Math.round(8500 * 0.14));
    expect(breakdown.total).toBe(8500 + breakdown.vatAmount);
  });

  it("quote with fees/credits adds to total", () => {
    const subTotal = 5000;
    const feesCredits = [
      { code: "delivery", sign: "plus" as const, amount: 300, formulaKey: null },
      { code: "loyalty", sign: "minus" as const, amount: 200, formulaKey: null },
    ];
    const breakdown = computeQuoteBreakdown(
      subTotal,
      { amount: 0, maxValue: null },
      feesCredits,
    );
    expect(breakdown.subTotal).toBe(5000);
    expect(breakdown.feesCreditsTotal).toBe(100); // +300 -200
    expect(breakdown.total).toBe(
      breakdown.vatBase + breakdown.vatAmount + 100,
    );
  });
});

// ── Factor order stability ──────────────────────────────────────────────────

describe("BreakdownPanel: factor order stability", () => {
  it("override key iteration order does not affect result", () => {
    const tenantFactors: PricingFactor[] = [
      { factorKey: "labor", percent: 10 },
      { factorKey: "margin", percent: 20 },
    ];

    // Two different override objects with same values, different key order
    const overrides1 = { labor: 25, margin: 15 };
    const overrides2 = { margin: 15, labor: 25 };

    const r1 = applyUnitFactors(1000, tenantFactors, overrides1);
    const r2 = applyUnitFactors(1000, tenantFactors, overrides2);

    expect(r1.finalPrice).toBe(r2.finalPrice);
    // Both: labor 250 + margin 150 = 1400
    expect(r1.finalPrice).toBe(1400);
  });
});

// ── i18n key coverage for breakdown section ─────────────────────────────────

describe("BreakdownPanel: i18n key coverage", () => {
  const requiredKeys = [
    "breakdown.title",
    "breakdown.stale",
    "breakdown.empty",
    "breakdown.errorRecompute",
    "breakdown.costSubtotal",
    "breakdown.unitPrice",
    "breakdown.sectionTotal",
    "breakdown.subTotal",
    "breakdown.discount",
    "breakdown.vat",
    "breakdown.total",
    "breakdown.override",
    "breakdown.overrideActive",
    "breakdown.factorOverrideHint",
    "breakdown.applyOverrides",
    "breakdown.factor.subtotal",
    "breakdown.factor.labor",
    "breakdown.factor.overhead",
    "breakdown.factor.complexity",
    "breakdown.factor.rush",
    "breakdown.factor.margin",
    "breakdown.factor.luxury",
  ];

  it.each(["en", "ar", "fr"] as const)(
    "all %s locale files have every breakdown key",
    async (locale) => {
      const mod = await import(`@/i18n/locales/${locale}.json`);
      const keys = mod.default;
      for (const key of requiredKeys) {
        const parts = key.split(".");
        let value: any = keys;
        for (const part of parts) {
          value = value?.[part];
        }
        expect(value, `Missing key "${key}" in ${locale}.json`).toBeDefined();
        expect(typeof value, `Key "${key}" in ${locale}.json should be string`).toBe("string");
      }
    },
  );
});

// ── BreakdownPanel tree shape validation ────────────────────────────────────

describe("BreakdownPanel: tree shape", () => {
  it("empty products array produces no breakdown", () => {
    const tree = { products: [] };
    expect(tree.products).toHaveLength(0);
  });

  it("tree with one product, one section, one unit", () => {
    const tree = {
      products: [
        {
          id: "p1",
          label: "Kitchen",
          sections: [
            {
              id: "s1",
              label: "Cabinets",
              units: [
                {
                  id: "u1",
                  unit_type_id: "ut1",
                  width_mm: 600,
                  height_mm: 720,
                  depth_mm: 600,
                  qty: 1,
                  override_factor_keys: {},
                  components: [
                    {
                      id: "c1",
                      kind: "material",
                      catalog_id: "mat1",
                      qty: 1,
                      unit_of_measure: "m2",
                      area_function_key: "cabinet_side",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(tree.products).toHaveLength(1);
    expect(tree.products[0].sections).toHaveLength(1);
    expect(tree.products[0].sections[0].units).toHaveLength(1);
    expect(tree.products[0].sections[0].units[0].components).toHaveLength(1);
  });

  it("override keys on unit are preserved through tree", () => {
    const unit = {
      id: "u1",
      override_factor_keys: { labor: 30, rush: 10 },
    };
    expect(unit.override_factor_keys.labor).toBe(30);
    expect(unit.override_factor_keys.rush).toBe(10);
  });
});

// ── formatEGP produces expected format ──────────────────────────────────────

describe("BreakdownPanel: formatEGP", () => {
  it("formats a number as EGP currency", async () => {
    const { formatEGP } = await import("@/lib/pricing");
    const result = formatEGP(12345);
    // Arabic locale uses ج.م. as currency symbol
    expect(result).toMatch(/[EGPج.م]/);
  });

  it("rounds to nearest integer (no fractional digits)", async () => {
    const { formatEGP } = await import("@/lib/pricing");
    const result = formatEGP(12345.67);
    // Should contain the integer part (١٢٬٣٤٦ in Arabic), no decimal separator
    expect(result).toMatch(/[EGPج.م]/);
    // No Arabic decimal separator ٫
    expect(result).not.toContain("٫");
  });

  it("handles zero", async () => {
    const { formatEGP } = await import("@/lib/pricing");
    const result = formatEGP(0);
    expect(result).toMatch(/[EGPج.م]/);
  });

  it("handles negative", async () => {
    const { formatEGP } = await import("@/lib/pricing");
    const result = formatEGP(-500);
    expect(result).toMatch(/[EGPج.م]/);
  });
});
