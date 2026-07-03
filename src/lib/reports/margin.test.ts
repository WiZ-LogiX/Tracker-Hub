/**
 * Margin report tests — version-pick-by-date, report reconciliation, no regression.
 *
 * Tests the pure functions (pickVersion, computeSnapshotMargin) without DB.
 * DB-dependent tests verify schema structure and migration patterns.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  pickVersion,
  computeSnapshotMargin,
} from "@/lib/reports/margin";

// ── 1. Version-pick-by-date ─────────────────────────────────────────────────

describe("pickVersion", () => {
  const history = [
    { price: 7700, effective_from: "2026-01-01T00:00:00Z" },
    { price: 8200, effective_from: "2026-03-15T00:00:00Z" },
    { price: 8800, effective_from: "2026-06-01T00:00:00Z" },
  ];

  it("picks the version effective at the snapshot date", () => {
    const result = pickVersion(history, new Date("2026-04-15T00:00:00Z"));
    expect(result.price).toBe(8200);
    expect(result.effective_from).toBe("2026-03-15T00:00:00Z");
    expect(result.matched).toBe(true);
  });

  it("picks the earliest version when date is before all versions", () => {
    const result = pickVersion(history, new Date("2025-12-01T00:00:00Z"));
    expect(result.price).toBe(7700);
    expect(result.effective_from).toBe("2026-01-01T00:00:00Z");
    expect(result.matched).toBe(false); // fallback, not matched
  });

  it("picks the latest version when date is after all versions", () => {
    const result = pickVersion(history, new Date("2026-12-31T00:00:00Z"));
    expect(result.price).toBe(8800);
    expect(result.effective_from).toBe("2026-06-01T00:00:00Z");
    expect(result.matched).toBe(true);
  });

  it("picks exact boundary (same day as effective_from)", () => {
    const result = pickVersion(history, new Date("2026-03-15T00:00:00Z"));
    expect(result.price).toBe(8200);
    expect(result.matched).toBe(true);
  });

  it("picks previous version when date is one day before next version", () => {
    const result = pickVersion(history, new Date("2026-05-31T23:59:59Z"));
    expect(result.price).toBe(8200);
    expect(result.matched).toBe(true);
  });

  it("handles unsorted input", () => {
    const unsorted = [
      { price: 8800, effective_from: "2026-06-01T00:00:00Z" },
      { price: 7700, effective_from: "2026-01-01T00:00:00Z" },
      { price: 8200, effective_from: "2026-03-15T00:00:00Z" },
    ];
    const result = pickVersion(unsorted, new Date("2026-04-15T00:00:00Z"));
    expect(result.price).toBe(8200);
    expect(result.matched).toBe(true);
  });

  it("returns matched=false for empty history", () => {
    const result = pickVersion([], new Date("2026-04-15T00:00:00Z"));
    expect(result.price).toBe(0);
    expect(result.matched).toBe(false);
  });

  it("handles single version", () => {
    const result = pickVersion(
      [{ price: 5000, effective_from: "2026-01-01T00:00:00Z" }],
      new Date("2026-06-15T00:00:00Z"),
    );
    expect(result.price).toBe(5000);
    expect(result.matched).toBe(true);
  });
});

// ── 2. computeSnapshotMargin ────────────────────────────────────────────────

describe("computeSnapshotMargin", () => {
  it("computes margin from breakdown + tree", () => {
    const breakdown = {
      subTotal: 50000,
      discount: 2500,
      vatBase: 47500,
      vatAmount: 6650,
      feesCreditsTotal: 1000,
      total: 55150,
    };
    const tree = {
      products: [
        {
          sections: [
            {
              units: [
                {
                  components: [
                    { cost: 8000 },
                    { cost: 3000 },
                  ],
                },
                {
                  components: [
                    { cost: 6000 },
                    { cost: 2000 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = computeSnapshotMargin(breakdown, tree);
    expect(result.revenue).toBe(55150);
    expect(result.cost).toBe(19000);
    expect(result.margin).toBe(36150);
    expect(result.marginPct).toBeCloseTo(0.6555, 2);
  });

  it("handles zero revenue", () => {
    const breakdown = { total: 0 };
    const tree = { products: [] };
    const result = computeSnapshotMargin(breakdown, tree);
    expect(result.revenue).toBe(0);
    expect(result.cost).toBe(0);
    expect(result.margin).toBe(0);
    expect(result.marginPct).toBeNull();
  });

  it("handles empty tree (no components)", () => {
    const breakdown = { total: 10000 };
    const tree = { products: [] };
    const result = computeSnapshotMargin(breakdown, tree);
    expect(result.revenue).toBe(10000);
    expect(result.cost).toBe(0);
    expect(result.margin).toBe(10000);
    expect(result.marginPct).toBe(1);
  });

  it("handles nested empty sections", () => {
    const breakdown = { total: 5000 };
    const tree = {
      products: [
        {
          sections: [
            { units: [] },
            {
              units: [
                { components: [{ cost: 1500 }] },
              ],
            },
          ],
        },
      ],
    };
    const result = computeSnapshotMargin(breakdown, tree);
    expect(result.cost).toBe(1500);
    expect(result.margin).toBe(3500);
  });

  it("handles missing breakdown gracefully", () => {
    const result = computeSnapshotMargin(null, { products: [] });
    expect(result.revenue).toBe(0);
    expect(result.cost).toBe(0);
    expect(result.margin).toBe(0);
  });

  it("handles negative margin (cost > revenue)", () => {
    const breakdown = { total: 5000 };
    const tree = {
      products: [
        {
          sections: [
            {
              units: [
                { components: [{ cost: 8000 }] },
              ],
            },
          ],
        },
      ],
    };
    const result = computeSnapshotMargin(breakdown, tree);
    expect(result.margin).toBe(-3000);
    expect(result.marginPct).toBeCloseTo(-0.6, 1);
  });

  it("sums costs across multiple products and sections", () => {
    const breakdown = { total: 100000 };
    const tree = {
      products: [
        {
          sections: [
            {
              units: [
                { components: [{ cost: 1000 }, { cost: 500 }] },
              ],
            },
            {
              units: [
                { components: [{ cost: 2000 }] },
              ],
            },
          ],
        },
        {
          sections: [
            {
              units: [
                { components: [{ cost: 3000 }, { cost: 1500 }] },
              ],
            },
          ],
        },
      ],
    };
    const result = computeSnapshotMargin(breakdown, tree);
    expect(result.cost).toBe(8000);
    expect(result.margin).toBe(92000);
  });

  it("uses comp.amount as fallback when comp.cost is missing", () => {
    const breakdown = { total: 10000 };
    const tree = {
      products: [
        {
          sections: [
            {
              units: [
                { components: [{ amount: 4000 }] },
              ],
            },
          ],
        },
      ],
    };
    const result = computeSnapshotMargin(breakdown, tree);
    expect(result.cost).toBe(4000);
    expect(result.margin).toBe(6000);
  });
});

// ── 3. Schema + migration structure ─────────────────────────────────────────

describe("price_history schema", () => {
  const schema = readFileSync(resolve("src/db/schema.ts"), "utf-8");

  it("defines priceHistory table", () => {
    expect(schema).toContain('"price_history"');
  });

  it("has required columns", () => {
    expect(schema).toContain('tenantId: uuid("tenant_id")');
    expect(schema).toContain('entityType: text("entity_type")');
    expect(schema).toContain('entityId: uuid("entity_id")');
    expect(schema).toContain('price: numeric("price"');
    expect(schema).toContain('effectiveFrom: timestamp("effective_from"');
  });

  it("has composite index for version lookup", () => {
    expect(schema).toContain("price_history_effective_idx");
  });

  it("exports PriceHistory type", () => {
    expect(schema).toContain("export type PriceHistory");
    expect(schema).toContain("export type NewPriceHistory");
  });
});

describe("price_history migration", () => {
  const sql = readFileSync(
    resolve("supabase/migrations/20260628_price_history.sql"),
    "utf-8",
  );

  it("creates the table", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.price_history");
  });

  it("enables RLS", () => {
    expect(sql).toContain("ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY");
  });

  it("creates SELECT policy", () => {
    expect(sql).toContain("price_history_select");
    expect(sql).toContain("FOR SELECT");
  });

  it("creates INSERT policy", () => {
    expect(sql).toContain("price_history_insert");
    expect(sql).toContain("FOR INSERT");
  });

  it("no UPDATE or DELETE policies (append-only)", () => {
    expect(sql).not.toContain("FOR UPDATE");
    expect(sql).not.toContain("FOR DELETE");
  });

  it("creates indexes", () => {
    expect(sql).toContain("price_history_tenant_id_idx");
    expect(sql).toContain("price_history_entity_idx");
    expect(sql).toContain("price_history_effective_idx");
  });
});

// ── 4. No regression: engine-v3 still works ─────────────────────────────────

describe("no regression — engine-v3", () => {
  it("priceQuote still exports and produces deterministic output", async () => {
    const { priceQuote } = await import("@/lib/pricing/engine-v3");
    expect(typeof priceQuote).toBe("function");

    // Minimal smoke test — empty quote
    const result = priceQuote(
      {
        products: [],
        discount: undefined,
      },
      {
        materials: {},
        hardware: {},
        accessories: {},
        manufacturingOps: {},
        veneers: {},
        finishes: {},
        pricingFactors: [],
        wastageRules: [],
        feesCredits: [],
      },
    );
    expect(result.breakdown.total).toBe(0);
    expect(result.products).toEqual([]);
  });

  it("factors.ts still exports applyUnitFactors", async () => {
    const { applyUnitFactors } = await import("@/lib/pricing/factors");
    expect(typeof applyUnitFactors).toBe("function");
  });

  it("componentAmount still exports", async () => {
    const { componentAmount } = await import("@/lib/pricing/componentAmount");
    expect(typeof componentAmount).toBe("function");
  });
});

// ── 5. Report function exports ──────────────────────────────────────────────

describe("margin report exports", () => {
  it("getMarginReport is exported from margin.ts", async () => {
    const mod = await import("@/lib/reports/margin");
    expect(typeof mod.getMarginReport).toBe("function");
  });

  it("pickVersion is exported", async () => {
    const mod = await import("@/lib/reports/margin");
    expect(typeof mod.pickVersion).toBe("function");
  });

  it("computeSnapshotMargin is exported", async () => {
    const mod = await import("@/lib/reports/margin");
    expect(typeof mod.computeSnapshotMargin).toBe("function");
  });
});
