import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CreateOrderInput = z.object({
  quoteId: z.string().uuid().optional().nullable(),
  invoiceId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid(),
});

export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateOrderInput.parse(input))
  .handler(async ({ data }) => {
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

    // Compute deposit amount (50% of total by default)
    let deposit = 0;
    if (quote) {
      deposit = Number(quote.total) * Number(quote.deposit_pct) / 100;
    }

    // Generate PLC number directly without extra fetch
    const { plc } = await (await import("@/lib/plc.functions")).POST({
      data: { type: "order" }
    });
    const orderNumber = plc ?? "PLC-ORDER-0001";

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .insert({
        quote_id: data.quoteId,
        customer_id: data.customerId,
        order_number: orderNumber,
        total: quote?.total ?? 0,
        deposit,
        contract_date: new Date().toISOString().slice(0, 10),
        expected_delivery: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        current_stage: "deposit_received",
      })
      .select("id")
      .single();

    if (error || !order) throw new Error(error?.message ?? "Failed to create order");
    return { orderId: order.id, orderNumber };
  });