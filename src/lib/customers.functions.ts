import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { db } from "@/db/client.server";
import {
  customers,
  quotes,
  orders,
  invoices,
  invoicePayments,
  tasks,
  taskAssignees,
  tenantMembers,
  auditLog,
  remakes,
  opportunities,
  productionWorkOrders,
  deliveryHandovers,
  appUsers,
  serviceCases,
} from "@/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { type TenantContext, forbidWorker } from "@/lib/tenant-context";
import { calculateWarrantyStatus } from "@/lib/after-sales.pure";
import type {
  ServiceCaseItem,
  CustomerWarrantyStatus,
} from "@/lib/after-sales-types";
import type {
  CustomerListItem,
  Customer360Data,
  CustomerQuoteItem,
  CustomerOrderItem,
  CustomerActivityItem,
  CustomerProjectItem,
  CustomerFinancials,
  CustomerPaymentRecord,
  CustomerAfterSalesSummary,
} from "@/lib/customer-types";
import { getQuotationProgressiveStatus } from "@/lib/quote.functions";
import {
  QUOTATION_STAGE_LABEL_AR,
  CUSTOMER_STAGE_LABEL_AR,
  mapInternalStageToCustomerStage,
} from "@/lib/stages";
import type { RemakeListItem } from "@/lib/remake-types";
import type { ProductionWorkOrder } from "@/lib/work-order-types";
import type { DeliveryHandover } from "@/lib/delivery-types";
import { computeInvoiceStatus, type InvoiceItem } from "@/lib/invoice-types";
import { computeIsOverdue, type TaskItem, type TaskStatus } from "@/lib/task-types";

// ── Validation Schemas ──────────────────────────────────────────────────────

const ListCustomersInput = z
  .object({
    search: z.string().optional(),
    filter: z
      .enum(["all", "active_orders", "outstanding_balance", "with_quotes", "no_active_orders"])
      .optional()
      .default("all"),
    sort: z
      .enum(["newest", "oldest", "name_asc", "name_desc"])
      .optional()
      .default("newest"),
    page: z.number().int().min(1).optional().default(1),
    pageSize: z.number().int().min(1).max(100).optional().default(25),
  })
  .optional()
  .default({});

const GetCustomer360Input = z.object({
  customerId: z.string().uuid(),
});

const UpsertCustomerInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Customer name is required"),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  governorate: z.string().trim().optional().nullable(),
});

const DeleteCustomerInput = z.object({
  customerId: z.string().uuid(),
});

// ── Server Functions ────────────────────────────────────────────────────────

/**
 * List paginated customers with pre-aggregated quotation counts, active orders, and financial balances.
 * Uses optimized batch SQL joins to avoid N+1 roundtrips.
 */
export const listCustomersWithStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => ListCustomersInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<{
    rows: CustomerListItem[];
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Customer Management");
    const { tenantId } = ctx;

    const conditions = [eq(customers.tenantId, tenantId)];

    if (data.search && data.search.trim().length > 0) {
      const q = `%${data.search.trim()}%`;
      conditions.push(
        sql`(${customers.name} ILIKE ${q} OR ${customers.phone} ILIKE ${q} OR ${customers.email} ILIKE ${q} OR ${customers.governorate} ILIKE ${q})`,
      );
    }

    if (data.filter === "active_orders") {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM ${orders} WHERE ${orders.customerId} = ${customers.id} AND ${orders.tenantId} = ${tenantId} AND ${orders.currentStage} != 'completed' AND ${orders.currentStage} != 'cancelled')`,
      );
    } else if (data.filter === "no_active_orders") {
      conditions.push(
        sql`NOT EXISTS (SELECT 1 FROM ${orders} WHERE ${orders.customerId} = ${customers.id} AND ${orders.tenantId} = ${tenantId} AND ${orders.currentStage} != 'completed' AND ${orders.currentStage} != 'cancelled')`,
      );
    } else if (data.filter === "with_quotes") {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM ${quotes} WHERE ${quotes.customerId} = ${customers.id} AND ${quotes.tenantId} = ${tenantId})`,
      );
    } else if (data.filter === "outstanding_balance") {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM ${invoices} WHERE ${invoices.customerId} = ${customers.id} AND ${invoices.tenantId} = ${tenantId} AND coalesce(${invoices.paidAmount}, 0) < ${invoices.total})`,
      );
    }

    const page = Math.max(1, data.page || 1);
    const pageSize = Math.min(100, Math.max(1, data.pageSize || 25));
    const offset = (page - 1) * pageSize;

    let orderByClause = desc(customers.createdAt);
    if (data.sort === "oldest") {
      orderByClause = sql`${customers.createdAt} ASC`;
    } else if (data.sort === "name_asc") {
      orderByClause = sql`${customers.name} ASC`;
    } else if (data.sort === "name_desc") {
      orderByClause = sql`${customers.name} DESC`;
    }

    // 1. Get total filtered count
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(customers)
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
      };
    }

    // 2. Fetch only the requested page of customers
    const customerRows = await db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        email: customers.email,
        address: customers.address,
        governorate: customers.governorate,
        createdAt: customers.createdAt,
      })
      .from(customers)
      .where(and(...conditions))
      .orderBy(orderByClause)
      .limit(pageSize)
      .offset(offset);

    const customerIds = customerRows.map((c) => c.id);

    // 3. Batch Quote counts for page items only
    const quoteStats = await db
      .select({
        customerId: quotes.customerId,
        count: sql<number>`count(*)::int`,
      })
      .from(quotes)
      .where(and(eq(quotes.tenantId, tenantId), inArray(quotes.customerId, customerIds)))
      .groupBy(quotes.customerId);

    const quotesByCustomer: Record<string, number> = {};
    for (const q of quoteStats) {
      if (q.customerId) quotesByCustomer[q.customerId] = Number(q.count || 0);
    }

    // 4. Batch Active Order counts for page items only
    const orderStats = await db
      .select({
        customerId: orders.customerId,
        activeCount: sql<number>`count(case when ${orders.currentStage} != 'completed' and ${orders.currentStage} != 'cancelled' then 1 end)::int`,
      })
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), inArray(orders.customerId, customerIds)))
      .groupBy(orders.customerId);

    const activeOrdersByCustomer: Record<string, number> = {};
    for (const o of orderStats) {
      if (o.customerId) activeOrdersByCustomer[o.customerId] = Number(o.activeCount || 0);
    }

    // 5. Batch Invoiced & Paid totals for page items only
    const invoiceStats = await db
      .select({
        customerId: invoices.customerId,
        totalInvoiced: sql<number>`coalesce(sum(${invoices.total}), 0)::numeric`,
        totalPaid: sql<number>`coalesce(sum(${invoices.paidAmount}), 0)::numeric`,
      })
      .from(invoices)
      .where(and(eq(invoices.tenantId, tenantId), inArray(invoices.customerId, customerIds)))
      .groupBy(invoices.customerId);

    const financialsByCustomer: Record<string, { totalInvoiced: number; totalPaid: number }> = {};
    for (const inv of invoiceStats) {
      if (inv.customerId) {
        financialsByCustomer[inv.customerId] = {
          totalInvoiced: Number(inv.totalInvoiced || 0),
          totalPaid: Number(inv.totalPaid || 0),
        };
      }
    }

    // Combine into CustomerListItem
    const rows: CustomerListItem[] = customerRows.map((c): CustomerListItem => {
      const fin = financialsByCustomer[c.id] || { totalInvoiced: 0, totalPaid: 0 };
      const outstandingBalance = Math.max(0, fin.totalInvoiced - fin.totalPaid);

      return {
        id: c.id,
        name: c.name,
        phone: c.phone || null,
        email: c.email || null,
        address: c.address || null,
        governorate: c.governorate || null,
        createdAt: c.createdAt,
        quoteCount: quotesByCustomer[c.id] || 0,
        activeOrderCount: activeOrdersByCustomer[c.id] || 0,
        totalInvoiced: fin.totalInvoiced,
        totalPaid: fin.totalPaid,
        outstandingBalance,
      };
    });

    return {
      rows,
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  });

/**
 * Get comprehensive 360 overview of a customer:
 * Quotes, Orders, Invoices with Payments, Tasks, and Activity timeline.
 */
export const getCustomer360 = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => GetCustomer360Input.parse(input))
  .handler(async ({ data, context }): Promise<Customer360Data> => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Customer Management");
    const { tenantId } = ctx;

    // 1. Fetch customer details
    const [customerRow] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, data.customerId), eq(customers.tenantId, tenantId)))
      .limit(1);

    if (!customerRow) {
      throw new Error("Customer not found or access denied");
    }

    // 2. Fetch Quotes in parallel
    const quoteRowsPromise = db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        status: quotes.status,
        total: quotes.total,
        validUntil: quotes.validUntil,
        opportunityId: sql<string | null>`(${quotes.snapshot}->>'opportunityId')`.as("opportunity_id"),
        createdAt: quotes.createdAt,
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        snapshot: quotes.snapshot,
      })
      .from(quotes)
      .leftJoin(orders, eq(quotes.id, orders.quoteId))
      .where(and(eq(quotes.customerId, customerRow.id), eq(quotes.tenantId, tenantId)))
      .orderBy(desc(quotes.createdAt));

    // 3. Fetch Orders in parallel
    const orderRowsPromise = db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        quoteId: orders.quoteId,
        quoteNumber: quotes.quoteNumber,
        opportunityId: sql<string | null>`(${quotes.snapshot}->>'opportunityId')`.as("quote_opportunity_id"),
        currentStage: orders.currentStage,
        total: orders.total,
        deposit: orders.deposit,
        contractDate: orders.contractDate,
        expectedDelivery: orders.expectedDelivery,
        deliveredAt: orders.deliveredAt,
        notes: orders.notes,
        createdAt: orders.createdAt,
        invoicePaidAmount: invoices.paidAmount,
      })
      .from(orders)
      .leftJoin(quotes, eq(orders.quoteId, quotes.id))
      .leftJoin(invoices, eq(orders.invoiceId, invoices.id))
      .where(and(eq(orders.customerId, customerRow.id), eq(orders.tenantId, tenantId)))
      .orderBy(desc(orders.createdAt));

    // 4. Fetch Invoices with Payments
    const invoiceRowsPromise = db
      .select({
        id: invoices.id,
        tenantId: invoices.tenantId,
        invoiceNumber: invoices.invoiceNumber,
        quoteId: invoices.quoteId,
        customerId: invoices.customerId,
        total: invoices.total,
        depositAmount: invoices.depositAmount,
        paidAmount: invoices.paidAmount,
        issuedAt: invoices.issuedAt,
        paidAt: invoices.paidAt,
        quoteNumber: quotes.quoteNumber,
        orderId: orders.id,
        orderNumber: orders.orderNumber,
      })
      .from(invoices)
      .leftJoin(quotes, eq(invoices.quoteId, quotes.id))
      .leftJoin(orders, eq(invoices.id, orders.invoiceId))
      .where(and(eq(invoices.customerId, customerRow.id), eq(invoices.tenantId, tenantId)))
      .orderBy(desc(invoices.issuedAt));

    // 5. Fetch Tasks
    const taskRowsPromise = db
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
        opportunityId: tasks.opportunityId,
        quoteId: tasks.quoteId,
        orderId: tasks.orderId,
        productionStage: tasks.productionStage,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
        quoteNumber: quotes.quoteNumber,
        orderNumber: orders.orderNumber,
      })
      .from(tasks)
      .leftJoin(quotes, eq(tasks.quoteId, quotes.id))
      .leftJoin(orders, eq(tasks.orderId, orders.id))
      .where(and(eq(tasks.customerId, customerRow.id), eq(tasks.tenantId, tenantId)))
      .orderBy(desc(tasks.createdAt));

    // 6. Fetch Activities from audit_log (bounded to 50)
    const activityRowsPromise = db
      .select({
        id: auditLog.id,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        action: auditLog.action,
        details: auditLog.details,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.tenantId, tenantId),
          sql`(${auditLog.details}->>'customerId' = ${customerRow.id} OR ${auditLog.entityId} = ${customerRow.id})`,
        ),
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(50);

    // 7. Fetch Remakes / Quality / Warranty cases
    const remakeRowsPromise = db
      .select({
        id: remakes.id,
        remakeNumber: remakes.remakeNumber,
        orderId: remakes.orderId,
        orderNumber: orders.orderNumber,
        customerId: remakes.customerId,
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
      .where(
        and(
          eq(remakes.tenantId, tenantId),
          eq(remakes.customerId, customerRow.id),
        ),
      )
      .orderBy(desc(remakes.createdAt));

    // 8. Fetch Opportunities (with sales owner name via app_users)
    const opportunitiesPromise = db
      .select({
        id: opportunities.id,
        tenantId: opportunities.tenantId,
        opportunityNumber: opportunities.opportunityNumber,
        customerId: opportunities.customerId,
        leadId: opportunities.leadId,
        title: opportunities.title,
        projectType: opportunities.projectType,
        value: opportunities.value,
        salesOwner: opportunities.salesOwner,
        salesOwnerName: appUsers.displayName,
        stage: opportunities.stage,
        source: opportunities.source,
        expectedCloseDate: opportunities.expectedCloseDate,
        nextAction: opportunities.nextAction,
        nextActionDate: opportunities.nextActionDate,
        siteAddress: opportunities.siteAddress,
        notes: opportunities.notes,
        status: opportunities.status,
        lostReason: opportunities.lostReason,
        createdAt: opportunities.createdAt,
        updatedAt: opportunities.updatedAt,
      })
      .from(opportunities)
      .leftJoin(appUsers, eq(opportunities.salesOwner, appUsers.id))
      .where(
        and(
          eq(opportunities.tenantId, tenantId),
          eq(opportunities.customerId, customerRow.id),
        ),
      )
      .orderBy(desc(opportunities.createdAt))
      .catch(() => [] as any[]);

    // 9. Fetch Delivery Handovers
    const deliveryRowsPromise = db
      .select({
        id: deliveryHandovers.id,
        tenantId: deliveryHandovers.tenantId,
        deliveryNumber: deliveryHandovers.deliveryNumber,
        orderId: deliveryHandovers.orderId,
        customerId: deliveryHandovers.customerId,
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
        orderNumber: orders.orderNumber,
      })
      .from(deliveryHandovers)
      .leftJoin(orders, eq(deliveryHandovers.orderId, orders.id))
      .where(
        and(
          eq(deliveryHandovers.tenantId, tenantId),
          eq(deliveryHandovers.customerId, customerRow.id),
        ),
      )
      .orderBy(desc(deliveryHandovers.createdAt))
      .catch(() => [] as any[]);

    // 10. Fetch Service Cases
    const serviceCasesPromise = db
      .select({
        id: serviceCases.id,
        tenantId: serviceCases.tenantId,
        caseNumber: serviceCases.caseNumber,
        customerId: serviceCases.customerId,
        projectId: serviceCases.projectId,
        orderId: serviceCases.orderId,
        remakeId: serviceCases.remakeId,
        deliveryId: serviceCases.deliveryId,
        taskId: serviceCases.taskId,
        type: serviceCases.type,
        priority: serviceCases.priority,
        status: serviceCases.status,
        title: serviceCases.title,
        description: serviceCases.description,
        assignedTo: serviceCases.assignedTo,
        dueDate: serviceCases.dueDate,
        resolution: serviceCases.resolution,
        resolvedAt: serviceCases.resolvedAt,
        closedAt: serviceCases.closedAt,
        createdBy: serviceCases.createdBy,
        createdAt: serviceCases.createdAt,
        updatedAt: serviceCases.updatedAt,
        customerName: customers.name,
        customerPhone: customers.phone,
        orderNumber: orders.orderNumber,
        projectTitle: opportunities.title,
        assignedToName: appUsers.displayName,
        remakeNumber: remakes.remakeNumber,
        deliveryNumber: deliveryHandovers.deliveryNumber,
        taskCode: tasks.taskCode,
      })
      .from(serviceCases)
      .leftJoin(customers, eq(serviceCases.customerId, customers.id))
      .leftJoin(orders, eq(serviceCases.orderId, orders.id))
      .leftJoin(opportunities, eq(serviceCases.projectId, opportunities.id))
      .leftJoin(appUsers, eq(serviceCases.assignedTo, appUsers.id))
      .leftJoin(remakes, eq(serviceCases.remakeId, remakes.id))
      .leftJoin(deliveryHandovers, eq(serviceCases.deliveryId, deliveryHandovers.id))
      .leftJoin(tasks, eq(serviceCases.taskId, tasks.id))
      .where(
        and(
          eq(serviceCases.tenantId, tenantId),
          eq(serviceCases.customerId, customerRow.id),
        ),
      )
      .orderBy(desc(serviceCases.createdAt))
      .catch(() => [] as any[]);

    const [
      quoteRows,
      orderRows,
      invoiceRows,
      taskRows,
      activityRows,
      remakeRows,
      opportunityRows,
      deliveryRows,
      serviceCaseRows,
    ] = await Promise.all([
      quoteRowsPromise,
      orderRowsPromise,
      invoiceRowsPromise,
      taskRowsPromise,
      activityRowsPromise,
      remakeRowsPromise,
      opportunitiesPromise,
      deliveryRowsPromise,
      serviceCasesPromise,
    ]);

    // Format Quotes
    const formattedQuotes: CustomerQuoteItem[] = quoteRows.map((q) => {
      const progStatus = getQuotationProgressiveStatus(q);
      return {
        id: q.id,
        quoteNumber: q.quoteNumber,
        status: q.status,
        progressiveStatus: progStatus,
        statusLabelAr: QUOTATION_STAGE_LABEL_AR[progStatus] || q.status,
        total: Number(q.total || 0),
        validUntil: q.validUntil,
        opportunityId: q.opportunityId || null,
        createdAt: q.createdAt,
        orderId: q.orderId || null,
        orderNumber: q.orderNumber || null,
        snapshot: q.snapshot,
      };
    });

    // Format Orders
    const formattedOrders: CustomerOrderItem[] = orderRows.map((o) => {
      const orderTotal = Number(o.total || 0);
      const paid = Number(o.invoicePaidAmount || o.deposit || 0);
      const balance = Math.max(0, orderTotal - paid);

      return {
        id: o.id,
        orderNumber: o.orderNumber,
        quoteId: o.quoteId || null,
        quoteNumber: o.quoteNumber || null,
        opportunityId: o.opportunityId || null,
        currentStage: o.currentStage,
        total: orderTotal,
        deposit: Number(o.deposit || 0),
        paidAmount: paid,
        balanceDue: balance,
        contractDate: o.contractDate,
        expectedDelivery: o.expectedDelivery || null,
        deliveredAt: o.deliveredAt || null,
        notes: o.notes || null,
        createdAt: o.createdAt,
      };
    });

    // Format Service Cases
    const formattedCases: ServiceCaseItem[] = (serviceCaseRows || []).map((c: any) => ({
      id: c.id,
      tenantId: c.tenantId,
      caseNumber: c.caseNumber,
      customerId: c.customerId,
      customerName: c.customerName || customerRow.name,
      customerPhone: c.customerPhone || customerRow.phone || null,
      projectId: c.projectId,
      projectTitle: c.projectTitle,
      orderId: c.orderId,
      orderNumber: c.orderNumber,
      remakeId: c.remakeId,
      remakeNumber: c.remakeNumber,
      deliveryId: c.deliveryId,
      deliveryNumber: c.deliveryNumber,
      taskId: c.taskId,
      taskCode: c.taskCode,
      type: c.type,
      priority: c.priority,
      status: c.status,
      title: c.title,
      description: c.description,
      assignedTo: c.assignedTo,
      assignedToName: c.assignedToName,
      dueDate: c.dueDate ? (typeof c.dueDate === "string" ? c.dueDate.slice(0, 10) : new Date(c.dueDate).toISOString().slice(0, 10)) : null,
      resolution: c.resolution,
      resolvedAt: c.resolvedAt ? (typeof c.resolvedAt === "string" ? c.resolvedAt : new Date(c.resolvedAt).toISOString()) : null,
      closedAt: c.closedAt ? (typeof c.closedAt === "string" ? c.closedAt : new Date(c.closedAt).toISOString()) : null,
      createdBy: c.createdBy,
      createdAt: typeof c.createdAt === "string" ? c.createdAt : new Date(c.createdAt).toISOString(),
      updatedAt: typeof c.updatedAt === "string" ? c.updatedAt : new Date(c.updatedAt).toISOString(),
    }));

    // 10. Fetch Production Work Orders for Customer's Orders
    const orderIds = orderRows.map((o) => o.id);
    let workOrderRows: any[] = [];
    if (orderIds.length > 0) {
      workOrderRows = await db
        .select({
          id: productionWorkOrders.id,
          tenantId: productionWorkOrders.tenantId,
          workOrderNumber: productionWorkOrders.workOrderNumber,
          orderId: productionWorkOrders.orderId,
          remakeId: productionWorkOrders.remakeId,
          status: productionWorkOrders.status,
          priority: productionWorkOrders.priority,
          notes: productionWorkOrders.notes,
          scheduledDate: productionWorkOrders.scheduledDate,
          startedAt: productionWorkOrders.startedAt,
          completedAt: productionWorkOrders.completedAt,
          createdBy: productionWorkOrders.createdBy,
          createdAt: productionWorkOrders.createdAt,
          updatedAt: productionWorkOrders.updatedAt,
          orderNumber: orders.orderNumber,
        })
        .from(productionWorkOrders)
        .leftJoin(orders, eq(productionWorkOrders.orderId, orders.id))
        .where(
          and(
            eq(productionWorkOrders.tenantId, tenantId),
            inArray(productionWorkOrders.orderId, orderIds),
          ),
        )
        .orderBy(desc(productionWorkOrders.createdAt))
        .catch(() => [] as any[]);
    }

    const formattedWorkOrders: ProductionWorkOrder[] = workOrderRows.map((w: any) => ({
      id: w.id,
      tenantId: w.tenantId,
      workOrderNumber: w.workOrderNumber,
      orderId: w.orderId,
      orderNumber: w.orderNumber || "—",
      customerId: customerRow.id,
      customerName: customerRow.name,
      customerPhone: customerRow.phone || null,
      remakeId: w.remakeId,
      status: w.status as any,
      priority: w.priority as any,
      currentStage: w.status,
      materialReadiness: "available" as any,
      notes: w.notes,
      scheduledDate: w.scheduledDate,
      startedAt: w.startedAt,
      completedAt: w.completedAt,
      createdBy: w.createdBy,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    }));

    // Format Deliveries
    const formattedDeliveries: DeliveryHandover[] = deliveryRows.map((d: any) => ({
      id: d.id,
      tenantId: d.tenantId,
      deliveryNumber: d.deliveryNumber,
      orderId: d.orderId,
      orderNumber: d.orderNumber || "—",
      customerId: d.customerId,
      customerName: customerRow.name,
      customerPhone: customerRow.phone || "",
      status: d.status as any,
      deliveryAddress: d.deliveryAddress,
      recipientName: d.recipientName,
      recipientPhone: d.recipientPhone,
      scheduledDate: d.scheduledDate,
      dispatchedAt: d.dispatchedAt,
      deliveredAt: d.deliveredAt,
      installationRequired: !!d.installationRequired,
      installedAt: d.installedAt,
      installerName: d.installerName,
      installerNotes: d.installerNotes,
      handedOverAt: d.handedOverAt,
      signerName: d.signerName,
      customerNotes: d.customerNotes,
      handoverNotes: d.handoverNotes,
      signatureDataUrl: d.signatureDataUrl,
      createdBy: d.createdBy,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));

    // Format Invoices with Payments
    const invoiceIds = invoiceRows.map((i) => i.id);
    let paymentRows: any[] = [];
    if (invoiceIds.length > 0) {
      paymentRows = await db
        .select()
        .from(invoicePayments)
        .where(
          and(
            eq(invoicePayments.tenantId, tenantId),
            inArray(invoicePayments.invoiceId, invoiceIds),
          ),
        )
        .orderBy(desc(invoicePayments.paidAt));
    }

    const paymentsByInvoice: Record<string, any[]> = {};
    for (const p of paymentRows) {
      (paymentsByInvoice[p.invoiceId] ||= []).push(p);
    }

    const formattedInvoices: InvoiceItem[] = invoiceRows.map((inv) => {
      const totalNum = Number(inv.total || 0);
      const payments = paymentsByInvoice[inv.id] || [];
      const sumPayments = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
      const paidNum = Math.max(Number(inv.paidAmount || 0), sumPayments);
      const balanceDue = Math.max(0, totalNum - paidNum);
      const status = computeInvoiceStatus(totalNum, paidNum, inv.issuedAt);

      return {
        id: inv.id,
        tenantId: inv.tenantId,
        invoiceNumber: inv.invoiceNumber,
        quoteId: inv.quoteId,
        orderId: inv.orderId || null,
        customerId: inv.customerId,
        customerName: customerRow.name,
        customerPhone: customerRow.phone || null,
        orderNumber: inv.orderNumber || null,
        quoteNumber: inv.quoteNumber || null,
        total: totalNum,
        depositAmount: Number(inv.depositAmount || 0),
        paidAmount: paidNum,
        balanceDue,
        status,
        issuedAt: inv.issuedAt,
        paidAt: inv.paidAt,
        paymentCount: payments.length,
        payments: payments.map((p) => ({
          id: p.id,
          invoiceId: p.invoiceId,
          paymentNumber: p.paymentNumber,
          amount: Number(p.amount),
          paymentMethod: p.paymentMethod,
          referenceNumber: p.referenceNumber,
          notes: p.notes,
          recordedBy: p.recordedBy,
          paidAt: p.paidAt,
          createdAt: p.createdAt,
        })),
      };
    });

    // Format Tasks
    const taskIds = taskRows.map((t) => t.id);
    let assigneeRows: any[] = [];
    if (taskIds.length > 0) {
      assigneeRows = await db
        .select({
          taskId: taskAssignees.taskId,
          userId: taskAssignees.userId,
          assignedAt: taskAssignees.assignedAt,
          memberRole: tenantMembers.role,
        })
        .from(taskAssignees)
        .leftJoin(
          tenantMembers,
          and(
            eq(taskAssignees.userId, tenantMembers.userId),
            eq(taskAssignees.tenantId, tenantMembers.tenantId),
          ),
        )
        .where(
          and(
            eq(taskAssignees.tenantId, tenantId),
            inArray(taskAssignees.taskId, taskIds),
          ),
        );
    }

    const assigneesByTask: Record<string, typeof assigneeRows> = {};
    for (const a of assigneeRows) {
      (assigneesByTask[a.taskId] ||= []).push(a);
    }

    const formattedTasks: TaskItem[] = taskRows.map((t) => ({
      id: t.id,
      tenantId: t.tenantId,
      taskCode: t.taskCode,
      title: t.title,
      description: t.description,
      status: t.status as TaskStatus,
      priority: t.priority as any,
      category: t.category,
      dueDate: t.dueDate,
      completedAt: t.completedAt,
      createdBy: t.createdBy,
      customerId: t.customerId,
      opportunityId: t.opportunityId || null,
      quoteId: t.quoteId,
      orderId: t.orderId,
      productionStage: t.productionStage,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      customerName: customerRow.name,
      quoteNumber: t.quoteNumber,
      orderNumber: t.orderNumber,
      isOverdue: computeIsOverdue(t.status as TaskStatus, t.dueDate),
      assignees: assigneesByTask[t.id] ?? [],
    }));

    // Format Remakes / Quality
    const formattedRemakes: RemakeListItem[] = remakeRows.map((r) => ({
      id: r.id,
      remakeNumber: r.remakeNumber,
      orderId: r.orderId,
      orderNumber: r.orderNumber || "—",
      customerId: r.customerId,
      customerName: customerRow.name,
      customerPhone: customerRow.phone || null,
      type: r.type as any,
      severity: r.severity as any,
      status: r.status as any,
      reason: r.reason,
      defectDescription: r.defectDescription,
      resolution: r.resolution,
      assignedTo: r.assignedTo,
      dueDate: r.dueDate,
      resolvedAt: r.resolvedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    // Format Opportunities
    const formattedOpportunities = opportunityRows.map((o: any) => ({
      id: o.id,
      tenantId: o.tenantId,
      opportunityNumber: o.opportunityNumber,
      customerId: o.customerId,
      customerName: customerRow.name,
      customerPhone: customerRow.phone || null,
      customerEmail: customerRow.email || null,
      leadId: o.leadId,
      title: o.title,
      projectType: o.projectType,
      value: Number(o.value || 0),
      salesOwner: o.salesOwner,
      salesOwnerName: o.salesOwnerName || null,
      stage: o.stage,
      source: o.source,
      expectedCloseDate: o.expectedCloseDate,
      nextAction: o.nextAction,
      nextActionDate: o.nextActionDate ? o.nextActionDate.toISOString() : null,
      siteAddress: o.siteAddress,
      notes: o.notes,
      status: o.status,
      lostReason: o.lostReason,
      createdAt: o.createdAt ? o.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: o.updatedAt ? o.updatedAt.toISOString() : new Date().toISOString(),
    }));

    // Assemble Project-Centric View (Customer → Projects / Opportunities → Quotes → Orders → Production → Delivery → After-Sales)
    const assignedQuoteIds = new Set<string>();
    const assignedOrderIds = new Set<string>();

    const projects: CustomerProjectItem[] = formattedOpportunities.map((opp) => {
      const oppQuotes = formattedQuotes.filter((q) => q.opportunityId === opp.id);
      for (const q of oppQuotes) assignedQuoteIds.add(q.id);

      const oppQuoteIdSet = new Set(oppQuotes.map((q) => q.id));
      const oppOrders = formattedOrders.filter(
        (o) => (o.quoteId && oppQuoteIdSet.has(o.quoteId)) || o.opportunityId === opp.id,
      );
      for (const o of oppOrders) assignedOrderIds.add(o.id);

      const oppOrderIdSet = new Set(oppOrders.map((o) => o.id));
      const oppWorkOrders = formattedWorkOrders.filter((w) => oppOrderIdSet.has(w.orderId));
      const oppDeliveries = formattedDeliveries.filter((d) => oppOrderIdSet.has(d.orderId));
      const oppRemakes = formattedRemakes.filter((r) => oppOrderIdSet.has(r.orderId));
      const oppTasks = formattedTasks.filter(
        (t) =>
          t.opportunityId === opp.id ||
          (t.orderId && oppOrderIdSet.has(t.orderId)) ||
          (t.quoteId && oppQuoteIdSet.has(t.quoteId)),
      );

      const projValue =
        opp.value ||
        oppQuotes.reduce((s, q) => s + q.total, 0) ||
        oppOrders.reduce((s, o) => s + o.total, 0);

      let quotationStatus: string | null = null;
      if (oppQuotes.length > 0) {
        if (oppQuotes.some((q) => q.status === "accepted")) quotationStatus = "accepted";
        else if (oppQuotes.some((q) => q.status === "sent")) quotationStatus = "sent";
        else quotationStatus = oppQuotes[0].status;
      }

      let orderStatus: string | null = null;
      if (oppOrders.length > 0) {
        if (oppOrders.every((o) => o.currentStage === "completed")) orderStatus = "completed";
        else orderStatus = oppOrders[0].currentStage;
      }

      let productionStatus: string | null = null;
      if (oppWorkOrders.length > 0) {
        productionStatus = oppWorkOrders[0].status;
      } else if (orderStatus) {
        productionStatus = orderStatus;
      }

      let deliveryStatus: string | null = null;
      if (oppDeliveries.length > 0) {
        deliveryStatus = oppDeliveries[0].status;
      } else if (oppOrders.some((o) => o.deliveredAt)) {
        deliveryStatus = "delivered";
      }

      const projInvoiced = oppOrders.reduce((s, o) => s + o.total, 0);
      const projPaid = oppOrders.reduce((s, o) => s + o.paidAmount, 0);
      const outstandingBalance = Math.max(0, projInvoiced - projPaid);

      const openTasksCount = oppTasks.filter(
        (t) => t.status !== "completed" && t.status !== "cancelled",
      ).length;

      return {
        id: opp.id,
        opportunityNumber: opp.opportunityNumber,
        title: opp.title,
        projectType: opp.projectType || "residential",
        value: projValue,
        stage: opp.stage,
        status: opp.status,
        salesOwner: opp.salesOwner || null,
        salesOwnerName: opp.salesOwnerName || null,
        quotationStatus,
        orderStatus,
        productionStatus,
        deliveryStatus,
        outstandingBalance,
        openTasksCount,
        qualityCasesCount: oppRemakes.length,
        nextAction: opp.nextAction || null,
        nextActionDate: opp.nextActionDate || null,
        quotesCount: oppQuotes.length,
        ordersCount: oppOrders.length,
        quotes: oppQuotes,
        orders: oppOrders,
        workOrders: oppWorkOrders,
        deliveries: oppDeliveries,
        tasks: oppTasks,
        remakes: oppRemakes,
      };
    });

    // Capture any legacy or unlinked quotes/orders under a direct operations project
    const unassignedQuotes = formattedQuotes.filter((q) => !assignedQuoteIds.has(q.id));
    const unassignedOrders = formattedOrders.filter((o) => !assignedOrderIds.has(o.id));

    if (unassignedQuotes.length > 0 || unassignedOrders.length > 0) {
      const unassignedOrderIdSet = new Set(unassignedOrders.map((o) => o.id));
      const unassignedWorkOrders = formattedWorkOrders.filter((w) => unassignedOrderIdSet.has(w.orderId));
      const unassignedDeliveries = formattedDeliveries.filter((d) => unassignedOrderIdSet.has(d.orderId));
      const unassignedRemakes = formattedRemakes.filter((r) => unassignedOrderIdSet.has(r.orderId));
      const unassignedQuoteIdSet = new Set(unassignedQuotes.map((q) => q.id));
      const unassignedTasks = formattedTasks.filter(
        (t) =>
          !t.opportunityId &&
          ((t.orderId && unassignedOrderIdSet.has(t.orderId)) ||
           (t.quoteId && unassignedQuoteIdSet.has(t.quoteId))),
      );

      const directValue =
        unassignedQuotes.reduce((s, q) => s + q.total, 0) ||
        unassignedOrders.reduce((s, o) => s + o.total, 0);

      const directInvoiced = unassignedOrders.reduce((s, o) => s + o.total, 0);
      const directPaid = unassignedOrders.reduce((s, o) => s + o.paidAmount, 0);

      projects.push({
        id: "direct-operations",
        opportunityNumber: "DIR-001",
        title: "تعاملات ومقايسات مباشرة",
        projectType: "direct",
        value: directValue,
        stage: unassignedOrders.length > 0 ? "in_production" : "quotation",
        status: "open",
        salesOwner: null,
        salesOwnerName: null,
        quotationStatus: unassignedQuotes[0]?.status || null,
        orderStatus: unassignedOrders[0]?.currentStage || null,
        productionStatus: unassignedWorkOrders[0]?.status || unassignedOrders[0]?.currentStage || null,
        deliveryStatus: unassignedDeliveries[0]?.status || (unassignedOrders.some((o) => o.deliveredAt) ? "delivered" : null),
        outstandingBalance: Math.max(0, directInvoiced - directPaid),
        openTasksCount: unassignedTasks.filter((t) => t.status !== "completed" && t.status !== "cancelled").length,
        qualityCasesCount: unassignedRemakes.length,
        nextAction: null,
        nextActionDate: null,
        quotesCount: unassignedQuotes.length,
        ordersCount: unassignedOrders.length,
        quotes: unassignedQuotes,
        orders: unassignedOrders,
        workOrders: unassignedWorkOrders,
        deliveries: unassignedDeliveries,
        tasks: unassignedTasks,
        remakes: unassignedRemakes,
      });
    }

    // Financial View & Payment Ledger
    const totalInvoiced = formattedInvoices.reduce((s, i) => s + i.total, 0);
    const totalCollected = formattedInvoices.reduce((s, i) => s + i.paidAmount, 0);
    const outstandingBalance = Math.max(0, totalInvoiced - totalCollected);
    const openInvoices = formattedInvoices.filter((i) => i.balanceDue > 0 || i.status !== "paid");

    const recentPayments: CustomerPaymentRecord[] = paymentRows.map((p) => {
      const inv = formattedInvoices.find((i) => i.id === p.invoiceId);
      return {
        id: p.id,
        invoiceId: p.invoiceId,
        invoiceNumber: inv?.invoiceNumber || "—",
        paymentNumber: p.paymentNumber,
        amount: Number(p.amount || 0),
        paymentMethod: p.paymentMethod,
        referenceNumber: p.referenceNumber || null,
        notes: p.notes || null,
        paidAt: p.paidAt,
      };
    });

    const financials: CustomerFinancials = {
      totalInvoiced,
      totalCollected,
      outstandingBalance,
      openInvoicesCount: openInvoices.length,
      openInvoices,
      recentPayments,
    };

    // Role-based security check for financials:
    // Unauthorized roles (such as shop-floor workers) do not see sensitive financial margins or figures
    const callerRole = (ctx as any).role || (context as any).memberRole;
    if (callerRole === "worker") {
      financials.totalInvoiced = 0;
      financials.totalCollected = 0;
      financials.outstandingBalance = 0;
      financials.openInvoices = [];
      financials.recentPayments = [];
      for (const p of projects) {
        p.value = 0;
        p.outstandingBalance = 0;
      }
      for (const q of formattedQuotes) {
        q.total = 0;
      }
      for (const o of formattedOrders) {
        o.total = 0;
        o.deposit = 0;
        o.paidAmount = 0;
        o.balanceDue = 0;
      }
    }

    // Unified Chronological Activity Timeline
    const timelineItems: CustomerActivityItem[] = [];

    // 1. Customer intake
    timelineItems.push({
      id: `act-cust-${customerRow.id}`,
      entityType: "customer",
      action: "customer_created",
      title: "تسجيل العميل",
      description: `تم تسجيل العميل ${customerRow.name} في النظام`,
      timestamp: customerRow.createdAt,
    });

    // 2. Opportunities
    for (const opp of formattedOpportunities) {
      timelineItems.push({
        id: `act-opp-${opp.id}`,
        entityType: "opportunity",
        entityId: opp.id,
        action: "opportunity_created",
        title: "إنشاء صفقة / مشروع",
        description: `${opp.opportunityNumber}: ${opp.title} (${opp.stage})`,
        timestamp: opp.createdAt,
        status: opp.stage,
      });
    }

    // 3. Quotes & Progressive Lifecycle Events
    for (const q of formattedQuotes) {
      const snap = ((q.snapshot as any) || {}) as Record<string, any>;
      const lifecycle = (snap.lifecycle || {}) as Record<string, any>;

      timelineItems.push({
        id: `act-q-${q.id}`,
        entityType: "quote",
        entityId: q.id,
        action: "quote_created",
        title: "عرض سعر جديد",
        description: `عرض سعر ${q.quoteNumber} بقيمة ${Math.round(q.total).toLocaleString()} ج.م (${q.statusLabelAr || q.status})`,
        timestamp: q.createdAt,
        status: q.status,
      });

      if (lifecycle.approved_at) {
        timelineItems.push({
          id: `act-q-appr-${q.id}`,
          entityType: "quote",
          entityId: q.id,
          action: "quote_approved",
          title: "اعتماد داخلي وطلب تأكيد العميل",
          description: `تم اعتماد عرض السعر ${q.quoteNumber} وإرسال طلب التأكيد للعميل عبر واتساب`,
          timestamp: lifecycle.approved_at,
          status: "awaiting_customer_confirmation",
        });
      }

      if (lifecycle.consented_at) {
        timelineItems.push({
          id: `act-q-consent-${q.id}`,
          entityType: "quote",
          entityId: q.id,
          action: "quote_consent_received",
          title: "موافقة العميل على استلام العرض",
          description: `وافق العميل على استلام ملف عرض السعر ${q.quoteNumber} عبر واتساب`,
          timestamp: lifecycle.consented_at,
          status: "approved_for_delivery",
        });
      }

      if (lifecycle.pdf_sent_at) {
        timelineItems.push({
          id: `act-q-pdf-${q.id}`,
          entityType: "quote",
          entityId: q.id,
          action: "quote_pdf_sent",
          title: "إرسال رابط ملف العرض",
          description: `تم تسليم رابط التتبع ومستند PDF لعرض السعر ${q.quoteNumber}`,
          timestamp: lifecycle.pdf_sent_at,
          status: "pdf_sent",
        });
      }

      if (lifecycle.decision_at) {
        const decLabel =
          lifecycle.decision === "accepted"
            ? "قبول واعتماد عرض السعر"
            : lifecycle.decision === "revision_requested"
            ? "طلب تعديل عرض السعر"
            : "رفض عرض السعر";
        timelineItems.push({
          id: `act-q-dec-${q.id}`,
          entityType: "quote",
          entityId: q.id,
          action: `quote_decision_${lifecycle.decision}`,
          title: `قرار العميل: ${decLabel}`,
          description: lifecycle.decision_notes
            ? `قرار العميل بخصوص ${q.quoteNumber}: ${lifecycle.decision_notes}`
            : `تم تسجيل ${decLabel} لعرض السعر ${q.quoteNumber}`,
          timestamp: lifecycle.decision_at,
          status: lifecycle.decision,
        });
      }
    }

    // 4. Orders
    for (const o of formattedOrders) {
      timelineItems.push({
        id: `act-ord-${o.id}`,
        entityType: "order",
        entityId: o.id,
        action: "order_created",
        title: "بدء أمر إنتاج",
        description: `أمر تصنيع ${o.orderNumber} بقيمة ${Math.round(o.total).toLocaleString()} ج.م - مرحلة: ${o.currentStage}`,
        timestamp: o.contractDate || o.createdAt,
        status: o.currentStage,
      });
    }

    // 5. Payments
    for (const pay of recentPayments) {
      timelineItems.push({
        id: `act-pay-${pay.id}`,
        entityType: "payment",
        entityId: pay.id,
        action: "payment_recorded",
        title: "تحصيل دفعة مالية",
        description: `سداد ${Math.round(pay.amount).toLocaleString()} ج.م (${pay.paymentMethod}) برقم ${pay.paymentNumber}`,
        timestamp: pay.paidAt,
      });
    }

    // 6. Work Orders (Production)
    for (const wo of formattedWorkOrders) {
      timelineItems.push({
        id: `act-wo-${wo.id}`,
        entityType: "qc",
        entityId: wo.id,
        action: "work_order_created",
        title: "أمر تشغيل ورشة",
        description: `${wo.workOrderNumber} للأمر ${wo.orderNumber} (${wo.status})`,
        timestamp: wo.createdAt,
        status: wo.status,
      });
    }

    // 7. Deliveries & Handovers
    for (const d of formattedDeliveries) {
      timelineItems.push({
        id: `act-del-${d.id}`,
        entityType: d.handedOverAt ? "handover" : "delivery",
        entityId: d.id,
        action: d.handedOverAt ? "handover_completed" : "delivery_scheduled",
        title: d.handedOverAt ? "تسليم واستلام نهائي" : "جدولة شحن وتوصيل",
        description: `${d.deliveryNumber}: ${d.deliveryAddress || "موقع العميل"} (${d.status})`,
        timestamp: d.deliveredAt || d.handedOverAt || d.createdAt,
        status: d.status,
      });
    }

    // 8. Remakes & Warranty Cases
    for (const r of formattedRemakes) {
      timelineItems.push({
        id: `act-rem-${r.id}`,
        entityType: r.type === "warranty" ? "warranty" : "remake",
        entityId: r.id,
        action: "remake_logged",
        title: r.type === "warranty" ? "مطالبة ضمان" : "إعادة تصنيع / عيب جودة",
        description: `${r.remakeNumber}: ${r.reason || r.defectDescription || "بلا تفاصيل"} (${r.status})`,
        timestamp: r.createdAt,
        status: r.status,
      });
    }

    // 9. Tasks
    for (const t of formattedTasks) {
      timelineItems.push({
        id: `act-tsk-${t.id}`,
        entityType: "task",
        entityId: t.id,
        action: "task_created",
        title: "مهمة عمل",
        description: `${t.taskCode}: ${t.title} (${t.status})`,
        timestamp: t.createdAt,
        status: t.status,
      });
    }

    // 10. Audit Log Events (Deduplicated)
    for (const act of activityRows) {
      const details = (act.details || {}) as any;
      timelineItems.push({
        id: act.id,
        entityType: (act.entityType as any) || "customer",
        entityId: act.entityId,
        action: act.action,
        title: act.action.replace(/_/g, " "),
        description: details.description || details.message || act.action,
        timestamp: act.createdAt,
      });
    }

    // 11. Service Cases (Timeline)
    for (const sc of formattedCases) {
      timelineItems.push({
        id: `act-case-${sc.id}`,
        entityType: sc.type === "warranty" ? "warranty" : "customer",
        entityId: sc.id,
        action: "service_case_logged",
        title: `بلاغ خدمة: ${sc.caseNumber} (${sc.type})`,
        description: `${sc.title} (${sc.status})`,
        timestamp: sc.createdAt,
        status: sc.status,
      });
    }

    // Sort descending by timestamp and bound to 50 items for optimal performance
    timelineItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const boundedTimeline = timelineItems.slice(0, 50);

    const activeOrderCount = formattedOrders.filter((o) => o.currentStage !== "completed").length;

    const customerSummary: CustomerListItem = {
      id: customerRow.id,
      name: customerRow.name,
      phone: customerRow.phone || null,
      email: customerRow.email || null,
      address: customerRow.address || null,
      governorate: customerRow.governorate || null,
      createdAt: customerRow.createdAt,
      quoteCount: formattedQuotes.length,
      activeOrderCount,
      totalInvoiced: financials.totalInvoiced,
      totalPaid: financials.totalCollected,
      outstandingBalance: financials.outstandingBalance,
    };

    // 12. Compute Warranties for each customer order
    const warranties: CustomerWarrantyStatus[] = formattedOrders.map((o) => {
      const matchDel = formattedDeliveries.find((d) => d.orderId === o.id);
      return calculateWarrantyStatus(o, matchDel);
    });

    // 13. Recent Delivery & Recent Handover
    const recentDelivery = formattedDeliveries.length > 0 ? formattedDeliveries[0] : null;
    const recentHandover =
      formattedDeliveries.find((d) => d.handedOverAt || d.status === "completed") || null;

    // 14. Check if customer has completed historical projects (Repeat Business qualification)
    const hasCompletedProjects =
      formattedOrders.some((o) => o.currentStage === "completed") ||
      formattedDeliveries.some((d) => d.status === "completed" || d.handedOverAt !== null) ||
      formattedOpportunities.some((opp) => opp.stage === "won" || opp.stage === "closed_won");

    // 15. After-Sales Summary
    const openCasesCount = formattedCases.filter(
      (c) => c.status !== "closed" && c.status !== "resolved",
    ).length;
    const resolvedCasesCount = formattedCases.filter(
      (c) => c.status === "resolved" || c.status === "closed",
    ).length;
    const remakesCount = formattedRemakes.length;
    const complaintsCount =
      formattedCases.filter((c) => c.type === "complaint").length +
      formattedRemakes.filter((r) => r.type === "customer_complaint").length;

    const afterSales: CustomerAfterSalesSummary = {
      openCasesCount,
      resolvedCasesCount,
      remakesCount,
      complaintsCount,
      cases: formattedCases,
      warranties,
      recentDelivery,
      recentHandover,
    };

    return {
      customer: customerSummary,
      projects,
      opportunities: formattedOpportunities,
      quotes: formattedQuotes,
      orders: formattedOrders,
      invoices: formattedInvoices,
      financials,
      tasks: formattedTasks,
      workOrders: formattedWorkOrders,
      deliveries: formattedDeliveries,
      remakes: formattedRemakes,
      activities: boundedTimeline,
      afterSales,
      hasCompletedProjects,
    };
  });

/**
 * Upsert customer with tenant scoping.
 */
export const upsertCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => UpsertCustomerInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { userId, tenantId, role } = ctx;

    if (role === "worker" || role === "viewer") {
      throw new Error("Forbidden: insufficient permissions to manage customers");
    }

    if (data.id) {
      // Update
      const [updated] = await db
        .update(customers)
        .set({
          name: data.name,
          phone: data.phone || null,
          email: data.email || null,
          address: data.address || null,
          governorate: data.governorate || null,
        })
        .where(and(eq(customers.id, data.id), eq(customers.tenantId, tenantId)))
        .returning();

      return { customer: updated };
    } else {
      // Create
      const [inserted] = await db
        .insert(customers)
        .values({
          tenantId,
          name: data.name,
          phone: data.phone || null,
          email: data.email || null,
          address: data.address || null,
          governorate: data.governorate || null,
        })
        .returning();

      // Audit log
      await db.insert(auditLog).values({
        tenantId,
        actorId: userId,
        entityType: "customer",
        entityId: inserted.id,
        action: "customer_created",
        details: {
          name: inserted.name,
          phone: inserted.phone,
        },
      });

      return { customer: inserted };
    }
  });

/**
 * Delete customer.
 */
export const deleteCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => DeleteCustomerInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, role } = ctx;

    if (role === "worker" || role === "viewer") {
      throw new Error("Forbidden: insufficient permissions to delete customers");
    }

    // Check if customer has active orders
    const [existingOrder] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.customerId, data.customerId), eq(orders.tenantId, tenantId)))
      .limit(1);

    if (existingOrder) {
      throw new Error("Cannot delete customer with existing orders");
    }

    await db
      .delete(customers)
      .where(and(eq(customers.id, data.customerId), eq(customers.tenantId, tenantId)));

    return { ok: true };
  });
