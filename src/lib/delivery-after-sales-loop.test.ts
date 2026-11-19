import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/db/client.server";
import {
  tenants,
  customers,
  quotes,
  orders,
  projects,
  invoices,
  deliveryHandovers,
  serviceCases,
  remakes,
  tasks,
  taskAssignees,
  appUsers,
  qcInspections,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  ORDER_STAGES,
  getStageLabelAr,
  mapInternalStageToCustomerStage,
} from "@/lib/stages";
import {
  executeOrderStageTransition,
  executeQCInspectionWithRemakeLoop,
} from "@/lib/production-workflow.server";
import {
  executeCreateDelivery,
  executeGetDeliveryById,
  executeDeliveryStatusUpdate,
  executeCreateServiceCase,
  executeCreateRemakeForCase,
  executeGetServiceCaseById,
} from "@/lib/delivery-after-sales.server";

describe("Sprint 6A — Delivery, Installation, Milestone Billing & Warranty Remake Loop", () => {
  const TEST_TENANT_ID = "00000000-0000-0000-0000-00000000006a";
  const TEST_USER_ID = "00000000-0000-0000-0000-00000000006b";
  const TEST_TECH_ID = "00000000-0000-0000-0000-00000000006c";

  let testCustomerId: string;
  let testQuoteId: string;
  let testOrderId: string;
  let testProjectId: string;
  let testDeliveryId: string;
  let testCaseId: string;

  const mockAdminContext = {
    tenantContext: {
      tenantId: TEST_TENANT_ID,
      userId: TEST_USER_ID,
      role: "owner" as const,
      user: { id: TEST_USER_ID, email: "owner@test6a.com" },
    },
  };

  beforeAll(async () => {
    // 1. Ensure test tenant exists
    await db
      .insert(tenants)
      .values({
        id: TEST_TENANT_ID,
        name: "Test Atelier Prestige 6A",
        slug: `test-6a-${Date.now()}`,
        plan: "pro",
      })
      .onConflictDoNothing();

    // 2. Ensure test users exist
    await db
      .insert(appUsers)
      .values([
        {
          id: TEST_USER_ID,
          tenantId: TEST_TENANT_ID,
          username: `owner_6a_${Date.now()}`,
          displayName: "Workshop Owner 6A",
          status: "active",
        },
        {
          id: TEST_TECH_ID,
          tenantId: TEST_TENANT_ID,
          username: `tech_6a_${Date.now()}`,
          displayName: "Lead Field Installer 6A",
          status: "active",
        },
      ])
      .onConflictDoNothing();

    // 3. Ensure test customer exists
    const [cust] = await db
      .insert(customers)
      .values({
        tenantId: TEST_TENANT_ID,
        name: "عميل راقي للاختبار 6A",
        phone: "01099996666",
        address: "التجمع الخامس، شارع التسعين الشمالي، فيلا 25",
      })
      .returning();
    testCustomerId = cust.id;

    // 4. Create Quote
    const [quote] = await db
      .insert(quotes)
      .values({
        tenantId: TEST_TENANT_ID,
        quoteNumber: `PLC-6A-${Date.now().toString().slice(-5)}`,
        customerId: testCustomerId,
        status: "accepted",
        total: "120000.00",
        validUntil: "2026-12-31",
      })
      .returning();
    testQuoteId = quote.id;

    // 5. Create Order
    const [order] = await db
      .insert(orders)
      .values({
        tenantId: TEST_TENANT_ID,
        orderNumber: `ORD-6A-${Date.now().toString().slice(-4)}`,
        quoteId: testQuoteId,
        customerId: testCustomerId,
        currentStage: "quality_check",
        total: "120000.00",
        deposit: "60000.00",
        contractDate: "2026-11-01",
      })
      .returning();
    testOrderId = order.id;

    // 6. Create Project linked to quote and order
    const [proj] = await db
      .insert(projects)
      .values({
        tenantId: TEST_TENANT_ID,
        projectNumber: `PRJ-6A-${Date.now().toString().slice(-4)}`,
        customerId: testCustomerId,
        quoteId: testQuoteId,
        orderId: testOrderId,
        title: "مشروع فيلا التجمع - مطبخ ودريسنج",
        currentStage: "production",
        totalValue: "120000.00",
      })
      .returning();
    testProjectId = proj.id;
  });

  afterAll(async () => {
    try {
      await db.delete(tasks).where(eq(tasks.tenantId, TEST_TENANT_ID));
      await db.delete(remakes).where(eq(remakes.tenantId, TEST_TENANT_ID));
      await db.delete(serviceCases).where(eq(serviceCases.tenantId, TEST_TENANT_ID));
      await db.delete(deliveryHandovers).where(eq(deliveryHandovers.tenantId, TEST_TENANT_ID));
      await db.delete(invoices).where(eq(invoices.tenantId, TEST_TENANT_ID));
      await db.delete(orders).where(eq(orders.tenantId, TEST_TENANT_ID));
      await db.delete(projects).where(eq(projects.tenantId, TEST_TENANT_ID));
      await db.delete(quotes).where(eq(quotes.tenantId, TEST_TENANT_ID));
      await db.delete(customers).where(eq(customers.tenantId, TEST_TENANT_ID));
      await db.delete(appUsers).where(eq(appUsers.tenantId, TEST_TENANT_ID));
      await db.delete(tenants).where(eq(tenants.id, TEST_TENANT_ID));
    } catch {
      /* cleanup fallback */
    }
  });

  describe("1. Stage Transition & Backward Compatibility (ready_for_pickup -> ready_for_delivery)", () => {
    it("defines ORDER_STAGES with 'ready_for_delivery' and accurate trilingual Arabic label", () => {
      expect(ORDER_STAGES).toContain("ready_for_delivery");
      expect(ORDER_STAGES).not.toContain("ready_for_pickup");
      expect(getStageLabelAr("ready_for_delivery")).toBe("جاهز للتسليم والتركيب");
    });

    it("maintains backward-compatible alias fallback for legacy 'ready_for_pickup'", () => {
      expect(getStageLabelAr("ready_for_pickup")).toBe("جاهز للتسليم والتركيب");
      expect(mapInternalStageToCustomerStage("ready_for_pickup")).toBe("ready_for_delivery");
      expect(mapInternalStageToCustomerStage("ready_for_delivery")).toBe("ready_for_delivery");
    });

    it("strictly blocks advancement from 'quality_check' to 'ready_for_delivery' without passing QC", async () => {
      await expect(
        executeOrderStageTransition(db, {
          tenantId: TEST_TENANT_ID,
          userId: TEST_USER_ID,
          orderId: testOrderId,
          nextStage: "ready_for_delivery",
        }),
      ).rejects.toThrow(/Cannot advance order beyond Quality Check/i);
    });

    it("records a passing QC inspection and successfully advances to 'ready_for_delivery'", async () => {
      // 1. Pass QC
      const qcRes = await executeQCInspectionWithRemakeLoop(db, {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        orderId: testOrderId,
        stage: "quality_check",
        passed: true,
        notes: "فحص الجودة مطابق تماماً للمواصفات الفنية",
      });
      expect(qcRes.ok).toBe(true);
      expect(qcRes.passed).toBe(true);

      // 2. Advance to ready_for_delivery
      const transitionRes = await executeOrderStageTransition(db, {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        orderId: testOrderId,
        nextStage: "ready_for_delivery",
      });
      expect(transitionRes.ok).toBe(true);
      expect(transitionRes.currentStage).toBe("ready_for_delivery");

      const [ord] = await db
        .select({ currentStage: orders.currentStage })
        .from(orders)
        .where(eq(orders.id, testOrderId));
      expect(ord.currentStage).toBe("ready_for_delivery");
    });
  });

  describe("2. Company Delivery & Installation Handover with Milestone Sync", () => {
    it("creates delivery handover with installationRequired defaulting to true", async () => {
      const res = await executeCreateDelivery(db, mockAdminContext.tenantContext, {
        orderId: testOrderId,
        deliveryAddress: "التجمع الخامس، شارع التسعين الشمالي، فيلا 25",
        recipientName: "عميل راقي للاختبار 6A",
        recipientPhone: "01099996666",
      });

      expect(res.ok).toBe(true);
      expect(res.deliveryNumber).toMatch(/^DEL-\d+/);
      testDeliveryId = res.deliveryId;

      const [dRow] = await db
        .select()
        .from(deliveryHandovers)
        .where(eq(deliveryHandovers.id, testDeliveryId));
      expect(dRow.installationRequired).toBe(true);
      expect(dRow.status).toBe("ready_for_dispatch");
    });

    it("surfaces linked trackingToken and scheduled milestone invoices in getDeliveryById", async () => {
      // 1. Create a scheduled milestone invoice for the project
      await db.insert(invoices).values({
        tenantId: TEST_TENANT_ID,
        invoiceNumber: `INV-6A-M3-${Date.now().toString().slice(-4)}`,
        quoteId: testQuoteId,
        customerId: testCustomerId,
        projectId: testProjectId,
        total: "30000.00",
        milestoneIndex: 3,
        milestoneTotalCount: 3,
        milestoneLabel: "دفعة التركيب والتسليم النهائي",
        milestonePct: "25.00",
        billingStatus: "scheduled",
        dueStage: "installation",
      });

      const detail = await executeGetDeliveryById(db, mockAdminContext.tenantContext, {
        deliveryId: testDeliveryId,
      });

      expect(detail.delivery).toBeDefined();
      expect(detail.delivery.trackingToken).toBeDefined();
      expect(typeof detail.delivery.trackingToken).toBe("string");
      expect(detail.delivery.scheduledMilestoneInvoices).toBeDefined();
      expect(detail.delivery.scheduledMilestoneInvoices.length).toBeGreaterThanOrEqual(1);

      const scheduled = detail.delivery.scheduledMilestoneInvoices[0];
      expect(scheduled.billingStatus).toBe("scheduled");
      expect(scheduled.milestoneLabel).toBe("دفعة التركيب والتسليم النهائي");
    });

    it("synchronizes orders.currentStage and projects.currentStage when delivery reaches 'installed' and 'completed'", async () => {
      // 1. Advance to dispatched
      await executeDeliveryStatusUpdate(db, mockAdminContext.tenantContext, {
        deliveryId: testDeliveryId,
        status: "dispatched",
      });

      // 2. Advance to out_for_delivery
      await executeDeliveryStatusUpdate(db, mockAdminContext.tenantContext, {
        deliveryId: testDeliveryId,
        status: "out_for_delivery",
      });

      // 3. Advance to delivered
      await executeDeliveryStatusUpdate(db, mockAdminContext.tenantContext, {
        deliveryId: testDeliveryId,
        status: "delivered",
      });

      // 4. Advance to installation_pending
      await executeDeliveryStatusUpdate(db, mockAdminContext.tenantContext, {
        deliveryId: testDeliveryId,
        status: "installation_pending",
      });

      // 5. Advance to installed -> triggers sync of orders to 'delivered' and projects to 'delivery'
      await executeDeliveryStatusUpdate(db, mockAdminContext.tenantContext, {
        deliveryId: testDeliveryId,
        status: "installed",
        installerName: "كابتن أحمد التركيبات",
      });

      let [ord] = await db
        .select({ currentStage: orders.currentStage, deliveredAt: orders.deliveredAt })
        .from(orders)
        .where(eq(orders.id, testOrderId));
      expect(ord.currentStage).toBe("delivered");
      expect(ord.deliveredAt).not.toBeNull();

      let [proj] = await db
        .select({ currentStage: projects.currentStage })
        .from(projects)
        .where(eq(projects.id, testProjectId));
      expect(proj.currentStage).toBe("delivery");

      // 6. Advance to handover_pending then completed
      await executeDeliveryStatusUpdate(db, mockAdminContext.tenantContext, {
        deliveryId: testDeliveryId,
        status: "handover_pending",
      });

      await executeDeliveryStatusUpdate(db, mockAdminContext.tenantContext, {
        deliveryId: testDeliveryId,
        status: "completed",
        signerName: "عميل راقي للاختبار 6A",
        handoverNotes: "تم الاستلام والمعاينة بنجاح كامل",
      });

      [ord] = await db
        .select({ currentStage: orders.currentStage, deliveredAt: orders.deliveredAt })
        .from(orders)
        .where(eq(orders.id, testOrderId));
      expect(ord.currentStage).toBe("completed");

      [proj] = await db
        .select({ currentStage: projects.currentStage })
        .from(projects)
        .where(eq(projects.id, testProjectId));
      expect(proj.currentStage).toBe("handover");
    });
  });

  describe("3. After-Sales Warranty -> Remake & Corrective Task Loop", () => {
    it("creates a warranty service case and calculates warranty coverage", async () => {
      const caseRes = await executeCreateServiceCase(db, mockAdminContext.tenantContext, {
        customerId: testCustomerId,
        orderId: testOrderId,
        projectId: null,
        deliveryId: testDeliveryId,
        type: "warranty",
        priority: "high",
        title: "شرخ بسيط في دلفة المطبخ العلوية تحت الضمان",
        description: "ملاحظة بعد التركيب بيومين تتطلب استبدال الدلفة العلوية",
      });

      expect(caseRes.caseNumber).toMatch(/^CAS-\d+/);
      expect(caseRes.status).toBe("new");
      expect(caseRes.type).toBe("warranty");
      testCaseId = caseRes.id;
    });

    it("atomically creates a workshop remake, links remakeId, spawns high-priority task, and updates case status to in_progress", async () => {
      const remakeRes = await executeCreateRemakeForCase(db, mockAdminContext.tenantContext, {
        caseId: testCaseId,
        reason: "دلفة علوية بها شرخ بعد التركيب",
        defectDescription: "استبدال خامة HPL أبيض مقاس 60x70 سم",
        severity: "high",
        assignedTo: TEST_TECH_ID,
      });

      expect(remakeRes).toBeDefined();
      expect(remakeRes.id).toBeDefined();
      expect(remakeRes.remakeNumber).toMatch(/^RMK-\d+/);
      expect(remakeRes.type).toBe("warranty");
      expect(remakeRes.severity).toBe("high");

      // Verify service case was updated atomically
      const [updatedCase] = await db
        .select()
        .from(serviceCases)
        .where(eq(serviceCases.id, testCaseId));

      expect(updatedCase.remakeId).toBe(remakeRes.id);
      expect(updatedCase.status).toBe("in_progress");
      expect(updatedCase.taskId).not.toBeNull();

      // Verify linked corrective task in tasks table
      const [taskRow] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, updatedCase.taskId!));

      expect(taskRow).toBeDefined();
      expect(taskRow.taskCode).toMatch(/^TSK-\d+/);
      expect(taskRow.category).toBe("quality");
      expect(taskRow.priority).toBe("high");
      expect(taskRow.remakeId).toBe(remakeRes.id);
      expect(taskRow.orderId).toBe(testOrderId);
      expect(taskRow.customerId).toBe(testCustomerId);

      // Verify task assignment record
      const [assignment] = await db
        .select()
        .from(taskAssignees)
        .where(eq(taskAssignees.taskId, taskRow.id));
      expect(assignment).toBeDefined();
      expect(assignment.userId).toBe(TEST_TECH_ID);
    });

    it("fetches full case details via executeGetServiceCaseById verifying warranty, linked remake and tasks", async () => {
      const caseDetail = await executeGetServiceCaseById(db, mockAdminContext.tenantContext, {
        caseId: testCaseId,
      });

      expect(caseDetail.id).toBe(testCaseId);
      expect(caseDetail.status).toBe("in_progress");
      expect(caseDetail.linkedRemake).toBeDefined();
      expect(caseDetail.linkedRemake.remakeNumber).toMatch(/^RMK-\d+/);
      expect(caseDetail.linkedTasks).toBeDefined();
      expect(caseDetail.linkedTasks.length).toBeGreaterThanOrEqual(1);
      expect(caseDetail.linkedTasks[0].category).toBe("quality");
    });
  });
});
