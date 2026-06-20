import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generatePLCId } from "@/lib/numbering";
import type { TenantContext } from "@/lib/tenant-context";

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
