import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { db } from "@/db/client.server";
import {
  remakes,
  orders,
  customers,
  qcInspections,
  tasks,
  attachments,
  auditLog,
  tenantCounters,
} from "@/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { type TenantContext, forbidWorker } from "@/lib/tenant-context";
import {
  isValidRemakeTransition,
  type RemakeListItem,
  type RemakeDetailData,
  type RemakeType,
  type RemakeSeverity,
  type RemakeStatus,
  type PaginatedRemakesResult,
  type RemakeKpis,
} from "@/lib/remake-types";
import { getDownloadUrl } from "@/lib/r2.server";
import { computeIsOverdue } from "@/lib/task-types";

// ── Validation Schemas ──────────────────────────────────────────────────────

const ListRemakesInput = z
  .object({
    search: z.string().optional(),
    status: z.string().optional().default("all"),
    severity: z.string().optional().default("all"),
    type: z.string().optional().default("all"),
    orderId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    sort: z
      .enum(["newest", "oldest", "severity_desc", "remake_number"])
      .optional()
      .default("newest"),
    page: z.number().int().min(1).optional().default(1),
    pageSize: z.number().int().min(1).max(100).optional().default(25),
  })
  .optional()
  .default({});

const GetRemakeByIdInput = z.object({
  remakeId: z.string().uuid(),
});

const CreateRemakeInput = z.object({
  orderId: z.string().uuid(),
  customerId: z.string().uuid().optional().nullable(),
  qcInspectionId: z.string().uuid().optional().nullable(),
  componentId: z.string().uuid().optional().nullable(),
  type: z
    .enum(["qc_failure", "manufacturing_defect", "customer_complaint", "warranty"])
    .default("qc_failure"),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  reason: z.string().trim().min(1, "Reason is required"),
  defectDescription: z.string().trim().optional().nullable(),
  assignedTo: z.string().uuid().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  initialStatus: z.enum(["reported", "under_review"]).default("reported"),
  createLinkedTask: z.boolean().optional().default(false),
});

const ChangeRemakeStatusInput = z.object({
  remakeId: z.string().uuid(),
  targetStatus: z.enum([
    "reported",
    "under_review",
    "approved",
    "in_remake",
    "qc_pending",
    "resolved",
    "rejected",
    "cancelled",
  ]),
  resolutionNotes: z.string().trim().optional().nullable(),
});

const ResolveRemakeInput = z.object({
  remakeId: z.string().uuid(),
  resolution: z.string().trim().min(1, "Resolution description is required"),
});

// ── Helper: Atomic Concurrency-Safe Remake Number Generator ────────────────

async function getNextRemakeNumber(tenantId: string): Promise<string> {
  const result = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ lastValue: tenantCounters.lastValue })
      .from(tenantCounters)
      .where(
        and(
          eq(tenantCounters.tenantId, tenantId),
          eq(tenantCounters.counterType, "remake"),
        ),
      )
      .limit(1);

    let nextVal = 1001;
    if (existing.length === 0) {
      await tx.insert(tenantCounters).values({
        tenantId,
        counterType: "remake",
        lastValue: 1001,
      });
    } else {
      nextVal = existing[0].lastValue + 1;
      await tx
        .update(tenantCounters)
        .set({ lastValue: nextVal, updatedAt: new Date() })
        .where(
          and(
            eq(tenantCounters.tenantId, tenantId),
            eq(tenantCounters.counterType, "remake"),
          ),
        );
    }
    return `RMK-${nextVal}`;
  });

  return result;
}

// ── Server Functions ────────────────────────────────────────────────────────

/**
 * List paginated quality / remake cases with search, filters, and KPI summary.
 */
export const listRemakes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => ListRemakesInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<PaginatedRemakesResult> => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Remake Management");
    const { tenantId } = ctx;

    const conditions = [eq(remakes.tenantId, tenantId)];

    if (data.orderId) {
      conditions.push(eq(remakes.orderId, data.orderId));
    }

    if (data.customerId) {
      conditions.push(eq(remakes.customerId, data.customerId));
    }

    if (data.status && data.status !== "all") {
      conditions.push(eq(remakes.status, data.status));
    }

    if (data.severity && data.severity !== "all") {
      conditions.push(eq(remakes.severity, data.severity));
    }

    if (data.type && data.type !== "all") {
      conditions.push(eq(remakes.type, data.type));
    }

    if (data.search && data.search.trim().length > 0) {
      const q = `%${data.search.trim()}%`;
      conditions.push(
        sql`(${remakes.remakeNumber} ILIKE ${q} OR ${remakes.reason} ILIKE ${q} OR ${orders.orderNumber} ILIKE ${q} OR ${customers.name} ILIKE ${q} OR ${customers.phone} ILIKE ${q})`,
      );
    }

    const page = Math.max(1, data.page || 1);
    const pageSize = Math.min(100, Math.max(1, data.pageSize || 25));
    const offset = (page - 1) * pageSize;

    let orderByClause = desc(remakes.createdAt);
    if (data.sort === "oldest") {
      orderByClause = sql`${remakes.createdAt} ASC`;
    } else if (data.sort === "remake_number") {
      orderByClause = sql`${remakes.remakeNumber} ASC`;
    } else if (data.sort === "severity_desc") {
      orderByClause = sql`CASE 
        WHEN ${remakes.severity} = 'critical' THEN 1 
        WHEN ${remakes.severity} = 'high' THEN 2 
        WHEN ${remakes.severity} = 'medium' THEN 3 
        ELSE 4 END ASC, ${remakes.createdAt} DESC`;
    }

    // 1. Compute KPIs for tenant
    const allTenantRemakes = await db
      .select({
        status: remakes.status,
        type: remakes.type,
      })
      .from(remakes)
      .where(eq(remakes.tenantId, tenantId));

    const kpis: RemakeKpis = {
      totalCases: allTenantRemakes.length,
      openCases: allTenantRemakes.filter((r) => r.status === "reported").length,
      underReview: allTenantRemakes.filter((r) => r.status === "under_review").length,
      inRemake: allTenantRemakes.filter((r) => r.status === "in_remake").length,
      qcPending: allTenantRemakes.filter((r) => r.status === "qc_pending").length,
      resolved: allTenantRemakes.filter((r) => r.status === "resolved").length,
      warrantyCases: allTenantRemakes.filter((r) => r.type === "warranty").length,
    };

    // 2. Total count for current query
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(remakes)
      .leftJoin(orders, eq(remakes.orderId, orders.id))
      .leftJoin(customers, eq(remakes.customerId, customers.id))
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

    // 3. Fetch paginated rows
    const rowsRaw = await db
      .select({
        id: remakes.id,
        remakeNumber: remakes.remakeNumber,
        orderId: remakes.orderId,
        orderNumber: orders.orderNumber,
        customerId: remakes.customerId,
        customerName: customers.name,
        customerPhone: customers.phone,
        qcInspectionId: remakes.qcInspectionId,
        componentId: remakes.componentId,
        type: remakes.type,
        severity: remakes.severity,
        status: remakes.status,
        reason: remakes.reason,
        defectDescription: remakes.defectDescription,
        resolution: remakes.resolution,
        assignedTo: remakes.assignedTo,
        dueDate: remakes.dueDate,
        resolvedAt: remakes.resolvedAt,
        createdAt: remakes.createdAt,
        updatedAt: remakes.updatedAt,
      })
      .from(remakes)
      .leftJoin(orders, eq(remakes.orderId, orders.id))
      .leftJoin(customers, eq(remakes.customerId, customers.id))
      .where(and(...conditions))
      .orderBy(orderByClause)
      .limit(pageSize)
      .offset(offset);

    const rows: RemakeListItem[] = rowsRaw.map((r) => ({
      id: r.id,
      remakeNumber: r.remakeNumber,
      orderId: r.orderId,
      orderNumber: r.orderNumber || "—",
      customerId: r.customerId,
      customerName: r.customerName || null,
      customerPhone: r.customerPhone || null,
      qcInspectionId: r.qcInspectionId,
      componentId: r.componentId,
      type: r.type as RemakeType,
      severity: r.severity as RemakeSeverity,
      status: r.status as RemakeStatus,
      reason: r.reason,
      defectDescription: r.defectDescription,
      resolution: r.resolution,
      assignedTo: r.assignedTo,
      dueDate: r.dueDate,
      resolvedAt: r.resolvedAt,
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
 * Get detailed information about a single quality/remake case.
 */
export const getRemakeById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => GetRemakeByIdInput.parse(input))
  .handler(async ({ data, context }): Promise<RemakeDetailData> => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Remake Management");
    const { tenantId } = ctx;

    const [remakeRow] = await db
      .select({
        id: remakes.id,
        remakeNumber: remakes.remakeNumber,
        orderId: remakes.orderId,
        orderNumber: orders.orderNumber,
        customerId: remakes.customerId,
        customerName: customers.name,
        customerPhone: customers.phone,
        qcInspectionId: remakes.qcInspectionId,
        componentId: remakes.componentId,
        type: remakes.type,
        severity: remakes.severity,
        status: remakes.status,
        reason: remakes.reason,
        defectDescription: remakes.defectDescription,
        resolution: remakes.resolution,
        assignedTo: remakes.assignedTo,
        dueDate: remakes.dueDate,
        resolvedAt: remakes.resolvedAt,
        createdAt: remakes.createdAt,
        updatedAt: remakes.updatedAt,
      })
      .from(remakes)
      .leftJoin(orders, eq(remakes.orderId, orders.id))
      .leftJoin(customers, eq(remakes.customerId, customers.id))
      .where(and(eq(remakes.id, data.remakeId), eq(remakes.tenantId, tenantId)))
      .limit(1);

    if (!remakeRow) {
      throw new Error("Remake case not found or access denied");
    }

    // Parallel fetch related attachments, linked tasks, and QC inspection
    const [attRows, taskRows, qcRow] = await Promise.all([
      db
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.tenantId, tenantId),
            eq(attachments.entityType, "remake"),
            eq(attachments.entityId, remakeRow.id),
          ),
        ),
      db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.tenantId, tenantId),
            eq(tasks.orderId, remakeRow.orderId),
            sql`${tasks.description} ILIKE ${`%${remakeRow.remakeNumber}%`}`,
          ),
        ),
      remakeRow.qcInspectionId
        ? db
            .select()
            .from(qcInspections)
            .where(
              and(
                eq(qcInspections.tenantId, tenantId),
                eq(qcInspections.id, remakeRow.qcInspectionId),
              ),
            )
            .limit(1)
            .then((res) => res[0] || null)
        : Promise.resolve(null),
    ]);

    // Sign attachment URLs
    const signedAttachments = await Promise.all(
      attRows.map(async (a) => {
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
          createdAt: a.createdAt,
        };
      }),
    );

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
      id: remakeRow.id,
      remakeNumber: remakeRow.remakeNumber,
      orderId: remakeRow.orderId,
      orderNumber: remakeRow.orderNumber || "—",
      customerId: remakeRow.customerId,
      customerName: remakeRow.customerName || null,
      customerPhone: remakeRow.customerPhone || null,
      qcInspectionId: remakeRow.qcInspectionId,
      componentId: remakeRow.componentId,
      type: remakeRow.type as RemakeType,
      severity: remakeRow.severity as RemakeSeverity,
      status: remakeRow.status as RemakeStatus,
      reason: remakeRow.reason,
      defectDescription: remakeRow.defectDescription,
      resolution: remakeRow.resolution,
      assignedTo: remakeRow.assignedTo,
      dueDate: remakeRow.dueDate,
      resolvedAt: remakeRow.resolvedAt,
      createdAt: remakeRow.createdAt,
      updatedAt: remakeRow.updatedAt,
      linkedTasks,
      attachments: signedAttachments,
      qcInspection: qcRow
        ? {
            id: qcRow.id,
            stage: qcRow.stage,
            passed: qcRow.passed,
            notes: qcRow.notes,
            createdAt: qcRow.createdAt,
          }
        : null,
    };
  });

/**
 * Create a new Quality Case / Remake / Defect record.
 */
export const createRemake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => CreateRemakeInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string; remakeNumber: string }> => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Remake Management");
    const { tenantId, userId, role } = ctx;

    // Viewers cannot create remakes
    if (role === "viewer") {
      throw new Error("Forbidden: viewers cannot report defects or create quality cases");
    }

    // 1. Verify Order belongs to this tenant
    const [orderRow] = await db
      .select({ id: orders.id, customerId: orders.customerId, orderNumber: orders.orderNumber })
      .from(orders)
      .where(and(eq(orders.id, data.orderId), eq(orders.tenantId, tenantId)))
      .limit(1);

    if (!orderRow) {
      throw new Error("Order not found or belongs to another tenant");
    }

    const customerId = data.customerId || orderRow.customerId || null;

    // 2. If customerId provided, verify it belongs to tenant
    if (customerId) {
      const [cust] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
        .limit(1);

      if (!cust) {
        throw new Error("Customer not found or belongs to another tenant");
      }
    }

    // 3. Generate atomic remake number (RMK-xxxx)
    const remakeNumber = await getNextRemakeNumber(tenantId);

    // 4. Insert remake row
    const [newRow] = await db
      .insert(remakes)
      .values({
        tenantId,
        remakeNumber,
        orderId: data.orderId,
        customerId,
        qcInspectionId: data.qcInspectionId || null,
        componentId: data.componentId || null,
        type: data.type,
        severity: data.severity,
        status: data.initialStatus,
        reason: data.reason,
        defectDescription: data.defectDescription || null,
        assignedTo: data.assignedTo || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        createdBy: userId ? (userId as any) : null,
      })
      .returning({ id: remakes.id, remakeNumber: remakes.remakeNumber });

    // 5. Optionally create a linked operational task
    if (data.createLinkedTask) {
      try {
        const [counterRow] = await db
          .select({ lastValue: tenantCounters.lastValue })
          .from(tenantCounters)
          .where(and(eq(tenantCounters.tenantId, tenantId), eq(tenantCounters.counterType, "task")))
          .limit(1);

        const taskNum = (counterRow?.lastValue || 1000) + 1;
        await db
          .insert(tenantCounters)
          .values({ tenantId, counterType: "task", lastValue: taskNum })
          .onConflictDoUpdate({
            target: [tenantCounters.tenantId, tenantCounters.counterType],
            set: { lastValue: taskNum, updatedAt: new Date() },
          });

        await db.insert(tasks).values({
          tenantId,
          taskCode: `TSK-${taskNum}`,
          title: `[${remakeNumber}] ${data.reason.slice(0, 80)}`,
          description: `Quality case ${remakeNumber} for Order ${orderRow.orderNumber}: ${data.defectDescription || data.reason}`,
          status: "not_started",
          priority: data.severity === "critical" ? "critical" : data.severity === "high" ? "high" : "medium",
          category: "manufacturing",
          customerId,
          orderId: data.orderId,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          createdBy: userId ? (userId as any) : (tenantId as any),
        });
      } catch {
        // Non-blocking task creation failure
      }
    }

    // 6. Record in audit_log
    await db.insert(auditLog).values({
      tenantId,
      actorId: userId ? (userId as any) : null,
      entityType: "remake",
      entityId: newRow.id,
      action: "quality_case_created",
      details: {
        remake_number: remakeNumber,
        order_id: data.orderId,
        order_number: orderRow.orderNumber,
        type: data.type,
        severity: data.severity,
        reason: data.reason,
      },
    });

    return newRow;
  });

/**
 * Change status of a Quality / Remake case with state machine validation.
 */
export const changeRemakeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => ChangeRemakeStatusInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; status: RemakeStatus }> => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Remake Management");
    const { tenantId, userId, role } = ctx;

    const [remakeRow] = await db
      .select({
        id: remakes.id,
        status: remakes.status,
        remakeNumber: remakes.remakeNumber,
        orderId: remakes.orderId,
      })
      .from(remakes)
      .where(and(eq(remakes.id, data.remakeId), eq(remakes.tenantId, tenantId)))
      .limit(1);

    if (!remakeRow) {
      throw new Error("Remake not found or access denied");
    }

    const currentStatus = remakeRow.status as RemakeStatus;
    const targetStatus = data.targetStatus as RemakeStatus;

    // Validate state transition
    if (!isValidRemakeTransition(currentStatus, targetStatus)) {
      throw new Error(
        `Invalid status transition: cannot change quality case from "${currentStatus}" to "${targetStatus}"`,
      );
    }

    // Role check: Only owner/admin can approve/reject
    if ((targetStatus === "approved" || targetStatus === "rejected") && role !== "owner" && role !== "admin") {
      throw new Error("Forbidden: only owners or admins can approve or reject remake cases");
    }

    const updateFields: any = {
      status: targetStatus,
      updatedAt: new Date(),
    };

    if (targetStatus === "resolved") {
      updateFields.resolvedAt = new Date();
      if (data.resolutionNotes) {
        updateFields.resolution = data.resolutionNotes;
      }
    }

    await db
      .update(remakes)
      .set(updateFields)
      .where(and(eq(remakes.id, data.remakeId), eq(remakes.tenantId, tenantId)));

    // Record audit event
    await db.insert(auditLog).values({
      tenantId,
      actorId: userId ? (userId as any) : null,
      entityType: "remake",
      entityId: remakeRow.id,
      action: `remake_status_${targetStatus}`,
      details: {
        remake_number: remakeRow.remakeNumber,
        previous_status: currentStatus,
        new_status: targetStatus,
        resolution: data.resolutionNotes || null,
      },
    });

    return { ok: true, status: targetStatus };
  });

/**
 * Approve a Remake case.
 */
export const approveRemake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => z.object({ remakeId: z.string().uuid(), notes: z.string().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    return changeRemakeStatus({
      data: {
        remakeId: data.remakeId,
        targetStatus: "approved",
        resolutionNotes: data.notes || null,
      },
    });
  });

/**
 * Resolve a Remake / Quality case with resolution notes.
 */
export const resolveRemake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => ResolveRemakeInput.parse(input))
  .handler(async ({ data, context }) => {
    return changeRemakeStatus({
      data: {
        remakeId: data.remakeId,
        targetStatus: "resolved",
        resolutionNotes: data.resolution,
      },
    });
  });
