import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TenantContext } from "@/lib/tenant-context";

const CreateInvoiceInput = z.object({
  quoteId: z.string().uuid(),
  customerId: z.string().uuid(),
  plcId: z.string().optional().nullable(), // The unified PLC ID from the quote
});

export const createInvoiceFromQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((input: unknown) => CreateInvoiceInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const tenantId = ctx.tenantId;

    // Get quote with items and ensure it belongs to the tenant
    const { data: quote, error: qErr } = await supabaseAdmin
      .from("quotes")
      .select("*, quote_items(*), tenant_id")
      .eq("id", data.quoteId)
      .single();

    if (qErr || !quote) throw new Error("Quote not found");
    if (quote.tenant_id !== tenantId) {
      throw new Error("Forbidden: quote does not belong to your tenant");
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

    // Use the unified PLC ID from the quote's quote_number
    const plcId = data.plcId ?? quote.quote_number;

    const depositAmount = (Number(quote.total) * Number(quote.deposit_pct)) / 100;

    const { data: invoice, error: iErr } = await supabaseAdmin
      .from("invoices")
      .insert({
        tenant_id: tenantId,
        quote_id: quote.id,
        customer_id: data.customerId,
        invoice_number: plcId,
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

    return { invoiceId: invoice.id, invoiceNumber: plcId, plcId };
  });
