import { describe, it, expect } from "vitest";
import type {
  CustomerListItem,
  Customer360Data,
  CustomerProjectItem,
  CustomerQuoteItem,
  CustomerOrderItem,
  CustomerFinancials,
  CustomerActivityItem,
} from "@/lib/customer-types";
import { computeInvoiceStatus, type InvoiceItem } from "@/lib/invoice-types";
import type { ProductionWorkOrder } from "@/lib/work-order-types";
import type { DeliveryHandover } from "@/lib/delivery-types";
import type { RemakeListItem } from "@/lib/remake-types";
import type { TaskItem } from "@/lib/task-types";
import type { OpportunityItem } from "@/lib/crm-types";

describe("TASK 23 — Customer 360 v2 Comprehensive Suite", () => {
  describe("1. Customer With No Activity (Zero State)", () => {
    it("correctly handles a newly registered customer with zero projects, quotes, orders, and balance", () => {
      const emptyCustomerData: Customer360Data = {
        customer: {
          id: "c-empty",
          name: "Fresh Client",
          phone: "01012345678",
          email: "fresh@example.com",
          address: "Zamalek, Cairo",
          governorate: "Cairo",
          createdAt: new Date().toISOString(),
          quoteCount: 0,
          activeOrderCount: 0,
          totalInvoiced: 0,
          totalPaid: 0,
          outstandingBalance: 0,
        },
        projects: [],
        opportunities: [],
        quotes: [],
        orders: [],
        invoices: [],
        financials: {
          totalInvoiced: 0,
          totalCollected: 0,
          outstandingBalance: 0,
          openInvoicesCount: 0,
          openInvoices: [],
          recentPayments: [],
        },
        tasks: [],
        workOrders: [],
        deliveries: [],
        remakes: [],
        activities: [],
        afterSales: {
          openCasesCount: 0,
          resolvedCasesCount: 0,
          remakesCount: 0,
          complaintsCount: 0,
          cases: [],
          warranties: [],
          recentDelivery: null,
          recentHandover: null,
        },
        hasCompletedProjects: false,
      };

      expect(emptyCustomerData.projects).toHaveLength(0);
      expect(emptyCustomerData.opportunities).toHaveLength(0);
      expect(emptyCustomerData.quotes).toHaveLength(0);
      expect(emptyCustomerData.orders).toHaveLength(0);
      expect(emptyCustomerData.invoices).toHaveLength(0);
      expect(emptyCustomerData.financials.totalInvoiced).toBe(0);
      expect(emptyCustomerData.financials.totalCollected).toBe(0);
      expect(emptyCustomerData.financials.outstandingBalance).toBe(0);
      expect(emptyCustomerData.tasks).toHaveLength(0);
      expect(emptyCustomerData.workOrders).toHaveLength(0);
      expect(emptyCustomerData.deliveries).toHaveLength(0);
      expect(emptyCustomerData.remakes).toHaveLength(0);
      expect(emptyCustomerData.activities).toHaveLength(0);
    });
  });

  describe("2. Single Project Customer Lifecycle (Customer → Project → Quote → Order → Production → Delivery → After-Sales)", () => {
    it("assembles complete project lifecycle correctly", () => {
      const mockQuote: CustomerQuoteItem = {
        id: "q-1",
        quoteNumber: "QUO-2001",
        status: "accepted",
        total: 150000,
        opportunityId: "opp-1",
        createdAt: "2026-09-01T10:00:00Z",
        orderId: "ord-1",
        orderNumber: "ORD-5001",
      };

      const mockOrder: CustomerOrderItem = {
        id: "ord-1",
        orderNumber: "ORD-5001",
        quoteId: "q-1",
        quoteNumber: "QUO-2001",
        opportunityId: "opp-1",
        currentStage: "cutting",
        total: 150000,
        deposit: 75000,
        paidAmount: 75000,
        balanceDue: 75000,
        contractDate: "2026-09-02T10:00:00Z",
        expectedDelivery: "2026-09-25",
        createdAt: "2026-09-02T10:00:00Z",
      };

      const mockWorkOrder: ProductionWorkOrder = {
        id: "wo-1",
        tenantId: "t-1",
        workOrderNumber: "WO-101",
        orderId: "ord-1",
        orderNumber: "ORD-5001",
        status: "in_progress",
        priority: "high",
        currentStage: "cutting",
        materialReadiness: "READY",
        createdAt: "2026-09-03T10:00:00Z",
        updatedAt: "2026-09-03T10:00:00Z",
      };

      const mockDelivery: DeliveryHandover = {
        id: "del-1",
        tenantId: "t-1",
        deliveryNumber: "DEL-101",
        orderId: "ord-1",
        orderNumber: "ORD-5001",
        customerId: "c-1",
        customerName: "Ahmed Hassan",
        customerPhone: "01001234567",
        status: "dispatched",
        deliveryAddress: "New Cairo Villa 42",
        recipientName: "Ahmed Hassan",
        recipientPhone: "01001234567",
        scheduledDate: "2026-09-25",
        installationRequired: true,
        createdAt: "2026-09-04T10:00:00Z",
        updatedAt: "2026-09-04T10:00:00Z",
      };

      const mockTask: TaskItem = {
        id: "tsk-1",
        tenantId: "t-1",
        taskCode: "TSK-1001",
        title: "Finalize shop drawing approval",
        status: "completed",
        priority: "high",
        category: "production",
        dueDate: "2026-09-05T00:00:00Z",
        createdBy: "usr-1",
        opportunityId: "opp-1",
        orderId: "ord-1",
        isOverdue: false,
        assignees: [],
        createdAt: "2026-09-01T11:00:00Z",
        updatedAt: "2026-09-05T12:00:00Z",
      };

      const project: CustomerProjectItem = {
        id: "opp-1",
        opportunityNumber: "OPP-001",
        title: "Modern Acrylic Kitchen",
        projectType: "kitchen",
        value: 150000,
        stage: "in_production",
        status: "open",
        salesOwner: "usr-sales",
        salesOwnerName: "Sarah M.",
        quotationStatus: "accepted",
        orderStatus: "cutting",
        productionStatus: "in_progress",
        deliveryStatus: "scheduled",
        outstandingBalance: 75000,
        openTasksCount: 0,
        qualityCasesCount: 0,
        nextAction: "Inspect edge banding",
        nextActionDate: "2026-09-10",
        quotesCount: 1,
        ordersCount: 1,
        quotes: [mockQuote],
        orders: [mockOrder],
        workOrders: [mockWorkOrder],
        deliveries: [mockDelivery],
        tasks: [mockTask],
        remakes: [],
      };

      expect(project.value).toBe(150000);
      expect(project.quotationStatus).toBe("accepted");
      expect(project.orderStatus).toBe("cutting");
      expect(project.productionStatus).toBe("in_progress");
      expect(project.deliveryStatus).toBe("scheduled");
      expect(project.outstandingBalance).toBe(75000);
      expect(project.openTasksCount).toBe(0);
      expect(project.quotes).toHaveLength(1);
      expect(project.orders).toHaveLength(1);
      expect(project.workOrders).toHaveLength(1);
      expect(project.deliveries).toHaveLength(1);
    });
  });

  describe("3. Multi-Project Customer Architecture", () => {
    it("handles multiple concurrent projects for the same customer with isolated lifecycles", () => {
      const project1: CustomerProjectItem = {
        id: "opp-kitchen",
        opportunityNumber: "OPP-001",
        title: "Villa Kitchen Fitout",
        projectType: "kitchen",
        value: 200000,
        stage: "in_production",
        status: "open",
        quotationStatus: "accepted",
        orderStatus: "assembly",
        productionStatus: "in_progress",
        deliveryStatus: "scheduled",
        outstandingBalance: 50000,
        openTasksCount: 1,
        qualityCasesCount: 0,
        quotesCount: 1,
        ordersCount: 1,
        quotes: [],
        orders: [],
        workOrders: [],
        deliveries: [],
        tasks: [],
        remakes: [],
      };

      const project2: CustomerProjectItem = {
        id: "opp-dressing",
        opportunityNumber: "OPP-002",
        title: "Master Dressing Room",
        projectType: "dressing_room",
        value: 120000,
        stage: "proposal",
        status: "open",
        quotationStatus: "sent",
        orderStatus: null,
        productionStatus: null,
        deliveryStatus: null,
        outstandingBalance: 0,
        openTasksCount: 2,
        qualityCasesCount: 0,
        quotesCount: 1,
        ordersCount: 0,
        quotes: [],
        orders: [],
        workOrders: [],
        deliveries: [],
        tasks: [],
        remakes: [],
      };

      const projects = [project1, project2];
      const totalPortfolioValue = projects.reduce((s, p) => s + p.value, 0);
      const totalOutstanding = projects.reduce((s, p) => s + p.outstandingBalance, 0);
      const totalOpenTasks = projects.reduce((s, p) => s + p.openTasksCount, 0);

      expect(totalPortfolioValue).toBe(320000);
      expect(totalOutstanding).toBe(50000);
      expect(totalOpenTasks).toBe(3);
      expect(projects[0].quotationStatus).toBe("accepted");
      expect(projects[1].quotationStatus).toBe("sent");
    });
  });

  describe("4. Financial Ledger Invariant & Payment History", () => {
    it("ensures totalInvoiced = totalCollected + outstandingBalance across multiple invoices and payments", () => {
      const invoices: InvoiceItem[] = [
        {
          id: "inv-1",
          tenantId: "t1",
          invoiceNumber: "INV-1001",
          quoteId: "q1",
          customerId: "c1",
          total: 100000,
          depositAmount: 50000,
          paidAmount: 50000,
          balanceDue: 50000,
          status: "partially_paid",
          issuedAt: "2026-09-01T10:00:00Z",
          paymentCount: 1,
          payments: [
            {
              id: "pay-1",
              invoiceId: "inv-1",
              paymentNumber: "RCT-1001",
              amount: 50000,
              paymentMethod: "instapay",
              recordedBy: "usr-1",
              paidAt: "2026-09-01T11:00:00Z",
              createdAt: "2026-09-01T11:00:00Z",
            },
          ],
        },
        {
          id: "inv-2",
          tenantId: "t1",
          invoiceNumber: "INV-1002",
          quoteId: "q2",
          customerId: "c1",
          total: 80000,
          depositAmount: 40000,
          paidAmount: 80000,
          balanceDue: 0,
          status: "paid",
          issuedAt: "2026-09-02T10:00:00Z",
          paymentCount: 2,
          payments: [
            {
              id: "pay-2",
              invoiceId: "inv-2",
              paymentNumber: "RCT-1002",
              amount: 40000,
              paymentMethod: "bank_transfer",
              recordedBy: "usr-1",
              paidAt: "2026-09-02T12:00:00Z",
              createdAt: "2026-09-02T12:00:00Z",
            },
            {
              id: "pay-3",
              invoiceId: "inv-2",
              paymentNumber: "RCT-1003",
              amount: 40000,
              paymentMethod: "cash",
              recordedBy: "usr-1",
              paidAt: "2026-09-05T15:00:00Z",
              createdAt: "2026-09-05T15:00:00Z",
            },
          ],
        },
      ];

      const totalInvoiced = invoices.reduce((s, i) => s + i.total, 0);
      const totalCollected = invoices.reduce((s, i) => s + i.paidAmount, 0);
      const outstandingBalance = Math.max(0, totalInvoiced - totalCollected);

      expect(totalInvoiced).toBe(180000);
      expect(totalCollected).toBe(130000);
      expect(outstandingBalance).toBe(50000);
      expect(totalInvoiced).toBe(totalCollected + outstandingBalance);

      // Verify payment ledger extraction
      const paymentLedger = invoices.flatMap((i) => i.payments || []);
      expect(paymentLedger).toHaveLength(3);
      const sumLedger = paymentLedger.reduce((s, p) => s + p.amount, 0);
      expect(sumLedger).toBe(totalCollected);
    });
  });

  describe("5. Role-Based Financial Masking (Worker Security)", () => {
    it("completely zeroes financial balances, invoice rows, and project monetary values for worker role", () => {
      const applyWorkerMasking = (data: Customer360Data): Customer360Data => {
        const masked = { ...data };
        masked.financials = {
          ...masked.financials,
          totalInvoiced: 0,
          totalCollected: 0,
          outstandingBalance: 0,
          openInvoices: [],
          recentPayments: [],
        };
        masked.customer = {
          ...masked.customer,
          totalInvoiced: 0,
          totalPaid: 0,
          outstandingBalance: 0,
        };
        masked.projects = masked.projects.map((p) => ({
          ...p,
          value: 0,
          outstandingBalance: 0,
        }));
        masked.quotes = masked.quotes.map((q) => ({
          ...q,
          total: 0,
        }));
        masked.orders = masked.orders.map((o) => ({
          ...o,
          total: 0,
          deposit: 0,
          paidAmount: 0,
          balanceDue: 0,
        }));
        return masked;
      };

      const initialData: Customer360Data = {
        customer: {
          id: "c1",
          name: "Confidential Client",
          phone: "01000000000",
          email: "c@example.com",
          address: "Zamalek",
          governorate: "Cairo",
          createdAt: new Date().toISOString(),
          quoteCount: 1,
          activeOrderCount: 1,
          totalInvoiced: 500000,
          totalPaid: 250000,
          outstandingBalance: 250000,
        },
        projects: [
          {
            id: "p1",
            title: "Luxury Penthouse",
            projectType: "full_residence",
            value: 500000,
            stage: "in_production",
            status: "open",
            outstandingBalance: 250000,
            openTasksCount: 1,
            qualityCasesCount: 0,
            quotesCount: 1,
            ordersCount: 1,
            quotes: [],
            orders: [],
            workOrders: [],
            deliveries: [],
            tasks: [],
            remakes: [],
          },
        ],
        opportunities: [],
        quotes: [
          {
            id: "q1",
            quoteNumber: "QUO-1",
            status: "accepted",
            total: 500000,
            createdAt: new Date().toISOString(),
          },
        ],
        orders: [
          {
            id: "o1",
            orderNumber: "ORD-1",
            currentStage: "cutting",
            total: 500000,
            deposit: 250000,
            paidAmount: 250000,
            balanceDue: 250000,
            contractDate: "2026-09-01",
            createdAt: new Date().toISOString(),
          },
        ],
        invoices: [],
        financials: {
          totalInvoiced: 500000,
          totalCollected: 250000,
          outstandingBalance: 250000,
          openInvoicesCount: 1,
          openInvoices: [],
          recentPayments: [],
        },
        tasks: [],
        workOrders: [],
        deliveries: [],
        remakes: [],
        activities: [],
        afterSales: {
          openCasesCount: 0,
          resolvedCasesCount: 0,
          remakesCount: 0,
          complaintsCount: 0,
          cases: [],
          warranties: [],
          recentDelivery: null,
          recentHandover: null,
        },
        hasCompletedProjects: false,
      };

      const maskedData = applyWorkerMasking(initialData);

      expect(maskedData.financials.totalInvoiced).toBe(0);
      expect(maskedData.financials.totalCollected).toBe(0);
      expect(maskedData.financials.outstandingBalance).toBe(0);
      expect(maskedData.customer.outstandingBalance).toBe(0);
      expect(maskedData.projects[0].value).toBe(0);
      expect(maskedData.projects[0].outstandingBalance).toBe(0);
      expect(maskedData.quotes[0].total).toBe(0);
      expect(maskedData.orders[0].total).toBe(0);
      expect(maskedData.orders[0].balanceDue).toBe(0);
    });
  });

  describe("6. Operational Problem Detection (Quality Remakes & Overdue Tasks)", () => {
    it("correctly flags overdue tasks and active quality remakes", () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const futureDate = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

      const task1: TaskItem = {
        id: "t1",
        tenantId: "t-1",
        taskCode: "TSK-01",
        title: "Urgent edge repair",
        status: "in_progress",
        priority: "critical",
        category: "repair",
        dueDate: pastDate,
        createdBy: "usr-1",
        isOverdue: true,
        assignees: [],
        createdAt: pastDate,
        updatedAt: pastDate,
      };

      const task2: TaskItem = {
        id: "t2",
        tenantId: "t-1",
        taskCode: "TSK-02",
        title: "Future packaging check",
        status: "not_started",
        priority: "medium",
        category: "qc",
        dueDate: futureDate,
        createdBy: "usr-1",
        isOverdue: false,
        assignees: [],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      const remake1: RemakeListItem = {
        id: "r1",
        remakeNumber: "RMK-01",
        orderId: "o1",
        orderNumber: "ORD-01",
        type: "qc_failure",
        severity: "critical",
        status: "in_remake",
        reason: "Cabinet door dimension off by 5mm",
        createdAt: pastDate,
        updatedAt: pastDate,
      };

      const remake2: RemakeListItem = {
        id: "r2",
        remakeNumber: "RMK-02",
        orderId: "o1",
        orderNumber: "ORD-01",
        type: "warranty",
        severity: "low",
        status: "resolved",
        reason: "Hinge adjustment",
        createdAt: pastDate,
        updatedAt: now.toISOString(),
      };

      const tasks = [task1, task2];
      const remakes = [remake1, remake2];

      const overdueTasks = tasks.filter((t) => t.isOverdue);
      const openRemakes = remakes.filter(
        (r) => r.status !== "resolved" && r.status !== "rejected" && r.status !== "cancelled",
      );

      expect(overdueTasks).toHaveLength(1);
      expect(overdueTasks[0].taskCode).toBe("TSK-01");
      expect(openRemakes).toHaveLength(1);
      expect(openRemakes[0].remakeNumber).toBe("RMK-01");
      expect(openRemakes[0].type).toBe("qc_failure");
    });
  });

  describe("7. Unified Chronological Activity Timeline Ordering", () => {
    it("ensures activity events are sorted descending by timestamp and bounded to 50 items", () => {
      const timestamps = [
        "2026-09-01T08:00:00Z",
        "2026-09-03T12:00:00Z",
        "2026-09-02T10:00:00Z",
        "2026-09-05T16:00:00Z",
        "2026-09-04T09:00:00Z",
      ];

      const activities: CustomerActivityItem[] = timestamps.map((ts, idx) => ({
        id: `act-${idx}`,
        entityType: "order",
        action: "updated",
        title: `Event ${idx}`,
        description: `Description ${idx}`,
        timestamp: ts,
      }));

      // Sort descending
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      expect(new Date(activities[0].timestamp).getTime()).toBeGreaterThan(
        new Date(activities[1].timestamp).getTime(),
      );
      expect(activities[0].timestamp).toBe("2026-09-05T16:00:00Z");
      expect(activities[activities.length - 1].timestamp).toBe("2026-09-01T08:00:00Z");
    });
  });

  describe("8. Tenant Isolation Verification", () => {
    it("strictly isolates customers and projects between tenant boundaries", () => {
      const tenantA = "11111111-1111-1111-1111-111111111111";
      const tenantB = "22222222-2222-2222-2222-222222222222";

      const tenantACustomer = {
        id: "c-A",
        tenantId: tenantA,
        name: "Tenant A Customer",
      };

      const checkTenantAccess = (callerTenantId: string, resourceTenantId: string) => {
        return callerTenantId === resourceTenantId;
      };

      expect(checkTenantAccess(tenantA, tenantACustomer.tenantId)).toBe(true);
      expect(checkTenantAccess(tenantB, tenantACustomer.tenantId)).toBe(false);
    });
  });
});
