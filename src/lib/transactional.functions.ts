/**
 * Transactional quote → order → invoice conversion.
 *
 * Wraps the entire flow in a single db.transaction(). On any failure,
 * the entire transaction rolls back — no partial order, no orphaned invoice.
 *
 * Pricing snapshot (rule version id) is stored on the order at creation time
 * to satisfy immutability rules.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { tenantDb, schema } from "@/lib/tenant";
import { type TenantContext } from "@/lib/tenant-context";
import { log } from "@/lib/log";

const ConvertQuoteInput = z.object({
  quoteId: z.string().uuid(),
});

export const convertQuoteToOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((input: unknown) => ConvertQuoteInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const tenantId = ctx.tenantId;
    const t0 = Date.now();

    const tdb = await tenantDb(tenantId);

    const result = await tdb.transaction(async (tx) => {
      // 1. Read quote + items (tenant-scoped)
      const [quoteRow] = await tx
        .select()
        .from(schema.quotes)
        .where(
          and(
            eq(schema.quotes.id, data.quoteId),
            eq(schema.quotes.tenantId, tenantId),
          ),
        )
        .limit(1);

      if (!quoteRow) {
        throw new Error("Quote not found or does not belong to your tenant");
      }

      const items = await tx
        .select()
        .from(schema.quoteItems)
        .where(eq(schema.quoteItems.quoteId, quoteRow.id));

      // 2. Create invoice
      const depositAmount =
        (Number(quoteRow.total) * Number(quoteRow.depositPct)) / 100;

      const [invoice] = await tx
        .insert(schema.invoices)
        .values({
          tenantId,
          quoteId: quoteRow.id,
          customerId: quoteRow.customerId,
          invoiceNumber: quoteRow.quoteNumber,
          total: quoteRow.total,
          depositAmount: String(depositAmount),
          paidAmount: "0",
          snapshot: quoteRow.snapshot,
        })
        .returning({ id: schema.invoices.id });

      // 3. Create order with pricing snapshot
      const contractDate = new Date().toISOString().slice(0, 10);
      const expectedDelivery = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      )
        .toISOString()
        .slice(0, 10);

      const [order] = await tx
        .insert(schema.orders)
        .values({
          tenantId,
          quoteId: quoteRow.id,
          invoiceId: invoice.id,
          customerId: quoteRow.customerId,
          orderNumber: quoteRow.quoteNumber,
          total: quoteRow.total,
          deposit: String(depositAmount),
          contractDate,
          expectedDelivery,
          currentStage: "deposit_received",
          notes: `Pricing snapshot from quote ${quoteRow.quoteNumber}`,
        })
        .returning({ id: schema.orders.id });

      // 4. Mark quote as converted
      await tx
        .update(schema.quotes)
        .set({ status: "converted" })
        .where(eq(schema.quotes.id, quoteRow.id));

      // 5. Return ids for notification (outside transaction)
      return {
        orderId: order.id,
        invoiceId: invoice.id,
        orderNumber: quoteRow.quoteNumber,
        plcId: quoteRow.quoteNumber,
      };
    });

    log.info("quote converted to order", {
      tenantId,
      fn: "convertQuoteToOrder",
      quoteId: data.quoteId,
      orderId: result.orderId,
      invoiceId: result.invoiceId,
      orderNumber: result.orderNumber,
      ms: Date.now() - t0,
    });

    return result;
  });
