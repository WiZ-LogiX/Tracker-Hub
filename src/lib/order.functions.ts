import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generatePLCId } from "@/lib/numbering";

const CreateOrderInput = z.object({
  quoteId: z.string().uuid().optional().nullable(),
  invoiceId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid(),
  plcId: z.string().optional().nullable(), // The unified PLC ID from the quote
});

export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateOrderInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Resolve tenant from the calling user's membership.
    const { data: membership } = await supabaseAdmin
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!membership?.tenant_id) {
      throw new Error("Forbidden: no tenant membership for caller");
    }
    const tenantId = membership.tenant_id;

    // Grab the quote if an ID is provided
    let quote = null;
    if (data.quoteId) {
      const { data: q, error } = await supabaseAdmin
        .from("quotes")
        .select("*")
        .eq("id", data.quoteId)
        .single();
      if (error || !q) throw new Error(error?.message ?? "Quote not found");
      quote = q;
    }

    // Use the unified PLC ID passed from the quote, or generate a new one
    const plcId = data.plcId ?? (quote?.quote_number ?? generatePLCId());

    // Compute deposit amount (50% of total by default)
    const deposit = quote ? Number(quote.total) * Number(quote.deposit_pct) / 100 : 0;

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
        expected_delivery: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        current_stage: "deposit_received",
      })
      .select("id")
      .single();

    if (error || !order) throw new Error(error?.message ?? "Failed to create order");
    return { orderId: order.id, orderNumber: plcId };
  });
