import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getNextPLCNumber } from "@/lib/numbering";

const CreateInvoiceInput = z.object({
  quoteId: z.string().uuid(),
  customerId: z.string().uuid(),
});

export const createInvoiceFromQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateInvoiceInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Get quote with items
    const { data: quote, error: qErr } = await supabaseAdmin
      .from("quotes")
      .select("*, quote_items(*)")
      .eq("id", data.quoteId)
      .single();
    
    if (qErr || !quote) throw new Error("Quote not found");

    const invoiceNumber = await getNextPLCNumber("invoice");
    const depositAmount = Number(quote.total) * Number(quote.deposit_pct) / 100;

    const { data: invoice, error: iErr } = await supabaseAdmin
      .from("invoices")
      .insert({
        quote_id: quote.id,
        customer_id: data.customerId,
        invoice_number: invoiceNumber,
        total: quote.total,
        deposit_amount: depositAmount,
        paid_amount: 0,
        snapshot: quote.snapshot,
      })
      .select("id")
      .single();
    
    if (iErr || !invoice) throw new Error(iErr?.message ?? "Failed to create invoice");

    // Update quote status
    await supabaseAdmin
      .from("quotes")
      .update({ status: "converted" as any })
      .eq("id", quote.id);

    return { invoiceId: invoice.id, invoiceNumber };
  });