/**
 * Invoice operations — tenant-scoped server functions.
 *
 * Uses supabaseAdmin (service-role) to bypass RLS.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TenantContext } from "@/lib/tenant-context";

const MarkPaidInput = z.object({
  invoice_id: z.string().uuid(),
  paid_amount: z.number(),
});

export const markInvoicePaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => MarkPaidInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;

    const { error } = await supabaseAdmin
      .from("invoices")
      .update({
        paid_at: new Date().toISOString(),
        paid_amount: data.paid_amount,
      })
      .eq("id", data.invoice_id)
      .eq("tenant_id", ctx.tenantId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
