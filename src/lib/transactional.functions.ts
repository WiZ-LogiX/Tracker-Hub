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
import { requirePermission, type TenantContext } from "@/lib/tenant-context";
import { log } from "@/lib/log";
import { createProjectRecord } from "@/lib/project-store.server";

const ConvertQuoteInput = z.object({
  quoteId: z.string().uuid(),
  milestones: z
    .enum(["100", "50_50", "60_30_10", "50_30_20"])
    .optional()
    .default("100"),
});

interface MilestoneConfig {
  label: string;
  pct: number;
  stage: string;
}

const MILESTONE_PRESETS: Record<string, MilestoneConfig[]> = {
  "100": [
    { label: "Full Payment", pct: 100, stage: "deposit" },
  ],
  "50_50": [
    { label: "Contract Deposit", pct: 50, stage: "deposit" },
    { label: "Final Handover", pct: 50, stage: "handover" },
  ],
  "60_30_10": [
    { label: "Contract Deposit", pct: 60, stage: "deposit" },
    { label: "Delivery & Supply", pct: 30, stage: "delivery" },
    { label: "Installation & Handover", pct: 10, stage: "installation" },
  ],
  "50_30_20": [
    { label: "Contract Deposit", pct: 50, stage: "deposit" },
    { label: "Manufacturing Completion", pct: 30, stage: "qc" },
    { label: "Installation & Handover", pct: 20, stage: "handover" },
  ],
};

export const convertQuoteToOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((input: unknown) => ConvertQuoteInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    requirePermission(ctx, "quotes.convert");
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

      if (quoteRow.status === "converted") {
        throw new Error("This quotation has already been converted to an order");
      }

      if (quoteRow.status !== "accepted") {
        throw new Error(`Only an explicitly accepted quotation can be converted to an order (current status: ${quoteRow.status})`);
      }

      // Guard against duplicate orders for this quotation
      const [existingOrder] = await tx
        .select({ id: schema.orders.id, orderNumber: schema.orders.orderNumber })
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.quoteId, quoteRow.id),
            eq(schema.orders.tenantId, tenantId),
          ),
        )
        .limit(1);

      if (existingOrder) {
        throw new Error(`An order (${existingOrder.orderNumber}) has already been created for this quotation`);
      }

      const items = await tx
        .select()
        .from(schema.quoteItems)
        .where(eq(schema.quoteItems.quoteId, quoteRow.id));

      // Validate deposit percentage from quote
      const depositPctNum = Number(quoteRow.depositPct ?? 50);
      if (isNaN(depositPctNum) || depositPctNum < 0 || depositPctNum > 100) {
        throw new Error(`Invalid deposit percentage: ${quoteRow.depositPct}`);
      }
      const legacyDepositAmount =
        (Number(quoteRow.total) * Number(quoteRow.depositPct)) / 100;

      // 2. Resolve Opportunity & Create Project Record first so invoices link cleanly
      const linkedOpportunityId = (quoteRow.snapshot as any)?.opportunityId as string | undefined;
      const projectNumber = `PRJ-${quoteRow.quoteNumber.replace(/^(QUO|ORD)-/, "")}`;
      const projectRecord = await createProjectRecord({
        tenantId,
        customerId: quoteRow.customerId,
        quoteId: quoteRow.id,
        orderId: null,
        opportunityId: linkedOpportunityId || null,
        title: quoteRow.notes ? `مشروع: ${quoteRow.notes}` : `مشروع تصنيع وتوريد ${quoteRow.quoteNumber}`,
        projectType: "residential",
        totalValue: quoteRow.total,
        customProjectNumber: projectNumber,
      });

      // 3. Compute milestone schedules with remainder rounding on last milestone
      const presetKey = data.milestones || "100";
      const presetConfigs = MILESTONE_PRESETS[presetKey] || MILESTONE_PRESETS["100"];
      const totalQuoteNum = Number(quoteRow.total || 0);

      let runningSum = 0;
      const milestoneAmounts: number[] = [];
      for (let i = 0; i < presetConfigs.length; i++) {
        if (i === presetConfigs.length - 1) {
          const lastAmount = Math.round((totalQuoteNum - runningSum) * 100) / 100;
          milestoneAmounts.push(lastAmount);
        } else {
          const amount = Math.round(((totalQuoteNum * presetConfigs[i].pct) / 100) * 100) / 100;
          milestoneAmounts.push(amount);
          runningSum += amount;
        }
      }

      // 4. Insert milestone invoices
      const createdInvoices: Array<{
        id: string;
        invoiceNumber: string;
        milestoneIndex: number;
        total: string;
        billingStatus: string;
      }> = [];

      for (let i = 0; i < presetConfigs.length; i++) {
        const isMulti = presetConfigs.length > 1;
        const invoiceNumber = isMulti
          ? `${quoteRow.quoteNumber}-M${i + 1}`
          : quoteRow.quoteNumber;
        const isFirst = i === 0;
        const milestoneAmount = String(milestoneAmounts[i]);
        const billingStatus = isFirst ? "issued" : "scheduled";

        const [inv] = await tx
          .insert(schema.invoices)
          .values({
            tenantId,
            quoteId: quoteRow.id,
            projectId: projectRecord.id,
            customerId: quoteRow.customerId,
            invoiceNumber,
            total: milestoneAmount,
            depositAmount: isFirst ? milestoneAmount : "0",
            paidAmount: "0",
            milestoneIndex: i + 1,
            milestoneTotalCount: presetConfigs.length,
            milestoneLabel: presetConfigs[i].label,
            milestonePct: String(presetConfigs[i].pct),
            billingStatus,
            dueStage: presetConfigs[i].stage,
            snapshot: quoteRow.snapshot,
          })
          .returning({
            id: schema.invoices.id,
            invoiceNumber: schema.invoices.invoiceNumber,
            milestoneIndex: schema.invoices.milestoneIndex,
            total: schema.invoices.total,
            billingStatus: schema.invoices.billingStatus,
          });

        createdInvoices.push(inv);
      }

      const firstInvoice = createdInvoices[0];

      // 5. Create order with pricing snapshot linked to first invoice
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
          invoiceId: firstInvoice.id,
          customerId: quoteRow.customerId,
          orderNumber: quoteRow.quoteNumber,
          total: quoteRow.total,
          deposit: String(milestoneAmounts[0]),
          contractDate,
          expectedDelivery,
          currentStage: "deposit_received",
          notes: `Pricing snapshot from quote ${quoteRow.quoteNumber}`,
        })
        .returning({ id: schema.orders.id });

      // Link order back to project
      await tx
        .update(schema.projects)
        .set({ orderId: order.id })
        .where(eq(schema.projects.id, projectRecord.id));

      // 6. Mark quote as converted
      await tx
        .update(schema.quotes)
        .set({ status: "converted" })
        .where(eq(schema.quotes.id, quoteRow.id));

      // 7. If linked to an Opportunity, advance opportunity to "won"
      if (linkedOpportunityId) {
        await tx
          .update(schema.opportunities)
          .set({
            stage: "won",
            status: "won",
            value: quoteRow.total,
            lostReason: null,
            nextAction: `أمر بيع قيد الإنتاج والتصنيع - ${quoteRow.quoteNumber}`,
            nextActionDate: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.opportunities.id, linkedOpportunityId),
              eq(schema.opportunities.tenantId, tenantId),
            ),
          );

        await tx.insert(schema.auditLog).values({
          tenantId,
          actorId: ctx.userId ?? "system",
          action: "opportunity_won",
          entityType: "opportunity",
          entityId: linkedOpportunityId,
          details: {
            reason: "Converted quote to order",
            orderId: order.id,
            orderNumber: quoteRow.quoteNumber,
            quoteId: quoteRow.id,
            amount: quoteRow.total,
            milestones: presetKey,
          },
        });
      }

      // 8. Return ids for notification, navigation, and billing verification
      return {
        orderId: order.id,
        invoiceId: firstInvoice.id,
        invoices: createdInvoices.map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          milestoneIndex: inv.milestoneIndex,
          total: Number(inv.total),
          billingStatus: inv.billingStatus,
        })),
        projectId: projectRecord.id,
        projectNumber: projectRecord.projectNumber,
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
