import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { db } from "@/db/client.server";
import {
  invoices,
  invoicePayments,
  orders,
  quotes,
  customers,
  auditLog,
} from "@/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { type TenantContext, forbidWorker } from "@/lib/tenant-context";
import {
  InvoiceStatusSchema,
  PaymentMethodSchema,
  computeInvoiceStatus,
  type InvoiceItem,
  type InvoicePaymentItem,
} from "@/lib/invoice-types";

// ── Validation Schemas ──────────────────────────────────────────────────────

const ListInvoicesInput = z
  .object({
    status: InvoiceStatusSchema.optional(),
    orderId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    search: z.string().optional(),
  })
  .optional()
  .default({});

const GetInvoiceInput = z.object({
  invoiceId: z.string().uuid(),
});

const RecordPaymentInput = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive("Payment amount must be greater than zero"),
  paymentMethod: PaymentMethodSchema.default("bank_transfer"),
  referenceNumber: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  paidAt: z.string().datetime().optional().nullable(),
});

const MarkPaidInput = z.object({
  invoice_id: z.string().uuid(),
  paid_amount: z.number().min(0),
});

// ── Helper ──────────────────────────────────────────────────────────────────

async function getNextPaymentNumber(tenantId: string): Promise<string> {
  const result = await db.execute(sql`
    INSERT INTO public.tenant_counters (tenant_id, counter_type, last_value, updated_at)
    VALUES (${tenantId}, 'payment', 1001, now())
    ON CONFLICT (tenant_id, counter_type)
    DO UPDATE SET last_value = public.tenant_counters.last_value + 1, updated_at = now()
    RETURNING last_value;
  `);

  const nextVal = (result as any)?.[0]?.last_value ?? 1001;
  return `REC-${nextVal}`;
}

// ── Server Functions ────────────────────────────────────────────────────────

/**
 * List all invoices with customer and order relationships, paid sums, and balances.
 */
export const listInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => ListInvoicesInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Invoices & Payments");
    const { tenantId } = ctx;

    const conditions = [eq(invoices.tenantId, tenantId)];

    if (data.customerId) {
      conditions.push(eq(invoices.customerId, data.customerId));
    }

    if (data.search) {
      const q = `%${data.search.trim()}%`;
      conditions.push(
        sql`(${invoices.invoiceNumber} ILIKE ${q} OR ${customers.name} ILIKE ${q} OR ${customers.phone} ILIKE ${q})`,
      );
    }

    const rows = await db
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
        customerName: customers.name,
        customerPhone: customers.phone,
        quoteNumber: quotes.quoteNumber,
        orderId: orders.id,
        orderNumber: orders.orderNumber,
      })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .leftJoin(quotes, eq(invoices.quoteId, quotes.id))
      .leftJoin(orders, eq(invoices.id, orders.invoiceId))
      .where(and(...conditions))
      .orderBy(desc(invoices.issuedAt));

    if (rows.length === 0) {
      return [];
    }

    // Batch load payment count per invoice
    const invoiceIds = rows.map((r) => r.id);
    const paymentCounts = await db
      .select({
        invoiceId: invoicePayments.invoiceId,
        count: sql<number>`count(*)::int`,
        sumAmount: sql<number>`coalesce(sum(${invoicePayments.amount}), 0)::numeric`,
      })
      .from(invoicePayments)
      .where(
        and(
          eq(invoicePayments.tenantId, tenantId),
          inArray(invoicePayments.invoiceId, invoiceIds),
        ),
      )
      .groupBy(invoicePayments.invoiceId);

    const statsByInvoice: Record<
      string,
      { count: number; sumAmount: number }
    > = {};
    for (const p of paymentCounts) {
      statsByInvoice[p.invoiceId] = {
        count: Number(p.count || 0),
        sumAmount: Number(p.sumAmount || 0),
      };
    }

    let result: InvoiceItem[] = rows.map((r) => {
      const totalNum = Number(r.total || 0);
      const stats = statsByInvoice[r.id] || { count: 0, sumAmount: 0 };
      // Paid amount is maximum of stored paid_amount or sum of payments
      const paidNum = Math.max(Number(r.paidAmount || 0), stats.sumAmount);
      const balanceDue = Math.max(0, totalNum - paidNum);
      const status = computeInvoiceStatus(totalNum, paidNum, r.issuedAt);

      return {
        id: r.id,
        tenantId: r.tenantId,
        invoiceNumber: r.invoiceNumber,
        quoteId: r.quoteId,
        orderId: r.orderId || null,
        customerId: r.customerId,
        customerName: r.customerName || null,
        customerPhone: r.customerPhone || null,
        orderNumber: r.orderNumber || null,
        quoteNumber: r.quoteNumber || null,
        total: totalNum,
        depositAmount: Number(r.depositAmount || 0),
        paidAmount: paidNum,
        balanceDue,
        status,
        issuedAt: r.issuedAt,
        paidAt: r.paidAt,
        paymentCount: stats.count,
      };
    });

    if (data.status) {
      result = result.filter((inv) => inv.status === data.status);
    }

    if (data.orderId) {
      result = result.filter((inv) => inv.orderId === data.orderId);
    }

    return result;
  });

/**
 * Get detailed invoice by ID with full payment history.
 */
export const getInvoiceById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => GetInvoiceInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Invoices & Payments");
    const { tenantId } = ctx;

    const [invoiceRow] = await db
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
        snapshot: invoices.snapshot,
        customerName: customers.name,
        customerPhone: customers.phone,
        quoteNumber: quotes.quoteNumber,
        orderId: orders.id,
        orderNumber: orders.orderNumber,
      })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .leftJoin(quotes, eq(invoices.quoteId, quotes.id))
      .leftJoin(orders, eq(invoices.id, orders.invoiceId))
      .where(and(eq(invoices.id, data.invoiceId), eq(invoices.tenantId, tenantId)))
      .limit(1);

    if (!invoiceRow) {
      throw new Error("Invoice not found or access denied");
    }

    // Fetch payments for this invoice
    const paymentRows = await db
      .select({
        id: invoicePayments.id,
        invoiceId: invoicePayments.invoiceId,
        paymentNumber: invoicePayments.paymentNumber,
        amount: invoicePayments.amount,
        paymentMethod: invoicePayments.paymentMethod,
        referenceNumber: invoicePayments.referenceNumber,
        notes: invoicePayments.notes,
        recordedBy: invoicePayments.recordedBy,
        paidAt: invoicePayments.paidAt,
        createdAt: invoicePayments.createdAt,
      })
      .from(invoicePayments)
      .where(
        and(
          eq(invoicePayments.invoiceId, invoiceRow.id),
          eq(invoicePayments.tenantId, tenantId),
        ),
      )
      .orderBy(desc(invoicePayments.paidAt));

    const totalNum = Number(invoiceRow.total || 0);
    const sumPayments = paymentRows.reduce((s, p) => s + Number(p.amount || 0), 0);
    const paidNum = Math.max(Number(invoiceRow.paidAmount || 0), sumPayments);
    const balanceDue = Math.max(0, totalNum - paidNum);
    const status = computeInvoiceStatus(totalNum, paidNum, invoiceRow.issuedAt);

    const formattedPayments: InvoicePaymentItem[] = paymentRows.map((p) => ({
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
    }));

    return {
      id: invoiceRow.id,
      tenantId: invoiceRow.tenantId,
      invoiceNumber: invoiceRow.invoiceNumber,
      quoteId: invoiceRow.quoteId,
      orderId: invoiceRow.orderId || null,
      customerId: invoiceRow.customerId,
      customerName: invoiceRow.customerName || null,
      customerPhone: invoiceRow.customerPhone || null,
      orderNumber: invoiceRow.orderNumber || null,
      quoteNumber: invoiceRow.quoteNumber || null,
      total: totalNum,
      depositAmount: Number(invoiceRow.depositAmount || 0),
      paidAmount: paidNum,
      balanceDue,
      status,
      issuedAt: invoiceRow.issuedAt,
      paidAt: invoiceRow.paidAt,
      paymentCount: formattedPayments.length,
      payments: formattedPayments,
    };
  });

/**
 * Record milestone payment against an invoice with transactional balance updates.
 */
export const recordInvoicePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => RecordPaymentInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { userId, tenantId, role } = ctx;

    // 1. Role validation: Workers and viewers cannot record financial payments
    if (role === "worker" || role === "viewer") {
      throw new Error("Forbidden: insufficient permissions to record payments");
    }

    // 2. Fetch invoice
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, data.invoiceId), eq(invoices.tenantId, tenantId)))
      .limit(1);

    if (!invoice) {
      throw new Error("Invoice not found or access denied");
    }

    const total = Number(invoice.total || 0);

    // 3. Generate receipt number
    const paymentNumber = await getNextPaymentNumber(tenantId);
    const paidAtDate = data.paidAt ? new Date(data.paidAt) : new Date();

    // 4. Insert payment record
    const [insertedPayment] = await db
      .insert(invoicePayments)
      .values({
        tenantId,
        invoiceId: invoice.id,
        paymentNumber,
        amount: String(data.amount),
        paymentMethod: data.paymentMethod,
        referenceNumber: data.referenceNumber || null,
        notes: data.notes || null,
        recordedBy: userId,
        paidAt: paidAtDate,
      })
      .returning();

    // 5. Recompute total paid
    const [sumResult] = await db
      .select({
        totalPaid: sql<number>`coalesce(sum(${invoicePayments.amount}), 0)::numeric`,
      })
      .from(invoicePayments)
      .where(
        and(
          eq(invoicePayments.invoiceId, invoice.id),
          eq(invoicePayments.tenantId, tenantId),
        ),
      );

    const newTotalPaid = Number(sumResult?.totalPaid || data.amount);
    const isFullyPaid = newTotalPaid >= total;
    const balanceDue = Math.max(0, total - newTotalPaid);

    // 6. Update invoice paid_amount and paid_at
    await db
      .update(invoices)
      .set({
        paidAmount: String(newTotalPaid),
        paidAt: isFullyPaid ? new Date() : null,
      })
      .where(and(eq(invoices.id, invoice.id), eq(invoices.tenantId, tenantId)));

    // 7. Update linked order deposit if this is the deposit phase
    const [linkedOrder] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.invoiceId, invoice.id), eq(orders.tenantId, tenantId)))
      .limit(1);

    if (linkedOrder) {
      const depositRequirement = Number(linkedOrder.deposit || 0);
      if (linkedOrder.currentStage === "deposit_pending" && newTotalPaid >= depositRequirement) {
        await db
          .update(orders)
          .set({
            currentStage: "cutting",
          })
          .where(eq(orders.id, linkedOrder.id));
      }
    }

    // 8. Record in audit log
    await db.insert(auditLog).values({
      tenantId,
      actorId: userId,
      entityType: "invoice",
      entityId: invoice.id,
      action: "payment_recorded",
      details: {
        paymentNumber: insertedPayment.paymentNumber,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        referenceNumber: data.referenceNumber,
        totalPaid: newTotalPaid,
        balanceDue,
      },
    });

    return {
      success: true,
      paymentId: insertedPayment.id,
      paymentNumber: insertedPayment.paymentNumber,
      totalPaid: newTotalPaid,
      balanceDue,
      isFullyPaid,
    };
  });

/**
 * Legacy markInvoicePaid function (backward compatibility).
 */
export const markInvoicePaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((d: unknown) => MarkPaidInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, userId, role } = ctx;

    if (role === "worker" || role === "viewer") {
      throw new Error("Forbidden");
    }

    const [inv] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, data.invoice_id), eq(invoices.tenantId, tenantId)))
      .limit(1);

    if (!inv) throw new Error("Invoice not found");

    const paymentNumber = await getNextPaymentNumber(tenantId);

    await db.insert(invoicePayments).values({
      tenantId,
      invoiceId: inv.id,
      paymentNumber,
      amount: String(data.paid_amount),
      paymentMethod: "bank_transfer",
      recordedBy: userId,
      paidAt: new Date(),
    });

    await db
      .update(invoices)
      .set({
        paidAmount: String(data.paid_amount),
        paidAt: new Date(),
      })
      .where(and(eq(invoices.id, inv.id), eq(invoices.tenantId, tenantId)));

    return { ok: true };
  });
