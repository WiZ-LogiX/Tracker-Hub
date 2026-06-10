import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CreateOrderInput = z.object({
  quoteId: z.string().uuid().optional().nullable(),
  invoiceId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid(),
});

// Simple deterministic PLC number generator (same logic as POST /api/plc)
function generatePLCNumber(type: 'order' | 'invoice' | 'quote'): string {
  const now = new Date();
  const suffix = now.toISOString().slice(0, 10).replace(/-/g, "").slice(-6); // e.g. "230607"
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `PLC-${type}-${suffix}-${random}`;
}

export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateOrderInput.parse(input))
  .handler(async ({ data }) => {
    const total = data.invoiceId
      ? Number(
          (await supabaseAdmin
            .from("invoices")
            .select("total, deposit_amount")
            .eq("id", data.invoiceId)
            .single()).data?.total ?? 0)
      : 0;
    const deposit = data.invoiceId
      ? Number(
          (await supabaseAdmin
            .from("invoices")
            .select("deposit_amount")
            .eq("id", data.invoiceId)
            .single()).data?.deposit_amount ?? 0)
      : 0;

    // Fallback if quoteId is provided (use its deposit_pct)
    if (!data.invoiceId && data.quoteId) {
      const { data: q } = await supabaseAdmin
        .from("quotes")
        .select("deposit_pct")
        .eq("id", data.quoteId)
        .single();
      deposit = total * Number(q?.deposit_pct ?? 50) / 100;
    }

    const orderNumber = generatePLCNumber("order");

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
        expected_delivery: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        current_stage: "deposit_received",
      })
      .select("id")
      .single();

    if (error || !order) throw new Error(error?.message ?? "Failed to create order");
    return { orderId: order.id, orderNumber };
  });