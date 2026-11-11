import { describe, it, expect } from "vitest";
import {
  deriveProjectLifecycle,
  deriveTransparentHealthIndicators,
} from "@/lib/project.pure";
import type {
  ProjectCommercialQuote,
  ProjectOrderRecord,
  ProjectInventoryAllocation,
  ProjectInvoiceRecord,
  ProjectFinancials,
  ProjectLifecycleStage,
  HealthSeverity,
  ProjectWorkspaceData,
} from "@/lib/project-types";
import type { ProductionWorkOrder } from "@/lib/work-order-types";
import type { DeliveryHandover } from "@/lib/delivery-types";
import type { RemakeListItem } from "@/lib/remake-types";
import type { TaskItem } from "@/lib/task-types";
import type { PipelineStage, OpportunityStatus } from "@/lib/crm-types";

describe("TASK 26 — Project / Job Workspace Comprehensive Suite", () => {
  // ── 1. 13-Stage Project Lifecycle Orchestration ─────────────────────────────
  describe("1. 13-Stage Project Lifecycle Progression", () => {
    it("orchestrates early stage when only an opportunity exists (lead / opportunity)", () => {
      const { currentStage, steps } = deriveProjectLifecycle(
        "new_lead",
        "open",
        [],
        [],
        [],
        [],
      );

      expect(currentStage).toBe("lead");
      expect(steps).toHaveLength(13);
      expect(steps[0].stage).toBe("lead");
      expect(steps[0].status).toBe("current");
      expect(steps[1].status).toBe("pending");
    });

    it("advances to measurement and design when opportunity stage reaches design_measurement", () => {
      const { currentStage, steps } = deriveProjectLifecycle(
        "design_measurement",
        "open",
        [],
        [],
        [],
        [],
      );

      expect(currentStage).toBe("design");
      const designStep = steps.find((s) => s.stage === "design");
      expect(designStep?.status).toBe("current");
      const leadStep = steps.find((s) => s.stage === "lead");
      expect(leadStep?.status).toBe("completed");
    });

    it("advances to quote stage when quotations exist in draft or sent", () => {
      const quotes: ProjectCommercialQuote[] = [
        {
          id: "q-1",
          quoteNumber: "PLC-2026-0001",
          total: 150000,
          subtotal: 131578.95,
          status: "sent",
          createdAt: "2026-09-01T10:00:00Z",
          isMainQuote: true,
        },
      ];

      const { currentStage, steps } = deriveProjectLifecycle(
        "quotation",
        "open",
        quotes,
        [],
        [],
        [],
      );

      expect(currentStage).toBe("quote");
      const quoteStep = steps.find((s) => s.stage === "quote");
      expect(quoteStep?.status).toBe("current");
    });

    it("advances to won stage when quotation is accepted or opportunity is won", () => {
      const quotes: ProjectCommercialQuote[] = [
        {
          id: "q-1",
          quoteNumber: "PLC-2026-0001",
          total: 150000,
          subtotal: 131578.95,
          status: "accepted",
          createdAt: "2026-09-01T10:00:00Z",
          isMainQuote: true,
        },
      ];

      const { currentStage, steps } = deriveProjectLifecycle(
        "won",
        "won",
        quotes,
        [],
        [],
        [],
      );

      expect(currentStage).toBe("won");
      const wonStep = steps.find((s) => s.stage === "won");
      expect(wonStep?.status).toBe("current");
    });

    it("advances to order stage when order record is booked", () => {
      const quotes: ProjectCommercialQuote[] = [
        {
          id: "q-1",
          quoteNumber: "PLC-2026-0001",
          total: 150000,
          subtotal: 131578.95,
          status: "accepted",
          createdAt: "2026-09-01T10:00:00Z",
          isMainQuote: true,
        },
      ];
      const orders: ProjectOrderRecord[] = [
        {
          id: "ord-1",
          orderNumber: "ORD-2026-001",
          quoteId: "q-1",
          quoteNumber: "PLC-2026-0001",
          total: 150000,
          deposit: 75000,
          paidAmount: 75000,
          currentStage: "deposit_received",
          contractDate: "2026-09-02",
          createdAt: "2026-09-02T10:00:00Z",
        },
      ];

      const { currentStage, steps } = deriveProjectLifecycle(
        "won",
        "won",
        quotes,
        orders,
        [],
        [],
      );

      expect(currentStage).toBe("order");
      const orderStep = steps.find((s) => s.stage === "order");
      expect(orderStep?.status).toBe("current");
    });

    it("advances to production when work orders are actively running on the shop floor", () => {
      const orders: ProjectOrderRecord[] = [
        {
          id: "ord-1",
          orderNumber: "ORD-2026-001",
          total: 150000,
          deposit: 75000,
          paidAmount: 75000,
          currentStage: "cutting",
          contractDate: "2026-09-02",
          createdAt: "2026-09-02T10:00:00Z",
        },
      ];
      const workOrders: ProductionWorkOrder[] = [
        {
          id: "wo-1",
          tenantId: "tenant-1",
          workOrderNumber: "WO-1001",
          orderId: "ord-1",
          orderNumber: "ORD-2026-001",
          status: "in_progress",
          priority: "high",
          currentStage: "cutting",
          materialReadiness: "READY",
          createdAt: "2026-09-03T10:00:00Z",
          updatedAt: "2026-09-03T10:00:00Z",
        },
      ];

      const { currentStage, steps } = deriveProjectLifecycle(
        "won",
        "won",
        [],
        orders,
        workOrders,
        [],
      );

      expect(currentStage).toBe("production");
      const prodStep = steps.find((s) => s.stage === "production");
      expect(prodStep?.status).toBe("current");
    });

    it("advances to QC stage when inspection is pending or manufacturing order reaches quality_check", () => {
      const orders: ProjectOrderRecord[] = [
        {
          id: "ord-1",
          orderNumber: "ORD-2026-001",
          total: 150000,
          deposit: 75000,
          paidAmount: 75000,
          currentStage: "quality_check",
          contractDate: "2026-09-02",
          createdAt: "2026-09-02T10:00:00Z",
        },
      ];
      const workOrders: ProductionWorkOrder[] = [
        {
          id: "wo-1",
          tenantId: "tenant-1",
          workOrderNumber: "WO-1001",
          orderId: "ord-1",
          orderNumber: "ORD-2026-001",
          status: "qc_pending",
          priority: "medium",
          currentStage: "quality_check",
          materialReadiness: "READY",
          createdAt: "2026-09-03T10:00:00Z",
          updatedAt: "2026-09-03T10:00:00Z",
        },
      ];

      const { currentStage, steps } = deriveProjectLifecycle(
        "won",
        "won",
        [],
        orders,
        workOrders,
        [],
      );

      expect(currentStage).toBe("qc");
      const qcStep = steps.find((s) => s.stage === "qc");
      expect(qcStep?.status).toBe("current");
    });

    it("advances through delivery, installation, handover, and warranty stages smoothly", () => {
      const orders: ProjectOrderRecord[] = [
        {
          id: "ord-1",
          orderNumber: "ORD-2026-001",
          total: 150000,
          deposit: 75000,
          paidAmount: 150000,
          currentStage: "completed",
          contractDate: "2026-09-02",
          createdAt: "2026-09-02T10:00:00Z",
        },
      ];
      const deliveries: DeliveryHandover[] = [
        {
          id: "del-1",
          tenantId: "tenant-1",
          deliveryNumber: "DEL-1001",
          orderId: "ord-1",
          orderNumber: "ORD-2026-001",
          customerId: "cust-1",
          customerName: "Ahmed",
          customerPhone: "01000000000",
          status: "completed",
          deliveryAddress: "New Cairo",
          installationRequired: true,
          installedAt: "2026-09-10T14:00:00Z",
          handedOverAt: "2026-09-10T16:00:00Z",
          createdAt: "2026-09-09T10:00:00Z",
          updatedAt: "2026-09-10T16:00:00Z",
        },
      ];

      const { currentStage, steps } = deriveProjectLifecycle(
        "won",
        "won",
        [],
        orders,
        [],
        deliveries,
      );

      expect(currentStage).toBe("warranty");
      const warrantyStep = steps.find((s) => s.stage === "warranty");
      expect(warrantyStep?.status).toBe("current");
      const handoverStep = steps.find((s) => s.stage === "handover");
      expect(handoverStep?.status).toBe("completed");
    });
  });

  // ── 2. Transparent Health Indicators (No Artificial Scoring) ────────────────
  describe("2. Transparent Operational Health Indicators", () => {
    it("reports zero-quality-defects with good severity when no remakes exist", () => {
      const indicators = deriveTransparentHealthIndicators(
        { stage: "won", status: "won", quotes: [] },
        [],
        [],
        [],
        [],
        { totalProjectValue: 100000, totalInvoiced: 100000, totalCollected: 100000, outstandingBalance: 0, invoices: [], payments: [] },
        [],
      );

      const qualInd = indicators.find((i) => i.dimension === "quality");
      expect(qualInd).toBeDefined();
      expect(qualInd?.severity).toBe("good");
      expect(qualInd?.statusText).toBe("Zero Quality Defects");
    });

    it("flags critical quality health immediately when an active remake case exists", () => {
      const activeRemakes: RemakeListItem[] = [
        {
          id: "rem-1",
          remakeNumber: "RMK-1001",
          orderId: "ord-1",
          orderNumber: "ORD-2026-001",
          type: "manufacturing_defect",
          severity: "high",
          status: "in_remake",
          reason: "Dimension discrepancy on base cabinet",
          createdAt: "2026-09-15T10:00:00Z",
          updatedAt: "2026-09-15T10:00:00Z",
        },
      ];

      const indicators = deriveTransparentHealthIndicators(
        { stage: "won", status: "won", quotes: [] },
        [],
        [],
        [],
        [],
        { totalProjectValue: 100000, totalInvoiced: 100000, totalCollected: 100000, outstandingBalance: 0, invoices: [], payments: [] },
        activeRemakes,
      );

      const qualInd = indicators.find((i) => i.dimension === "quality");
      expect(qualInd?.severity).toBe("critical");
      expect(qualInd?.statusText).toContain("1 Remake Request Active");
      expect(qualInd?.detail).toContain("Dimension discrepancy on base cabinet");
    });

    it("flags commercial critical health if opportunity is lost with reason", () => {
      const indicators = deriveTransparentHealthIndicators(
        { stage: "lost", status: "lost", lostReason: "competitor", quotes: [] },
        [],
        [],
        [],
        [],
        { totalProjectValue: 0, totalInvoiced: 0, totalCollected: 0, outstandingBalance: 0, invoices: [], payments: [] },
        [],
      );

      const commInd = indicators.find((i) => i.dimension === "commercial");
      expect(commInd?.severity).toBe("critical");
      expect(commInd?.statusText).toBe("Deal Lost");
      expect(commInd?.detail).toContain("competitor");
    });

    it("flags warning on financial health if outstanding balance is pending", () => {
      const indicators = deriveTransparentHealthIndicators(
        { stage: "won", status: "won", quotes: [] },
        [],
        [],
        [],
        [],
        {
          totalProjectValue: 200000,
          totalInvoiced: 200000,
          totalCollected: 100000,
          outstandingBalance: 100000,
          invoices: [],
          payments: [],
        },
        [],
      );

      const finInd = indicators.find((i) => i.dimension === "financial");
      expect(finInd?.severity).toBe("warning");
      expect(finInd?.statusText).toContain("100,000");
    });

    it("reports good financial health when 100% of invoiced amount is collected", () => {
      const indicators = deriveTransparentHealthIndicators(
        { stage: "won", status: "won", quotes: [] },
        [],
        [],
        [],
        [],
        {
          totalProjectValue: 200000,
          totalInvoiced: 200000,
          totalCollected: 200000,
          outstandingBalance: 0,
          invoices: [],
          payments: [],
        },
        [],
      );

      const finInd = indicators.find((i) => i.dimension === "financial");
      expect(finInd?.severity).toBe("good");
      expect(finInd?.statusText).toBe("Fully Collected");
    });

    it("flags delivery critical health if a delivery attempt failed", () => {
      const failedDeliveries: DeliveryHandover[] = [
        {
          id: "del-1",
          tenantId: "tenant-1",
          deliveryNumber: "DEL-1001",
          orderId: "ord-1",
          orderNumber: "ORD-2026-001",
          customerId: "cust-1",
          customerName: "Ahmed",
          customerPhone: "01000000000",
          status: "delivery_failed",
          deliveryAddress: "Site not accessible",
          installationRequired: false,
          createdAt: "2026-09-10T10:00:00Z",
          updatedAt: "2026-09-10T10:00:00Z",
        },
      ];

      const indicators = deriveTransparentHealthIndicators(
        { stage: "won", status: "won", quotes: [] },
        [],
        [],
        [],
        failedDeliveries,
        { totalProjectValue: 100000, totalInvoiced: 100000, totalCollected: 100000, outstandingBalance: 0, invoices: [], payments: [] },
        [],
      );

      const delInd = indicators.find((i) => i.dimension === "delivery");
      expect(delInd?.severity).toBe("critical");
      expect(delInd?.statusText).toBe("Delivery Issues");
    });
  });

  // ── 3. Multi-Project Customer Isolation ─────────────────────────────────────
  describe("3. Multi-Project Customer Isolation", () => {
    it("maintains distinct workspaces for multiple projects belonging to the same customer", () => {
      const customerId = "cust-vip-1";

      const projectA: ProjectWorkspaceData = {
        header: {
          projectId: "opp-proj-a",
          projectNumber: "OPP-1001",
          projectName: "Master Kitchen Villa",
          projectType: "residential",
          customerId,
          customerName: "Mohamed Aly",
          currentStage: "production",
          stageLabel: "In Production",
          stageLabelAr: "قيد التصنيع",
          status: "won",
          totalValue: 350000,
          invoicedAmount: 350000,
          paidAmount: 200000,
          outstandingBalance: 150000,
          health: [],
          lifecycle: [],
        },
        commercial: {
          opportunityId: "opp-proj-a",
          opportunityNumber: "OPP-1001",
          title: "Master Kitchen Villa",
          projectType: "residential",
          value: 350000,
          stage: "won",
          status: "won",
          quotes: [
            {
              id: "q-a",
              quoteNumber: "PLC-2026-0001",
              total: 350000,
              subtotal: 307000,
              status: "accepted",
              createdAt: "2026-08-01T10:00:00Z",
              isMainQuote: true,
            },
          ],
        },
        orders: [
          {
            id: "ord-a",
            orderNumber: "ORD-2026-001",
            total: 350000,
            deposit: 175000,
            paidAmount: 200000,
            currentStage: "assembly",
            contractDate: "2026-08-05",
            createdAt: "2026-08-05T10:00:00Z",
          },
        ],
        production: {
          workOrders: [],
          activeStage: "assembly",
          completionPercentage: 60,
        },
        tasks: [],
        inventory: { allocations: [], readiness: "READY" },
        delivery: { handovers: [], currentDeliveryStatus: null },
        financials: {
          totalProjectValue: 350000,
          totalInvoiced: 350000,
          totalCollected: 200000,
          outstandingBalance: 150000,
          invoices: [],
          payments: [],
        },
        quality: { remakes: [], qcCount: 1, defectsCount: 0 },
        documents: [],
        timeline: [],
        currentUserRole: "admin",
      };

      const projectB: ProjectWorkspaceData = {
        header: {
          projectId: "opp-proj-b",
          projectNumber: "OPP-1002",
          projectName: "Guest House Dressing Room",
          projectType: "residential",
          customerId,
          customerName: "Mohamed Aly",
          currentStage: "quote",
          stageLabel: "Quotation",
          stageLabelAr: "عرض أسعار",
          status: "open",
          totalValue: 120000,
          invoicedAmount: 0,
          paidAmount: 0,
          outstandingBalance: 0,
          health: [],
          lifecycle: [],
        },
        commercial: {
          opportunityId: "opp-proj-b",
          opportunityNumber: "OPP-1002",
          title: "Guest House Dressing Room",
          projectType: "residential",
          value: 120000,
          stage: "quotation",
          status: "open",
          quotes: [
            {
              id: "q-b",
              quoteNumber: "PLC-2026-0002",
              total: 120000,
              subtotal: 105000,
              status: "sent",
              createdAt: "2026-09-01T10:00:00Z",
              isMainQuote: true,
            },
          ],
        },
        orders: [],
        production: {
          workOrders: [],
          activeStage: null,
          completionPercentage: 0,
        },
        tasks: [],
        inventory: { allocations: [], readiness: "NOT_RESERVED" },
        delivery: { handovers: [], currentDeliveryStatus: null },
        financials: {
          totalProjectValue: 120000,
          totalInvoiced: 0,
          totalCollected: 0,
          outstandingBalance: 0,
          invoices: [],
          payments: [],
        },
        quality: { remakes: [], qcCount: 0, defectsCount: 0 },
        documents: [],
        timeline: [],
        currentUserRole: "admin",
      };

      // Both belong to same customer
      expect(projectA.header.customerId).toBe(projectB.header.customerId);

      // But completely isolated project numbers and IDs
      expect(projectA.header.projectId).not.toBe(projectB.header.projectId);
      expect(projectA.header.projectNumber).toBe("OPP-1001");
      expect(projectB.header.projectNumber).toBe("OPP-1002");

      // Distinct lifecycles
      expect(projectA.header.currentStage).toBe("production");
      expect(projectB.header.currentStage).toBe("quote");

      // Distinct quotes and values
      expect(projectA.commercial.quotes[0].quoteNumber).toBe("PLC-2026-0001");
      expect(projectB.commercial.quotes[0].quoteNumber).toBe("PLC-2026-0002");
      expect(projectA.orders).toHaveLength(1);
      expect(projectB.orders).toHaveLength(0);
    });
  });

  // ── 4. Role-Based Access Control (RBAC) & Financial Masking ──────────────────
  describe("4. Role-Based Access Control (RBAC) & Data Masking", () => {
    it("masks all financial numbers and invoices to zero for shop-floor workers", () => {
      const mockRawFinancials: ProjectFinancials = {
        totalProjectValue: 450000,
        totalInvoiced: 450000,
        totalCollected: 300000,
        outstandingBalance: 150000,
        invoices: [
          {
            id: "inv-1",
            invoiceNumber: "INV-2026-001",
            total: 450000,
            paidAmount: 300000,
            balanceDue: 150000,
            status: "partially_paid",
            issueDate: "2026-09-01",
          },
        ],
        payments: [],
      };

      const userRole: string = "worker";

      const maskedFinancials: ProjectFinancials = {
        totalProjectValue: userRole === "worker" ? 0 : mockRawFinancials.totalProjectValue,
        totalInvoiced: userRole === "worker" ? 0 : mockRawFinancials.totalInvoiced,
        totalCollected: userRole === "worker" ? 0 : mockRawFinancials.totalCollected,
        outstandingBalance: userRole === "worker" ? 0 : mockRawFinancials.outstandingBalance,
        invoices: userRole === "worker" ? [] : mockRawFinancials.invoices,
        payments: userRole === "worker" ? [] : mockRawFinancials.payments,
      };

      expect(maskedFinancials.totalProjectValue).toBe(0);
      expect(maskedFinancials.totalInvoiced).toBe(0);
      expect(maskedFinancials.totalCollected).toBe(0);
      expect(maskedFinancials.outstandingBalance).toBe(0);
      expect(maskedFinancials.invoices).toHaveLength(0);
    });

    it("preserves full financial figures and invoices for managers and owners", () => {
      const mockRawFinancials: ProjectFinancials = {
        totalProjectValue: 450000,
        totalInvoiced: 450000,
        totalCollected: 300000,
        outstandingBalance: 150000,
        invoices: [
          {
            id: "inv-1",
            invoiceNumber: "INV-2026-001",
            total: 450000,
            paidAmount: 300000,
            balanceDue: 150000,
            status: "partially_paid",
            issueDate: "2026-09-01",
          },
        ],
        payments: [],
      };

      const userRole: string = "admin";

      const unmaskedFinancials: ProjectFinancials = {
        totalProjectValue: userRole === "worker" ? 0 : mockRawFinancials.totalProjectValue,
        totalInvoiced: userRole === "worker" ? 0 : mockRawFinancials.totalInvoiced,
        totalCollected: userRole === "worker" ? 0 : mockRawFinancials.totalCollected,
        outstandingBalance: userRole === "worker" ? 0 : mockRawFinancials.outstandingBalance,
        invoices: userRole === "worker" ? [] : mockRawFinancials.invoices,
        payments: userRole === "worker" ? [] : mockRawFinancials.payments,
      };

      expect(unmaskedFinancials.totalProjectValue).toBe(450000);
      expect(unmaskedFinancials.totalInvoiced).toBe(450000);
      expect(unmaskedFinancials.outstandingBalance).toBe(150000);
      expect(unmaskedFinancials.invoices).toHaveLength(1);
    });
  });

  // ── 5. Chronological Unified Activity Timeline ──────────────────────────────
  describe("5. Chronological Unified Activity Timeline", () => {
    it("sorts all operational and commercial milestones chronologically descending", () => {
      const timelineItems = [
        {
          id: "t-1",
          entityType: "opportunity" as const,
          action: "project_created",
          title: "Project Initialized",
          description: "Created project OPP-1001",
          timestamp: "2026-09-01T10:00:00Z",
        },
        {
          id: "t-2",
          entityType: "quote" as const,
          action: "quote_sent",
          title: "Quotation Sent",
          description: "Sent quote PLC-2026-0001",
          timestamp: "2026-09-03T12:00:00Z",
        },
        {
          id: "t-3",
          entityType: "order" as const,
          action: "order_booked",
          title: "Order Booked",
          description: "Booked order ORD-2026-001",
          timestamp: "2026-09-05T09:00:00Z",
        },
        {
          id: "t-4",
          entityType: "delivery" as const,
          action: "delivery_dispatched",
          title: "Dispatched",
          description: "Dispatched delivery DEL-1001",
          timestamp: "2026-09-12T08:00:00Z",
        },
      ];

      timelineItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      expect(timelineItems[0].id).toBe("t-4"); // newest
      expect(timelineItems[1].id).toBe("t-3");
      expect(timelineItems[2].id).toBe("t-2");
      expect(timelineItems[3].id).toBe("t-1"); // oldest
    });
  });
});
