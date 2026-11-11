import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { db } from "@/db/client.server";
import {
  tasks,
  taskAssignees,
  tenantCounters,
  auditLog,
  customers,
  quotes,
  orders,
  tenantMembers,
  appUsers,
  productionWorkOrders,
  remakes,
  deliveryHandovers,
  serviceCases,
} from "@/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { type TenantContext, forbidWorker } from "@/lib/tenant-context";
import {
  TaskStatusSchema,
  TaskPrioritySchema,
  computeIsOverdue,
  type TaskStatus,
  type TaskPriority,
  type WorkforceMember,
} from "@/lib/task-types";
import {
  sendTaskAssignmentNotifications,
  sendTaskLifecycleNotification,
} from "@/lib/notifications.functions";

function isSchemaFallbackError(err: any): boolean {
  const code = err?.code || err?.cause?.code;
  const msg = `${err?.message || ""} ${err?.cause?.message || ""}`;
  return (
    code === "42P01" ||
    code === "42703" ||
    msg.includes("does not exist") ||
    msg.includes("42P01") ||
    msg.includes("42703")
  );
}

// ── Validation Schemas ──────────────────────────────────────────────────────

const ListTasksInput = z
  .object({
    status: TaskStatusSchema.optional(),
    priority: TaskPrioritySchema.optional(),
    category: z.string().optional(),
    assigneeId: z.string().uuid().optional(),
    orderId: z.string().uuid().optional(),
    quoteId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    workOrderId: z.string().uuid().optional(),
    remakeId: z.string().uuid().optional(),
    deliveryId: z.string().uuid().optional(),
    caseId: z.string().uuid().optional(),
    module: z.enum(["all", "order", "production", "delivery", "after_sales"]).optional().default("all"),
    dueState: z.enum(["all", "overdue", "due_today", "upcoming"]).optional().default("all"),
    search: z.string().optional(),
    includeArchived: z.boolean().optional().default(false),
  })
  .optional()
  .default({});

const GetTaskInput = z.object({
  taskId: z.string().uuid(),
});

const CreateTaskInput = z.object({
  title: z.string().trim().min(1, "Title is required").max(255),
  description: z.string().trim().optional().nullable(),
  priority: TaskPrioritySchema.default("medium"),
  category: z.string().trim().default("general"),
  dueDate: z.string().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  quoteId: z.string().uuid().optional().nullable(),
  orderId: z.string().uuid().optional().nullable(),
  workOrderId: z.string().uuid().optional().nullable(),
  remakeId: z.string().uuid().optional().nullable(),
  deliveryId: z.string().uuid().optional().nullable(),
  caseId: z.string().uuid().optional().nullable(),
  productionStage: z.string().optional().nullable(),
  assigneeIds: z.array(z.string().uuid()).default([]),
});

const UpdateTaskInput = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1, "Title is required").max(255),
  description: z.string().trim().optional().nullable(),
  priority: TaskPrioritySchema.default("medium"),
  category: z.string().trim().default("general"),
  dueDate: z.string().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  quoteId: z.string().uuid().optional().nullable(),
  orderId: z.string().uuid().optional().nullable(),
  workOrderId: z.string().uuid().optional().nullable(),
  remakeId: z.string().uuid().optional().nullable(),
  deliveryId: z.string().uuid().optional().nullable(),
  caseId: z.string().uuid().optional().nullable(),
  productionStage: z.string().optional().nullable(),
  assigneeIds: z.array(z.string().uuid()).default([]),
});

const AcknowledgeTaskCompletionInput = z.object({
  taskId: z.string().uuid(),
  notes: z.string().trim().optional().nullable(),
});

const ChangeTaskStatusInput = z.object({
  taskId: z.string().uuid(),
  status: TaskStatusSchema,
  reviewNotes: z.string().trim().optional().nullable(),
});

const AssignTaskInput = z.object({
  taskId: z.string().uuid(),
  assigneeIds: z.array(z.string().uuid()),
});

const BulkUpdateTasksInput = z.object({
  taskIds: z.array(z.string().uuid()).min(1, "At least one task must be selected"),
  assigneeId: z.string().uuid().optional(),
  priority: TaskPrioritySchema.optional(),
  dueDate: z.string().optional().nullable(),
  status: TaskStatusSchema.optional(),
});

const GetTaskAuditHistoryInput = z.object({
  taskId: z.string().uuid(),
});

// ── Helpers ─────────────────────────────────────────────────────────────────

import { getNextTaskCode } from "@/lib/task-codes.server";

// ── Server Functions ────────────────────────────────────────────────────────

/**
 * List tasks for the active tenant with optional filtering.
 * Role-aware: Workers see assigned tasks only; Owners/Admins/Sales see all tenant tasks.
 */
export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => ListTasksInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { userId, tenantId, role } = ctx;

    // 1. Resolve query filters
    const conditions = [eq(tasks.tenantId, tenantId)];

    if (data.status) {
      conditions.push(eq(tasks.status, data.status));
    } else if (!data.includeArchived) {
      // Default query: active tasks + completed within last 14 days
      conditions.push(
        sql`(${tasks.status} != 'completed' AND ${tasks.status} != 'cancelled') OR (${tasks.completedAt} >= now() - interval '14 days')`,
      );
    }

    if (data.priority) {
      conditions.push(eq(tasks.priority, data.priority));
    }
    if (data.category && data.category !== "all") {
      conditions.push(eq(tasks.category, data.category));
    }
    if (data.orderId) {
      conditions.push(eq(tasks.orderId, data.orderId));
    }
    if (data.quoteId) {
      conditions.push(eq(tasks.quoteId, data.quoteId));
    }
    if (data.customerId) {
      conditions.push(eq(tasks.customerId, data.customerId));
    }
    if (data.workOrderId) {
      conditions.push(eq(tasks.workOrderId, data.workOrderId));
    }
    if (data.remakeId) {
      conditions.push(eq(tasks.remakeId, data.remakeId));
    }
    if (data.deliveryId) {
      conditions.push(eq(tasks.deliveryId, data.deliveryId));
    }
    if (data.caseId) {
      conditions.push(eq(serviceCases.id, data.caseId));
    }

    // Operational module filtering
    if (data.module === "order") {
      conditions.push(sql`${tasks.orderId} IS NOT NULL`);
    } else if (data.module === "production") {
      conditions.push(sql`(${tasks.workOrderId} IS NOT NULL OR ${tasks.productionStage} IS NOT NULL)`);
    } else if (data.module === "delivery") {
      conditions.push(sql`${tasks.deliveryId} IS NOT NULL`);
    } else if (data.module === "after_sales") {
      conditions.push(
        sql`(${serviceCases.id} IS NOT NULL OR ${tasks.remakeId} IS NOT NULL OR ${tasks.category} = 'after_sales_service')`,
      );
    }

    // Due state filtering
    if (data.dueState === "overdue") {
      conditions.push(
        sql`${tasks.dueDate} IS NOT NULL AND ${tasks.dueDate} < now() AND ${tasks.status} NOT IN ('completed', 'cancelled')`,
      );
    } else if (data.dueState === "due_today") {
      conditions.push(
        sql`date_trunc('day', ${tasks.dueDate}) = date_trunc('day', now()) AND ${tasks.status} NOT IN ('completed', 'cancelled')`,
      );
    } else if (data.dueState === "upcoming") {
      conditions.push(
        sql`${tasks.dueDate} > now() AND ${tasks.status} NOT IN ('completed', 'cancelled')`,
      );
    }

    if (data.search) {
      const q = `%${data.search.trim()}%`;
      conditions.push(
        sql`(${tasks.title} ILIKE ${q} OR ${tasks.taskCode} ILIKE ${q} OR ${tasks.description} ILIKE ${q})`,
      );
    }

    // Role restriction for workers: only tasks assigned to this worker
    if (role === "worker") {
      try {
        const assignedTaskIdsResult = await db
          .select({ taskId: taskAssignees.taskId })
          .from(taskAssignees)
          .where(
            and(
              eq(taskAssignees.tenantId, tenantId),
              eq(taskAssignees.userId, userId),
            ),
          );
        const allowedIds = assignedTaskIdsResult.map((r) => r.taskId);
        if (allowedIds.length === 0) {
          return [];
        }
        conditions.push(inArray(tasks.id, allowedIds));
      } catch (err: any) {
        if (err?.code === "42P01") return [];
        throw err;
      }
    } else if (data.assigneeId) {
      try {
        const assignedTaskIdsResult = await db
          .select({ taskId: taskAssignees.taskId })
          .from(taskAssignees)
          .where(
            and(
              eq(taskAssignees.tenantId, tenantId),
              eq(taskAssignees.userId, data.assigneeId),
            ),
          );
        const allowedIds = assignedTaskIdsResult.map((r) => r.taskId);
        if (allowedIds.length === 0) {
          return [];
        }
        conditions.push(inArray(tasks.id, allowedIds));
      } catch (err: any) {
        if (err?.code === "42P01") return [];
        throw err;
      }
    }

    // 2. Fetch tasks with fallback for local schema migration
    let taskRows: any[] = [];
    try {
      taskRows = await db
        .select({
          id: tasks.id,
          tenantId: tasks.tenantId,
          taskCode: tasks.taskCode,
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          priority: tasks.priority,
          category: tasks.category,
          dueDate: tasks.dueDate,
          completedAt: tasks.completedAt,
          createdBy: tasks.createdBy,
          customerId: tasks.customerId,
          quoteId: tasks.quoteId,
          orderId: tasks.orderId,
          workOrderId: tasks.workOrderId,
          remakeId: tasks.remakeId,
          deliveryId: tasks.deliveryId,
          productionStage: tasks.productionStage,
          reviewNotes: tasks.reviewNotes,
          reviewedBy: tasks.reviewedBy,
          returnedAt: tasks.returnedAt,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,
          customerName: customers.name,
          quoteNumber: quotes.quoteNumber,
          orderNumber: orders.orderNumber,
          workOrderNumber: productionWorkOrders.workOrderNumber,
          remakeNumber: remakes.remakeNumber,
          deliveryNumber: deliveryHandovers.deliveryNumber,
          caseId: serviceCases.id,
          caseNumber: serviceCases.caseNumber,
          caseTitle: serviceCases.title,
        })
        .from(tasks)
        .leftJoin(customers, eq(tasks.customerId, customers.id))
        .leftJoin(quotes, eq(tasks.quoteId, quotes.id))
        .leftJoin(orders, eq(tasks.orderId, orders.id))
        .leftJoin(productionWorkOrders, eq(tasks.workOrderId, productionWorkOrders.id))
        .leftJoin(remakes, eq(tasks.remakeId, remakes.id))
        .leftJoin(deliveryHandovers, eq(tasks.deliveryId, deliveryHandovers.id))
        .leftJoin(serviceCases, eq(serviceCases.taskId, tasks.id))
        .where(and(...conditions))
        .orderBy(desc(tasks.createdAt));
    } catch (err: any) {
      const errStr = `${err?.message || ""} ${err?.cause?.message || ""}`;
      if (errStr.includes("relation \"tasks\" does not exist")) {
        return [];
      }
      if (isSchemaFallbackError(err)) {
        // Fallback for database before work_orders / remakes migration
        const baseRows = await db
          .select({
            id: tasks.id,
            tenantId: tasks.tenantId,
            taskCode: tasks.taskCode,
            title: tasks.title,
            description: tasks.description,
            status: tasks.status,
            priority: tasks.priority,
            category: tasks.category,
            dueDate: tasks.dueDate,
            completedAt: tasks.completedAt,
            createdBy: tasks.createdBy,
            customerId: tasks.customerId,
            quoteId: tasks.quoteId,
            orderId: tasks.orderId,
            productionStage: tasks.productionStage,
            createdAt: tasks.createdAt,
            updatedAt: tasks.updatedAt,
            customerName: customers.name,
            quoteNumber: quotes.quoteNumber,
            orderNumber: orders.orderNumber,
            caseId: serviceCases.id,
            caseNumber: serviceCases.caseNumber,
            caseTitle: serviceCases.title,
          })
          .from(tasks)
          .leftJoin(customers, eq(tasks.customerId, customers.id))
          .leftJoin(quotes, eq(tasks.quoteId, quotes.id))
          .leftJoin(orders, eq(tasks.orderId, orders.id))
          .leftJoin(serviceCases, eq(serviceCases.taskId, tasks.id))
          .where(and(...conditions))
          .orderBy(desc(tasks.createdAt));

        taskRows = baseRows.map((r) => ({
          ...r,
          workOrderId: null,
          remakeId: null,
          deliveryId: null,
          reviewNotes: null,
          reviewedBy: null,
          returnedAt: null,
          workOrderNumber: null,
          remakeNumber: null,
          deliveryNumber: null,
        }));
      } else {
        throw err;
      }
    }

    if (taskRows.length === 0) {
      return [];
    }

    // 3. Batch load assignees with user profiles
    const taskIds = taskRows.map((t) => t.id);
    let assigneeRows: any[] = [];
    try {
      assigneeRows = await db
        .select({
          taskId: taskAssignees.taskId,
          userId: taskAssignees.userId,
          assignedAt: taskAssignees.assignedAt,
          memberRole: tenantMembers.role,
          userName: appUsers.displayName,
          userEmail: appUsers.username,
        })
        .from(taskAssignees)
        .leftJoin(
          tenantMembers,
          and(
            eq(taskAssignees.userId, tenantMembers.userId),
            eq(taskAssignees.tenantId, tenantMembers.tenantId),
          ),
        )
        .leftJoin(appUsers, eq(taskAssignees.userId, appUsers.id))
        .where(
          and(
            eq(taskAssignees.tenantId, tenantId),
            inArray(taskAssignees.taskId, taskIds),
          ),
        );
    } catch (err: any) {
      if (err?.code !== "42P01") {
        console.error("Failed to load task assignees", err);
      }
    }

    const assigneesByTask: Record<string, typeof assigneeRows> = {};
    for (const a of assigneeRows) {
      (assigneesByTask[a.taskId] ||= []).push(a);
    }

    return taskRows.map((t) => ({
      ...t,
      isOverdue: computeIsOverdue(t.status as TaskStatus, t.dueDate),
      assignees: assigneesByTask[t.id] ?? [],
    }));
  });

/**
 * Get single task by ID with assignees, profiles, and tenant verification.
 */
export const getTaskById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => GetTaskInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { userId, tenantId, role } = ctx;

    let task: any = null;
    try {
      const taskRows = await db
        .select({
          id: tasks.id,
          tenantId: tasks.tenantId,
          taskCode: tasks.taskCode,
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          priority: tasks.priority,
          category: tasks.category,
          dueDate: tasks.dueDate,
          completedAt: tasks.completedAt,
          createdBy: tasks.createdBy,
          customerId: tasks.customerId,
          quoteId: tasks.quoteId,
          orderId: tasks.orderId,
          workOrderId: tasks.workOrderId,
          remakeId: tasks.remakeId,
          deliveryId: tasks.deliveryId,
          productionStage: tasks.productionStage,
          reviewNotes: tasks.reviewNotes,
          reviewedBy: tasks.reviewedBy,
          returnedAt: tasks.returnedAt,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,
          customerName: customers.name,
          quoteNumber: quotes.quoteNumber,
          orderNumber: orders.orderNumber,
          workOrderNumber: productionWorkOrders.workOrderNumber,
          remakeNumber: remakes.remakeNumber,
          deliveryNumber: deliveryHandovers.deliveryNumber,
          caseId: serviceCases.id,
          caseNumber: serviceCases.caseNumber,
          caseTitle: serviceCases.title,
        })
        .from(tasks)
        .leftJoin(customers, eq(tasks.customerId, customers.id))
        .leftJoin(quotes, eq(tasks.quoteId, quotes.id))
        .leftJoin(orders, eq(tasks.orderId, orders.id))
        .leftJoin(productionWorkOrders, eq(tasks.workOrderId, productionWorkOrders.id))
        .leftJoin(remakes, eq(tasks.remakeId, remakes.id))
        .leftJoin(deliveryHandovers, eq(tasks.deliveryId, deliveryHandovers.id))
        .leftJoin(serviceCases, eq(serviceCases.taskId, tasks.id))
        .where(and(eq(tasks.id, data.taskId), eq(tasks.tenantId, tenantId)))
        .limit(1);

      task = taskRows[0];
    } catch (err: any) {
      if (isSchemaFallbackError(err)) {
        const baseRows = await db
          .select({
            id: tasks.id,
            tenantId: tasks.tenantId,
            taskCode: tasks.taskCode,
            title: tasks.title,
            description: tasks.description,
            status: tasks.status,
            priority: tasks.priority,
            category: tasks.category,
            dueDate: tasks.dueDate,
            completedAt: tasks.completedAt,
            createdBy: tasks.createdBy,
            customerId: tasks.customerId,
            quoteId: tasks.quoteId,
            orderId: tasks.orderId,
            productionStage: tasks.productionStage,
            createdAt: tasks.createdAt,
            updatedAt: tasks.updatedAt,
            customerName: customers.name,
            quoteNumber: quotes.quoteNumber,
            orderNumber: orders.orderNumber,
            caseId: serviceCases.id,
            caseNumber: serviceCases.caseNumber,
            caseTitle: serviceCases.title,
          })
          .from(tasks)
          .leftJoin(customers, eq(tasks.customerId, customers.id))
          .leftJoin(quotes, eq(tasks.quoteId, quotes.id))
          .leftJoin(orders, eq(tasks.orderId, orders.id))
          .leftJoin(serviceCases, eq(serviceCases.taskId, tasks.id))
          .where(and(eq(tasks.id, data.taskId), eq(tasks.tenantId, tenantId)))
          .limit(1);

        if (baseRows[0]) {
          task = {
            ...baseRows[0],
            workOrderId: null,
            remakeId: null,
            deliveryId: null,
            reviewNotes: null,
            reviewedBy: null,
            returnedAt: null,
            workOrderNumber: null,
            remakeNumber: null,
            deliveryNumber: null,
          };
        }
      } else {
        throw err;
      }
    }

    if (!task) {
      throw new Error("Task not found or access denied");
    }

    // Fetch assignees with display names
    let assignees: any[] = [];
    try {
      assignees = await db
        .select({
          userId: taskAssignees.userId,
          assignedAt: taskAssignees.assignedAt,
          memberRole: tenantMembers.role,
          userName: appUsers.displayName,
          userEmail: appUsers.username,
        })
        .from(taskAssignees)
        .leftJoin(
          tenantMembers,
          and(
            eq(taskAssignees.userId, tenantMembers.userId),
            eq(taskAssignees.tenantId, tenantMembers.tenantId),
          ),
        )
        .leftJoin(appUsers, eq(taskAssignees.userId, appUsers.id))
        .where(
          and(
            eq(taskAssignees.taskId, task.id),
            eq(taskAssignees.tenantId, tenantId),
          ),
        );
    } catch (e) {
      // safe fallback
    }

    // Worker role restriction: worker must be assigned
    if (role === "worker" && !assignees.some((a) => a.userId === userId)) {
      throw new Error("Forbidden: worker is not assigned to this task");
    }

    let isAcknowledged = false;
    let acknowledgedAt: Date | null = null;
    let acknowledgedBy: string | null = null;

    try {
      const [ackLog] = await db
        .select({
          id: auditLog.id,
          createdAt: auditLog.createdAt,
          actorId: auditLog.actorId,
        })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.tenantId, tenantId),
            eq(auditLog.entityType, "task"),
            eq(auditLog.entityId, task.id),
            eq(auditLog.action, "completion_acknowledged"),
          ),
        )
        .orderBy(desc(auditLog.createdAt))
        .limit(1);

      if (ackLog) {
        const reopenedAfter =
          task.returnedAt && new Date(task.returnedAt) > new Date(ackLog.createdAt);
        if (!reopenedAfter && task.status === "completed") {
          isAcknowledged = true;
          acknowledgedAt = ackLog.createdAt;
          acknowledgedBy = ackLog.actorId;
        }
      }
    } catch (e) {
      // non-fatal
    }

    return {
      ...task,
      isOverdue: computeIsOverdue(task.status as TaskStatus, task.dueDate),
      isAcknowledged,
      acknowledgedAt,
      acknowledgedBy,
      assignees,
    };
  });

/**
 * Create task with transactional assignee linking, tenant validation, and audit logging.
 */
export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => CreateTaskInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { userId, tenantId, role } = ctx;

    // 1. Role validation: worker and viewer cannot create tasks
    if (role === "worker" || role === "viewer") {
      throw new Error("Forbidden: insufficient permissions to create tasks");
    }

    // 2. Strict cross-tenant validation for referenced entities
    if (data.customerId) {
      const cust = await db
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(
            eq(customers.id, data.customerId),
            eq(customers.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!cust[0]) {
        throw new Error("Customer not found or belongs to another organization");
      }
    }

    if (data.quoteId) {
      const q = await db
        .select({ id: quotes.id })
        .from(quotes)
        .where(and(eq(quotes.id, data.quoteId), eq(quotes.tenantId, tenantId)))
        .limit(1);
      if (!q[0]) {
        throw new Error("Quotation not found or belongs to another organization");
      }
    }

    if (data.orderId) {
      const ord = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.id, data.orderId), eq(orders.tenantId, tenantId)))
        .limit(1);
      if (!ord[0]) {
        throw new Error("Order not found or belongs to another organization");
      }
    }

    if (data.workOrderId) {
      try {
        const wo = await db
          .select({ id: productionWorkOrders.id })
          .from(productionWorkOrders)
          .where(
            and(
              eq(productionWorkOrders.id, data.workOrderId),
              eq(productionWorkOrders.tenantId, tenantId),
            ),
          )
          .limit(1);
        if (!wo[0]) {
          throw new Error("Work order not found or belongs to another organization");
        }
      } catch (e: any) {
        if (e?.code !== "42P01") throw e;
      }
    }

    if (data.remakeId) {
      try {
        const rem = await db
          .select({ id: remakes.id })
          .from(remakes)
          .where(and(eq(remakes.id, data.remakeId), eq(remakes.tenantId, tenantId)))
          .limit(1);
        if (!rem[0]) {
          throw new Error("Remake not found or belongs to another organization");
        }
      } catch (e: any) {
        if (e?.code !== "42P01") throw e;
      }
    }

    if (data.deliveryId) {
      try {
        const del = await db
          .select({ id: deliveryHandovers.id })
          .from(deliveryHandovers)
          .where(
            and(
              eq(deliveryHandovers.id, data.deliveryId),
              eq(deliveryHandovers.tenantId, tenantId),
            ),
          )
          .limit(1);
        if (!del[0]) {
          throw new Error("Delivery handover not found or belongs to another organization");
        }
      } catch (e: any) {
        if (e?.code !== "42P01") throw e;
      }
    }

    if (data.caseId) {
      try {
        const sc = await db
          .select({
            id: serviceCases.id,
            customerId: serviceCases.customerId,
            orderId: serviceCases.orderId,
            deliveryId: serviceCases.deliveryId,
            remakeId: serviceCases.remakeId,
          })
          .from(serviceCases)
          .where(
            and(
              eq(serviceCases.id, data.caseId),
              eq(serviceCases.tenantId, tenantId),
            ),
          )
          .limit(1);
        if (!sc[0]) {
          throw new Error("Service case not found or belongs to another organization");
        }
        // Auto-populate contextual IDs if not explicitly provided
        if (!data.customerId && sc[0].customerId) data.customerId = sc[0].customerId;
        if (!data.orderId && sc[0].orderId) data.orderId = sc[0].orderId;
        if (!data.remakeId && sc[0].remakeId) data.remakeId = sc[0].remakeId;
        if (!data.deliveryId && sc[0].deliveryId) data.deliveryId = sc[0].deliveryId;
      } catch (e: any) {
        if (e?.code !== "42P01") throw e;
      }
    }

    // Validate assignees belong to active tenant
    const uniqueAssigneeIds = Array.from(new Set(data.assigneeIds));
    if (uniqueAssigneeIds.length > 0) {
      const members = await db
        .select({ userId: tenantMembers.userId })
        .from(tenantMembers)
        .where(
          and(
            eq(tenantMembers.tenantId, tenantId),
            inArray(tenantMembers.userId, uniqueAssigneeIds),
          ),
        );
      if (members.length !== uniqueAssigneeIds.length) {
        throw new Error("One or more assignees are not members of this organization");
      }
    }

    // 3. Generate sequential task code
    const taskCode = await getNextTaskCode(tenantId);

    // 4. Create task
    const dueDateVal = data.dueDate ? new Date(data.dueDate) : null;

    let insertedTask: any = null;
    try {
      const [ins] = await db
        .insert(tasks)
        .values({
          tenantId,
          taskCode,
          title: data.title,
          description: data.description || null,
          priority: data.priority,
          category: data.category,
          dueDate: dueDateVal,
          createdBy: userId,
          customerId: data.customerId || null,
          quoteId: data.quoteId || null,
          orderId: data.orderId || null,
          workOrderId: data.workOrderId || null,
          remakeId: data.remakeId || null,
          deliveryId: data.deliveryId || null,
          productionStage: data.productionStage || null,
          status: "not_started",
        })
        .returning();
      insertedTask = ins;
    } catch (err: any) {
      if (isSchemaFallbackError(err)) {
        // Fallback without extended columns
        const [ins] = await db
          .insert(tasks)
          .values({
            tenantId,
            taskCode,
            title: data.title,
            description: data.description || null,
            priority: data.priority,
            category: data.category,
            dueDate: dueDateVal,
            createdBy: userId,
            customerId: data.customerId || null,
            quoteId: data.quoteId || null,
            orderId: data.orderId || null,
            productionStage: data.productionStage || null,
            status: "not_started",
          })
          .returning();
        insertedTask = ins;
      } else {
        throw err;
      }
    }

    if (!insertedTask) {
      throw new Error("Failed to insert task");
    }

    // 5. Link Service Case if task was created from After-Sales
    if (data.caseId) {
      try {
        await db
          .update(serviceCases)
          .set({ taskId: insertedTask.id, updatedAt: new Date() })
          .where(
            and(
              eq(serviceCases.id, data.caseId),
              eq(serviceCases.tenantId, tenantId),
            ),
          );
      } catch (e) {
        console.error("Failed to link service case to task", e);
      }
    }

    // 6. Insert assignees
    if (uniqueAssigneeIds.length > 0) {
      try {
        await db.insert(taskAssignees).values(
          uniqueAssigneeIds.map((assigneeId) => ({
            tenantId,
            taskId: insertedTask.id,
            userId: assigneeId,
          })),
        );
      } catch (err: any) {
        console.error("Failed to insert task assignees", err);
      }

      // 6b. Dispatch in-app notifications to newly assigned employees
      await sendTaskAssignmentNotifications(db, {
        tenantId,
        taskId: insertedTask.id,
        taskCode: insertedTask.taskCode,
        title: insertedTask.title,
        priority: insertedTask.priority,
        dueDate: dueDateVal,
        actorId: userId,
        assigneeIds: uniqueAssigneeIds,
      });
    }

    // 7. Record in audit_log
    try {
      await db.insert(auditLog).values({
        tenantId,
        actorId: userId,
        entityType: "task",
        entityId: insertedTask.id,
        action: "task_created",
        details: {
          taskCode: insertedTask.taskCode,
          title: insertedTask.title,
          priority: insertedTask.priority,
          category: insertedTask.category,
          orderId: insertedTask.orderId,
          workOrderId: data.workOrderId || undefined,
          caseId: data.caseId || undefined,
          assignees: uniqueAssigneeIds,
        },
      });
    } catch (e) {
      // non-fatal
    }

    return {
      taskId: insertedTask.id,
      taskCode: insertedTask.taskCode,
    };
  });

/**
 * Update an existing task's metadata, scheduling, and assignees.
 */
export const updateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => UpdateTaskInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { userId, tenantId, role } = ctx;

    if (role === "worker" || role === "viewer") {
      throw new Error("Forbidden: only managers or admins can edit tasks");
    }

    const [existing] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, data.taskId), eq(tasks.tenantId, tenantId)))
      .limit(1);

    if (!existing) {
      throw new Error("Task not found or access denied");
    }

    // Validate assignees belong to active tenant
    const uniqueAssigneeIds = Array.from(new Set(data.assigneeIds));
    if (uniqueAssigneeIds.length > 0) {
      const members = await db
        .select({ userId: tenantMembers.userId })
        .from(tenantMembers)
        .where(
          and(
            eq(tenantMembers.tenantId, tenantId),
            inArray(tenantMembers.userId, uniqueAssigneeIds),
          ),
        );
      if (members.length !== uniqueAssigneeIds.length) {
        throw new Error("One or more assignees are not members of this organization");
      }
    }

    const dueDateVal = data.dueDate ? new Date(data.dueDate) : null;

    try {
      await db
        .update(tasks)
        .set({
          title: data.title,
          description: data.description ?? null,
          priority: data.priority,
          category: data.category,
          dueDate: dueDateVal,
          customerId: data.customerId ?? null,
          quoteId: data.quoteId ?? null,
          orderId: data.orderId ?? null,
          workOrderId: data.workOrderId ?? null,
          remakeId: data.remakeId ?? null,
          deliveryId: data.deliveryId ?? null,
          productionStage: data.productionStage ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(tasks.id, data.taskId), eq(tasks.tenantId, tenantId)));
    } catch (err: any) {
      if (isSchemaFallbackError(err)) {
        await db
          .update(tasks)
          .set({
            title: data.title,
            description: data.description ?? null,
            priority: data.priority,
            category: data.category,
            dueDate: dueDateVal,
            customerId: data.customerId ?? null,
            quoteId: data.quoteId ?? null,
            orderId: data.orderId ?? null,
            productionStage: data.productionStage ?? null,
            updatedAt: new Date(),
          })
          .where(and(eq(tasks.id, data.taskId), eq(tasks.tenantId, tenantId)));
      } else {
        throw err;
      }
    }

    // Link service case if provided
    if (data.caseId) {
      try {
        await db
          .update(serviceCases)
          .set({ taskId: data.taskId, updatedAt: new Date() })
          .where(
            and(
              eq(serviceCases.id, data.caseId),
              eq(serviceCases.tenantId, tenantId),
            ),
          );
      } catch (e) {
        // non-fatal
      }
    }

    // Fetch existing assignees to detect newly added assignees (prevents duplicate notifications)
    let newlyAddedAssigneeIds: string[] = [];
    try {
      const existingAssigneeRows = await db
        .select({ userId: taskAssignees.userId })
        .from(taskAssignees)
        .where(
          and(
            eq(taskAssignees.taskId, data.taskId),
            eq(taskAssignees.tenantId, tenantId),
          ),
        );
      const existingUserIds = existingAssigneeRows.map((r) => r.userId);
      newlyAddedAssigneeIds = uniqueAssigneeIds.filter(
        (id) => !existingUserIds.includes(id),
      );
    } catch (e) {
      // non-fatal
    }

    // Synchronize assignees: delete existing and reinsert
    try {
      await db
        .delete(taskAssignees)
        .where(
          and(
            eq(taskAssignees.taskId, data.taskId),
            eq(taskAssignees.tenantId, tenantId),
          ),
        );

      if (uniqueAssigneeIds.length > 0) {
        await db.insert(taskAssignees).values(
          uniqueAssigneeIds.map((assigneeId) => ({
            tenantId,
            taskId: data.taskId,
            userId: assigneeId,
          })),
        );
      }

      // Notify newly assigned employees only
      if (newlyAddedAssigneeIds.length > 0) {
        await sendTaskLifecycleNotification(db, {
          tenantId,
          taskId: data.taskId,
          taskCode: existing.taskCode,
          title: data.title,
          priority: data.priority,
          dueDate: dueDateVal,
          actorId: userId,
          recipientIds: newlyAddedAssigneeIds,
          event: "task_reassigned",
        });
      }
    } catch (e) {
      console.error("Failed to update task assignees", e);
    }

    // Audit log
    try {
      await db.insert(auditLog).values({
        tenantId,
        actorId: userId,
        entityType: "task",
        entityId: data.taskId,
        action: "task_updated",
        details: {
          title: data.title,
          priority: data.priority,
          category: data.category,
          dueDate: data.dueDate,
          assignees: uniqueAssigneeIds,
        },
      });
    } catch (e) {
      // non-fatal
    }

    return { success: true, taskId: data.taskId };
  });

/**
 * Transition task status with state-machine & role validation.
 */
export const changeTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => ChangeTaskStatusInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { userId, tenantId, role } = ctx;

    // 1. Fetch current task
    const [task] = await db
      .select({
        id: tasks.id,
        status: tasks.status,
        tenantId: tasks.tenantId,
        taskCode: tasks.taskCode,
        title: tasks.title,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        createdBy: tasks.createdBy,
        reviewNotes: tasks.reviewNotes,
      })
      .from(tasks)
      .where(and(eq(tasks.id, data.taskId), eq(tasks.tenantId, tenantId)))
      .limit(1);

    if (!task) {
      throw new Error("Task not found or access denied");
    }

    const prevStatus = task.status as TaskStatus;
    const nextStatus = data.status;

    if (prevStatus === nextStatus && !data.reviewNotes) {
      return { success: true, taskId: task.id, status: nextStatus };
    }

    // 2. Role-based status transition rules
    if (role === "viewer") {
      throw new Error("Forbidden: read-only users cannot modify tasks");
    }

    if (role === "worker") {
      // Check if worker is assigned to this task
      const [assignment] = await db
        .select({ id: taskAssignees.id })
        .from(taskAssignees)
        .where(
          and(
            eq(taskAssignees.taskId, task.id),
            eq(taskAssignees.userId, userId),
            eq(taskAssignees.tenantId, tenantId),
          ),
        )
        .limit(1);

      if (!assignment) {
        throw new Error("Forbidden: worker can only transition assigned tasks");
      }

      // Workers can transition not_started -> in_progress, and in_progress -> completed / waiting_review / not_started
      const allowedTransitions: Record<TaskStatus, TaskStatus[]> = {
        not_started: ["in_progress"],
        in_progress: ["completed", "waiting_review", "not_started"],
        waiting_review: [],
        completed: [],
        cancelled: [],
      };

      if (!allowedTransitions[prevStatus]?.includes(nextStatus)) {
        throw new Error(
          `Forbidden: workers cannot transition task directly from '${prevStatus}' to '${nextStatus}'.`,
        );
      }
    }

    // 3. Update status & timestamps
    const completedAtVal = nextStatus === "completed" ? new Date() : null;
    const isReturned = prevStatus === "waiting_review" && nextStatus === "in_progress";
    const isReopened = prevStatus === "completed" && nextStatus === "in_progress";

    if (isReturned && (!data.reviewNotes || !data.reviewNotes.trim())) {
      throw new Error("Review notes are required when returning a task for changes.");
    }

    try {
      await db
        .update(tasks)
        .set({
          status: nextStatus,
          completedAt: completedAtVal,
          reviewNotes: data.reviewNotes ?? (nextStatus === "completed" ? task.reviewNotes : undefined),
          reviewedBy: nextStatus === "completed" || isReturned || isReopened ? userId : undefined,
          returnedAt: isReturned || isReopened ? new Date() : undefined,
          updatedAt: new Date(),
        })
        .where(and(eq(tasks.id, task.id), eq(tasks.tenantId, tenantId)));
    } catch (err: any) {
      if (isSchemaFallbackError(err)) {
        await db
          .update(tasks)
          .set({
            status: nextStatus,
            completedAt: completedAtVal,
            updatedAt: new Date(),
          })
          .where(and(eq(tasks.id, task.id), eq(tasks.tenantId, tenantId)));
      } else {
        throw err;
      }
    }

    // 4. Record status change in audit_log
    const actionName =
      isReturned
        ? "task_returned"
        : isReopened
        ? "task_reopened"
        : nextStatus === "completed"
        ? (role === "worker" ? "task_completed" : "task_approved")
        : nextStatus === "waiting_review"
        ? "task_submitted_review"
        : "status_changed";

    try {
      await db.insert(auditLog).values({
        tenantId,
        actorId: userId,
        entityType: "task",
        entityId: task.id,
        action: actionName,
        details: {
          taskCode: task.taskCode,
          from: prevStatus,
          to: nextStatus,
          reviewNotes: data.reviewNotes || undefined,
        },
      });
    } catch (e) {
      // non-fatal
    }

    // 5. Dispatch lifecycle notifications
    if (nextStatus === "completed") {
      // Notify task creator when completed (e.g. by worker)
      if (task.createdBy && task.createdBy !== userId) {
        await sendTaskLifecycleNotification(db, {
          tenantId,
          taskId: task.id,
          taskCode: task.taskCode,
          title: task.title,
          priority: task.priority,
          dueDate: task.dueDate,
          actorId: userId,
          event: "task_completed",
          recipientIds: [task.createdBy],
          note: data.reviewNotes || null,
        });
      }
    } else if (isReopened) {
      // Notify assignees when task is reopened by manager
      try {
        const assigneeRows = await db
          .select({ userId: taskAssignees.userId })
          .from(taskAssignees)
          .where(
            and(
              eq(taskAssignees.taskId, task.id),
              eq(taskAssignees.tenantId, tenantId),
            ),
          );
        const assigneeIds = assigneeRows.map((r) => r.userId);
        if (assigneeIds.length > 0) {
          await sendTaskLifecycleNotification(db, {
            tenantId,
            taskId: task.id,
            taskCode: task.taskCode,
            title: task.title,
            priority: task.priority,
            dueDate: task.dueDate,
            actorId: userId,
            event: "task_reopened",
            recipientIds: assigneeIds,
            note: data.reviewNotes || null,
          });
        }
      } catch (e) {
        console.error("Failed to notify assignees of reopened task", e);
      }
    }

    return {
      success: true,
      taskId: task.id,
      status: nextStatus,
    };
  });

/**
 * Dedicated server function to assign/reassign workers to a task.
 */
export const assignTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => AssignTaskInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { userId, tenantId, role } = ctx;

    if (role === "worker" || role === "viewer") {
      throw new Error("Forbidden: only managers or admins can assign tasks");
    }

    const [task] = await db
      .select({
        id: tasks.id,
        taskCode: tasks.taskCode,
        title: tasks.title,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
      })
      .from(tasks)
      .where(and(eq(tasks.id, data.taskId), eq(tasks.tenantId, tenantId)))
      .limit(1);

    if (!task) {
      throw new Error("Task not found or access denied");
    }

    const uniqueAssigneeIds = Array.from(new Set(data.assigneeIds));
    if (uniqueAssigneeIds.length > 0) {
      const members = await db
        .select({ userId: tenantMembers.userId })
        .from(tenantMembers)
        .where(
          and(
            eq(tenantMembers.tenantId, tenantId),
            inArray(tenantMembers.userId, uniqueAssigneeIds),
          ),
        );
      if (members.length !== uniqueAssigneeIds.length) {
        throw new Error("One or more assignees do not belong to this organization");
      }
    }

    // Detect newly added assignees to prevent duplicate notifications
    let newlyAddedAssigneeIds: string[] = [];
    try {
      const currentAssigneeRows = await db
        .select({ userId: taskAssignees.userId })
        .from(taskAssignees)
        .where(
          and(
            eq(taskAssignees.taskId, task.id),
            eq(taskAssignees.tenantId, tenantId),
          ),
        );
      const existingUserIds = currentAssigneeRows.map((r) => r.userId);
      newlyAddedAssigneeIds = uniqueAssigneeIds.filter(
        (id) => !existingUserIds.includes(id),
      );
    } catch (e) {
      // non-fatal
    }

    // Transactional re-assignment
    await db
      .delete(taskAssignees)
      .where(
        and(
          eq(taskAssignees.taskId, task.id),
          eq(taskAssignees.tenantId, tenantId),
        ),
      );

    if (uniqueAssigneeIds.length > 0) {
      await db.insert(taskAssignees).values(
        uniqueAssigneeIds.map((uid) => ({
          tenantId,
          taskId: task.id,
          userId: uid,
        })),
      );
    }

    // Dispatch notifications to newly assigned employees only
    if (newlyAddedAssigneeIds.length > 0) {
      await sendTaskLifecycleNotification(db, {
        tenantId,
        taskId: task.id,
        taskCode: task.taskCode,
        title: task.title,
        priority: task.priority,
        dueDate: task.dueDate,
        actorId: userId,
        recipientIds: newlyAddedAssigneeIds,
        event: "task_reassigned",
      });
    }

    try {
      await db.insert(auditLog).values({
        tenantId,
        actorId: userId,
        entityType: "task",
        entityId: task.id,
        action: "task_reassigned",
        details: {
          taskCode: task.taskCode,
          assignees: uniqueAssigneeIds,
        },
      });
    } catch (e) {
      // non-fatal
    }

    return { success: true, taskId: task.id, assignees: uniqueAssigneeIds };
  });

/**
 * Acknowledge completion of a task by manager or admin.
 * Records audit event completion_acknowledged without mutating operational entities.
 */
export const acknowledgeTaskCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => AcknowledgeTaskCompletionInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { userId, tenantId, role } = ctx;

    if (role === "worker" || role === "viewer") {
      throw new Error("Forbidden: only managers or admins can acknowledge task completion");
    }

    const [task] = await db
      .select({
        id: tasks.id,
        taskCode: tasks.taskCode,
        status: tasks.status,
      })
      .from(tasks)
      .where(and(eq(tasks.id, data.taskId), eq(tasks.tenantId, tenantId)))
      .limit(1);

    if (!task) {
      throw new Error("Task not found or access denied");
    }

    if (task.status !== "completed") {
      throw new Error("Only completed tasks can be acknowledged");
    }

    // Insert audit log entry
    await db.insert(auditLog).values({
      tenantId,
      actorId: userId,
      entityType: "task",
      entityId: task.id,
      action: "completion_acknowledged",
      details: {
        taskCode: task.taskCode,
        notes: data.notes || undefined,
        acknowledgedAt: new Date().toISOString(),
      },
    });

    return { success: true, taskId: task.id, acknowledged: true };
  });

/**
 * Bulk update multiple tasks (assign worker, change priority, set due date, update status).
 */
export const bulkUpdateTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => BulkUpdateTasksInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { userId, tenantId, role } = ctx;

    if (role === "worker" || role === "viewer") {
      throw new Error("Forbidden: insufficient permissions for bulk task updates");
    }

    const uniqueTaskIds = Array.from(new Set(data.taskIds));

    // Verify all tasks belong to active tenant
    const matchedTasks = await db
      .select({
        id: tasks.id,
        taskCode: tasks.taskCode,
        title: tasks.title,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.tenantId, tenantId),
          inArray(tasks.id, uniqueTaskIds),
        ),
      );

    if (matchedTasks.length !== uniqueTaskIds.length) {
      throw new Error("One or more selected tasks not found or access denied");
    }

    // Verify assignee if provided
    if (data.assigneeId) {
      const [member] = await db
        .select({ userId: tenantMembers.userId })
        .from(tenantMembers)
        .where(
          and(
            eq(tenantMembers.tenantId, tenantId),
            eq(tenantMembers.userId, data.assigneeId),
          ),
        )
        .limit(1);

      if (!member) {
        throw new Error("Target assignee does not belong to this organization");
      }
    }

    // Build update object
    const updateObj: Record<string, any> = { updatedAt: new Date() };
    if (data.priority) updateObj.priority = data.priority;
    if (data.dueDate !== undefined) {
      updateObj.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    }
    if (data.status) {
      updateObj.status = data.status;
      if (data.status === "completed") updateObj.completedAt = new Date();
    }

    // Apply updates
    await db
      .update(tasks)
      .set(updateObj)
      .where(
        and(
          eq(tasks.tenantId, tenantId),
          inArray(tasks.id, uniqueTaskIds),
        ),
      );

    // Apply assignee if provided and dispatch notification
    if (data.assigneeId) {
      const targetAssigneeId = data.assigneeId;
      for (const t of matchedTasks) {
        let alreadyAssigned = false;
        try {
          const [existing] = await db
            .select({ id: taskAssignees.id })
            .from(taskAssignees)
            .where(
              and(
                eq(taskAssignees.taskId, t.id),
                eq(taskAssignees.tenantId, tenantId),
                eq(taskAssignees.userId, targetAssigneeId),
              ),
            )
            .limit(1);
          alreadyAssigned = !!existing;
        } catch (e) {
          // ignore
        }

        await db
          .delete(taskAssignees)
          .where(
            and(
              eq(taskAssignees.taskId, t.id),
              eq(taskAssignees.tenantId, tenantId),
            ),
          );

        await db.insert(taskAssignees).values({
          tenantId,
          taskId: t.id,
          userId: targetAssigneeId,
        });

        if (!alreadyAssigned) {
          await sendTaskAssignmentNotifications(db, {
            tenantId,
            taskId: t.id,
            taskCode: t.taskCode,
            title: t.title,
            priority: data.priority || t.priority || "medium",
            dueDate: data.dueDate !== undefined ? data.dueDate : t.dueDate,
            actorId: userId,
            assigneeIds: [targetAssigneeId],
          });
        }
      }
    }

    // Audit log
    try {
      await db.insert(auditLog).values({
        tenantId,
        actorId: userId,
        entityType: "task",
        entityId: uniqueTaskIds[0],
        action: "task_bulk_updated",
        details: {
          taskCount: uniqueTaskIds.length,
          taskCodes: matchedTasks.map((t) => t.taskCode),
          assignedTo: data.assigneeId,
          priority: data.priority,
          status: data.status,
        },
      });
    } catch (e) {
      // non-fatal
    }

    return { success: true, count: uniqueTaskIds.length };
  });

/**
 * List all workforce members in the active tenant with live workload indicators.
 */
export const listWorkforceMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Workforce Management");
    const { tenantId } = ctx;

    // Fetch tenant members joined with app_users
    const members = await db
      .select({
        userId: tenantMembers.userId,
        role: tenantMembers.role,
        displayName: appUsers.displayName,
        username: appUsers.username,
        avatarKey: appUsers.avatarKey,
        status: appUsers.status,
      })
      .from(tenantMembers)
      .leftJoin(appUsers, eq(tenantMembers.userId, appUsers.id))
      .where(eq(tenantMembers.tenantId, tenantId));

    if (members.length === 0) {
      return [];
    }

    // Compute live task counts per user
    let countsByUser: Record<
      string,
      {
        open: number;
        critical: number;
        overdue: number;
        waitingReview: number;
        completedToday: number;
      }
    > = {};

    try {
      const taskRows = await db
        .select({
          userId: taskAssignees.userId,
          status: tasks.status,
          priority: tasks.priority,
          dueDate: tasks.dueDate,
          completedAt: tasks.completedAt,
        })
        .from(taskAssignees)
        .innerJoin(
          tasks,
          and(eq(taskAssignees.taskId, tasks.id), eq(tasks.tenantId, tenantId)),
        )
        .where(eq(taskAssignees.tenantId, tenantId));

      const now = Date.now();
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      for (const row of taskRows) {
        const uId = row.userId;
        const entry = (countsByUser[uId] ||= {
          open: 0,
          critical: 0,
          overdue: 0,
          waitingReview: 0,
          completedToday: 0,
        });

        const isOpen = row.status !== "completed" && row.status !== "cancelled";
        if (isOpen) {
          entry.open += 1;
          if (row.priority === "critical") entry.critical += 1;
          if (row.dueDate && new Date(row.dueDate).getTime() < now) {
            entry.overdue += 1;
          }
        }
        if (row.status === "waiting_review") {
          entry.waitingReview += 1;
        }
        if (
          row.status === "completed" &&
          row.completedAt &&
          new Date(row.completedAt).getTime() >= startOfToday.getTime()
        ) {
          entry.completedToday += 1;
        }
      }
    } catch (e) {
      // If tasks table does not exist or fails, default to 0
    }

    const workforce: WorkforceMember[] = members.map((m) => {
      const counts = countsByUser[m.userId] || {
        open: 0,
        critical: 0,
        overdue: 0,
        waitingReview: 0,
        completedToday: 0,
      };

      return {
        userId: m.userId,
        displayName: m.displayName || m.username || "User",
        username: m.username || m.userId.slice(0, 8),
        avatarKey: m.avatarKey,
        role: m.role || "worker",
        status: (m.status as "active" | "disabled") || "active",
        openTasksCount: counts.open,
        criticalTasksCount: counts.critical,
        overdueTasksCount: counts.overdue,
        waitingReviewCount: counts.waitingReview,
        completedTodayCount: counts.completedToday,
      };
    });

    return workforce;
  });

/**
 * Get audit history for a task.
 */
export const getTaskAuditHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => GetTaskAuditHistoryInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, userId, role } = ctx;

    // Task workers can only view audit logs of tasks assigned to them
    if (role === "worker") {
      const [assignment] = await db
        .select({ id: taskAssignees.id })
        .from(taskAssignees)
        .where(
          and(
            eq(taskAssignees.taskId, data.taskId),
            eq(taskAssignees.userId, userId),
            eq(taskAssignees.tenantId, tenantId),
          ),
        )
        .limit(1);

      if (!assignment) {
        throw new Error("Forbidden: worker is not assigned to this task");
      }
    }

    try {
      const logs = await db
        .select({
          id: auditLog.id,
          action: auditLog.action,
          details: auditLog.details,
          createdAt: auditLog.createdAt,
          actorId: auditLog.actorId,
          actorName: appUsers.displayName,
          actorUsername: appUsers.username,
        })
        .from(auditLog)
        .leftJoin(appUsers, eq(auditLog.actorId, appUsers.id))
        .where(
          and(
            eq(auditLog.tenantId, tenantId),
            eq(auditLog.entityType, "task"),
            eq(auditLog.entityId, data.taskId),
          ),
        )
        .orderBy(desc(auditLog.createdAt))
        .limit(50);

      return logs.map((l) => ({
        ...l,
        details: (l.details as Record<string, any>) ?? null,
      }));
    } catch (err: any) {
      console.error("Failed to load task audit history", err);
      return [];
    }
  });
