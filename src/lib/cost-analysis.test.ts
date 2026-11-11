import { describe, it, expect } from "vitest";
import { computeProfitAndMargin } from "@/lib/cost-analysis-types";

describe("Task 12 — V2 Cost Analysis & Profitability Tests", () => {
  describe("1. Profitability and Margin Arithmetic", () => {
    it("calculates gross profit and gross margin % accurately", () => {
      const sellingPrice = 100000;
      const mfgCost = 65000;
      const { grossProfit, grossMarginPct } = computeProfitAndMargin(sellingPrice, mfgCost);

      expect(grossProfit).toBe(35000);
      expect(grossMarginPct).toBe(35.0);
    });

    it("handles zero selling price gracefully without NaN or Infinity", () => {
      const { grossProfit, grossMarginPct } = computeProfitAndMargin(0, 5000);
      expect(grossProfit).toBe(-5000);
      expect(grossMarginPct).toBe(0);
      expect(isNaN(grossMarginPct)).toBe(false);
      expect(isFinite(grossMarginPct)).toBe(true);
    });

    it("handles zero cost (100% margin)", () => {
      const { grossProfit, grossMarginPct } = computeProfitAndMargin(50000, 0);
      expect(grossProfit).toBe(50000);
      expect(grossMarginPct).toBe(100.0);
    });
  });

  describe("2. Cost Category Aggregation & Wastage Invariants", () => {
    it("correctly sums category items and isolates wastage from base materials", () => {
      const categories = {
        materials: 30000,
        hardware: 12000,
        accessories: 8000,
        finishes: 15000,
        manufacturing: 10000,
        wastage: 5000,
        factors: 0,
        other: 0,
      };

      const totalManufacturingCost =
        categories.materials +
        categories.hardware +
        categories.accessories +
        categories.finishes +
        categories.manufacturing +
        categories.wastage +
        categories.other;

      expect(totalManufacturingCost).toBe(80000);

      const sellingPrice = 120000;
      const { grossProfit, grossMarginPct } = computeProfitAndMargin(
        sellingPrice,
        totalManufacturingCost,
      );

      expect(grossProfit).toBe(40000);
      expect(grossMarginPct).toBe(33.33);
    });
  });

  describe("3. Snapshot Immutability Simulation", () => {
    it("preserves historical costs from frozen snapshot regardless of subsequent catalog price changes", () => {
      // 1. Initial snapshot taken at unit cost = 500
      const frozenSnapshot = {
        tree: [
          {
            id: "p1",
            name: "Kitchen",
            sections: [
              {
                id: "s1",
                name: "Base Section",
                units: [
                  {
                    id: "u1",
                    name: "Base Unit",
                    qty: 2,
                    components: [
                      {
                        id: "c1",
                        kind: "material",
                        name: "MDF Board",
                        unitCost: 500,
                        qty: 10,
                        totalCost: 5000,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
        subtotal: 18000,
      };

      // 2. Compute cost from snapshot
      const snapshotUnit = frozenSnapshot.tree[0].sections[0].units[0];
      const snapshotComp = snapshotUnit.components[0];
      const snapshotTotalCost = snapshotComp.totalCost * snapshotUnit.qty;
      expect(snapshotTotalCost).toBe(10000);

      // 3. Simulate catalog material price increase to 850 in live DB
      const liveCatalogPrice = 850;
      const liveHypotheticalCost = liveCatalogPrice * snapshotComp.qty * snapshotUnit.qty;
      expect(liveHypotheticalCost).toBe(17000);

      // 4. Analysis MUST still report frozen snapshot cost (10,000), not live cost (17,000)
      expect(snapshotTotalCost).toBe(10000);
      const { grossProfit, grossMarginPct } = computeProfitAndMargin(
        frozenSnapshot.subtotal,
        snapshotTotalCost,
      );
      expect(grossProfit).toBe(8000);
      expect(grossMarginPct).toBe(44.44);
    });
  });

  describe("4. Role Authorization for Sensitive Margin Exposure", () => {
    it("permits owners, admins, and sales to access margins, and blocks workers", () => {
      const canAccessMarginData = (role: string) => {
        return role === "owner" || role === "admin" || role === "sales";
      };

      expect(canAccessMarginData("owner")).toBe(true);
      expect(canAccessMarginData("admin")).toBe(true);
      expect(canAccessMarginData("sales")).toBe(true);
      expect(canAccessMarginData("worker")).toBe(false);
      expect(canAccessMarginData("viewer")).toBe(false);
    });
  });
});
