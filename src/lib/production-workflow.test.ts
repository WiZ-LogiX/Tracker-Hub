import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/db/client.server";
import {
  tenants,
  customers,
  orders,
  projects,
  productionWorkOrders,
  qcInspections,
  productionLogs,
  remakes,
  tasks,
  taskAssignees,
  appUsers,
  tenantCounters,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  executeOrderStageTransition,
  executeQCInspectionWithRemakeLoop,
} from "@/lib/production-workflow.server";

describe("Sprint 3 — Guided Production Stage, QC Gate & Remake Loop Suite", () => {
  const TEST_TENANT_ID = "00000000-0000-0000-0000-000000000003";
  const TEST_USER_ID = "00000000-0000-0000-0000-000000000004";
  const TEST_WORKER_ID = "00000000-0000-0000-0000-000000000005";

  let testCustomerId: string;
  let testOrderId: string;
  let testProjectId: string;

  beforeAll(async () => {
    // 1. Ensure test tenant exists
    await db
      .insert(tenants)
      .values({
        id: TEST_TENANT_ID,
        name: "Test Production Tenant",
        slug: `test-prod-${Date.now()}`,
      })
      .onConflictDoNothing();

    // 2. Ensure test users exist
    await db
      .insert(appUsers)
      .values([
        {
          id: TEST_USER_ID,
          tenantId: TEST_TENANT_ID,
          username: `prod_mgr_${Date.now()}`,
          displayName: "Production Manager",
        },
        {
          id: TEST_WORKER_ID,
          tenantId: TEST_TENANT_ID,
          username: `tech_worker_${Date.now()}`,
          displayName: "Technician Worker",
        },
      ])
      .onConflictDoNothing();

    // 3. Create test customer
    const [cust] = await db
      .insert(customers)
      .values({
        tenantId: TEST_TENANT_ID,
        name: "Production Test Customer",
        phone: "01012345678",
      })
      .returning();
    testCustomerId = cust.id;

    // 4. Create test order at 'deposit_received'
    const [ord] = await db
      .insert(orders)
      .values({
        tenantId: TEST_TENANT_ID,
        customerId: testCustomerId,
        orderNumber: `ORD-TEST-${Date.now()}`,
        currentStage: "deposit_received",
        contractDate: "2026-11-18",
        total: "150000",
        deposit: "75000",
      })
      .returning();
    testOrderId = ord.id;

    // 5. Create linked project
    const [proj] = await db
      .insert(projects)
      .values({
        tenantId: TEST_TENANT_ID,
        customerId: testCustomerId,
        orderId: testOrderId,
        projectNumber: `PRJ-TEST-${Date.now()}`,
        title: "Villa Production Project",
        projectType: "residential",
        currentStage: "deposit_received",
        status: "open",
        totalValue: "150000",
      })
      .returning();
    testProjectId = proj.id;
  });

  afterAll(async () => {
    try {
      await db.delete(taskAssignees).where(eq(taskAssignees.tenantId, TEST_TENANT_ID));
      await db.delete(tasks).where(eq(tasks.tenantId, TEST_TENANT_ID));
      await db.delete(remakes).where(eq(remakes.tenantId, TEST_TENANT_ID));
      await db.delete(qcInspections).where(eq(qcInspections.tenantId, TEST_TENANT_ID));
      await db.delete(productionLogs).where(eq(productionLogs.tenantId, TEST_TENANT_ID));
      await db.delete(productionWorkOrders).where(eq(productionWorkOrders.tenantId, TEST_TENANT_ID));
      await db.delete(projects).where(eq(projects.tenantId, TEST_TENANT_ID));
      await db.delete(orders).where(eq(orders.tenantId, TEST_TENANT_ID));
      await db.delete(customers).where(eq(customers.tenantId, TEST_TENANT_ID));
      await db.delete(tenantCounters).where(eq(tenantCounters.tenantId, TEST_TENANT_ID));
      await db.delete(appUsers).where(eq(appUsers.tenantId, TEST_TENANT_ID));
    } catch {
      // Non-blocking cleanup
    }
  });

  describe("1. Stage Transition & Automatic Work Order Engine", () => {
    it("advances order to 'cutting' and auto-creates an initial work order WO-XXXX and production log", async () => {
      const res = await executeOrderStageTransition(db, {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        orderId: testOrderId,
        nextStage: "cutting",
        notes: "Moving to cutting stage",
        autoCreateWorkOrder: true,
      });

      expect(res.ok).toBe(true);
      expect(res.currentStage).toBe("cutting");
      expect(res.previousStage).toBe("deposit_received");
      expect(res.workOrderId).toBeDefined();

      // Verify orders table
      const [ord] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, testOrderId));
      expect(ord.currentStage).toBe("cutting");

      // Verify production_logs table
      const logs = await db
        .select()
        .from(productionLogs)
        .where(eq(productionLogs.orderId, testOrderId));
      expect(logs.length).toBeGreaterThanOrEqual(1);
      const cuttingLog = logs.find((l) => l.stageTo === "cutting");
      expect(cuttingLog).toBeDefined();
      expect(cuttingLog?.stageFrom).toBe("deposit_received");

      // Verify production_work_orders table
      const wos = await db
        .select()
        .from(productionWorkOrders)
        .where(eq(productionWorkOrders.orderId, testOrderId));
      expect(wos.length).toBe(1);
      expect(wos[0].workOrderNumber).toMatch(/^WO-\d+$/);
      expect(wos[0].status).toBe("ready");

      // Verify linked projects table sync
      const [proj] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, testProjectId));
      expect(proj.currentStage).toBe("cutting");
    });

    it("does not create duplicate work orders if one already exists when entering cutting", async () => {
      const res = await executeOrderStageTransition(db, {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        orderId: testOrderId,
        nextStage: "cutting",
        autoCreateWorkOrder: true,
      });

      expect(res.ok).toBe(true);
      expect(res.workOrderId).toBeUndefined();

      const wos = await db
        .select()
        .from(productionWorkOrders)
        .where(eq(productionWorkOrders.orderId, testOrderId));
      expect(wos.length).toBe(1);
    });
  });

  describe("2. Server-Side Quality Control Gate Enforcement", () => {
    it("transitions order to 'quality_check' without restrictions", async () => {
      const res = await executeOrderStageTransition(db, {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        orderId: testOrderId,
        nextStage: "quality_check",
      });

      expect(res.ok).toBe(true);
      expect(res.currentStage).toBe("quality_check");
    });

    it("strictly blocks advancement from 'quality_check' to 'ready_for_pickup' when no passing QC exists", async () => {
      await expect(
        executeOrderStageTransition(db, {
          tenantId: TEST_TENANT_ID,
          userId: TEST_USER_ID,
          orderId: testOrderId,
          nextStage: "ready_for_pickup",
        }),
      ).rejects.toThrow(/Cannot advance order beyond Quality Check/i);

      // Verify order stage remained quality_check
      const [ord] = await db
        .select({ currentStage: orders.currentStage })
        .from(orders)
        .where(eq(orders.id, testOrderId));
      expect(ord.currentStage).toBe("quality_check");
    });

    it("strictly blocks advancement to 'delivered' or 'completed' when no passing QC exists", async () => {
      await expect(
        executeOrderStageTransition(db, {
          tenantId: TEST_TENANT_ID,
          userId: TEST_USER_ID,
          orderId: testOrderId,
          nextStage: "delivered",
        }),
      ).rejects.toThrow(/Cannot advance order beyond Quality Check/i);
    });
  });

  describe("3. QC Inspection & Remake / Corrective Task Engine", () => {
    it("records a failed QC inspection and atomically creates RMK-XXXX and high-priority TSK-XXXX", async () => {
      const qcResult = await executeQCInspectionWithRemakeLoop(db, {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        orderId: testOrderId,
        stage: "quality_check",
        passed: false,
        notes: "Scratched veneer surface and misaligned hinge holes",
        assignedTo: TEST_WORKER_ID,
      });

      expect(qcResult.ok).toBe(true);
      expect(qcResult.passed).toBe(false);
      expect(qcResult.inspectionId).toBeDefined();
      expect(qcResult.remakeId).toBeDefined();
      expect(qcResult.remakeNumber).toMatch(/^RMK-\d+$/);
      expect(qcResult.taskId).toBeDefined();
      expect(qcResult.taskNumber).toMatch(/^TSK-\d+$/);

      // Verify qc_inspections row
      const [inspection] = await db
        .select()
        .from(qcInspections)
        .where(eq(qcInspections.id, qcResult.inspectionId));
      expect(inspection.passed).toBe(false);
      expect(inspection.stage).toBe("quality_check");

      // Verify remakes row
      const [remake] = await db
        .select()
        .from(remakes)
        .where(eq(remakes.id, qcResult.remakeId!));
      expect(remake.remakeNumber).toBe(qcResult.remakeNumber);
      expect(remake.type).toBe("qc_failure");
      expect(remake.severity).toBe("high");
      expect(remake.status).toBe("reported");
      expect(remake.assignedTo).toBe(TEST_WORKER_ID);

      // Verify tasks row
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, qcResult.taskId!));
      expect(task.taskCode).toBe(qcResult.taskNumber);
      expect(task.priority).toBe("high");
      expect(task.category).toBe("quality");
      expect(task.remakeId).toBe(remake.id);

      // Verify task_assignees row
      const assignees = await db
        .select()
        .from(taskAssignees)
        .where(eq(taskAssignees.taskId, task.id));
      expect(assignees.length).toBe(1);
      expect(assignees[0].userId).toBe(TEST_WORKER_ID);
    });

    it("still blocks advancement from 'quality_check' when only failed QC exists", async () => {
      await expect(
        executeOrderStageTransition(db, {
          tenantId: TEST_TENANT_ID,
          userId: TEST_USER_ID,
          orderId: testOrderId,
          nextStage: "ready_for_pickup",
        }),
      ).rejects.toThrow(/Cannot advance order beyond Quality Check/i);
    });

    it("records a passing QC inspection and successfully unlocks stage advancement", async () => {
      // 1. Record passing inspection
      const passingRes = await executeQCInspectionWithRemakeLoop(db, {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        orderId: testOrderId,
        stage: "quality_check",
        passed: true,
        notes: "Defects rectified, re-inspection passed 100%",
      });

      expect(passingRes.ok).toBe(true);
      expect(passingRes.passed).toBe(true);
      expect(passingRes.remakeId).toBeUndefined();
      expect(passingRes.taskId).toBeUndefined();

      // 2. Advance to ready_for_pickup - should now succeed!
      const advanceRes = await executeOrderStageTransition(db, {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        orderId: testOrderId,
        nextStage: "ready_for_pickup",
      });
      expect(advanceRes.ok).toBe(true);
      expect(advanceRes.currentStage).toBe("ready_for_pickup");

      // 3. Advance to delivered - verifies deliveredAt timestamp
      const deliveredRes = await executeOrderStageTransition(db, {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        orderId: testOrderId,
        nextStage: "delivered",
      });
      expect(deliveredRes.ok).toBe(true);

      const [ord] = await db
        .select({ currentStage: orders.currentStage, deliveredAt: orders.deliveredAt })
        .from(orders)
        .where(eq(orders.id, testOrderId));
      expect(ord.currentStage).toBe("delivered");
      expect(ord.deliveredAt).not.toBeNull();

      // 4. Advance to completed - verifies linked project status becomes 'completed'
      const completedRes = await executeOrderStageTransition(db, {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        orderId: testOrderId,
        nextStage: "completed",
      });
      expect(completedRes.ok).toBe(true);

      const [proj] = await db
        .select({ currentStage: projects.currentStage, status: projects.status })
        .from(projects)
        .where(eq(projects.id, testProjectId));
      expect(proj.currentStage).toBe("completed");
      expect(proj.status).toBe("completed");
    });
  });
});
