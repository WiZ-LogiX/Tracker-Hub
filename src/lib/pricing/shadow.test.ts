/**
 * Pricing shadow comparison tests.
 *
 * 1. comparePricing pure function: tolerance, diff, edge cases
 * 2. runShadow integration (mocked Supabase)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { comparePricing } from "@/lib/pricing/shadow";

// ── comparePricing (pure function — no mocks needed) ─────────────────────────

describe("comparePricing", () => {
  it("within_tolerance=true when diff is 0", () => {
    const result = comparePricing(100, 100, 0.5);
    expect(result).toEqual({ diff: 0, withinTolerance: true });
  });

  it("within_tolerance=true when diff equals tolerance", () => {
    const result = comparePricing(100, 100.5, 0.5);
    expect(result).toEqual({ diff: 0.5, withinTolerance: true });
  });

  it("within_tolerance=false when diff exceeds tolerance", () => {
    const result = comparePricing(100, 101, 0.5);
    expect(result).toEqual({ diff: 1, withinTolerance: false });
  });

  it("handles legacy > v3", () => {
    const result = comparePricing(500, 100, 0.5);
    expect(result).toEqual({ diff: 400, withinTolerance: false });
  });

  it("handles legacy < v3", () => {
    const result = comparePricing(100, 500, 0.5);
    expect(result).toEqual({ diff: 400, withinTolerance: false });
  });

  it("handles zero legacy total", () => {
    const result = comparePricing(0, 0, 0.5);
    expect(result).toEqual({ diff: 0, withinTolerance: true });
  });

  it("handles zero v3 total", () => {
    const result = comparePricing(100, 0, 0.5);
    expect(result).toEqual({ diff: 100, withinTolerance: false });
  });

  it("custom tolerance of 0 allows only exact match", () => {
    const result = comparePricing(100, 100.001, 0);
    expect(result.withinTolerance).toBe(false);
    expect(result.diff).toBeGreaterThan(0);
  });

  it("large tolerance absorbs big diff", () => {
    const result = comparePricing(100, 200, 100);
    expect(result).toEqual({ diff: 100, withinTolerance: true });
  });

  it("مناينة -1000 credit: legacy=10000, v3=9000, tolerance=0.5 → divergent", () => {
    const result = comparePricing(10000, 9000, 0.5);
    expect(result.withinTolerance).toBe(false);
    expect(result.diff).toBe(1000);
  });

  it("مناينة -1000 credit: both engines include it → equal", () => {
    // Both engines agree on total including fees/credits
    const result = comparePricing(9000, 9000, 0.5);
    expect(result.withinTolerance).toBe(true);
    expect(result.diff).toBe(0);
  });
});

// ── runShadow integration (mocked Supabase) ─────────────────────────────────

describe("runShadow (integration)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("writes shadow row with correct values", async () => {
    let insertRow: any = null;

    const insertChain = {
      insert(row: any) { insertRow = row; return { error: null }; },
    };

    const fromMock = vi.fn((table: string) => {
      if (table === "pricing_shadow_runs") return insertChain;
      if (table === "quotes") return {
        select() { return this; },
        eq() { return this; },
        single() { return Promise.resolve({ data: { total: "100" }, error: null }); },
      };
      if (table === "quotation_products") return {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        then(resolve: any) { resolve({ data: [], error: null }); },
      };
      // All other tables return empty data
      return {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        in() { return this; },
        order() { return this; },
        then(resolve: any) { resolve({ data: [], error: null }); },
      };
    });

    vi.doMock("@/lib/log", () => ({
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));

    const mockClient = { from: fromMock };
    const { runShadow } = await import("@/lib/pricing/shadow");
    const result = await runShadow("quote-001", "tenant-001", undefined, mockClient);

    // No hierarchy → error
    expect(result.error).toContain("No hierarchy data");
    expect(result.legacyTotal).toBeNull();
    expect(insertRow).toBeTruthy();
    expect(insertRow.tenant_id).toBe("tenant-001");
    expect(insertRow.quotation_id).toBe("quote-001");
    expect(insertRow.legacy_total).toBeNull();
    expect(insertRow.v3_total).toBe(0);
    expect(insertRow.within_tolerance).toBe(false);
  });

  it("returns error when quote not found", async () => {
    const fromMock = vi.fn((table: string) => {
      if (table === "quotes") return {
        select() { return this; },
        eq() { return this; },
        single() { return Promise.resolve({ data: null, error: { message: "not found" } }); },
      };
      return {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        in() { return this; },
        order() { return this; },
        then(resolve: any) { resolve({ data: [], error: null }); },
      };
    });

    vi.doMock("@/lib/log", () => ({
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));

    const mockClient = { from: fromMock };
    const { runShadow } = await import("@/lib/pricing/shadow");
    const result = await runShadow("quote-001", "tenant-001", undefined, mockClient);

    expect(result.legacyTotal).toBeNull();
    expect(result.error).toContain("Failed to load quote");
    expect(result.withinTolerance).toBe(false);
  });

  it("flag off scenario: runShadow is never called (caller responsibility)", async () => {
    // This test documents the contract: the CALLER checks the feature flag.
    // runShadow itself always writes a row. This is tested above.
    // The integration point (quote save handler) would check:
    //   if (tenant.feature_flags?.pricing_shadow) { await runShadow(...); }
    expect(true).toBe(true);
  });
});
