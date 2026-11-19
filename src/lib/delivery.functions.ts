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
  projects,
} from "@/db/schema";
import { eq, and, desc, sql, or } from "drizzle-orm";
import { requirePermission, type TenantContext } from "@/lib/tenant-context";
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
  installationRequired: z.boolean().optional().default(true),
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

// ── Atomic Counter Generation ───────────────────────────────────────────────

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
 * List paginated delivery records with optional status, search, and ordering.
 */
export const listDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => ListDeliveriesInput.parse(input))
  .handler(async ({ data, context }): Promise<PaginatedDeliveryResult> => {
    const ctx = context.tenantContext as TenantContext;
    requirePermission(ctx, "deliveries.view");
    const { tenantId } = ctx;

    const page = data?.page || 1;
    const pageSize = data?.pageSize || 25;
    const offset = (page - 1) * pageSize;

    // Build filters
    const conditions = [eq(deliveryHandovers.tenantId, tenantId)];

    if (data?.status && data.status !== "all") {
      conditions.push(eq(deliveryHandovers.status, data.status as DeliveryStatus));
    }

    if (data?.installationRequired !== undefined) {
      conditions.push(eq(deliveryHandovers.installationRequired, data.installationRequired));
    }

    if (data?.orderId) {
      conditions.push(eq(deliveryHandovers.orderId, data.orderId));
    }

    if (data?.search && data.search.trim()) {
      const q = `%${data.search.trim()}%`;
      conditions.push(
        or(
          sql`${deliveryHandovers.deliveryNumber} ILIKE ${q}`,
          sql`${deliveryHandovers.recipientName} ILIKE ${q}`,
          sql`${deliveryHandovers.recipientPhone} ILIKE ${q}`,
          sql`${deliveryHandovers.deliveryAddress} ILIKE ${q}`,
          sql`${orders.orderNumber} ILIKE ${q}`,
          sql`${customers.name} ILIKE ${q}`,
        )!,
      );
    }

    // Determine Sort Order
    let orderByClause = desc(deliveryHandovers.createdAt);
    if (data?.sort === "del_asc") {
      orderByClause = sql`${deliveryHandovers.deliveryNumber} ASC` as any;
    } else if (data?.sort === "scheduled_asc") {
      orderByClause = sql`${deliveryHandovers.scheduledDate} ASC NULLS LAST` as any;
    } else if (data?.sort === "order_asc") {
      orderByClause = sql`${orders.orderNumber} ASC` as any;
    }

    // 1. KPI Aggregation (computed tenant-wide across all deliveries)
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
    requirePermission(ctx, "deliveries.view");
    const { tenantId } = ctx;

    const [delRow] = await db
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
      // Find linked project if any
      const [linkedProj] = await db
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
        const invRows = await db
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

        scheduledMilestoneInvoices = invRows.map((r) => ({
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
      console.warn("getDeliveryById: failed to load scheduled milestone invoices:", e?.message);
    }

    return {
      delivery: {
        id: delRow.id,
        tenantId: delRow.tenantId,
        deliveryNumber: delRow.deliveryNumber,
        orderId: delRow.orderId,
        orderNumber: delRow.orderNumber || "—",
        quoteId: delRow.quoteId || null,
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
        trackingToken: delRow.trackingToken || null,
        scheduledMilestoneInvoices,
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
    requirePermission(ctx, "deliveries.create");
    const { tenantId, userId, role } = ctx;

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
        installationRequired: data.installationRequired ?? true,
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
    requirePermission(ctx, "deliveries.status.update");
    const { tenantId, userId, role } = ctx;

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

    // Synchronize order & project lifecycle stage when delivery reaches installed or completed
    if (targetStatus === "installed" || targetStatus === "completed") {
      try {
        const [ord] = await db
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
            await db
              .update(orders)
              .set(ordUpdates)
              .where(and(eq(orders.id, ord.id), eq(orders.tenantId, tenantId)));
          }

          // Also synchronize project lifecycle if linked via orderId or quoteId
          const [proj] = await db
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
              await db
                .update(projects)
                .set({ currentStage: projTargetStage, updatedAt: new Date() })
                .where(and(eq(projects.id, proj.id), eq(projects.tenantId, tenantId)));
            }
          }
        }
      } catch (syncErr: any) {
        console.warn("updateDeliveryStatus: order/project synchronization failed:", syncErr?.message);
      }
    }

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
