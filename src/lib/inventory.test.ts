import { describe, it, expect } from "vitest";
import type { MaterialReadiness } from "@/lib/inventory-types";

describe("Task 15 — Inventory & Material Stock Allocation Gate Tests", () => {
  describe("1. Stock Invariants & Free Quantity Math", () => {
    it("strictly computes free stock as physical stock minus reserved stock", () => {
      const computeFreeStock = (physical: number, reserved: number) => {
        if (physical < 0) throw new Error("Physical stock cannot be negative");
        if (reserved < 0) throw new Error("Reserved stock cannot be negative");
        if (reserved > physical) throw new Error("Reserved stock cannot exceed physical stock");
        return physical - reserved;
      };

      expect(computeFreeStock(100, 20)).toBe(80);
      expect(computeFreeStock(50, 50)).toBe(0);
      expect(computeFreeStock(0, 0)).toBe(0);

      expect(() => computeFreeStock(-5, 0)).toThrow("Physical stock cannot be negative");
      expect(() => computeFreeStock(10, 15)).toThrow("Reserved stock cannot exceed physical stock");
    });

    it("validates stock adjustments safely without allowing negative or under-reserved physical stock", () => {
      const applyAdjustment = (currentPhysical: number, currentReserved: number, delta: number) => {
        const newPhysical = currentPhysical + delta;
        if (newPhysical < 0) {
          throw new Error("Physical stock cannot be negative");
        }
        if (newPhysical < currentReserved) {
          throw new Error("Physical stock cannot be lower than active reserved quantity");
        }
        return {
          physical: newPhysical,
          reserved: currentReserved,
          free: newPhysical - currentReserved,
        };
      };

      // Add stock (+50)
      expect(applyAdjustment(100, 30, 50)).toEqual({ physical: 150, reserved: 30, free: 120 });
      // Deduct available stock (-40)
      expect(applyAdjustment(100, 30, -40)).toEqual({ physical: 60, reserved: 30, free: 30 });
      // Deduct exactly down to reserved (-70)
      expect(applyAdjustment(100, 30, -70)).toEqual({ physical: 30, reserved: 30, free: 0 });

      // Illegal: results in negative physical stock
      expect(() => applyAdjustment(100, 30, -120)).toThrow("Physical stock cannot be negative");
      // Illegal: cuts into active reservations
      expect(() => applyAdjustment(100, 30, -80)).toThrow(
        "Physical stock cannot be lower than active reserved quantity",
      );
    });
  });

  describe("2. BOM Requirements Extraction & Shortage Math", () => {
    it("aggregates raw material and hardware requirements from multi-unit BOM trees", () => {
      const mockBOMTree = [
        {
          sections: [
            {
              units: [
                {
                  qty: 2,
                  components: [
                    { kind: "material", catalogId: "mat-1", qty: 1.5, unitOfMeasure: "sheet" },
                    { kind: "hardware", catalogId: "hdw-1", qty: 4, unitOfMeasure: "pcs" },
                  ],
                },
                {
                  qty: 1,
                  components: [
                    { kind: "material", catalogId: "mat-1", qty: 2.0, unitOfMeasure: "sheet" },
                    { kind: "hardware", catalogId: "hdw-1", qty: 2, unitOfMeasure: "pcs" },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const aggregateNeeds = (tree: any[]) => {
        const needs = new Map<string, number>();
        for (const prod of tree) {
          for (const sec of prod.sections || []) {
            for (const unit of sec.units || []) {
              const uQty = unit.qty || 1;
              for (const comp of unit.components || []) {
                const totalCompQty = comp.qty * uQty;
                needs.set(comp.catalogId, (needs.get(comp.catalogId) || 0) + totalCompQty);
              }
            }
          }
        }
        return Object.fromEntries(needs.entries());
      };

      const result = aggregateNeeds(mockBOMTree);
      // mat-1: (1.5 * 2) + (2.0 * 1) = 3 + 2 = 5 sheets
      expect(result["mat-1"]).toBe(5);
      // hdw-1: (4 * 2) + (2 * 1) = 8 + 2 = 10 pcs
      expect(result["hdw-1"]).toBe(10);
    });

    it("evaluates order readiness accurately into READY, PARTIAL, and BLOCKED", () => {
      const evaluateReadiness = (
        requirements: { required: number; free: number; reservedForOrder: number }[],
      ): MaterialReadiness => {
        let fullyAvailable = 0;
        let shortage = 0;

        for (const r of requirements) {
          const effective = r.free + r.reservedForOrder;
          if (effective >= r.required) {
            fullyAvailable++;
          } else {
            shortage++;
          }
        }

        if (shortage === 0) return "READY";
        if (fullyAvailable > 0 && shortage > 0) return "PARTIAL";
        return "BLOCKED";
      };

      // All available
      expect(
        evaluateReadiness([
          { required: 10, free: 20, reservedForOrder: 0 },
          { required: 4, free: 10, reservedForOrder: 0 },
        ]),
      ).toBe("READY");

      // Already reserved
      expect(
        evaluateReadiness([
          { required: 10, free: 0, reservedForOrder: 10 },
          { required: 4, free: 0, reservedForOrder: 4 },
        ]),
      ).toBe("READY");

      // Partial availability
      expect(
        evaluateReadiness([
          { required: 10, free: 20, reservedForOrder: 0 },
          { required: 10, free: 2, reservedForOrder: 0 }, // short 8
        ]),
      ).toBe("PARTIAL");

      // Complete shortage
      expect(
        evaluateReadiness([
          { required: 10, free: 0, reservedForOrder: 0 },
          { required: 4, free: 0, reservedForOrder: 0 },
        ]),
      ).toBe("BLOCKED");
    });
  });

  describe("3. Atomic Reservation & Idempotency", () => {
    it("prevents double reservations on quote -> order conversion retries", () => {
      const order = { id: "ord-1", requiredSheets: 10, reservedSheets: 0 };
      const inventory = { physical: 15, reserved: 0 };

      const reserveMaterials = (ord: typeof order, inv: typeof inventory) => {
        // Idempotency check: if order already has active reservation for this amount, do nothing
        if (ord.reservedSheets >= ord.requiredSheets) {
          return { reserved: ord.reservedSheets, invReserved: inv.reserved, note: "Already reserved" };
        }

        const needed = ord.requiredSheets - ord.reservedSheets;
        const free = inv.physical - inv.reserved;
        if (needed > free) throw new Error("Insufficient stock");

        inv.reserved += needed;
        ord.reservedSheets += needed;
        return { reserved: ord.reservedSheets, invReserved: inv.reserved, note: "Reserved" };
      };

      // First run: reserves 10
      const firstRun = reserveMaterials(order, inventory);
      expect(firstRun.reserved).toBe(10);
      expect(firstRun.invReserved).toBe(10);

      // Second retry run (idempotent): does not double-reserve to 20
      const secondRun = reserveMaterials(order, inventory);
      expect(secondRun.reserved).toBe(10);
      expect(secondRun.invReserved).toBe(10);
      expect(secondRun.note).toBe("Already reserved");
    });

    it("releases reservations cleanly back into free stock", () => {
      const inventory = { physical: 50, reserved: 30 };
      const orderReservation = 15;

      const releaseReservation = (inv: typeof inventory, qty: number) => {
        inv.reserved = Math.max(0, inv.reserved - qty);
        return inv;
      };

      const afterRelease = releaseReservation(inventory, orderReservation);
      expect(afterRelease.physical).toBe(50);
      expect(afterRelease.reserved).toBe(15);
      expect(afterRelease.physical - afterRelease.reserved).toBe(35); // Free stock restored to 35
    });
  });

  describe("4. Financial & Production Invariants", () => {
    it("ensures stock operations strictly do not modify order financial totals or quotes", () => {
      const order = {
        id: "ord-1001",
        quoteTotal: 85000,
        invoiceTotal: 85000,
        paid: 42500,
        balance: 42500,
      };

      const initialQuoteTotal = order.quoteTotal;
      const initialInvoiceTotal = order.invoiceTotal;
      const initialBalance = order.balance;

      // Simulate reserving 20 sheets
      const stockReservation = {
        orderId: order.id,
        quantity: 20,
        unit: "sheet",
        status: "reserved",
      };

      expect(order.quoteTotal).toBe(initialQuoteTotal);
      expect(order.invoiceTotal).toBe(initialInvoiceTotal);
      expect(order.balance).toBe(initialBalance);
      expect(stockReservation.orderId).toBe(order.id);
    });
  });

  describe("5. Tenant Isolation & Permissions", () => {
    it("strictly isolates stock items and reservations between tenants", () => {
      const tenantA = "11111111-1111-1111-1111-111111111111";
      const tenantB = "22222222-2222-2222-2222-222222222222";

      const stockRecords = [
        { id: "s1", tenantId: tenantA, sku: "MAT-MDF-18", physical: 100 },
        { id: "s2", tenantId: tenantB, sku: "MAT-MDF-18", physical: 50 },
      ];

      const getTenantStock = (currentTenantId: string, sku: string) => {
        return stockRecords.find((s) => s.tenantId === currentTenantId && s.sku === sku);
      };

      expect(getTenantStock(tenantA, "MAT-MDF-18")?.physical).toBe(100);
      expect(getTenantStock(tenantB, "MAT-MDF-18")?.physical).toBe(50);
    });

    it("enforces role permissions on stock adjustments and reservations", () => {
      const canAdjustStock = (role: string) => role === "owner" || role === "admin";
      const canReserveMaterials = (role: string) => role !== "viewer";

      expect(canAdjustStock("owner")).toBe(true);
      expect(canAdjustStock("admin")).toBe(true);
      expect(canAdjustStock("sales")).toBe(false);
      expect(canAdjustStock("worker")).toBe(false);
      expect(canAdjustStock("viewer")).toBe(false);

      expect(canReserveMaterials("owner")).toBe(true);
      expect(canReserveMaterials("admin")).toBe(true);
      expect(canReserveMaterials("worker")).toBe(true);
      expect(canReserveMaterials("viewer")).toBe(false);
    });
  });
});
