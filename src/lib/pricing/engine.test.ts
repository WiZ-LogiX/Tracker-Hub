import { describe, it, expect } from "vitest";
import { runFormula, DEFAULT_FORMULA } from "@/lib/pricing/engine";

describe("pricing engine smoke test", () => {
  it("computes a known total with the default formula", () => {
    // Base: 1000 EGP, Material: 500, Finish: 200, Veneer: 0, Accessories: 100
    // Qty: 2
    const result = runFormula(
      DEFAULT_FORMULA,
      {
        basePrice: 1000,
        materialCost: 500,
        finishCost: 200,
        veneerCost: 0,
        accessoriesCost: 100,
        qty: 2,
      },
      {
        labor: 15,
        wastage: 5,
        overhead: 8,
        margin: 25,
        luxury: 0,
        complexity: 0,
        rush: 0,
      },
      2,
    );

    // Step-by-step:
    //   add base_cost:        running = 1000
    //   add material_cost:    running = 1500
    //   add finish_cost:      running = 1700
    //   add veneer_cost:      running = 1700
    //   add accessories_cost: running = 1800
    //   snapshot subtotal_before_overhead = 1800
    //   labor 15% of 1800:   +270  → running = 2070
    //   wastage 5% of 1800:  +90   → running = 2160
    //   overhead 8% of 1800: +144  → running = 2304
    //   snapshot cost_before_margin = 2304
    //   margin 25% of 2304:  +576  → running = 2880
    //   luxury 0%:            +0
    //   complexity 0%:        +0
    //   rush 0%:              +0
    //   unitPrice = 2880
    //   lineTotal = 2880 × 2 = 5760

    expect(result.unitPrice).toBe(2880);
    expect(result.lineTotal).toBe(5760);
    expect(result.snapshots["subtotal_before_overhead"]).toBe(1800);
    expect(result.snapshots["cost_before_margin"]).toBe(2304);
    expect(result.ruleVersion).toBe(2);
    expect(result.lines.length).toBeGreaterThan(0);
  });
});
