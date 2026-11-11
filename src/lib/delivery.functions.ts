import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { db } from "@/db/client.server";
import {
  deliveryHandovers,
  orders,
  customers,
  invoices,
  invoicePayments,
  tenantCounters,
  auditLog,
} from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { type TenantContext, forbidWorker } from "@/lib/tenant-context";
import {
  type DeliveryHandover,
  type DeliveryStatus,
  type PaginatedDeliveryResult,
  type DeliveryKpis,
  isValidDeliveryTransition,
} from "@/lib/delivery-types";

// ── Validation Schemas ──────────────────────────────────────────────────────

const ListDeliveriesInput = z
  .object({
    search: z.string().optional(),
    status: z.string().optional().default("all"),
    installationRequired: z.boolean().optional(),
    orderId: z.string().uuid().optional(),
    sort: z
      .enum(["newest", "del_asc", "scheduled_asc", "order_asc"])
      .optional()
      .default("newest"),
    page: z.number().int().min(1).optional().default(1),
    pageSize: z.number().int().min(1).max(100).optional().default(25),
  })
  .optional()
  .default({});

const GetDeliveryInput = z.object({
  deliveryId: z.string().uuid(),
});

const CreateDeliveryInput = z.object({
  orderId: z.string().uuid(),
  deliveryAddress: z.string().trim().min(1, "Delivery address is required"),
  recipientName: z.string().trim().optional().nullable(),
  recipientPhone: z.string().trim().optional().nullable(),
  scheduledDate: z.string().optional().nullable(),
  installationRequired: z.boolean().optional().default(false),
  customerNotes: z.string().trim().optional().nullable(),
});

const UpdateDeliveryStatusInput = z.object({
  deliveryId: z.string().uuid(),
  status: z.enum([
    "ready_for_dispatch",
    "dispatched",
    "out_for_delivery",
    "delivered",
    "installation_pending",
    "installed",
    "handover_pending",
    "completed",
    "delivery_failed",
    "cancelled",
  ]),
  recipientName: z.string().trim().optional().nullable(),
  recipientPhone: z.string().trim().optional().nullable(),
  installerName: z.string().trim().optional().nullable(),
  installerNotes: z.string().trim().optional().nullable(),
  signerName: z.string().trim().optional().nullable(),
  customerNotes: z.string().trim().optional().nullable(),
  handoverNotes: z.string().trim().optional().nullable(),
  signatureDataUrl: z.string().optional().nullable(),
});

// ── Helper: Atomic Concurrency-Safe Sequence Number ─────────────────────────

async function getNextDeliveryNumber(tenantId: string): Promise<string> {
  const result = await db.transaction(async (tx) => {
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

// ── Server Functions ────────────────────────────────────────────────────────

/**
 * List paginated deliveries with search, filters, and KPI metrics.
 */
export const listDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => ListDeliveriesInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<PaginatedDeliveryResult> => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Delivery Management");
    const { tenantId } = ctx;

    const conditions = [eq(deliveryHandovers.tenantId, tenantId)];

    if (data.status && data.status !== "all") {
      conditions.push(eq(deliveryHandovers.status, data.status));
    }

    if (data.installationRequired !== undefined) {
      conditions.push(eq(deliveryHandovers.installationRequired, data.installationRequired));
    }

    if (data.orderId) {
      conditions.push(eq(deliveryHandovers.orderId, data.orderId));
    }

    if (data.search && data.search.trim().length > 0) {
      const q = `%${data.search.trim()}%`;
      conditions.push(
        sql`(${deliveryHandovers.deliveryNumber} ILIKE ${q} OR ${orders.orderNumber} ILIKE ${q} OR ${customers.name} ILIKE ${q} OR ${customers.phone} ILIKE ${q} OR ${deliveryHandovers.deliveryAddress} ILIKE ${q})`,
      );
    }

    const page = Math.max(1, data.page || 1);
    const pageSize = Math.min(100, Math.max(1, data.pageSize || 25));
    const offset = (page - 1) * pageSize;

    let orderByClause = desc(deliveryHandovers.createdAt);
    if (data.sort === "del_asc") {
      orderByClause = sql`${deliveryHandovers.deliveryNumber} ASC`;
    } else if (data.sort === "scheduled_asc") {
      orderByClause = sql`${deliveryHandovers.scheduledDate} ASC NULLS LAST`;
    } else if (data.sort === "order_asc") {
      orderByClause = sql`${orders.orderNumber} ASC`;
    }

    // 1. KPI Counts
    const allTenantDeliveries = await db
      .select({
        status: deliveryHandovers.status,
      })
      .from(deliveryHandovers)
      .where(eq(deliveryHandovers.tenantId, tenantId));

    let readyForDispatch = 0;
    let dispatched = 0;
    let outForDelivery = 0;
    let installationPending = 0;
    let handoverPending = 0;
    let completed = 0;

    for (const d of allTenantDeliveries) {
      if (d.status === "ready_for_dispatch") readyForDispatch++;
      if (d.status === "dispatched") dispatched++;
      if (d.status === "out_for_delivery") outForDelivery++;
      if (d.status === "installation_pending") installationPending++;
      if (d.status === "handover_pending") handoverPending++;
      if (d.status === "completed") completed++;
    }

    const kpis: DeliveryKpis = {
      totalDeliveries: allTenantDeliveries.length,
      readyForDispatch,
      dispatched,
      outForDelivery,
      installationPending,
      handoverPending,
      completed,
    };

    // 2. Filtered Count
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(deliveryHandovers)
      .leftJoin(orders, eq(deliveryHandovers.orderId, orders.id))
      .leftJoin(customers, eq(deliveryHandovers.customerId, customers.id))
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
        id: deliveryHandovers.id,
        tenantId: deliveryHandovers.tenantId,
        deliveryNumber: deliveryHandovers.deliveryNumber,
        orderId: deliveryHandovers.orderId,
        orderNumber: orders.orderNumber,
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
      .where(and(...conditions))
      .orderBy(orderByClause)
      .limit(pageSize)
      .offset(offset);

    const rows: DeliveryHandover[] = rowsRaw.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      deliveryNumber: r.deliveryNumber,
      orderId: r.orderId,
      orderNumber: r.orderNumber || "—",
      customerId: r.customerId,
      customerName: r.customerName || "—",
      customerPhone: r.customerPhone || "—",
      status: r.status as DeliveryStatus,
      deliveryAddress: r.deliveryAddress,
      recipientName: r.recipientName,
      recipientPhone: r.recipientPhone,
      scheduledDate: r.scheduledDate,
      dispatchedAt: r.dispatchedAt,
      deliveredAt: r.deliveredAt,
      installationRequired: r.installationRequired,
      installedAt: r.installedAt,
      installerName: r.installerName,
      installerNotes: r.installerNotes,
      handedOverAt: r.handedOverAt,
      signerName: r.signerName,
      customerNotes: r.customerNotes,
      handoverNotes: r.handoverNotes,
      signatureDataUrl: r.signatureDataUrl,
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
 * Get detailed Delivery Handover record with invoice balance and evidence.
 */
export const getDeliveryById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => GetDeliveryInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Delivery Management");
    const { tenantId } = ctx;

    const [delRow] = await db
      .select({
        id: deliveryHandovers.id,
        tenantId: deliveryHandovers.tenantId,
        deliveryNumber: deliveryHandovers.deliveryNumber,
        orderId: deliveryHandovers.orderId,
        orderNumber: orders.orderNumber,
        orderTotal: orders.total,
        invoiceId: orders.invoiceId,
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
      const [inv] = await db
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

    return {
      delivery: {
        id: delRow.id,
        tenantId: delRow.tenantId,
        deliveryNumber: delRow.deliveryNumber,
        orderId: delRow.orderId,
        orderNumber: delRow.orderNumber || "—",
        customerId: delRow.customerId,
        customerName: delRow.customerName || "—",
        customerPhone: delRow.customerPhone || "—",
        status: delRow.status as DeliveryStatus,
        deliveryAddress: delRow.deliveryAddress,
        recipientName: delRow.recipientName,
        recipientPhone: delRow.recipientPhone,
        scheduledDate: delRow.scheduledDate,
        dispatchedAt: delRow.dispatchedAt,
        deliveredAt: delRow.deliveredAt,
        installationRequired: delRow.installationRequired,
        installedAt: delRow.installedAt,
        installerName: delRow.installerName,
        installerNotes: delRow.installerNotes,
        handedOverAt: delRow.handedOverAt,
        signerName: delRow.signerName,
        customerNotes: delRow.customerNotes,
        handoverNotes: delRow.handoverNotes,
        signatureDataUrl: delRow.signatureDataUrl,
        createdBy: delRow.createdBy,
        createdAt: delRow.createdAt,
        updatedAt: delRow.updatedAt,
      },
      financialSummary: {
        orderTotal: invoiceTotal,
        paidAmount,
        balanceDue,
      },
    };
  });

/**
 * Prepare a Delivery Handover for an order (Idempotent).
 */
export const createDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => CreateDeliveryInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; deliveryId: string; deliveryNumber: string }> => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Delivery Management");
    const { tenantId, userId, role } = ctx;

    if (role === "viewer") {
      throw new Error("Forbidden: viewers cannot prepare deliveries");
    }

    // Verify order exists
    const [orderRow] = await db
      .select({ id: orders.id, orderNumber: orders.orderNumber, customerId: orders.customerId })
      .from(orders)
      .where(and(eq(orders.id, data.orderId), eq(orders.tenantId, tenantId)))
      .limit(1);

    if (!orderRow) {
      throw new Error("Order not found or access denied");
    }

    // Check if delivery already exists for this order (Idempotency)
    const [existing] = await db
      .select()
      .from(deliveryHandovers)
      .where(and(eq(deliveryHandovers.orderId, data.orderId), eq(deliveryHandovers.tenantId, tenantId)))
      .limit(1);

    if (existing) {
      return {
        ok: true,
        deliveryId: existing.id,
        deliveryNumber: existing.deliveryNumber,
      };
    }

    // Generate atomic sequence number (DEL-1001, DEL-1002...)
    const deliveryNumber = await getNextDeliveryNumber(tenantId);

    const [inserted] = await db
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
        installationRequired: data.installationRequired ?? false,
        customerNotes: data.customerNotes || null,
        createdBy: userId ? (userId as any) : null,
      })
      .returning();

    await db.insert(auditLog).values({
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
  });

/**
 * Update Delivery Handover status through the strict state machine.
 */
export const updateDeliveryStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => UpdateDeliveryStatusInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Delivery Management");
    const { tenantId, userId, role } = ctx;

    if (role === "viewer") {
      throw new Error("Forbidden: viewers cannot update delivery statuses");
    }

    const [delivery] = await db
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

    // Enforce strict state machine transition
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

    await db
      .update(deliveryHandovers)
      .set(updates)
      .where(
        and(
          eq(deliveryHandovers.id, delivery.id),
          eq(deliveryHandovers.tenantId, tenantId),
        ),
      );

    await db.insert(auditLog).values({
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
  });
