import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getNextPLCNumber } from "@/lib/numbering";

const CreateOrderInput = z.object({
  quoteId: z.string().uuid().optional().nullable(),
  invoiceId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid(),
});

export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateOrderInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    let total = 0;
    let deposit = 0;

    if (data.invoiceId) {
      const { data: inv } = await supabaseAdmin
        .from("invoices")
        .select("total, deposit_amount")
        .eq("id", data.invoiceId)
        .single();
      total = Number(inv?.total ?? 0);
      deposit = Number(inv?.deposit_amount ?? 0);
    } else if (data.quoteId) {
      const { data: q } = await supabaseAdmin
        .from("quotes")
        .select("total, deposit_pct")
        .eq("id", data.quoteId)
        .single();
      total = Number(q?.total ?? 0);
      deposit = total * Number(q?.deposit_pct ?? 50) / 100;
    }

    const orderNumber = await getNextPLCNumber("order");
    const expected = new Date();
    expected.setDate(expected.getDate() + 30);

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .insert({
        quote_id: data.quoteId,
        invoice_id: data.invoiceId,
        customer_id: data.customerId,
        order_number: orderNumber,
        total,
        deposit,
        contract_date: new Date().toISOString().slice(0, 10),
        expected_delivery: expected.toISOString().slice(0, 10),
        current_stage: "deposit_received",
      })
      .select("id")
      .single();
    
    if (error || !order) throw new Error(error?.message ?? "Failed to create order");

    return { orderId: order.id, orderNumber };
  });