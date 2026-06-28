import { describe, it, expect } from "vitest";
import {
  FACTOR_ORDER,
  VAT_RATE,
  applyUnitFactors,
  applyDiscount,
  computeQuoteBreakdown,
  type PricingFactor,
  type DiscountInput,
  type FeesCreditEntry,
} from "@/lib/pricing/factors";

// ── FACTOR_ORDER invariance ─────────────────────────────────────────────────

describe("FACTOR_ORDER", () => {
  it("contains exactly the 8 required keys in locked order", () => {
    expect(FACTOR_ORDER).toEqual([
      "subtotal",
      "labor",
      "overhead",
      "complexity",
      "rush",
      "margin",
      "luxury",
      "packaging",
    ]);
  });

  it("VAT_RATE is 0.14", () => {
    expect(VAT_RATE).toBe(0.14);
  });
});

// ── applyUnitFactors ────────────────────────────────────────────────────────

describe("applyUnitFactors", () => {
  const tenantFactors: PricingFactor[] = [
    { factorKey: "labor", percent: 15 },
    { factorKey: "margin", percent: 25 },
  ];

  it("applies factors in locked order regardless of input order", () => {
    // Shuffle input — result must be identical
    const shuffled: PricingFactor[] = [
      { factorKey: "margin", percent: 25 },
      { factorKey: "labor", percent: 15 },
    ];

    const r1 = applyUnitFactors(1000, tenantFactors);
    const r2 = applyUnitFactors(1000, shuffled);

    expect(r1.finalPrice).toBe(r2.finalPrice);
    expect(r1.lines).toEqual(r2.lines);
  });

  it("each factor is % of base cost (additive, not compounding)", () => {
    const result = applyUnitFactors(1000, tenantFactors);

    // labor: 1000 × 0.15 = 150, margin: 1000 × 0.25 = 250
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toEqual({ factorKey: "labor", percent: 15, amount: 150 });
    expect(result.lines[1]).toEqual({ factorKey: "margin", percent: 25, amount: 250 });
    expect(result.finalPrice).toBe(1400); // 1000 + 150 + 250
  });

  it("unit override wins over tenant factor", () => {
    const result = applyUnitFactors(1000, tenantFactors, { labor: 30 });

    // labor overridden to 30%: 1000 × 0.30 = 300
    expect(result.lines[0]).toEqual({ factorKey: "labor", percent: 30, amount: 300 });
    // margin from tenant: 1000 × 0.25 = 250
    expect(result.lines[1]).toEqual({ factorKey: "margin", percent: 25, amount: 250 });
    expect(result.finalPrice).toBe(1550); // 1000 + 300 + 250
  });

  it("override for a key not in tenant factors still applies", () => {
    const result = applyUnitFactors(1000, tenantFactors, { rush: 20 });

    // rush not in tenant → only override: 1000 × 0.20 = 200
    // labor from tenant: 150, margin from tenant: 250
    expect(result.lines).toHaveLength(3);
    expect(result.lines[0]).toEqual({ factorKey: "labor", percent: 15, amount: 150 });
    expect(result.lines[1]).toEqual({ factorKey: "rush", percent: 20, amount: 200 });
    expect(result.lines[2]).toEqual({ factorKey: "margin", percent: 25, amount: 250 });
    expect(result.finalPrice).toBe(1600); // 1000 + 150 + 200 + 250
  });

  it("missing override falls back to tenant factor", () => {
    const result = applyUnitFactors(1000, tenantFactors, { overhead: 10 });

    // overhead from override (not in tenant): 1000 × 0.10 = 100
    // labor from tenant: 150, margin from tenant: 250
    expect(result.lines).toHaveLength(3);
    expect(result.finalPrice).toBe(1500); // 1000 + 100 + 150 + 250
  });

  it("skips factors with 0% in both tenant and override", () => {
    const result = applyUnitFactors(1000, []);

    expect(result.lines).toHaveLength(0);
    expect(result.finalPrice).toBe(1000);
  });

  it("returns baseCost in result for auditability", () => {
    const result = applyUnitFactors(500, tenantFactors);
    expect(result.baseCost).toBe(500);
  });

  it("order in lines matches FACTOR_ORDER", () => {
    const allFactors: PricingFactor[] = [
      { factorKey: "luxury", percent: 5 },
      { factorKey: "labor", percent: 10 },
      { factorKey: "rush", percent: 8 },
      { factorKey: "margin", percent: 12 },
      { factorKey: "overhead", percent: 7 },
      { factorKey: "complexity", percent: 3 },
    ];

    const result = applyUnitFactors(1000, allFactors);

    // Lines should appear in FACTOR_ORDER, skipping "subtotal" (not in tenant)
    const lineKeys = result.lines.map((l) => l.factorKey);
    // packaging is not in allFactors → skipped (0%), so 6 lines
    expect(lineKeys).toEqual(["labor", "overhead", "complexity", "rush", "margin", "luxury"]);
  });
});

// ── applyDiscount ───────────────────────────────────────────────────────────

describe("applyDiscount", () => {
  it("returns 0 for zero discount", () => {
    const result = applyDiscount(1000, { amount: 0, maxValue: null });
    expect(result).toEqual({ applied: 0, clamped: false });
  });

  it("applies discount without cap", () => {
    const result = applyDiscount(1000, { amount: 200, maxValue: null });
    expect(result).toEqual({ applied: 200, clamped: false });
  });

  it("caps discount by maxValue", () => {
    const result = applyDiscount(1000, { amount: 500, maxValue: 300 });
    expect(result).toEqual({ applied: 300, clamped: false });
  });

  it("clamps discount to subTotal (no negative base)", () => {
    const result = applyDiscount(100, { amount: 500, maxValue: null });
    expect(result).toEqual({ applied: 100, clamped: true });
  });

  it("clamps when maxValue exceeds subTotal", () => {
    const result = applyDiscount(100, { amount: 500, maxValue: 300 });
    expect(result).toEqual({ applied: 100, clamped: true });
  });

  it("handles negative discount amount as 0", () => {
    const result = applyDiscount(1000, { amount: -50, maxValue: null });
    expect(result).toEqual({ applied: 0, clamped: false });
  });
});

// ── computeQuoteBreakdown ───────────────────────────────────────────────────

describe("computeQuoteBreakdown", () => {
  const feesCredits: FeesCreditEntry[] = [
    { code: "delivery", sign: "plus", amount: 2000, formulaKey: null },
    { code: "preview", sign: "minus", amount: 1000, formulaKey: null },
  ];

  it("computes VAT on subTotal - discount", () => {
    const result = computeQuoteBreakdown(10000, { amount: 0, maxValue: null }, []);

    expect(result.subTotal).toBe(10000);
    expect(result.discount).toBe(0);
    expect(result.vatBase).toBe(10000);
    expect(result.vatAmount).toBe(1400); // 10000 × 0.14
    expect(result.total).toBe(11400); // 10000 + 1400
  });

  it("VAT base excludes discount", () => {
    const result = computeQuoteBreakdown(10000, { amount: 2000, maxValue: null }, []);

    expect(result.discount).toBe(2000);
    expect(result.vatBase).toBe(8000); // 10000 - 2000
    expect(result.vatAmount).toBe(1120); // 8000 × 0.14
    expect(result.total).toBe(9120); // 8000 + 1120
  });

  it("discount clamped to subTotal", () => {
    const result = computeQuoteBreakdown(1000, { amount: 5000, maxValue: null }, []);

    expect(result.discount).toBe(1000);
    expect(result.vatBase).toBe(0);
    expect(result.vatAmount).toBe(0);
    expect(result.total).toBe(0);
  });

  it("signed fees/credits: plus adds, minus subtracts", () => {
    const result = computeQuoteBreakdown(
      10000,
      { amount: 0, maxValue: null },
      feesCredits,
    );

    // delivery: +2000, preview: -1000 → net +1000
    expect(result.feesCreditsTotal).toBe(1000);
    expect(result.feesCreditsLines).toHaveLength(2);
    expect(result.feesCreditsLines[0]).toEqual({
      code: "delivery",
      sign: "plus",
      amount: 2000,
      signedAmount: 2000,
    });
    expect(result.feesCreditsLines[1]).toEqual({
      code: "preview",
      sign: "minus",
      amount: 1000,
      signedAmount: -1000,
    });

    // total = vatBase(10000) + vatAmount(1400) + feesTotal(1000) = 12400
    expect(result.total).toBe(12400);
  });

  it("معاينة -1000 credit reduces final total by exactly 1000", () => {
    const withoutPreview = computeQuoteBreakdown(
      10000,
      { amount: 0, maxValue: null },
      [{ code: "delivery", sign: "plus", amount: 2000, formulaKey: null }],
    );

    const withPreview = computeQuoteBreakdown(
      10000,
      { amount: 0, maxValue: null },
      [
        { code: "delivery", sign: "plus", amount: 2000, formulaKey: null },
        { code: "preview", sign: "minus", amount: 1000, formulaKey: null },
      ],
    );

    expect(withPreview.total).toBe(withoutPreview.total - 1000);
  });

  it("fee with amount=0 contributes 0, not an error", () => {
    const result = computeQuoteBreakdown(
      5000,
      { amount: 0, maxValue: null },
      [
        { code: "zero_fee", sign: "plus", amount: 0, formulaKey: null },
        { code: "real_fee", sign: "minus", amount: 100, formulaKey: null },
      ],
    );

    expect(result.feesCreditsLines[0].signedAmount).toBe(0);
    expect(result.feesCreditsTotal).toBe(-100);
    expect(result.total).toBe(5000 + 700 - 100); // 5000 + VAT(700) - 100
  });

  it("fee with null amount treated as 0", () => {
    const result = computeQuoteBreakdown(
      5000,
      { amount: 0, maxValue: null },
      [{ code: "null_fee", sign: "plus", amount: null, formulaKey: "some_formula" }],
    );

    expect(result.feesCreditsLines[0].amount).toBe(0);
    expect(result.feesCreditsLines[0].signedAmount).toBe(0);
  });

  it("full integration: subTotal + discount + VAT + signed fees", () => {
    const result = computeQuoteBreakdown(
      50000,
      { amount: 5000, maxValue: 10000 },
      [
        { code: "delivery", sign: "plus", amount: 2000, formulaKey: null },
        { code: "preview", sign: "minus", amount: 1000, formulaKey: null },
        { code: "discount_code", sign: "minus", amount: 500, formulaKey: null },
      ],
    );

    // subTotal = 50000
    // discount = min(5000, 10000) = 5000
    // vatBase = 50000 - 5000 = 45000
    // vatAmount = 45000 × 0.14 = 6300
    // fees: +2000 - 1000 - 500 = +500
    // total = 45000 + 6300 + 500 = 51800
    expect(result.subTotal).toBe(50000);
    expect(result.discount).toBe(5000);
    expect(result.vatBase).toBe(45000);
    expect(result.vatAmount).toBe(6300);
    expect(result.feesCreditsTotal).toBe(500);
    expect(result.total).toBe(51800);
  });
});
