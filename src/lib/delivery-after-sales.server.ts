import { db } from "@/db/client.server";
import {
  deliveryHandovers,
  orders,
  customers,
  invoices,
  projects,
  serviceCases,
  remakes,
  tasks,
  taskAssignees,
  tenantCounters,
  auditLog,
  appUsers,
  attachments,
} from "@/db/schema";
import { eq, and, sql, or, desc } from "drizzle-orm";
import {
  requirePermission,
  requireAnyPermission,
  type TenantContext,
} from "@/lib/tenant-context";
import {
  isValidDeliveryTransition,
  type DeliveryStatus,
} from "@/lib/delivery-types";
import { sendTaskAssignmentNotifications } from "@/lib/notifications.server";
import { calculateWarrantyStatus } from "@/lib/after-sales.pure";
import { getDownloadUrl } from "@/lib/r2.server";

/**
 * Concurrency-safe counter generation for deliveries (DEL-XXXX).
 */
export async function getNextDeliveryNumber(
  executor: any = db,
  tenantId: string,
): Promise<string> {
  const result = await executor.transaction(async (tx: any) => {
    const [existing] = await tx
      .select()
      .from(tenantCounters)
      .where(
        and(
          eq(tenantCounters.tenantId, tenantId),
          eq(tenantCounters.counterType, "delivery"),
        ),
      )
      .for("update")
      .limit(1);

    if (!existing) {
      const [inserted] = await tx
        .insert(tenantCounters)
        .values({
          tenantId,
          counterType: "delivery",
          lastValue: 1001,
        })
        .returning();
      return `DEL-${inserted.lastValue}`;
    }

    const nextVal = existing.lastValue + 1;
    await tx
      .update(tenantCounters)
      .set({
        lastValue: nextVal,
        updatedAt: new Date(),
      })
      .where(eq(tenantCounters.id, existing.id));

    return `DEL-${nextVal}`;
  });

  return result;
}

/**
 * Concurrency-safe counter generation for remakes (RMK-XXXX).
 */
export async function getNextRemakeCode(
  executor: any = db,
  tenantId: string,
): Promise<string> {
  try {
    const [row] = await executor
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

    const nextVal = row?.lastValue ?? 1001;
    return `RMK-${nextVal}`;
  } catch {
    return `RMK-${Math.floor(1000 + Math.random() * 9000)}`;
  }
}

/**
 * Concurrency-safe counter generation for tasks (TSK-XXXX).
 */
export async function getNextTaskCode(
  executor: any = db,
  tenantId: string,
): Promise<string> {
  try {
    const [row] = await executor
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

    const nextVal = row?.lastValue ?? 1001;
    return `TSK-${nextVal}`;
  } catch {
    return `TSK-${Math.floor(1000 + Math.random() * 9000)}`;
  }
}

/**
 * Concurrency-safe counter generation for after-sales cases (CAS-XXXX).
 */
export async function getNextCaseNumber(
  executor: any = db,
  tenantId: string,
): Promise<string> {
  try {
    const [row] = await executor
      .insert(tenantCounters)
      .values({
        tenantId,
        counterType: "service_case",
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

    const nextVal = row?.lastValue ?? 1001;
    return `CAS-${nextVal}`;
  } catch {
    return `CAS-${Math.floor(1000 + Math.random() * 9000)}`;
  }
}

/**
 * Pure execution helper for preparing a delivery handover.
 */
export async function executeCreateDelivery(
  executor: any = db,
  ctx: TenantContext,
  data: {
    orderId: string;
    deliveryAddress: string;
    recipientName?: string | null;
    recipientPhone?: string | null;
    scheduledDate?: string | null;
    installationRequired?: boolean;
    customerNotes?: string | null;
  },
): Promise<{ ok: boolean; deliveryId: string; deliveryNumber: string }> {
  requirePermission(ctx, "deliveries.create");
  const { tenantId, userId } = ctx;

  // Verify order exists
  const [orderRow] = await executor
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerId: orders.customerId,
    })
    .from(orders)
    .where(and(eq(orders.id, data.orderId), eq(orders.tenantId, tenantId)))
    .limit(1);

  if (!orderRow) {
    throw new Error("Order not found or access denied");
  }

  // Idempotency check: if a delivery already exists for this order, return it
  const [existing] = await executor
    .select()
    .from(deliveryHandovers)
    .where(
      and(
        eq(deliveryHandovers.orderId, data.orderId),
        eq(deliveryHandovers.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (existing) {
    return {
      ok: true,
      deliveryId: existing.id,
      deliveryNumber: existing.deliveryNumber,
    };
  }

  const deliveryNumber = await getNextDeliveryNumber(executor, tenantId);

  const [inserted] = await executor
    .insert(deliveryHandovers)
    .values({
      tenantId,
      deliveryNumber,
      orderId: data.orderId,
      customerId: orderRow.customerId,
      status: "ready_for_dispatch",
      deliveryAddress: data.deliveryAddress,
      recipientName: data.recipientName || null,
      recipientPhone: data.recipientPhone || null,
      scheduledDate: data.scheduledDate || null,
      installationRequired: data.installationRequired ?? true,
      customerNotes: data.customerNotes || null,
      createdBy: userId ? (userId as any) : null,
    })
    .returning();

  await executor.insert(auditLog).values({
    tenantId,
    actorId: userId ? (userId as any) : null,
    entityType: "delivery",
    entityId: inserted.id,
    action: "delivery_prepared",
    details: {
      delivery_number: deliveryNumber,
      order_id: data.orderId,
      order_number: orderRow.orderNumber,
      delivery_address: data.deliveryAddress,
    },
  });

  return {
    ok: true,
    deliveryId: inserted.id,
    deliveryNumber: inserted.deliveryNumber,
  };
}

/**
 * Pure execution helper for fetching delivery handover details, including
 * trackingToken, invoice balance and scheduled milestone invoices.
 */
export async function executeGetDeliveryById(
  executor: any = db,
  ctx: TenantContext,
  data: { deliveryId: string },
): Promise<any> {
  requirePermission(ctx, "deliveries.view");
  const { tenantId } = ctx;

  const [delRow] = await executor
    .select({
      id: deliveryHandovers.id,
      tenantId: deliveryHandovers.tenantId,
      deliveryNumber: deliveryHandovers.deliveryNumber,
      orderId: deliveryHandovers.orderId,
      orderNumber: orders.orderNumber,
      quoteId: orders.quoteId,
      orderTotal: orders.total,
      invoiceId: orders.invoiceId,
      trackingToken: orders.trackingToken,
      customerId: deliveryHandovers.customerId,
      customerName: customers.name,
      customerPhone: customers.phone,
      status: deliveryHandovers.status,
      deliveryAddress: deliveryHandovers.deliveryAddress,
      recipientName: deliveryHandovers.recipientName,
      recipientPhone: deliveryHandovers.recipientPhone,
      scheduledDate: deliveryHandovers.scheduledDate,
      dispatchedAt: deliveryHandovers.dispatchedAt,
      deliveredAt: deliveryHandovers.deliveredAt,
      installationRequired: deliveryHandovers.installationRequired,
      installedAt: deliveryHandovers.installedAt,
      installerName: deliveryHandovers.installerName,
      installerNotes: deliveryHandovers.installerNotes,
      handedOverAt: deliveryHandovers.handedOverAt,
      signerName: deliveryHandovers.signerName,
      customerNotes: deliveryHandovers.customerNotes,
      handoverNotes: deliveryHandovers.handoverNotes,
      signatureDataUrl: deliveryHandovers.signatureDataUrl,
      createdBy: deliveryHandovers.createdBy,
      createdAt: deliveryHandovers.createdAt,
      updatedAt: deliveryHandovers.updatedAt,
    })
    .from(deliveryHandovers)
    .leftJoin(orders, eq(deliveryHandovers.orderId, orders.id))
    .leftJoin(customers, eq(deliveryHandovers.customerId, customers.id))
    .where(
      and(
        eq(deliveryHandovers.id, data.deliveryId),
        eq(deliveryHandovers.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!delRow) {
    throw new Error("Delivery record not found or access denied");
  }

  // Resolve invoice balances if invoiceId exists
  let invoiceTotal = Number(delRow.orderTotal || 0);
  let paidAmount = 0;
  let balanceDue = invoiceTotal;

  if (delRow.invoiceId) {
    const [inv] = await executor
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, delRow.invoiceId), eq(invoices.tenantId, tenantId)))
      .limit(1);

    if (inv) {
      invoiceTotal = Number(inv.total || 0);
      paidAmount = Number(inv.paidAmount || 0);
      balanceDue = Math.max(0, invoiceTotal - paidAmount);
    }
  }

  // Query scheduled milestone invoices for the linked quote or project
  let scheduledMilestoneInvoices: Array<{
    id: string;
    invoiceNumber: string;
    milestoneLabel: string | null;
    milestonePct: string | null;
    amount: string;
    billingStatus: string;
    dueStage: string | null;
  }> = [];

  try {
    const [linkedProj] = await executor
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.tenantId, tenantId),
          or(
            eq(projects.orderId, delRow.orderId),
            delRow.quoteId ? eq(projects.quoteId, delRow.quoteId) : undefined,
          ),
        ),
      )
      .limit(1);

    const parentFilters: any[] = [];
    if (delRow.quoteId) {
      parentFilters.push(eq(invoices.quoteId, delRow.quoteId));
    }
    if (linkedProj?.id) {
      parentFilters.push(eq(invoices.projectId, linkedProj.id));
    }

    if (parentFilters.length > 0) {
      const invRows = await executor
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          milestoneLabel: invoices.milestoneLabel,
          milestonePct: invoices.milestonePct,
          amount: invoices.total,
          billingStatus: invoices.billingStatus,
          dueStage: invoices.dueStage,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.tenantId, tenantId),
            eq(invoices.billingStatus, "scheduled"),
            parentFilters.length > 1 ? or(...parentFilters) : parentFilters[0],
          ),
        );

      scheduledMilestoneInvoices = invRows.map((r: any) => ({
        id: r.id,
        invoiceNumber: r.invoiceNumber,
        milestoneLabel: r.milestoneLabel ?? null,
        milestonePct: r.milestonePct ?? null,
        amount: String(r.amount),
        billingStatus: r.billingStatus,
        dueStage: r.dueStage ?? null,
      }));
    }
  } catch (e: any) {
    console.warn("executeGetDeliveryById: failed to load scheduled milestone invoices:", e?.message);
  }

  return {
    delivery: {
      ...delRow,
      orderNumber: delRow.orderNumber || "—",
      quoteId: delRow.quoteId || null,
      customerName: delRow.customerName || "—",
      customerPhone: delRow.customerPhone || "—",
      status: delRow.status as DeliveryStatus,
      trackingToken: delRow.trackingToken || null,
      scheduledMilestoneInvoices,
    },
    financialSummary: {
      orderTotal: invoiceTotal,
      paidAmount,
      balanceDue,
    },
  };
}

/**
 * Pure execution helper for advancing a delivery handover status and synchronizing
 * orders.currentStage and projects.currentStage when reaching 'installed' or 'completed'.
 */
export async function executeDeliveryStatusUpdate(
  executor: any = db,
  ctx: TenantContext,
  data: {
    deliveryId: string;
    status: DeliveryStatus;
    recipientName?: string | null;
    recipientPhone?: string | null;
    installerName?: string | null;
    installerNotes?: string | null;
    signerName?: string | null;
    customerNotes?: string | null;
    handoverNotes?: string | null;
    signatureDataUrl?: string | null;
  },
): Promise<{ ok: boolean }> {
  requirePermission(ctx, "deliveries.status.update");
  const { tenantId, userId } = ctx;

  const [delivery] = await executor
    .select()
    .from(deliveryHandovers)
    .where(
      and(
        eq(deliveryHandovers.id, data.deliveryId),
        eq(deliveryHandovers.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!delivery) {
    throw new Error("Delivery record not found or access denied");
  }

  const currentStatus = delivery.status as DeliveryStatus;
  const targetStatus = data.status;

  if (!isValidDeliveryTransition(currentStatus, targetStatus)) {
    throw new Error(
      `Invalid delivery status transition from '${currentStatus}' to '${targetStatus}'`,
    );
  }

  const updates: any = {
    status: targetStatus,
    updatedAt: new Date(),
  };

  if (data.recipientName) updates.recipientName = data.recipientName;
  if (data.recipientPhone) updates.recipientPhone = data.recipientPhone;
  if (data.installerName) updates.installerName = data.installerName;
  if (data.installerNotes) updates.installerNotes = data.installerNotes;
  if (data.signerName) updates.signerName = data.signerName;
  if (data.customerNotes) updates.customerNotes = data.customerNotes;
  if (data.handoverNotes) updates.handoverNotes = data.handoverNotes;
  if (data.signatureDataUrl) updates.signatureDataUrl = data.signatureDataUrl;

  if (targetStatus === "dispatched" && !delivery.dispatchedAt) {
    updates.dispatchedAt = new Date();
  }
  if (targetStatus === "delivered" && !delivery.deliveredAt) {
    updates.deliveredAt = new Date();
  }
  if (targetStatus === "installed" && !delivery.installedAt) {
    updates.installedAt = new Date();
  }
  if (targetStatus === "completed" && !delivery.handedOverAt) {
    updates.handedOverAt = new Date();
  }

  await executor
    .update(deliveryHandovers)
    .set(updates)
    .where(
      and(
        eq(deliveryHandovers.id, delivery.id),
        eq(deliveryHandovers.tenantId, tenantId),
      ),
    );

  // Synchronize order & project lifecycle stage when delivery reaches installed or completed
  if (targetStatus === "installed" || targetStatus === "completed") {
    try {
      const [ord] = await executor
        .select({
          id: orders.id,
          currentStage: orders.currentStage,
          deliveredAt: orders.deliveredAt,
          quoteId: orders.quoteId,
        })
        .from(orders)
        .where(and(eq(orders.id, delivery.orderId), eq(orders.tenantId, tenantId)))
        .limit(1);

      if (ord) {
        const ordUpdates: any = {};
        if (targetStatus === "installed") {
          if (ord.currentStage !== "delivered" && ord.currentStage !== "completed") {
            ordUpdates.currentStage = "delivered";
          }
          if (!ord.deliveredAt) {
            ordUpdates.deliveredAt = new Date();
          }
        } else if (targetStatus === "completed") {
          if (ord.currentStage !== "completed") {
            ordUpdates.currentStage = "completed";
          }
          if (!ord.deliveredAt) {
            ordUpdates.deliveredAt = new Date();
          }
        }

        if (Object.keys(ordUpdates).length > 0) {
          await executor
            .update(orders)
            .set(ordUpdates)
            .where(and(eq(orders.id, ord.id), eq(orders.tenantId, tenantId)));
        }

        // Also synchronize project lifecycle if linked via orderId or quoteId
        const [proj] = await executor
          .select({ id: projects.id, currentStage: projects.currentStage })
          .from(projects)
          .where(
            and(
              eq(projects.tenantId, tenantId),
              or(
                eq(projects.orderId, ord.id),
                ord.quoteId ? eq(projects.quoteId, ord.quoteId) : undefined,
              ),
            ),
          )
          .limit(1);

        if (proj) {
          const projTargetStage = targetStatus === "completed" ? "handover" : "delivery";
          const earlierStages =
            targetStatus === "completed"
              ? [
                  "lead",
                  "opportunity",
                  "measurement",
                  "design",
                  "quote",
                  "won",
                  "order",
                  "production",
                  "qc",
                  "ready_for_delivery",
                  "ready_for_pickup",
                  "delivery",
                ]
              : [
                  "lead",
                  "opportunity",
                  "measurement",
                  "design",
                  "quote",
                  "won",
                  "order",
                  "production",
                  "qc",
                  "ready_for_delivery",
                  "ready_for_pickup",
                ];
          if (earlierStages.includes(proj.currentStage)) {
            await executor
              .update(projects)
              .set({ currentStage: projTargetStage, updatedAt: new Date() })
              .where(and(eq(projects.id, proj.id), eq(projects.tenantId, tenantId)));
          }
        }
      }
    } catch (syncErr: any) {
      console.warn("executeDeliveryStatusUpdate: order/project synchronization failed:", syncErr?.message);
    }
  }

  await executor.insert(auditLog).values({
    tenantId,
    actorId: userId ? (userId as any) : null,
    entityType: "delivery",
    entityId: delivery.id,
    action: `delivery_status_${targetStatus}`,
    details: {
      delivery_number: delivery.deliveryNumber,
      previous_status: currentStatus,
      new_status: targetStatus,
      signer_name: data.signerName || delivery.signerName,
    },
  });

  return { ok: true };
}

/**
 * Pure execution helper for creating an after-sales service case.
 */
export async function executeCreateServiceCase(
  executor: any = db,
  ctx: TenantContext,
  data: {
    customerId: string;
    projectId?: string | null;
    orderId?: string | null;
    deliveryId?: string | null;
    remakeId?: string | null;
    type: "warranty" | "maintenance" | "complaint" | "adjustment";
    priority: "low" | "medium" | "high" | "urgent";
    title: string;
    description?: string | null;
    assignedTo?: string | null;
    dueDate?: string | null;
    createInspectionTask?: boolean;
    inspectionTaskTitle?: string | null;
  },
): Promise<any> {
  requirePermission(ctx, "after-sales.create");
  const { tenantId, userId } = ctx;

  const caseNumber = await getNextCaseNumber(executor, tenantId);

  // Verify Customer exists
  const [cust] = await executor
    .select({ id: customers.id, name: customers.name, phone: customers.phone })
    .from(customers)
    .where(and(eq(customers.id, data.customerId), eq(customers.tenantId, tenantId)))
    .limit(1);

  if (!cust) {
    throw new Error("Customer not found");
  }

  let createdTaskId: string | null = null;
  let createdTaskCode: string | null = null;

  if (data.createInspectionTask) {
    const taskCode = await getNextTaskCode(executor, tenantId);
    const taskTitle = data.inspectionTaskTitle || `معاينة وبحث حالة: ${data.title}`;

    try {
      const [taskRow] = await executor
        .insert(tasks)
        .values({
          tenantId,
          taskCode,
          title: taskTitle,
          description: `فحص بلاغ ما بعد البيع ${caseNumber}: ${data.description || ""}`,
          status: "not_started",
          priority: data.priority,
          category: "after_sales_inspection",
          customerId: data.customerId,
          orderId: data.orderId || null,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          createdBy: userId,
        })
        .returning({ id: tasks.id, taskCode: tasks.taskCode });

      if (taskRow) {
        createdTaskId = taskRow.id;
        createdTaskCode = taskRow.taskCode;
      }
    } catch (err: any) {
      console.warn("[executeCreateServiceCase] Could not auto-create linked task:", err?.message);
    }
  }

  const [inserted] = await executor
    .insert(serviceCases)
    .values({
      tenantId,
      caseNumber,
      customerId: data.customerId,
      projectId: data.projectId || null,
      orderId: data.orderId || null,
      deliveryId: data.deliveryId || null,
      remakeId: data.remakeId || null,
      taskId: createdTaskId,
      type: data.type,
      priority: data.priority,
      status: "new",
      title: data.title,
      description: data.description || null,
      assignedTo: data.assignedTo || null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      createdBy: userId,
    })
    .returning();

  return {
    ...inserted,
    customerName: cust.name,
    customerPhone: cust.phone,
    orderNumber: null,
    assigneeName: null,
    createdTaskCode,
  };
}

/**
 * Pure execution helper for creating a workshop remake from an after-sales service case,
 * linking it to service_cases, updating case status to 'in_progress', and spawning a
 * high-priority quality task.
 */
export async function executeCreateRemakeForCase(
  executor: any = db,
  ctx: TenantContext,
  data: {
    caseId: string;
    reason: string;
    defectDescription?: string | null;
    severity?: "low" | "medium" | "high" | "critical";
    assignedTo?: string | null;
    dueDate?: string | null;
  },
): Promise<any> {
  requireAnyPermission(ctx, ["after-sales.create", "remakes.create"]);
  const { tenantId, userId } = ctx;

  const [c] = await executor
    .select({
      customerId: serviceCases.customerId,
      orderId: serviceCases.orderId,
      type: serviceCases.type,
      status: serviceCases.status,
      caseNumber: serviceCases.caseNumber,
      title: serviceCases.title,
    })
    .from(serviceCases)
    .where(and(eq(serviceCases.id, data.caseId), eq(serviceCases.tenantId, tenantId)))
    .limit(1);

  if (!c) {
    throw new Error("Service case not found or access denied");
  }

  if (!c.orderId) {
    throw new Error("Cannot issue a workshop remake without a linked order");
  }

  const remakeNumber = await getNextRemakeCode(executor, tenantId);
  const remakeType = c.type === "warranty" ? "warranty" : "customer_complaint";

  const [newRemake] = await executor
    .insert(remakes)
    .values({
      tenantId,
      remakeNumber,
      orderId: c.orderId,
      customerId: c.customerId,
      type: remakeType,
      severity: data.severity || "medium",
      status: "reported",
      reason: data.reason,
      defectDescription: data.defectDescription || null,
      assignedTo: data.assignedTo || null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      createdBy: userId,
    })
    .returning();

  // Create linked high-priority corrective task for the workshop
  const taskCode = await getNextTaskCode(executor, tenantId);
  const taskTitle = `[${remakeNumber}] تصحيح عيب: ${data.reason.slice(0, 60)}`;
  const taskDescription = `مهمة تصحيح جودة من بلاغ خدمة ما بعد البيع ${c.caseNumber} (أمر إعادة تصنيع ${remakeNumber}). السبب: ${data.reason}. ${data.defectDescription || ""}`;

  let createdTaskId: string | null = null;
  try {
    const [taskRow] = await executor
      .insert(tasks)
      .values({
        tenantId,
        taskCode,
        title: taskTitle,
        description: taskDescription,
        status: "not_started",
        priority: "high",
        category: "quality",
        orderId: c.orderId,
        customerId: c.customerId,
        remakeId: newRemake.id,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        createdBy: userId,
      })
      .returning({ id: tasks.id, taskCode: tasks.taskCode });

    if (taskRow) {
      createdTaskId = taskRow.id;
      const targetAssignee = data.assignedTo || null;
      if (targetAssignee) {
        try {
          await executor.insert(taskAssignees).values({
            tenantId,
            taskId: taskRow.id,
            userId: targetAssignee,
          });
          await sendTaskAssignmentNotifications(executor, {
            tenantId,
            taskId: taskRow.id,
            taskCode: taskRow.taskCode,
            title: taskTitle,
            priority: "high",
            actorId: userId || tenantId,
            assigneeIds: [targetAssignee],
            event: "task_assigned",
          });
        } catch (assignErr) {
          console.warn("[executeCreateRemakeForCase] assignment notification fallback:", assignErr);
        }
      }
    }
  } catch (err: any) {
    console.warn("[executeCreateRemakeForCase] Could not auto-create linked corrective task:", err?.message);
  }

  // Atomically update service_cases
  const caseUpdates: any = {
    remakeId: newRemake.id,
    updatedAt: new Date(),
  };
  if (createdTaskId) {
    caseUpdates.taskId = createdTaskId;
  }
  if (c.status === "new" || c.status === "under_review") {
    caseUpdates.status = "in_progress";
  }

  await executor
    .update(serviceCases)
    .set(caseUpdates)
    .where(and(eq(serviceCases.id, data.caseId), eq(serviceCases.tenantId, tenantId)));

  return newRemake;
}

/**
 * Pure execution helper for getting service case full details including warranty,
 * linked remake, and linked corrective tasks.
 */
export async function executeGetServiceCaseById(
  executor: any = db,
  ctx: TenantContext,
  data: { caseId: string },
): Promise<any> {
  requirePermission(ctx, "after-sales.view");
  const { tenantId } = ctx;

  const [baseCase] = await executor
    .select({
      id: serviceCases.id,
      tenantId: serviceCases.tenantId,
      caseNumber: serviceCases.caseNumber,
      customerId: serviceCases.customerId,
      customerName: customers.name,
      customerPhone: customers.phone,
      orderId: serviceCases.orderId,
      orderNumber: orders.orderNumber,
      projectId: serviceCases.projectId,
      deliveryId: serviceCases.deliveryId,
      remakeId: serviceCases.remakeId,
      taskId: serviceCases.taskId,
      type: serviceCases.type,
      priority: serviceCases.priority,
      status: serviceCases.status,
      title: serviceCases.title,
      description: serviceCases.description,
      resolution: serviceCases.resolution,
      assignedTo: serviceCases.assignedTo,
      assigneeName: appUsers.displayName,
      dueDate: serviceCases.dueDate,
      resolvedAt: serviceCases.resolvedAt,
      closedAt: serviceCases.closedAt,
      createdBy: serviceCases.createdBy,
      createdAt: serviceCases.createdAt,
      updatedAt: serviceCases.updatedAt,
    })
    .from(serviceCases)
    .leftJoin(customers, eq(serviceCases.customerId, customers.id))
    .leftJoin(orders, eq(serviceCases.orderId, orders.id))
    .leftJoin(appUsers, eq(serviceCases.assignedTo, appUsers.id))
    .where(and(eq(serviceCases.id, data.caseId), eq(serviceCases.tenantId, tenantId)))
    .limit(1);

  if (!baseCase) {
    throw new Error("Service case not found");
  }

  // 1. Fetch Linked Order
  let linkedOrder: any = null;
  if (baseCase.orderId) {
    const [ord] = await executor
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        total: orders.total,
        currentStage: orders.currentStage,
        contractDate: orders.contractDate,
        deliveredAt: orders.deliveredAt,
        notes: orders.notes,
      })
      .from(orders)
      .where(and(eq(orders.id, baseCase.orderId), eq(orders.tenantId, tenantId)))
      .limit(1);

    if (ord) {
      linkedOrder = {
        id: ord.id,
        orderNumber: ord.orderNumber,
        total: Number(ord.total || 0),
        currentStage: ord.currentStage,
        contractDate:
          typeof ord.contractDate === "string"
            ? ord.contractDate
            : new Date(ord.contractDate).toISOString().slice(0, 10),
        deliveredAt: ord.deliveredAt?.toISOString() || null,
        notes: ord.notes,
      };
    }
  }

  // 2. Fetch Linked Delivery Handover
  let linkedDelivery: any = null;
  if (baseCase.deliveryId || baseCase.orderId) {
    const delCondition = baseCase.deliveryId
      ? eq(deliveryHandovers.id, baseCase.deliveryId)
      : eq(deliveryHandovers.orderId, baseCase.orderId!);

    try {
      const [del] = await executor
        .select()
        .from(deliveryHandovers)
        .where(and(eq(deliveryHandovers.tenantId, tenantId), delCondition))
        .limit(1);

      if (del) {
        linkedDelivery = {
          ...del,
          createdAt: del.createdAt.toISOString(),
          updatedAt: del.updatedAt.toISOString(),
        };
      }
    } catch {
      linkedDelivery = null;
    }
  }

  // 3. Compute Reliable Warranty Status
  const warranty = linkedOrder
    ? calculateWarrantyStatus(linkedOrder, linkedDelivery)
    : {
        orderId: "",
        orderNumber: "—",
        isWarrantyActive: false,
        isReliable: false,
        warrantyStatusLabel: "Warranty Period Unknown",
        warrantyStatusLabelAr: "فترة الضمان غير محددة",
        warrantyDetails: "No associated order found for warranty evaluation",
        warrantyDetailsAr: "لا يوجد أمر تنفيذ مرتبط لفحص مدة الضمان",
      };

  // 4. Fetch Linked Remake
  let linkedRemake: any = null;
  if (baseCase.remakeId) {
    try {
      const [rmk] = await executor
        .select()
        .from(remakes)
        .where(and(eq(remakes.id, baseCase.remakeId), eq(remakes.tenantId, tenantId)))
        .limit(1);

      if (rmk) {
        linkedRemake = {
          id: rmk.id,
          remakeNumber: rmk.remakeNumber,
          orderId: rmk.orderId,
          orderNumber: linkedOrder?.orderNumber || "—",
          customerId: rmk.customerId,
          type: rmk.type,
          severity: rmk.severity,
          status: rmk.status,
          reason: rmk.reason,
          defectDescription: rmk.defectDescription,
          resolution: rmk.resolution,
          dueDate: rmk.dueDate,
          resolvedAt: rmk.resolvedAt,
          createdAt: rmk.createdAt.toISOString(),
          updatedAt: rmk.updatedAt.toISOString(),
        };
      }
    } catch {
      linkedRemake = null;
    }
  }

  // 5. Fetch Linked Tasks
  let linkedTasks: any[] = [];
  try {
    const taskConditions = [eq(tasks.tenantId, tenantId)];
    const orFilters = [];
    if (baseCase.taskId) orFilters.push(eq(tasks.id, baseCase.taskId));
    if (baseCase.orderId) orFilters.push(eq(tasks.orderId, baseCase.orderId));
    if (orFilters.length > 0) {
      taskConditions.push(or(...orFilters)!);
    }

    const taskRows = await executor
      .select({
        id: tasks.id,
        taskCode: tasks.taskCode,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        priority: tasks.priority,
        category: tasks.category,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
        createdBy: tasks.createdBy,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .where(and(...taskConditions))
      .orderBy(desc(tasks.createdAt))
      .limit(20);

    linkedTasks = taskRows.map((t: any) => ({
      ...t,
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      completedAt: t.completedAt?.toISOString() || null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));
  } catch {
    linkedTasks = [];
  }

  // 6. Fetch Private Signed Attachments
  let caseAttachments: any[] = [];
  try {
    const attRows = await executor
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.tenantId, tenantId),
          eq(attachments.entityType, "service_case"),
          eq(attachments.entityId, baseCase.id),
        ),
      )
      .orderBy(desc(attachments.createdAt));

    caseAttachments = await Promise.all(
      attRows.map(async (a: any) => {
        let downloadUrl: string | null = null;
        try {
          downloadUrl = await getDownloadUrl(a.storageKey, 3600);
        } catch {
          downloadUrl = null;
        }
        return {
          id: a.id,
          fileName: a.fileName,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
          caption: a.caption,
          storageKey: a.storageKey,
          downloadUrl,
          createdAt: a.createdAt.toISOString(),
        };
      }),
    );
  } catch {
    caseAttachments = [];
  }

  return {
    ...baseCase,
    warranty,
    linkedOrder,
    linkedDelivery,
    linkedRemake,
    linkedTasks,
    attachments: caseAttachments,
  };
}
