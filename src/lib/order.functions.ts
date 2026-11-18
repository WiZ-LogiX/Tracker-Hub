import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { db } from "@/db/client.server";
import { orders, customers, quotes, invoices, workers } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { generatePLCId } from "@/lib/numbering";
import { requirePermission, type TenantContext } from "@/lib/tenant-context";

const CreateOrderInput = z.object({
  quoteId: z.string().uuid().optional().nullable(),
  invoiceId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid(),
  plcId: z.string().optional().nullable(), // The unified PLC ID from the quote
});

export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((input: unknown) => CreateOrderInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requirePermission(ctx, "orders.create");
    const tenantId = ctx.tenantId;

    // Grab the quote if an ID is provided and ensure it belongs to the tenant
    let quote = null;
    if (data.quoteId) {
      const { data: q, error } = await supabaseAdmin
        .from("quotes")
        .select("*, tenant_id")
        .eq("id", data.quoteId)
        .single();
      if (error || !q) throw new Error(error?.message ?? "Quote not found");
      if (q.tenant_id !== tenantId) {
        throw new Error("Forbidden: quote does not belong to your tenant");
      }
      quote = q;
    }

    // Ensure the customer belongs to the tenant
    const { data: customer, error: customerErr } = await supabaseAdmin
      .from("customers")
      .select("id, tenant_id")
      .eq("id", data.customerId)
      .single();
    if (customerErr || !customer) throw new Error(customerErr?.message ?? "Customer not found");
    if (customer.tenant_id !== tenantId) {
      throw new Error("Forbidden: customer does not belong to your tenant");
    }

    // Use the unified PLC ID passed from the quote, or generate a new one
    const plcId = data.plcId ?? quote?.quote_number ?? generatePLCId();

    // Compute deposit amount (50% of total by default)
    const deposit = quote ? (Number(quote.total) * Number(quote.deposit_pct)) / 100 : 0;

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .insert({
        tenant_id: tenantId,
        quote_id: data.quoteId,
        customer_id: data.customerId,
        order_number: plcId,
        total: quote?.total ?? 0,
        deposit,
        contract_date: new Date().toISOString().slice(0, 10),
        expected_delivery: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
        current_stage: "deposit_received",
      })
      .select("id")
      .single();

    if (error || !order) throw new Error(error?.message ?? "Failed to create order");
    return { orderId: order.id, orderNumber: plcId };
  });

export const listProductionOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    requirePermission(ctx, "orders.view");
    const { tenantId } = ctx;

    const rows = await db
      .select({
        id: orders.id,
        order_number: orders.orderNumber,
        orderNumber: orders.orderNumber,
        quote_id: orders.quoteId,
        quoteId: orders.quoteId,
        invoice_id: orders.invoiceId,
        invoiceId: orders.invoiceId,
        customer_id: orders.customerId,
        customerId: orders.customerId,
        current_stage: orders.currentStage,
        currentStage: orders.currentStage,
        total: orders.total,
        deposit: orders.deposit,
        contract_date: orders.contractDate,
        contractDate: orders.contractDate,
        expected_delivery: orders.expectedDelivery,
        expectedDelivery: orders.expectedDelivery,
        delivered_at: orders.deliveredAt,
        deliveredAt: orders.deliveredAt,
        notes: orders.notes,
        created_at: orders.createdAt,
        createdAt: orders.createdAt,
        customer_name: customers.name,
        customer_phone: customers.phone,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(eq(orders.tenantId, tenantId))
      .orderBy(desc(orders.createdAt));

    return rows.map((r) => ({
      ...r,
      customers: {
        id: r.customer_id,
        name: r.customer_name,
        phone: r.customer_phone,
      },
    }));
  });

export const getOrderById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requirePermission(ctx, "orders.view");
    const { tenantId } = ctx;

    const [row] = await db
      .select({
        id: orders.id,
        order_number: orders.orderNumber,
        orderNumber: orders.orderNumber,
        quote_id: orders.quoteId,
        quoteId: orders.quoteId,
        invoice_id: orders.invoiceId,
        invoiceId: orders.invoiceId,
        customer_id: orders.customerId,
        customerId: orders.customerId,
        current_stage: orders.currentStage,
        currentStage: orders.currentStage,
        total: orders.total,
        deposit: orders.deposit,
        contract_date: orders.contractDate,
        contractDate: orders.contractDate,
        expected_delivery: orders.expectedDelivery,
        expectedDelivery: orders.expectedDelivery,
        delivered_at: orders.deliveredAt,
        deliveredAt: orders.deliveredAt,
        notes: orders.notes,
        created_at: orders.createdAt,
        createdAt: orders.createdAt,
        customer_name: customers.name,
        customer_phone: customers.phone,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(and(eq(orders.id, data.orderId), eq(orders.tenantId, tenantId)))
      .limit(1);

    if (!row) return null;
    return {
      ...row,
      customers: {
        id: row.customer_id,
        name: row.customer_name,
        phone: row.customer_phone,
      },
    };
  });

export const listActiveWorkers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId } = ctx;

    const rows = await db
      .select()
      .from(workers)
      .where(and(eq(workers.tenantId, tenantId), eq(workers.active, true)))
      .orderBy(workers.name);

    return rows;
  });
