import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/db/client.server";
import {
  tenants,
  stockItems,
  stockAdjustments,
  appUsers,
  auditLog,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  executeListStockMovements,
  executeStockAdjustment,
} from "@/lib/inventory-stock.server";
import type { TenantContext } from "@/lib/tenant-context";

describe("Sprint 4 — Standalone Inventory Polish & Movement Audit Ledger Suite", () => {
  const TEST_TENANT_A = "00000000-0000-0000-0000-000000000010";
  const TEST_TENANT_B = "00000000-0000-0000-0000-000000000020";
  const TEST_ADMIN_ID = "00000000-0000-0000-0000-000000000011";
  const TEST_WORKER_ID = "00000000-0000-0000-0000-000000000012";

  const adminCtxA: TenantContext = {
    tenantId: TEST_TENANT_A,
    userId: TEST_ADMIN_ID,
    role: "admin",
  };

  const workerCtxA: TenantContext = {
    tenantId: TEST_TENANT_A,
    userId: TEST_WORKER_ID,
    role: "worker",
  };

  const adminCtxB: TenantContext = {
    tenantId: TEST_TENANT_B,
    userId: "00000000-0000-0000-0000-000000000021",
    role: "admin",
  };

  let materialItemIdA: string;
  let hardwareItemIdA: string;
  let itemTenantBId: string;

  beforeAll(async () => {
    // 1. Ensure test tenants exist
    await db
      .insert(tenants)
      .values([
        {
          id: TEST_TENANT_A,
          name: "Test Inventory Tenant A",
          slug: `test-inv-a-${Date.now()}`,
        },
        {
          id: TEST_TENANT_B,
          name: "Test Inventory Tenant B",
          slug: `test-inv-b-${Date.now()}`,
        },
      ])
      .onConflictDoNothing();

    // 2. Ensure test users exist
    await db
      .insert(appUsers)
      .values([
        {
          id: TEST_ADMIN_ID,
          tenantId: TEST_TENANT_A,
          username: `inv_admin_${Date.now()}`,
          displayName: "Inventory Supervisor",
        },
        {
          id: TEST_WORKER_ID,
          tenantId: TEST_TENANT_A,
          username: `inv_worker_${Date.now()}`,
          displayName: "Shop Floor Worker",
        },
        {
          id: adminCtxB.userId!,
          tenantId: TEST_TENANT_B,
          username: `inv_admin_b_${Date.now()}`,
          displayName: "Tenant B Admin",
        },
      ])
      .onConflictDoNothing();

    // 3. Create stock items in Tenant A
    const [matA] = await db
      .insert(stockItems)
      .values({
        tenantId: TEST_TENANT_A,
        catalogItemId: "00000000-0000-0000-0000-000000000101",
        itemType: "material",
        sku: "MAT-OAK-18",
        name: "Natural White Oak Veneer 18mm",
        unit: "sheet",
        physicalQuantity: "100",
        reservedQuantity: "30",
        minReorderLevel: "15",
      })
      .returning();
    materialItemIdA = matA.id;

    const [hdwA] = await db
      .insert(stockItems)
      .values({
        tenantId: TEST_TENANT_A,
        catalogItemId: "00000000-0000-0000-0000-000000000102",
        itemType: "hardware",
        sku: "HDW-BLUM-110",
        name: "Blum Clip Top 110 Soft Close Hinge",
        unit: "pcs",
        physicalQuantity: "200",
        reservedQuantity: "50",
        minReorderLevel: "40",
      })
      .returning();
    hardwareItemIdA = hdwA.id;

    // 4. Create stock item in Tenant B
    const [itemB] = await db
      .insert(stockItems)
      .values({
        tenantId: TEST_TENANT_B,
        catalogItemId: "00000000-0000-0000-0000-000000000201",
        itemType: "material",
        sku: "MAT-PLY-12",
        name: "Birch Plywood 12mm",
        unit: "sheet",
        physicalQuantity: "80",
        reservedQuantity: "0",
        minReorderLevel: "10",
      })
      .returning();
    itemTenantBId = itemB.id;
  });

  afterAll(async () => {
    try {
      await db.delete(stockAdjustments).where(eq(stockAdjustments.tenantId, TEST_TENANT_A));
      await db.delete(stockAdjustments).where(eq(stockAdjustments.tenantId, TEST_TENANT_B));
      await db.delete(stockItems).where(eq(stockItems.tenantId, TEST_TENANT_A));
      await db.delete(stockItems).where(eq(stockItems.tenantId, TEST_TENANT_B));
      await db.delete(auditLog).where(eq(auditLog.tenantId, TEST_TENANT_A));
      await db.delete(auditLog).where(eq(auditLog.tenantId, TEST_TENANT_B));
      await db.delete(appUsers).where(eq(appUsers.tenantId, TEST_TENANT_A));
      await db.delete(appUsers).where(eq(appUsers.tenantId, TEST_TENANT_B));
    } catch {
      // Non-blocking cleanup
    }
  });

  describe("1. Directional Stock Adjustments & Floor/Reservation Bounds", () => {
    it("successfully applies positive Stock In delta (+25) and writes audit log", async () => {
      const res = await executeStockAdjustment(db, adminCtxA, {
        stockItemId: materialItemIdA,
        quantityDelta: 25,
        reason: "goods_received",
        notes: "GRN-9901 Supplier Delivery",
      });

      expect(res.ok).toBe(true);
      expect(res.newQuantity).toBe(125);

      const [item] = await db
        .select()
        .from(stockItems)
        .where(eq(stockItems.id, materialItemIdA));
      expect(Number(item.physicalQuantity)).toBe(125);
    });

    it("successfully applies negative Stock Out delta (-15) when remaining stock satisfies reservations", async () => {
      // Current physical is 125, reserved is 30. Dispensing 15 leaves 110 >= 30
      const res = await executeStockAdjustment(db, adminCtxA, {
        stockItemId: materialItemIdA,
        quantityDelta: -15,
        reason: "workshop_issued",
        notes: "Issued to Assembly line",
      });

      expect(res.ok).toBe(true);
      expect(res.newQuantity).toBe(110);

      const [item] = await db
        .select()
        .from(stockItems)
        .where(eq(stockItems.id, materialItemIdA));
      expect(Number(item.physicalQuantity)).toBe(110);
    });

    it("strictly rejects Stock Out that would breach reserved quantity bounds", async () => {
      // Current physical is 110, reserved is 30. Trying to deduct 85 leaves 25 < 30
      await expect(
        executeStockAdjustment(db, adminCtxA, {
          stockItemId: materialItemIdA,
          quantityDelta: -85,
          reason: "workshop_issued",
        }),
      ).rejects.toThrow(/cannot be lower than active reserved quantity/i);

      // Verify physical stock was NOT changed
      const [item] = await db
        .select()
        .from(stockItems)
        .where(eq(stockItems.id, materialItemIdA));
      expect(Number(item.physicalQuantity)).toBe(110);
    });

    it("strictly rejects Stock Out that would drive physical stock below zero", async () => {
      await expect(
        executeStockAdjustment(db, adminCtxA, {
          stockItemId: materialItemIdA,
          quantityDelta: -200,
          reason: "damaged",
        }),
      ).rejects.toThrow(/physical stock cannot be negative/i);
    });
  });

  describe("2. Global Stock Movement Audit Ledger (listStockMovements)", () => {
    beforeAll(async () => {
      // Insert additional movement for hardware in Tenant A
      await executeStockAdjustment(db, adminCtxA, {
        stockItemId: hardwareItemIdA,
        quantityDelta: 100,
        reason: "goods_received",
        notes: "Inward shipment from Blum",
      });

      await executeStockAdjustment(db, adminCtxA, {
        stockItemId: hardwareItemIdA,
        quantityDelta: -20,
        reason: "workshop_issued",
        notes: "Kitchen hinges dispense",
      });

      // Insert movement in Tenant B
      await executeStockAdjustment(db, adminCtxB, {
        stockItemId: itemTenantBId,
        quantityDelta: 10,
        reason: "goods_received",
        notes: "Tenant B secret stock",
      });
    });

    it("strictly isolates movements by tenant (Tenant A cannot see Tenant B movements)", async () => {
      const resA = await executeListStockMovements(db, adminCtxA, {
        direction: "all",
      });

      expect(resA.total).toBeGreaterThanOrEqual(4);
      expect(resA.items.every((m) => m.sku !== "MAT-PLY-12")).toBe(true);

      const resB = await executeListStockMovements(db, adminCtxB, {
        direction: "all",
      });

      expect(resB.total).toBe(1);
      expect(resB.items[0].sku).toBe("MAT-PLY-12");
    });

    it("forbids worker role from querying the global stock movements ledger", async () => {
      await expect(
        executeListStockMovements(db, workerCtxA, {
          direction: "all",
        }),
      ).rejects.toThrow(/Forbidden: Task Workers do not have access/i);
    });

    it("filters movements accurately by direction ('in' vs 'out')", async () => {
      // Test direction: "in"
      const inMovements = await executeListStockMovements(db, adminCtxA, {
        direction: "in",
      });

      expect(inMovements.items.length).toBeGreaterThanOrEqual(2);
      expect(inMovements.items.every((m) => m.direction === "in" && m.quantityDelta > 0)).toBe(true);

      // Test direction: "out"
      const outMovements = await executeListStockMovements(db, adminCtxA, {
        direction: "out",
      });

      expect(outMovements.items.length).toBeGreaterThanOrEqual(2);
      expect(outMovements.items.every((m) => m.direction === "out" && m.quantityDelta < 0)).toBe(true);
    });

    it("filters movements accurately by itemType ('material' vs 'hardware')", async () => {
      const matMovements = await executeListStockMovements(db, adminCtxA, {
        itemType: "material",
      });

      expect(matMovements.items.every((m) => m.itemType === "material")).toBe(true);

      const hdwMovements = await executeListStockMovements(db, adminCtxA, {
        itemType: "hardware",
      });

      expect(hdwMovements.items.every((m) => m.itemType === "hardware")).toBe(true);
    });

    it("searches movements by SKU, item name, or reference notes", async () => {
      const searchRes = await executeListStockMovements(db, adminCtxA, {
        search: "MAT-OAK-18",
      });

      expect(searchRes.items.length).toBeGreaterThanOrEqual(2);
      expect(searchRes.items.every((m) => m.sku === "MAT-OAK-18")).toBe(true);

      const notesRes = await executeListStockMovements(db, adminCtxA, {
        search: "Blum",
      });

      expect(notesRes.items.length).toBeGreaterThanOrEqual(1);
      expect(notesRes.items[0].sku).toBe("HDW-BLUM-110");
    });
  });
});
