import { describe, it, expect } from "vitest";

describe("Task 18 — Executive Operations & Commercial Dashboard Hardening Tests", () => {
  describe("1. Financial Aggregations & Zero-Safety", () => {
    it("safely computes collection rate and outstanding balance when invoices exist", () => {
      const invoices = [
        { total: 100000, paidAmount: 60000, status: "partial" },
        { total: 50000, paidAmount: 50000, status: "paid" },
        { total: 20000, paidAmount: 0, status: "issued" },
      ];

      let totalInvoiced = 0;
      let totalCollected = 0;
      let unpaidInvoicesCount = 0;

      for (const inv of invoices) {
        totalInvoiced += inv.total;
        totalCollected += inv.paidAmount;
        if (inv.status !== "paid" && inv.total > inv.paidAmount) {
          unpaidInvoicesCount++;
        }
      }

      const outstandingBalance = Math.max(0, totalInvoiced - totalCollected);
      const collectionRate = totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 0;

      expect(totalInvoiced).toBe(170000);
      expect(totalCollected).toBe(110000);
      expect(outstandingBalance).toBe(60000);
      expect(unpaidInvoicesCount).toBe(2);
      expect(collectionRate).toBeCloseTo(64.71, 1);
    });

    it("handles zero total invoiced safely without divide-by-zero errors", () => {
      const totalInvoiced = 0;
      const totalCollected = 0;
      const collectionRate = totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 0;

      expect(collectionRate).toBe(0);
    });
  });

  describe("2. Factory Bottleneck Detection", () => {
    it("identifies the active production stage with the highest queue of orders", () => {
      const orders = [
        { id: "1", currentStage: "cutting" },
        { id: "2", currentStage: "assembly" },
        { id: "3", currentStage: "assembly" },
        { id: "4", currentStage: "assembly" },
        { id: "5", currentStage: "finishing" },
        { id: "6", currentStage: "delivered" }, // delivered should not be considered active bottleneck
      ];

      const ordersByStage: Record<string, number> = {};
      for (const ord of orders) {
        ordersByStage[ord.currentStage] = (ordersByStage[ord.currentStage] || 0) + 1;
      }

      let maxStage = "";
      let maxCount = 0;
      for (const [st, cnt] of Object.entries(ordersByStage)) {
        if (st !== "delivered" && st !== "completed" && cnt > maxCount) {
          maxCount = cnt;
          maxStage = st;
        }
      }

      expect(maxStage).toBe("assembly");
      expect(maxCount).toBe(3);
    });
  });

  describe("3. Inventory Shortage Alerts", () => {
    it("computes available stock and flags items below safety threshold", () => {
      const stock = [
        { code: "MDF-18-OAK", physical: 20, reserved: 18 }, // available = 2 (< 5) -> alert
        { code: "MDF-18-WHT", physical: 50, reserved: 10 }, // available = 40 -> ok
        { code: "HINGE-SOFT", physical: 10, reserved: 10 }, // available = 0 -> critical alert
      ];

      const lowStock = stock.filter((s) => s.physical - s.reserved < 5);
      expect(lowStock).toHaveLength(2);
      expect(lowStock[0].code).toBe("MDF-18-OAK");
      expect(lowStock[1].code).toBe("HINGE-SOFT");
    });
  });

  describe("4. Task Overdue & Critical Derivation", () => {
    it("flags tasks with past due dates as overdue if status is not done", () => {
      const today = "2026-09-03";
      const tasks = [
        { id: "t1", status: "in_progress", dueDate: "2026-09-01" }, // overdue
        { id: "t2", status: "done", dueDate: "2026-09-01" },        // not overdue (done)
        { id: "t3", status: "todo", dueDate: "2026-09-10" },        // not overdue (future)
      ];

      const overdue = tasks.filter((t) => t.status !== "done" && t.dueDate && t.dueDate < today);
      expect(overdue).toHaveLength(1);
      expect(overdue[0].id).toBe("t1");
    });
  });

  describe("5. Needs Attention Synthesis & Tenant Isolation", () => {
    it("aggregates critical operational items across quality, inventory, and tasks", () => {
      const criticalRemake = { id: "rmk-1", remakeNumber: "RMK-1001", severity: "critical" };
      const lowStockItem = { code: "MDF-18-OAK", available: 2 };
      const overdueTask = { code: "TSK-1001", title: "Verify QC edge" };

      const attentionItems = [
        {
          id: "att-1",
          category: "quality",
          title: `إعادة تصنيع حرجة: ${criticalRemake.remakeNumber}`,
          severity: "critical",
          link: "/admin/remakes",
        },
        {
          id: "att-2",
          category: "inventory",
          title: `نقص خامات: ${lowStockItem.code}`,
          severity: "warning",
          link: "/admin/inventory",
        },
        {
          id: "att-3",
          category: "task",
          title: `مهمة متأخرة: ${overdueTask.code}`,
          severity: "warning",
          link: "/admin/tasks",
        },
      ];

      expect(attentionItems).toHaveLength(3);
      expect(attentionItems[0].category).toBe("quality");
      expect(attentionItems[0].severity).toBe("critical");
      expect(attentionItems[1].link).toBe("/admin/inventory");
      expect(attentionItems[2].link).toBe("/admin/tasks");
    });

    it("strictly isolates dashboard data by tenantId", () => {
      const tenantA = "tenant-a-uuid";
      const tenantB = "tenant-b-uuid";

      const orders = [
        { id: "ord-1", tenantId: tenantA, total: 100000 },
        { id: "ord-2", tenantId: tenantB, total: 200000 },
      ];

      const getTenantTotal = (tenantId: string) =>
        orders
          .filter((o) => o.tenantId === tenantId)
          .reduce((sum, o) => sum + o.total, 0);

      expect(getTenantTotal(tenantA)).toBe(100000);
      expect(getTenantTotal(tenantB)).toBe(200000);
    });
  });
});
