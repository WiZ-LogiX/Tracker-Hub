import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/db/client.server";
import {
  tenants,
  customers,
  quotes,
  orders,
  invoices,
  projects,
  stockItems,
  remakes,
  qcInspections,
  opportunities,
  leads,
} from "@/db/schema";
import { eq, or, inArray } from "drizzle-orm";
import { fetchExecutiveDashboardData } from "./dashboard.server";
import { forbidWorker, type TenantContext } from "./tenant-context";

describe("Sprint 6B — Actionable Morning Command Center & Dashboard Hardening", () => {
  const tenantId = "b6000000-0000-4000-8000-000000000001";
  const customerId = "c6000000-0000-4000-8000-000000000001";
  const quoteId = "a6000000-0000-4000-8000-000000000001";
  const orderId = "b6000000-0000-4000-8000-000000000002";
  const orderQcBlockedId = "b6000000-0000-4000-8000-000000000003";
  const issuedInvId = "d6000000-0000-4000-8000-000000000001";
  const scheduledInvId = "d6000000-0000-4000-8000-000000000002";
  const stockLowId = "56000000-0000-4000-8000-000000000001";
  const stockNormalId = "56000000-0000-4000-8000-000000000002";
  const oppOverdueId = "66000000-0000-4000-8000-000000000001";
  const oppFutureId = "66000000-0000-4000-8000-000000000002";

  beforeAll(async () => {
    // Cleanup prior run artifacts if present
    try {
      await db.delete(qcInspections).where(eq(qcInspections.tenantId, tenantId));
      await db.delete(opportunities).where(eq(opportunities.tenantId, tenantId));
      await db.delete(invoices).where(eq(invoices.tenantId, tenantId));
      await db.delete(orders).where(eq(orders.tenantId, tenantId));
      await db.delete(quotes).where(eq(quotes.tenantId, tenantId));
      await db.delete(stockItems).where(eq(stockItems.tenantId, tenantId));
      await db.delete(customers).where(eq(customers.id, customerId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    } catch {
      // Ignore initial cleanup
    }

    // 1. Seed Tenant & Customer
    await db.insert(tenants).values({
      id: tenantId,
      slug: "dashboard-hardening-test",
      name: "Dashboard Hardening Atelier",
      plan: "pro",
    });

    await db.insert(customers).values({
      id: customerId,
      tenantId,
      name: "عميل غرفة عمليات الصباح",
      phone: "01000009999",
    });

    // 2. Seed Quote & Delivery-Ready Order
    await db.insert(quotes).values({
      id: quoteId,
      tenantId,
      customerId,
      quoteNumber: "PLC-DSH01",
      status: "accepted",
      subtotal: "150000",
      total: "150000",
      validUntil: "2026-12-31",
    });

    await db.insert(orders).values({
      id: orderId,
      tenantId,
      customerId,
      quoteId,
      orderNumber: "PLC-ORD01",
      currentStage: "ready_for_delivery", // triggers milestone billing ready
      total: "150000",
      contractDate: "2026-11-19",
    });

    // 3. Seed Order Blocked at QC Gate (quality_check stage with no passing QC)
    await db.insert(orders).values({
      id: orderQcBlockedId,
      tenantId,
      customerId,
      quoteId,
      orderNumber: "PLC-ORDQC",
      currentStage: "quality_check", // QC Gate Blocker
      total: "50000",
      contractDate: "2026-11-19",
    });

    // 4. Seed Invoices: 1 Issued (deposit) + 1 Scheduled (delivery milestone)
    await db.insert(invoices).values({
      id: issuedInvId,
      tenantId,
      customerId,
      quoteId,
      invoiceNumber: "INV-DSH01",
      total: "75000",
      paidAmount: "75000",
      billingStatus: "issued",
      milestoneIndex: 1,
      milestoneTotalCount: 2,
      milestoneLabel: "دفعة التعاقد",
    });

    await db.insert(invoices).values({
      id: scheduledInvId,
      tenantId,
      customerId,
      quoteId,
      invoiceNumber: "INV-DSH02",
      total: "75000",
      paidAmount: "0",
      billingStatus: "scheduled", // milestone ready to bill because order is ready_for_delivery
      milestoneIndex: 2,
      milestoneTotalCount: 2,
      milestoneLabel: "دفعة الاستلام والتوريد",
    });

    // 5. Seed Stock Items: 1 low stock (available <= minReorderLevel), 1 normal
    await db.insert(stockItems).values({
      id: stockLowId,
      tenantId,
      catalogItemId: "00000000-0000-0000-0000-000000000601",
      itemType: "material",
      name: "خشب زان روماني أحمر",
      sku: "WOOD-BEECH-ROM",
      unit: "m3",
      physicalQuantity: "10.000",
      reservedQuantity: "8.000", // available = 2.000
      minReorderLevel: "5.000",  // 2 <= 5 -> LOW STOCK
    });

    await db.insert(stockItems).values({
      id: stockNormalId,
      tenantId,
      catalogItemId: "00000000-0000-0000-0000-000000000602",
      itemType: "hardware",
      name: "مفصلات باوم بلوم سوفت",
      sku: "HINGE-BLUM-110",
      unit: "pcs",
      physicalQuantity: "100.000",
      reservedQuantity: "20.000", // available = 80.000
      minReorderLevel: "30.000",  // 80 > 30 -> NORMAL
    });

    // 6. Seed CRM Opportunities: 1 Overdue, 1 Future
    await db.insert(opportunities).values({
      id: oppOverdueId,
      tenantId,
      customerId,
      opportunityNumber: "OPP-OVER01",
      title: "متابعة مقايسة فيلا زايد",
      status: "open",
      stage: "proposal_presented",
      nextAction: "الاتصال بالعميل لتأكيد موعد المعاينة",
      nextActionDate: new Date(Date.now() - 24 * 3600 * 1000), // Yesterday (overdue)
    });

    await db.insert(opportunities).values({
      id: oppFutureId,
      tenantId,
      customerId,
      opportunityNumber: "OPP-FUTR01",
      title: "متابعة مستقبلية",
      status: "open",
      stage: "new_lead",
      nextAction: "إرسال الكتالوج",
      nextActionDate: new Date(Date.now() + 7 * 24 * 3600 * 1000), // Next week
    });
  });

  afterAll(async () => {
    try {
      await db.delete(qcInspections).where(eq(qcInspections.tenantId, tenantId));
      await db.delete(opportunities).where(eq(opportunities.tenantId, tenantId));
      await db.delete(invoices).where(eq(invoices.tenantId, tenantId));
      await db.delete(orders).where(eq(orders.tenantId, tenantId));
      await db.delete(quotes).where(eq(quotes.tenantId, tenantId));
      await db.delete(stockItems).where(eq(stockItems.tenantId, tenantId));
      await db.delete(customers).where(eq(customers.id, customerId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    } catch {
      // Best effort cleanup
    }
  });

  describe("1. Invoice Aggregation & Scheduled Milestone Exclusion", () => {
    it("excludes scheduled milestone invoices from active totalInvoiced receivables", async () => {
      const dashboard = await fetchExecutiveDashboardData(tenantId, { canViewFinancials: true });

      // Only INV-DSH01 (75,000) was issued; INV-DSH02 (75,000) is scheduled
      expect(dashboard.financial.totalInvoiced).toBe(75000);
      expect(dashboard.financial.totalCollected).toBe(75000);
      expect(dashboard.financial.outstandingBalance).toBe(0);
      expect(dashboard.financial.unpaidInvoicesCount).toBe(0);
      expect(dashboard.financial.collectionRate).toBe(100);
      expect(dashboard.financialRestricted).toBe(false);
    });
  });

  describe("2. Low Stock Min Reorder Level Accuracy", () => {
    it("calculates low stock using minReorderLevel threshold (physical - reserved <= minReorderLevel)", async () => {
      const dashboard = await fetchExecutiveDashboardData(tenantId, { canViewFinancials: true });

      expect(dashboard.inventory.totalStockItems).toBe(2);
      expect(dashboard.inventory.lowStockItemsCount).toBe(1);
      expect(dashboard.inventory.lowStockItems).toHaveLength(1);
      expect(dashboard.inventory.lowStockItems[0].materialCode).toBe("WOOD-BEECH-ROM");
      expect(dashboard.inventory.lowStockItems[0].availableQuantity).toBe(2);
    });
  });

  describe("3. Morning Attention Queues Synthesis", () => {
    it("synthesizes QC gate blockers, milestones ready to bill, and overdue CRM follow-ups into attentionItems", async () => {
      const dashboard = await fetchExecutiveDashboardData(tenantId, { canViewFinancials: true });

      const { attentionItems } = dashboard;
      expect(attentionItems.length).toBeGreaterThanOrEqual(4);

      // A. QC Gate Blocker
      const qcBlocker = attentionItems.find((i) => i.id === `att-qc-${orderQcBlockedId}`);
      expect(qcBlocker).toBeDefined();
      expect(qcBlocker?.category).toBe("production");
      expect(qcBlocker?.severity).toBe("critical");
      expect(qcBlocker?.title).toContain("PLC-ORDQC");

      // B. Milestone Ready to Bill
      const milestoneItem = attentionItems.find((i) => i.id === `att-ms-${scheduledInvId}`);
      expect(milestoneItem).toBeDefined();
      expect(milestoneItem?.category).toBe("billing");
      expect(milestoneItem?.severity).toBe("warning");
      expect(milestoneItem?.actionPayload).toEqual({
        type: "issue_milestone_invoice",
        invoiceId: scheduledInvId,
        invoiceNumber: "INV-DSH02",
      });

      // C. Overdue CRM Follow-up
      const crmItem = attentionItems.find((i) => i.id === `att-crm-${oppOverdueId}`);
      expect(crmItem).toBeDefined();
      expect(crmItem?.category).toBe("crm");
      expect(crmItem?.severity).toBe("warning");

      // D. Low Stock
      const stockItem = attentionItems.find((i) => i.id === `att-stock-${stockLowId}`);
      expect(stockItem).toBeDefined();
      expect(stockItem?.category).toBe("inventory");
    });
  });

  describe("4. Permission-Based Financial Masking", () => {
    it("zeros out financial metrics, sets financialRestricted, and strips milestone billing when canViewFinancials is false", async () => {
      const maskedDashboard = await fetchExecutiveDashboardData(tenantId, { canViewFinancials: false });

      expect(maskedDashboard.financialRestricted).toBe(true);
      expect(maskedDashboard.financial.totalInvoiced).toBe(0);
      expect(maskedDashboard.financial.totalCollected).toBe(0);
      expect(maskedDashboard.financial.outstandingBalance).toBe(0);
      expect(maskedDashboard.financial.collectionRate).toBe(0);
      expect(maskedDashboard.financial.unpaidInvoicesCount).toBe(0);
      expect(maskedDashboard.commercial.totalPipelineValue).toBe(0);

      // Recent quote totals should be masked to 0
      for (const quote of maskedDashboard.commercial.recentQuotes) {
        expect(quote.total).toBe(0);
      }

      // Milestone billing items must be stripped from attention items
      const billingItem = maskedDashboard.attentionItems.find((i) => i.category === "billing");
      expect(billingItem).toBeUndefined();

      // Non-financial attention items (QC, CRM, Stock) must still be visible
      expect(maskedDashboard.attentionItems.some((i) => i.category === "production")).toBe(true);
      expect(maskedDashboard.attentionItems.some((i) => i.category === "crm")).toBe(true);
      expect(maskedDashboard.attentionItems.some((i) => i.category === "inventory")).toBe(true);
    });
  });

  describe("5. Role Guarding & Benchmark Performance", () => {
    it("enforces forbidWorker against worker role context for Executive Dashboard", () => {
      const workerCtx: TenantContext = {
        userId: "w-01",
        tenantId,
        role: "worker",
      };
      const adminCtx: TenantContext = {
        userId: "a-01",
        tenantId,
        role: "admin",
      };

      expect(() => forbidWorker(workerCtx, "Executive Dashboard")).toThrow(
        /Forbidden: Task Workers do not have access to Executive Dashboard/i,
      );
      expect(() => forbidWorker(adminCtx, "Executive Dashboard")).not.toThrow();
    });

    it("executes all 20 batched queries concurrently in under 100ms", async () => {
      const start = performance.now();
      const dashboard = await fetchExecutiveDashboardData(tenantId, { canViewFinancials: true });
      const durationMs = performance.now() - start;

      expect(durationMs).toBeLessThan(100);
      expect(dashboard).toBeDefined();
    });
  });
});
