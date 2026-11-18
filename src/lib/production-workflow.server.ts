import { db } from "@/db/client.server";
import {
  orders,
  projects,
  productionWorkOrders,
  qcInspections,
  productionLogs,
  remakes,
  tasks,
  taskAssignees,
  tenantCounters,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { sendTaskAssignmentNotifications } from "@/lib/notifications.functions";
import { log } from "@/lib/log";

export interface OrderStageTransitionInput {
  tenantId: string;
  userId?: string | null;
  orderId: string;
  nextStage: string;
  notes?: string | null;
  autoCreateWorkOrder?: boolean;
}

/**
 * Server-authoritative order stage transition engine with:
 * 1. Server-side Quality Control Gate (enforces passing inspection before advancing beyond quality_check)
 * 2. Automatic production log recording
 * 3. Automatic linked project stage and status synchronization
 * 4. Automatic initial work order creation upon entering cutting stage
 */
export async function executeOrderStageTransition(
  executor: any = db,
  input: OrderStageTransitionInput,
) {
  const { tenantId, userId, orderId, nextStage, notes, autoCreateWorkOrder = true } = input;

  // 1. Fetch current order state
  const [order] = await executor
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      currentStage: orders.currentStage,
      quoteId: orders.quoteId,
      customerId: orders.customerId,
      tenantId: orders.tenantId,
    })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
    .limit(1);

  if (!order) {
    throw new Error(`Order ${orderId} not found or access denied`);
  }

  const currentStage = order.currentStage;

  // 2. Enforce Server-Side Quality Check Gate
  // If the order is at quality_check and moving forward, require at least one passing QC inspection
  if (currentStage === "quality_check" && nextStage !== "quality_check") {
    const isAdvancingForward =
      nextStage === "ready_for_pickup" ||
      nextStage === "delivered" ||
      nextStage === "completed";

    if (isAdvancingForward) {
      const [passingQC] = await executor
        .select({ id: qcInspections.id })
        .from(qcInspections)
        .where(
          and(
            eq(qcInspections.tenantId, tenantId),
            eq(qcInspections.orderId, orderId),
            eq(qcInspections.stage, "quality_check"),
            eq(qcInspections.passed, true),
          ),
        )
        .limit(1);

      if (!passingQC) {
        throw new Error(
          `Cannot advance order beyond Quality Check: A passing QC inspection is required before moving to ${nextStage}`,
        );
      }
    }
  }

  // 3. Update orders table
  const orderUpdates: Record<string, any> = {
    currentStage: nextStage,
  };
  if (nextStage === "delivered") {
    orderUpdates.deliveredAt = new Date();
  }

  await executor
    .update(orders)
    .set(orderUpdates)
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)));

  // 4. Record production log audit entry
  try {
    await executor.insert(productionLogs).values({
      tenantId,
      orderId,
      stageFrom: currentStage,
      stageTo: nextStage,
      transitionedBy: userId || null,
      notes: notes || null,
    });
  } catch (logErr) {
    log.warn("executeOrderStageTransition: production_logs insert fallback:", { error: String(logErr) });
  }

  // 5. Sync linked projects row (where projects.orderId = orderId OR projects.quoteId = order.quoteId)
  try {
    const projectConditions = [
      eq(projects.tenantId, tenantId),
      eq(projects.orderId, orderId),
    ];

    let [linkedProject] = await executor
      .select({ id: projects.id, status: projects.status })
      .from(projects)
      .where(and(...projectConditions))
      .limit(1);

    if (!linkedProject && order.quoteId) {
      const [projByQuote] = await executor
        .select({ id: projects.id, status: projects.status })
        .from(projects)
        .where(and(eq(projects.tenantId, tenantId), eq(projects.quoteId, order.quoteId)))
        .limit(1);
      linkedProject = projByQuote;
    }

    if (linkedProject) {
      const projUpdates: Record<string, any> = {
        currentStage: nextStage,
        updatedAt: new Date(),
      };
      if (nextStage === "completed") {
        projUpdates.status = "completed";
      }
      await executor
        .update(projects)
        .set(projUpdates)
        .where(and(eq(projects.id, linkedProject.id), eq(projects.tenantId, tenantId)));
    }
  } catch (projErr) {
    log.warn("executeOrderStageTransition: project sync fallback:", { error: String(projErr) });
  }

  // 6. Automatic initial work order creation if entering 'cutting' stage
  let generatedWorkOrderId: string | undefined;
  if (nextStage === "cutting" && autoCreateWorkOrder) {
    try {
      const existingWOs = await executor
        .select({ id: productionWorkOrders.id })
        .from(productionWorkOrders)
        .where(
          and(
            eq(productionWorkOrders.tenantId, tenantId),
            eq(productionWorkOrders.orderId, orderId),
          ),
        )
        .limit(1);

      if (existingWOs.length === 0) {
        // Generate atomic WO-XXXX
        const [counterRow] = await executor
          .insert(tenantCounters)
          .values({
            tenantId,
            counterType: "work_order",
            lastValue: 1001,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [tenantCounters.tenantId, tenantCounters.counterType],
            set: {
              lastValue: sql`${tenantCounters.lastValue} + 1`,
              updatedAt: new Date(),
            },
          })
          .returning({ lastValue: tenantCounters.lastValue });

        const woNumber = `WO-${counterRow?.lastValue ?? 1001}`;

        const [newWO] = await executor
          .insert(productionWorkOrders)
          .values({
            tenantId,
            workOrderNumber: woNumber,
            orderId,
            status: "ready",
            priority: "medium",
            notes: "Auto-generated upon cutting stage progression",
            createdBy: userId || null,
          })
          .returning({ id: productionWorkOrders.id });

        generatedWorkOrderId = newWO?.id;
      }
    } catch (woErr) {
      log.warn("executeOrderStageTransition: auto work order creation fallback:", { error: String(woErr) });
    }
  }

  return {
    ok: true,
    orderId,
    previousStage: currentStage,
    currentStage: nextStage,
    workOrderId: generatedWorkOrderId,
  };
}

export interface QCInspectionWithRemakeLoopInput {
  tenantId: string;
  userId?: string | null;
  orderId: string;
  stage: string;
  passed: boolean;
  notes?: string | null;
  inspectorId?: string | null;
  assignedTo?: string | null;
}

/**
 * Server-authoritative QC inspection engine with atomic Remake & Task creation loop.
 * - If passed: records passing inspection in qc_inspections.
 * - If failed: atomically creates qc_inspections, linked RMK-XXXX in remakes, and corrective TSK-XXXX in tasks.
 */
export async function executeQCInspectionWithRemakeLoop(
  executor: any = db,
  input: QCInspectionWithRemakeLoopInput,
) {
  const { tenantId, userId, orderId, stage, passed, notes, inspectorId, assignedTo } = input;

  // 1. Insert row into qc_inspections
  const [inspection] = await executor
    .insert(qcInspections)
    .values({
      tenantId,
      orderId,
      stage,
      passed,
      notes: notes || null,
      inspectorId: inspectorId || userId || null,
    })
    .returning();

  // 2. If passed, return early
  if (passed) {
    return {
      ok: true,
      inspectionId: inspection.id,
      passed: true,
    };
  }

  // 3. If failed: trigger Remake & Corrective Task loop atomically
  const [orderRow] = await executor
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerId: orders.customerId,
    })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
    .limit(1);

  // Generate atomic RMK-XXXX
  const [remakeCounter] = await executor
    .insert(tenantCounters)
    .values({
      tenantId,
      counterType: "remake",
      lastValue: 1001,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [tenantCounters.tenantId, tenantCounters.counterType],
      set: {
        lastValue: sql`${tenantCounters.lastValue} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ lastValue: tenantCounters.lastValue });

  const rmkNumber = `RMK-${remakeCounter?.lastValue ?? 1001}`;

  // Insert into remakes
  const [remake] = await executor
    .insert(remakes)
    .values({
      tenantId,
      remakeNumber: rmkNumber,
      orderId,
      customerId: orderRow?.customerId || null,
      qcInspectionId: inspection.id,
      type: "qc_failure",
      severity: "high",
      status: "reported",
      reason: notes || `QC inspection failed at ${stage}`,
      defectDescription: notes || `Quality check rejected at stage ${stage}`,
      assignedTo: assignedTo || null,
      createdBy: userId || null,
    })
    .returning();

  // Generate atomic TSK-XXXX
  const [taskCounter] = await executor
    .insert(tenantCounters)
    .values({
      tenantId,
      counterType: "task",
      lastValue: 1001,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [tenantCounters.tenantId, tenantCounters.counterType],
      set: {
        lastValue: sql`${tenantCounters.lastValue} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ lastValue: tenantCounters.lastValue });

  const taskCode = `TSK-${taskCounter?.lastValue ?? 1001}`;

  // Insert linked corrective task
  const [task] = await executor
    .insert(tasks)
    .values({
      tenantId,
      taskCode,
      title: `[${rmkNumber}] Fix QC Defect: ${(notes || stage).slice(0, 60)}`,
      description: `Automated remake task generated from failed QC inspection at ${stage}. Order: ${orderRow?.orderNumber || orderId}. Reason: ${notes || "QC Failure"}`,
      status: "not_started",
      priority: "high",
      category: "quality",
      orderId,
      customerId: orderRow?.customerId || null,
      remakeId: remake.id,
      productionStage: stage,
      createdBy: userId || tenantId,
    })
    .returning();

  // If assignedTo is provided, record assignment and dispatch notification
  if (assignedTo) {
    try {
      await executor.insert(taskAssignees).values({
        tenantId,
        taskId: task.id,
        userId: assignedTo,
      });

      await sendTaskAssignmentNotifications(executor, {
        tenantId,
        taskId: task.id,
        taskCode,
        title: task.title,
        priority: "high",
        actorId: userId || tenantId,
        assigneeIds: [assignedTo],
        event: "task_assigned",
      });
    } catch (assignErr) {
      log.warn("executeQCInspectionWithRemakeLoop: assignment notification fallback:", { error: String(assignErr) });
    }
  }

  return {
    ok: true,
    inspectionId: inspection.id,
    passed: false,
    remakeId: remake.id,
    remakeNumber: rmkNumber,
    taskId: task.id,
    taskNumber: taskCode,
  };
}
