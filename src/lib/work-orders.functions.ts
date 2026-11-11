import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { db } from "@/db/client.server";
import {
  productionWorkOrders,
  orders,
  customers,
  quotes,
  quoteSnapshots,
  stockReservations,
  stockItems,
  qcInspections,
  tasks,
  remakes,
  tenantCounters,
  auditLog,
} from "@/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { type TenantContext, forbidWorker } from "@/lib/tenant-context";
import type {
  ProductionWorkOrder,
  WorkOrderStatus,
  WorkOrderPriority,
  CutListItem,
  WorkOrderOperationItem,
  WorkOrderDetailData,
  PaginatedWorkOrderResult,
  WorkOrderKpis,
} from "@/lib/work-order-types";
import { getOrderMaterialRequirements } from "@/lib/inventory.functions";
import { computeIsOverdue } from "@/lib/task-types";

// ── Validation Schemas ──────────────────────────────────────────────────────

const ListWorkOrdersInput = z
  .object({
    search: z.string().optional(),
    status: z.string().optional().default("all"),
    priority: z.string().optional().default("all"),
    orderId: z.string().uuid().optional(),
    sort: z
      .enum(["newest", "wo_asc", "priority_desc", "scheduled_asc", "order_asc"])
      .optional()
      .default("newest"),
    page: z.number().int().min(1).optional().default(1),
    pageSize: z.number().int().min(1).max(100).optional().default(25),
  })
  .optional()
  .default({});

const GetWorkOrderInput = z.object({
  workOrderId: z.string().uuid(),
});

const CreateWorkOrderInput = z.object({
  orderId: z.string().uuid(),
  remakeId: z.string().uuid().optional().nullable(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional().default("medium"),
  scheduledDate: z.string().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

const UpdateWorkOrderStatusInput = z.object({
  workOrderId: z.string().uuid(),
  status: z.enum(["draft", "ready", "in_progress", "qc_pending", "completed", "cancelled"]),
  notes: z.string().trim().optional().nullable(),
});

// ── Helper: Atomic Concurrency-Safe Sequence Number ─────────────────────────

async function getNextWorkOrderNumber(tenantId: string): Promise<string> {
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(tenantCounters)
      .where(
        and(
          eq(tenantCounters.tenantId, tenantId),
          eq(tenantCounters.counterType, "work_order"),
        ),
      )
      .for("update")
      .limit(1);

    if (!existing) {
      const [inserted] = await tx
        .insert(tenantCounters)
        .values({
          tenantId,
          counterType: "work_order",
          lastValue: 1001,
        })
        .returning();
      return `WO-${inserted.lastValue}`;
    }

    const nextVal = existing.lastValue + 1;
    await tx
      .update(tenantCounters)
      .set({
        lastValue: nextVal,
        updatedAt: new Date(),
      })
      .where(eq(tenantCounters.id, existing.id));

    return `WO-${nextVal}`;
  });

  return result;
}

// ── Helper: Extract Cut List from Frozen Snapshot ──────────────────────────

import { extractCutListFromTree } from "@/lib/work-orders.pure";
export { extractCutListFromTree };

// ── Server Functions ────────────────────────────────────────────────────────

/**
 * List paginated work orders with search, filters, and KPI summary.
 */
export const listWorkOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => ListWorkOrdersInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<PaginatedWorkOrderResult> => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Work Orders Management");
    const { tenantId } = ctx;

    const conditions = [eq(productionWorkOrders.tenantId, tenantId)];

    if (data.status && data.status !== "all") {
      conditions.push(eq(productionWorkOrders.status, data.status));
    }

    if (data.priority && data.priority !== "all") {
      conditions.push(eq(productionWorkOrders.priority, data.priority));
    }

    if (data.orderId) {
      conditions.push(eq(productionWorkOrders.orderId, data.orderId));
    }

    if (data.search && data.search.trim().length > 0) {
      const q = `%${data.search.trim()}%`;
      conditions.push(
        sql`(${productionWorkOrders.workOrderNumber} ILIKE ${q} OR ${orders.orderNumber} ILIKE ${q} OR ${customers.name} ILIKE ${q} OR ${customers.phone} ILIKE ${q})`,
      );
    }

    const page = Math.max(1, data.page || 1);
    const pageSize = Math.min(100, Math.max(1, data.pageSize || 25));
    const offset = (page - 1) * pageSize;

    let orderByClause = desc(productionWorkOrders.createdAt);
    if (data.sort === "wo_asc") {
      orderByClause = sql`${productionWorkOrders.workOrderNumber} ASC`;
    } else if (data.sort === "scheduled_asc") {
      orderByClause = sql`${productionWorkOrders.scheduledDate} ASC NULLS LAST`;
    } else if (data.sort === "order_asc") {
      orderByClause = sql`${orders.orderNumber} ASC`;
    }

    // 1. KPI Counts
    const allTenantWOs = await db
      .select({
        status: productionWorkOrders.status,
      })
      .from(productionWorkOrders)
      .where(eq(productionWorkOrders.tenantId, tenantId));

    let readyCount = 0;
    let inProgressCount = 0;
    let qcPendingCount = 0;
    let completedCount = 0;

    for (const wo of allTenantWOs) {
      if (wo.status === "ready") readyCount++;
      if (wo.status === "in_progress") inProgressCount++;
      if (wo.status === "qc_pending") qcPendingCount++;
      if (wo.status === "completed") completedCount++;
    }

    const kpis: WorkOrderKpis = {
      totalWorkOrders: allTenantWOs.length,
      readyCount,
      inProgressCount,
      qcPendingCount,
      completedCount,
    };

    // 2. Count Matching Rows
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(productionWorkOrders)
      .leftJoin(orders, eq(productionWorkOrders.orderId, orders.id))
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(and(...conditions));

    const totalCount = Number(countRow?.count || 0);
    const totalPages = Math.ceil(totalCount / pageSize) || 1;

    if (totalCount === 0) {
      return {
        rows: [],
        totalCount: 0,
        page,
        pageSize,
        totalPages: 1,
        kpis,
      };
    }

    // 3. Paginated Rows
    const rowsRaw = await db
      .select({
        id: productionWorkOrders.id,
        tenantId: productionWorkOrders.tenantId,
        workOrderNumber: productionWorkOrders.workOrderNumber,
        orderId: productionWorkOrders.orderId,
        orderNumber: orders.orderNumber,
        customerId: orders.customerId,
        customerName: customers.name,
        customerPhone: customers.phone,
        currentStage: orders.currentStage,
        remakeId: productionWorkOrders.remakeId,
        remakeNumber: remakes.remakeNumber,
        status: productionWorkOrders.status,
        priority: productionWorkOrders.priority,
        notes: productionWorkOrders.notes,
        scheduledDate: productionWorkOrders.scheduledDate,
        startedAt: productionWorkOrders.startedAt,
        completedAt: productionWorkOrders.completedAt,
        createdBy: productionWorkOrders.createdBy,
        createdAt: productionWorkOrders.createdAt,
        updatedAt: productionWorkOrders.updatedAt,
      })
      .from(productionWorkOrders)
      .leftJoin(orders, eq(productionWorkOrders.orderId, orders.id))
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(remakes, eq(productionWorkOrders.remakeId, remakes.id))
      .where(and(...conditions))
      .orderBy(orderByClause)
      .limit(pageSize)
      .offset(offset);

    const rows: ProductionWorkOrder[] = rowsRaw.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      workOrderNumber: r.workOrderNumber,
      orderId: r.orderId,
      orderNumber: r.orderNumber || "—",
      customerId: r.customerId,
      customerName: r.customerName || "—",
      customerPhone: r.customerPhone || "—",
      currentStage: r.currentStage || "deposit_received",
      remakeId: r.remakeId,
      remakeNumber: r.remakeNumber,
      status: r.status as WorkOrderStatus,
      priority: r.priority as WorkOrderPriority,
      materialReadiness: "READY",
      notes: r.notes,
      scheduledDate: r.scheduledDate,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return {
      rows,
      totalCount,
      page,
      pageSize,
      totalPages,
      kpis,
    };
  });

/**
 * Get complete Work Order package data with frozen BOM, cut list, operations, and tasks.
 */
export const getWorkOrderById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => GetWorkOrderInput.parse(input))
  .handler(async ({ data, context }): Promise<WorkOrderDetailData> => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Work Orders Management");
    const { tenantId } = ctx;

    const [woRow] = await db
      .select({
        id: productionWorkOrders.id,
        tenantId: productionWorkOrders.tenantId,
        workOrderNumber: productionWorkOrders.workOrderNumber,
        orderId: productionWorkOrders.orderId,
        orderNumber: orders.orderNumber,
        quoteId: orders.quoteId,
        customerId: orders.customerId,
        customerName: customers.name,
        customerPhone: customers.phone,
        currentStage: orders.currentStage,
        remakeId: productionWorkOrders.remakeId,
        remakeNumber: remakes.remakeNumber,
        status: productionWorkOrders.status,
        priority: productionWorkOrders.priority,
        notes: productionWorkOrders.notes,
        scheduledDate: productionWorkOrders.scheduledDate,
        startedAt: productionWorkOrders.startedAt,
        completedAt: productionWorkOrders.completedAt,
        createdBy: productionWorkOrders.createdBy,
        createdAt: productionWorkOrders.createdAt,
        updatedAt: productionWorkOrders.updatedAt,
      })
      .from(productionWorkOrders)
      .leftJoin(orders, eq(productionWorkOrders.orderId, orders.id))
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(remakes, eq(productionWorkOrders.remakeId, remakes.id))
      .where(
        and(
          eq(productionWorkOrders.id, data.workOrderId),
          eq(productionWorkOrders.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!woRow) {
      throw new Error("Work order not found or access denied");
    }

    // 1. Fetch Frozen Snapshot
    let snapshotData: any = null;
    if (woRow.quoteId) {
      const [snap] = await db
        .select()
        .from(quoteSnapshots)
        .where(
          and(
            eq(quoteSnapshots.quotationId, woRow.quoteId),
            eq(quoteSnapshots.tenantId, tenantId),
          ),
        )
        .limit(1);

      if (snap && snap.treeJson) {
        snapshotData = snap.treeJson;
      } else {
        const [q] = await db
          .select({ snapshot: quotes.snapshot })
          .from(quotes)
          .where(and(eq(quotes.id, woRow.quoteId), eq(quotes.tenantId, tenantId)))
          .limit(1);
        snapshotData = q?.snapshot;
      }
    }

    const tree = snapshotData?.tree?.products || snapshotData?.products || [];

    // 2. Generate Cut List & Operations
    const cutList = extractCutListFromTree(
      tree,
      woRow.workOrderNumber,
      woRow.orderNumber || "—",
    );

    const operations: WorkOrderOperationItem[] = [];
    let opIdx = 1;
    for (const prod of tree) {
      for (const sec of prod.sections || []) {
        for (const unit of sec.units || []) {
          const uQty = Number(unit.qty || 1);
          for (const comp of unit.components || []) {
            if (comp.kind === "operation") {
              operations.push({
                id: `op-${opIdx++}`,
                operationCode: comp.catalogCode || comp.sku || `OP-${comp.catalogId?.slice(0, 6)}`,
                name: comp.name || comp.labelI18nKey || comp.operationName || "Operation",
                stage: comp.stage || "cutting",
                quantity: Math.round(Number(comp.qty || 1) * uQty * 100) / 100,
                unit: comp.unitOfMeasure || "operation",
                unitName: unit.name || unit.unitName || "Unit",
              });
            }
          }
        }
      }
    }

    // 3. Fetch Reserved Stock & Material Readiness
    const [resRows, qcRows, taskRows] = await Promise.all([
      db
        .select({
          stockItemId: stockReservations.stockItemId,
          sku: stockItems.sku,
          name: stockItems.name,
          unit: stockReservations.unit,
          quantity: stockReservations.quantity,
          status: stockReservations.status,
        })
        .from(stockReservations)
        .leftJoin(stockItems, eq(stockReservations.stockItemId, stockItems.id))
        .where(
          and(
            eq(stockReservations.tenantId, tenantId),
            eq(stockReservations.orderId, woRow.orderId),
            eq(stockReservations.status, "reserved"),
          ),
        ),
      db
        .select()
        .from(qcInspections)
        .where(
          and(
            eq(qcInspections.tenantId, tenantId),
            eq(qcInspections.orderId, woRow.orderId),
          ),
        )
        .orderBy(desc(qcInspections.createdAt)),
      db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.tenantId, tenantId),
            eq(tasks.orderId, woRow.orderId),
          ),
        )
        .orderBy(desc(tasks.createdAt)),
    ]);

    const reservedMaterials = resRows.map((r) => ({
      stockItemId: r.stockItemId,
      sku: r.sku || "—",
      name: r.name || "Material",
      unit: r.unit,
      reservedQuantity: Number(r.quantity || 0),
      status: r.status,
    }));

    const matReqs = await getOrderMaterialRequirements({ data: { orderId: woRow.orderId } });

    const linkedTasks = taskRows.map((t) => ({
      id: t.id,
      tenantId: t.tenantId,
      taskCode: t.taskCode,
      title: t.title,
      description: t.description,
      status: t.status as any,
      priority: t.priority as any,
      category: t.category,
      dueDate: t.dueDate,
      completedAt: t.completedAt,
      createdBy: t.createdBy,
      isOverdue: computeIsOverdue(t.status as any, t.dueDate),
      customerId: t.customerId,
      quoteId: t.quoteId,
      orderId: t.orderId,
      productionStage: t.productionStage,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      assignees: [],
    }));

    return {
      workOrder: {
        id: woRow.id,
        tenantId: woRow.tenantId,
        workOrderNumber: woRow.workOrderNumber,
        orderId: woRow.orderId,
        orderNumber: woRow.orderNumber || "—",
        customerId: woRow.customerId,
        customerName: woRow.customerName || "—",
        customerPhone: woRow.customerPhone || "—",
        currentStage: woRow.currentStage || "deposit_received",
        remakeId: woRow.remakeId,
        remakeNumber: woRow.remakeNumber,
        status: woRow.status as WorkOrderStatus,
        priority: woRow.priority as WorkOrderPriority,
        materialReadiness: matReqs.readiness,
        notes: woRow.notes,
        scheduledDate: woRow.scheduledDate,
        startedAt: woRow.startedAt,
        completedAt: woRow.completedAt,
        createdBy: woRow.createdBy,
        createdAt: woRow.createdAt,
        updatedAt: woRow.updatedAt,
      },
      tree,
      cutList,
      operations,
      reservedMaterials,
      materialReadiness: matReqs.readiness,
      qcInspections: qcRows,
      linkedTasks,
    };
  });

/**
 * Create a new Work Order for a manufacturing order (Idempotent per order/remake).
 */
export const createWorkOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => CreateWorkOrderInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; workOrderId: string; workOrderNumber: string }> => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Work Orders Management");
    const { tenantId, userId, role } = ctx;

    if (role === "viewer") {
      throw new Error("Forbidden: viewers cannot create work orders");
    }

    // Verify order exists and belongs to tenant
    const [orderRow] = await db
      .select({ id: orders.id, orderNumber: orders.orderNumber })
      .from(orders)
      .where(and(eq(orders.id, data.orderId), eq(orders.tenantId, tenantId)))
      .limit(1);

    if (!orderRow) {
      throw new Error("Order not found or access denied");
    }

    // Idempotency check: if work order already exists for this order, return existing
    const existingConditions = [
      eq(productionWorkOrders.tenantId, tenantId),
      eq(productionWorkOrders.orderId, data.orderId),
    ];
    if (data.remakeId) {
      existingConditions.push(eq(productionWorkOrders.remakeId, data.remakeId));
    }

    const [existingWO] = await db
      .select()
      .from(productionWorkOrders)
      .where(and(...existingConditions))
      .limit(1);

    if (existingWO) {
      return {
        ok: true,
        workOrderId: existingWO.id,
        workOrderNumber: existingWO.workOrderNumber,
      };
    }

    // Generate atomic sequence number (WO-1001, WO-1002...)
    const workOrderNumber = await getNextWorkOrderNumber(tenantId);

    const [inserted] = await db
      .insert(productionWorkOrders)
      .values({
        tenantId,
        workOrderNumber,
        orderId: data.orderId,
        remakeId: data.remakeId || null,
        status: "ready",
        priority: data.priority || "medium",
        scheduledDate: data.scheduledDate || null,
        notes: data.notes || null,
        createdBy: userId ? (userId as any) : null,
      })
      .returning();

    await db.insert(auditLog).values({
      tenantId,
      actorId: userId ? (userId as any) : null,
      entityType: "work_order",
      entityId: inserted.id,
      action: "work_order_created",
      details: {
        work_order_number: workOrderNumber,
        order_id: data.orderId,
        order_number: orderRow.orderNumber,
        priority: data.priority,
      },
    });

    return {
      ok: true,
      workOrderId: inserted.id,
      workOrderNumber: inserted.workOrderNumber,
    };
  });

/**
 * Update Work Order status (e.g. in_progress, completed, cancelled).
 */
export const updateWorkOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => UpdateWorkOrderStatusInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Work Orders Management");
    const { tenantId, userId, role } = ctx;

    if (role === "viewer") {
      throw new Error("Forbidden: viewers cannot update work orders");
    }

    const [wo] = await db
      .select()
      .from(productionWorkOrders)
      .where(
        and(
          eq(productionWorkOrders.id, data.workOrderId),
          eq(productionWorkOrders.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!wo) {
      throw new Error("Work order not found or access denied");
    }

    const updates: any = {
      status: data.status,
      updatedAt: new Date(),
    };

    if (data.notes) {
      updates.notes = data.notes;
    }

    if (data.status === "in_progress" && !wo.startedAt) {
      updates.startedAt = new Date();
    }

    if (data.status === "completed") {
      updates.completedAt = new Date();
    }

    await db
      .update(productionWorkOrders)
      .set(updates)
      .where(and(eq(productionWorkOrders.id, wo.id), eq(productionWorkOrders.tenantId, tenantId)));

    await db.insert(auditLog).values({
      tenantId,
      actorId: userId ? (userId as any) : null,
      entityType: "work_order",
      entityId: wo.id,
      action: `work_order_status_${data.status}`,
      details: {
        work_order_number: wo.workOrderNumber,
        previous_status: wo.status,
        new_status: data.status,
      },
    });

    return { ok: true };
  });

/**
 * Generate UTF-8 CSV string for Work Order Cut List.
 */
export const exportCutListCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => GetWorkOrderInput.parse(input))
  .handler(async ({ data, context }): Promise<{ csvContent: string; fileName: string }> => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Work Orders Management");
    const { tenantId, userId } = ctx;

    const detail = await getWorkOrderById({ data: { workOrderId: data.workOrderId } });
    const { workOrder, cutList } = detail;

    // Header row
    const headers = [
      "WO Number",
      "Order Number",
      "Product",
      "Section",
      "Unit",
      "Component",
      "Material SKU",
      "Material Name",
      "Length (mm)",
      "Width (mm)",
      "Thickness (mm)",
      "Quantity",
      "Unit",
      "Grain Direction",
      "Notes",
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = cutList.map((item) => [
      escapeCsv(item.workOrderNumber),
      escapeCsv(item.orderNumber),
      escapeCsv(item.productName),
      escapeCsv(item.sectionName),
      escapeCsv(item.unitName),
      escapeCsv(item.componentName),
      escapeCsv(item.materialSku),
      escapeCsv(item.materialName),
      escapeCsv(item.lengthMm),
      escapeCsv(item.widthMm),
      escapeCsv(item.thicknessMm),
      escapeCsv(item.quantity),
      escapeCsv(item.unitOfMeasure),
      escapeCsv(item.grainDirection || "along_length"),
      escapeCsv(item.notes || ""),
    ]);

    // Prepend UTF-8 BOM (\uFEFF) for perfect Excel rendering in Arabic & English
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const fileName = `CutList_${workOrder.workOrderNumber}_${workOrder.orderNumber}.csv`;

    await db.insert(auditLog).values({
      tenantId,
      actorId: userId ? (userId as any) : null,
      entityType: "work_order",
      entityId: workOrder.id,
      action: "cut_list_exported",
      details: {
        work_order_number: workOrder.workOrderNumber,
        cut_list_rows_count: cutList.length,
      },
    });

    return { csvContent, fileName };
  });
