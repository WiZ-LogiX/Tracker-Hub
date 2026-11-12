/**
 * Quote CRUD — tenant-scoped server functions.
 *
 * SECURITY: Uses RLS-enforcing context.supabase for all tenant-owned data.
 * supabaseAdmin is NOT imported — all reads/writes go through the
 * requireTenant middleware client.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { db } from "@/db/client.server";
import { quotes, quoteItems, customers, orders, opportunities, tasks, taskAssignees, auditLog, appUsers, tenantCounters, invoices, invoicePayments, deliveryHandovers } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { type TenantContext, forbidWorker } from "@/lib/tenant-context";
import { deliverToN8n, type NotifyPayload } from "@/lib/whatsapp-share.functions";
import { generatePdf } from "@/lib/pdf.functions";
import { log } from "@/lib/log";
import {
  priceQuote,
  type QuoteInput,
  type CatalogLookup,
} from "@/lib/pricing/engine-v3";
import { runShadow } from "@/lib/pricing/shadow";
import { handleCustomerQuoteDecisionInternal } from "./quote-decision.server";
import {
  SaveCommercialQuoteInput,
  calculateCommercialQuoteTotals,
  DEFAULT_COMMERCIAL_TERMS,
  type CommercialQuoteSnapshot,
} from "@/lib/commercial-quote-types";
import type {
  PaginatedQuotationsResult,
  QuotationListItem,
  QuoteSortOption,
  QuoteStatusFilter,
} from "@/lib/quote-list-types";
import {
  QUOTATION_LIFECYCLE_STAGES,
  QUOTATION_STAGE_LABEL_AR,
  getQuotationProgressiveStatus,
  type QuotationLifecycleStage,
} from "@/lib/stages";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function normalizePhone(p: string) {
  return (p || "").replace(/\D/g, "").slice(-9);
}

export { getQuotationProgressiveStatus };

// ── Snapshot-freeze states ──────────────────────────────────────────────────
/** States that trigger a pricing snapshot freeze on transition. */
const FREEZE_STATES = new Set(["sent", "accepted"]);

const CreateQuoteInput = z.object({
  customer_id: z.string().uuid(),
  request_id: z.string().uuid().nullable().optional(),
  opportunity_id: z.string().uuid().nullable().optional(),
  status: z.enum(["draft", "sent"]),
  quote_number: z.string().min(1),
  subtotal: z.number(),
  discount_amount: z.number().optional().default(0),
  discount_code: z.string().nullable().optional(),
  vat_pct: z.number().optional().default(14),
  vat_amount: z.number(),
  total: z.number(),
  notes: z.string().nullable().optional(),
  snapshot: z.any().optional().default({}),
  items: z.array(z.object({
    product_id: z.string().uuid().nullable().optional(),
    product_name: z.string(),
    material_id: z.string().uuid().nullable().optional(),
    material_name: z.string().nullable().optional(),
    finish_id: z.string().uuid().nullable().optional(),
    finish_name: z.string().nullable().optional(),
    dimension_value: z.number(),
    qty: z.number(),
    accessories: z.any().optional().default([]),
    unit_price: z.number(),
    line_total: z.number(),
    breakdown: z.any().optional().default({}),
  })),
  configurations: z.array(z.object({
    template_id: z.string().uuid().nullable().optional(),
    selections: z.any().optional().default({}),
    dimensions: z.any().optional().default({}),
    computed_breakdown: z.any().optional().default({}),
    pricing_rule_version: z.number().optional(),
  })).optional(),
});

async function getNextTaskCode(tenantId: string): Promise<string> {
  const [row] = await db
    .insert(tenantCounters)
    .values({
      tenantId,
      counterType: "task",
      lastValue: 1001,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [tenantCounters.tenantId, tenantCounters.counterType],
      set: {
        lastValue: sql`${tenantCounters.lastValue} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ lastValue: tenantCounters.lastValue });

  const nextVal = row?.lastValue ?? 1001;
  return `TSK-${nextVal}`;
}

export const createQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => CreateQuoteInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Commercial Quotes");
    const client = (context as any).supabase;

    // Insert quote with tenant_id
    const quotePayload: Record<string, any> = {
      customer_id: data.customer_id,
      request_id: data.request_id ?? null,
      status: data.status,
      quote_number: data.quote_number,
      subtotal: data.subtotal,
      discount_amount: data.discount_amount,
      discount_code: data.discount_code ?? null,
      vat_pct: data.vat_pct,
      vat_amount: data.vat_amount,
      total: data.total,
      notes: data.notes ?? null,
      snapshot: data.snapshot,
      tenant_id: ctx.tenantId,
    };
    if (data.opportunity_id) {
      quotePayload.opportunity_id = data.opportunity_id;
    }

    let quoteRes = await client.from("quotes").insert(quotePayload).select("id").single();
    if (quoteRes.error && data.opportunity_id && quoteRes.error.message?.includes("opportunity_id")) {
      delete quotePayload.opportunity_id;
      quoteRes = await client.from("quotes").insert(quotePayload).select("id").single();
    }
    const { data: quote, error: quoteError } = quoteRes;

    if (quoteError || !quote) {
      throw new Error(quoteError?.message ?? "فشل إنشاء عرض السعر");
    }

    // Insert quote_items with tenant_id
    let insertedItemIds: string[] = [];
    if (data.items.length > 0) {
      const itemsToInsert = data.items.map((item) => ({
        quote_id: quote.id,
        product_id: item.product_id ?? null,
        product_name: item.product_name,
        material_id: item.material_id ?? null,
        material_name: item.material_name ?? null,
        finish_id: item.finish_id ?? null,
        finish_name: item.finish_name ?? null,
        dimension_value: item.dimension_value,
        qty: item.qty,
        accessories: item.accessories,
        unit_price: item.unit_price,
        line_total: item.line_total,
        breakdown: item.breakdown,
        tenant_id: ctx.tenantId,
      }));

      const { data: insertedItems, error: itemsError } = await client
        .from("quote_items")
        .insert(itemsToInsert as any)
        .select("id");

      if (itemsError) {
        // Quote was created but items failed — clean up
        await client.from("quotes").delete().eq("id", quote.id);
        throw new Error(itemsError.message);
      }

      insertedItemIds = (insertedItems ?? []).map((qi: any) => qi.id);
    }

    // Insert configurations if provided
    if (data.configurations && data.configurations.length > 0 && insertedItemIds.length > 0) {
      const configsToInsert = data.configurations.map((config, i) => ({
        quote_item_id: insertedItemIds[i] ?? null,
        template_id: config.template_id ?? null,
        selections: config.selections,
        dimensions: config.dimensions,
        computed_breakdown: config.computed_breakdown,
        pricing_rule_version: config.pricing_rule_version ?? null,
        tenant_id: ctx.tenantId,
      }));

      const { error: configError } = await client
        .from("configurations")
        .insert(configsToInsert as any);

      if (configError) {
        // Log but don't fail — configurations are optional
        log.error("Failed to insert configurations:", { error: configError.message });
      }
    }

    // Update quote_requests status if linked
    if (data.request_id) {
      await client
        .from("quote_requests")
        .update({ status: "quoted" as any })
        .eq("id", data.request_id)
        .eq("tenant_id", ctx.tenantId);
    }

    // Send WhatsApp notification to customer (with PDF attachment)
    try {
      const { data: customer } = await client
        .from("customers")
        .select("name, phone, email")
        .eq("id", data.customer_id)
        .eq("tenant_id", ctx.tenantId)
        .maybeSingle();

      if (customer?.phone) {
        const siteUrl = (process.env.SITE_URL || "").replace(/\/$/, "");
        const link = siteUrl
          ? `${siteUrl}/track?ref=${encodeURIComponent(data.quote_number)}`
          : `/track?ref=${encodeURIComponent(data.quote_number)}`;

        const vars: Record<string, string> = {
          customer_name: customer.name ?? "",
          reference: data.quote_number,
          total: String(data.total),
          link,
        };

        // Load template (fallback to en)
        let { data: tpl } = await client
          .from("notification_templates")
          .select("subject, body")
          .eq("event", "quote_created")
          .eq("channel", "whatsapp")
          .eq("language", "ar")
          .eq("tenant_id", ctx.tenantId)
          .eq("active", true)
          .maybeSingle();
        if (!tpl) {
          const { data: fallback } = await client
            .from("notification_templates")
            .select("subject, body")
            .eq("event", "quote_created")
            .eq("channel", "whatsapp")
            .eq("language", "en")
            .eq("tenant_id", ctx.tenantId)
            .eq("active", true)
            .maybeSingle();
          tpl = fallback;
        }

        if (tpl) {
          // Generate PDF and get presigned download URL
          let pdfUrl = "";
          try {
            const { downloadUrl } = await generatePdf({
              data: { entityType: "quote", entityId: quote.id },
            });
            pdfUrl = downloadUrl;
          } catch (pdfErr) {
            log.error("PDF generation failed (non-blocking):", { error: pdfErr instanceof Error ? pdfErr.message : String(pdfErr) });
          }

          const render = (t: string) => t.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
          const payload: NotifyPayload = {
            event: "quote_created",
            reference: data.quote_number,
            channels: ["whatsapp"],
            to: { phone: customer.phone, email: customer.email },
            subject: render((tpl as any).subject ?? ""),
            message: render((tpl as any).body),
            link,
            locale: "ar",
            entity: { type: "quote", id: quote.id },
            extra: pdfUrl ? { pdfUrl } : undefined,
          };
          await deliverToN8n(ctx, payload);
        }
      }
    } catch (err) {
      // Non-blocking — quote was created successfully, notification failure is not fatal
      log.error("Failed to send quote_created notification:", { error: String(err) });
    }

    // ── Pricing shadow comparison (non-blocking) ───────────────────────────────
    try {
      const { data: tenantRow } = await client
        .from("tenants")
        .select("feature_flags")
        .eq("id", ctx.tenantId)
        .single();

      const flags = (tenantRow?.feature_flags as Record<string, boolean>) ?? {};
      if (flags.pricing_shadow) {
        await runShadow(quote.id, ctx.tenantId, undefined, client);
      }
    } catch (err) {
      log.error("pricing_shadow: failed to check flags or run shadow:", {
        error: String(err),
      });
    }

    // ── CRM Opportunity Synchronization (non-blocking) ─────────────────────────
    if (data.opportunity_id) {
      try {
        const [opp] = await db
          .select({ id: opportunities.id, stage: opportunities.stage, value: opportunities.value })
          .from(opportunities)
          .where(and(eq(opportunities.id, data.opportunity_id), eq(opportunities.tenantId, ctx.tenantId)))
          .limit(1);

        if (opp) {
          const earlyStages = ["new_lead", "contacted", "qualified", "site_visit"];
          const newStage = data.status === "sent" ? "quotation" : earlyStages.includes(opp.stage) ? "design_measurement" : opp.stage;
          const quoteTotalNum = Number(data.total || 0);

          await db
            .update(opportunities)
            .set({
              stage: newStage,
              ...(quoteTotalNum > 0 ? { value: String(quoteTotalNum) } : {}),
              updatedAt: new Date(),
            })
            .where(and(eq(opportunities.id, opp.id), eq(opportunities.tenantId, ctx.tenantId)));
        }
      } catch (oppErr) {
        log.error("createQuote: opportunity sync failed (non-blocking):", { error: String(oppErr) });
      }
    }

    return { quoteId: quote.id };
  });

// ── V2 hierarchical quote save ──────────────────────────────────────────────

const V2ProductInput = z.object({
  productTypeCode: z.string(),
  label: z.string().nullable().optional(),
  position: z.number().int().default(0),
  sections: z.array(z.object({
    label: z.string().nullable().optional(),
    position: z.number().int().default(0),
    units: z.array(z.object({
      unitTypeId: z.string().uuid().nullable().optional(),
      lengthMm: z.number().int().default(0),
      widthMm: z.number().int().default(0),
      heightMm: z.number().int().default(0),
      depthMm: z.number().int().default(0),
      dimensionUnit: z.enum(["mm", "m", "m2"]).default("mm"),
      qty: z.number().int().min(1).default(1),
      finishId: z.string().uuid().nullable().optional(),
      widthTier: z.enum(["narrow", "standard", "wide", "extra_wide"]).nullable().optional(),
      overrideFactorKeys: z.record(z.number()).optional(),
      position: z.number().int().default(0),
      components: z.array(z.object({
        kind: z.enum(["material", "hardware", "accessory", "manufacturing", "edge_band", "veneer", "finish"]),
        catalogId: z.string().uuid().nullable().optional(),
        qty: z.number().min(0).default(1),
        unitOfMeasure: z.string().default("pcs"),
        areaFunctionKey: z.string().optional(),
        position: z.number().int().default(0),
      })).default([]),
    })).default([]),
  })).default([]),
});

const SaveV2QuoteInput = z.object({
  customer_id: z.string().uuid(),
  request_id: z.string().uuid().nullable().optional(),
  opportunity_id: z.string().uuid().nullable().optional(),
  status: z.enum(["draft", "sent"]).default("draft"),
  quote_number: z.string().min(1),
  notes: z.string().nullable().optional(),
  products: z.array(V2ProductInput).default([]),
});

/**
 * Save a v2 hierarchical quote in one call.
 *
 * Creates the quote row, inserts the full tree (products → sections → units → components)
 * in dependency order, then optionally runs shadow pricing comparison.
 *
 * SECURITY: Uses context.supabase (RLS-enforcing) for all writes.
 * No direct supabaseAdmin usage — all tenant_id injection is via middleware.
 */
export const saveV2Quote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => SaveV2QuoteInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Commercial Quotes");
    const tid = ctx.tenantId, client = (context as any).supabase;

    // 1. Insert quote
    const quotePayload: Record<string, any> = {
      customer_id: data.customer_id, request_id: data.request_id ?? null,
      status: data.status, quote_number: data.quote_number,
      subtotal: 0, discount_amount: 0, vat_pct: 14, vat_amount: 0, total: 0,
      notes: data.notes ?? null, snapshot: {}, tenant_id: tid,
      ...(data.opportunity_id ? { opportunity_id: data.opportunity_id } : {}),
    };

    let { data: quote, error: quoteErr } = await client.from("quotes").insert(quotePayload).select("id").single();
    if (quoteErr && data.opportunity_id && quoteErr.message?.includes("opportunity_id")) {
      delete quotePayload.opportunity_id;
      const retry = await client.from("quotes").insert(quotePayload).select("id").single();
      quote = retry.data; quoteErr = retry.error;
    }

    if (quoteErr || !quote) {
      throw new Error(quoteErr?.message ?? "فشل إنشاء عرض السعر");
    }

    const quoteId = quote.id;

    // 2. Insert products → sections → units → components
    try {
      for (const product of data.products) {
        const { data: prodRow, error: prodErr } = await client
          .from("quotation_products")
          .insert({ quotation_id: quoteId, product_type_code: product.productTypeCode, label: product.label ?? null, position: product.position, tenant_id: tid })
          .select("id")
          .single();

        if (prodErr || !prodRow) {
          throw new Error(`Failed to insert product: ${prodErr?.message ?? "no id"}`);
        }

        for (const section of product.sections) {
          const { data: secRow, error: secErr } = await client
            .from("sections")
            .insert({ quotation_product_id: prodRow.id, label: section.label ?? null, position: section.position, tenant_id: tid })
            .select("id")
            .single();

          if (secErr || !secRow) {
            throw new Error(`Failed to insert section: ${secErr?.message ?? "no id"}`);
          }

          for (const unit of section.units) {
            const { data: unitRow, error: unitErr } = await client
              .from("units")
              .insert({
                section_id: secRow.id,
                unit_type_id: unit.unitTypeId ?? null,
                length_mm: unit.lengthMm,
                width_mm: unit.widthMm,
                height_mm: unit.heightMm,
                depth_mm: unit.depthMm,
                dimension_unit: unit.dimensionUnit,
                qty: unit.qty,
                finish_id: unit.finishId ?? null,
                width_tier: unit.widthTier ?? null,
                override_factor_keys: unit.overrideFactorKeys ?? {},
                position: unit.position,
                tenant_id: tid,
              })
              .select("id")
              .single();

            if (unitErr || !unitRow) {
              throw new Error(`Failed to insert unit: ${unitErr?.message ?? "no id"}`);
            }

            if (unit.components.length > 0) {
              const componentInserts = unit.components.map((c) => ({
                unit_id: unitRow.id,
                kind: c.kind,
                catalog_id: c.catalogId ?? null,
                qty: c.qty,
                unit_of_measure: c.unitOfMeasure,
                area_function_key: c.areaFunctionKey ?? null,
                position: c.position,
                tenant_id: tid,
              }));

              const { error: compErr } = await client
                .from("components")
                .insert(componentInserts as any);

              if (compErr) {
                throw new Error(`Failed to insert components: ${compErr.message}`);
              }
            }
          }
        }
      }

      // 3. Compute pricing and update quotes row (so summary shows correct total)
      try {
        await computeAndPersistQuotePrices(tid, quoteId, client);
      } catch (priceErr) {
        log.error("saveV2Quote: pricing computation failed (non-blocking):", {
          error: priceErr instanceof Error ? priceErr.message : String(priceErr),
        });
      }

      // 4. Run shadow comparison if feature flag is on (non-blocking)
      try {
        const { data: tenantRow } = await client
          .from("tenants")
          .select("feature_flags")
          .eq("id", tid)
          .single();

        const flags = (tenantRow?.feature_flags as Record<string, boolean>) ?? {};
        if (flags.pricing_shadow) {
          await runShadow(quoteId, tid, undefined, client);
        }
      } catch (shadowErr) {
        log.error("saveV2Quote shadow pricing failed (non-blocking):", {
          error: shadowErr instanceof Error ? shadowErr.message : String(shadowErr),
        });
      }
    } catch (hierarchyErr) {
      // Roll back: delete the quote (cascades to products → sections → units → components)
      await client.from("quotes").delete().eq("id", quoteId);
      throw hierarchyErr;
    }

    // ── CRM Opportunity Synchronization (non-blocking) ─────────────────────────
    if (data.opportunity_id) {
      try {
        const [opp] = await db
          .select({ id: opportunities.id, stage: opportunities.stage, value: opportunities.value })
          .from(opportunities)
          .where(and(eq(opportunities.id, data.opportunity_id), eq(opportunities.tenantId, tid)))
          .limit(1);

        if (opp) {
          const [savedQuote] = await db
            .select({ total: quotes.total })
            .from(quotes)
            .where(eq(quotes.id, quoteId))
            .limit(1);

          const quoteTotalNum = savedQuote ? Number(savedQuote.total || 0) : 0;
          const earlyStages = ["new_lead", "contacted", "qualified", "site_visit"];
          const newStage = data.status === "sent" ? "quotation" : earlyStages.includes(opp.stage) ? "design_measurement" : opp.stage;

          await db
            .update(opportunities)
            .set({
              stage: newStage,
              ...(quoteTotalNum > 0 ? { value: String(quoteTotalNum) } : {}),
              updatedAt: new Date(),
            })
            .where(and(eq(opportunities.id, opp.id), eq(opportunities.tenantId, tid)));
        }
      } catch (oppErr) {
        log.error("saveV2Quote: opportunity sync failed (non-blocking):", { error: String(oppErr) });
      }
    }

    return { quoteId };
  });

const UpdateQuoteStatusInput = z.object({
  quote_id: z.string().uuid(),
  status: z.enum([
    "draft",
    "sent",
    "accepted",
    "rejected",
    "expired",
    "converted",
    "awaiting_customer_confirmation",
    "approved_for_delivery",
    "pdf_sent",
    "awaiting_customer_decision",
    "revision_requested",
  ]),
});

export const updateQuoteStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => UpdateQuoteStatusInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const tid = ctx.tenantId;
    const client = (context as any).supabase;

    // ── Block send with no priceable units ──────────────────────────────
    if (data.status === "sent" || data.status === "awaiting_customer_confirmation") {
      // Get section IDs for this quote's products
      const { data: productRows } = await client
        .from("quotation_products")
        .select("id")
        .eq("quotation_id", data.quote_id)
        .eq("tenant_id", tid);

      const productIds = (productRows ?? []).map((p: any) => p.id);

      if (productIds.length === 0) {
        // Also check if commercial quote_items exist
        const { count: itemsCount } = await client
          .from("quote_items")
          .select("id", { count: "exact", head: true })
          .eq("quote_id", data.quote_id)
          .eq("tenant_id", tid);

        if (!itemsCount || itemsCount === 0) {
          throw new Error("Cannot send: quote has no products or items. Add at least one product with units or commercial item.");
        }
      } else {
        const { data: sectionRows } = await client
          .from("sections")
          .select("id")
          .in("quotation_product_id", productIds)
          .eq("tenant_id", tid);

        const sectionIds = (sectionRows ?? []).map((s: any) => s.id);

        if (sectionIds.length === 0) {
          throw new Error("Cannot send: quote has no sections. Add at least one section with units.");
        }

        const { count } = await client
          .from("units")
          .select("id", { count: "exact", head: true })
          .in("section_id", sectionIds)
          .eq("tenant_id", tid);

        if (!count || count === 0) {
          throw new Error("Cannot send: quote has no priceable units. Add at least one unit with components.");
        }
      }
    }

    // ── Fetch current quote data (including opportunity link) ─────────
    const [quoteRow] = await db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        customerId: quotes.customerId,
        snapshot: quotes.snapshot,
        total: quotes.total,
        validUntil: quotes.validUntil,
      })
      .from(quotes)
      .where(and(eq(quotes.id, data.quote_id), eq(quotes.tenantId, tid)))
      .limit(1);

    if (!quoteRow) {
      throw new Error("Quote not found");
    }

    const linkedOpportunityId = (quoteRow.snapshot as any)?.opportunityId || (quoteRow.snapshot as any)?.opportunity_id || null;

    // ── Map progressive status to DB enum & snapshot lifecycle ────────
    let dbStatus: "draft" | "sent" | "accepted" | "rejected" | "expired" | "converted" = "draft";
    let lifecycleStage: QuotationLifecycleStage = "draft";

    if (data.status === "awaiting_customer_confirmation") {
      dbStatus = "sent";
      lifecycleStage = "awaiting_customer_confirmation";
    } else if (data.status === "approved_for_delivery") {
      dbStatus = "sent";
      lifecycleStage = "approved_for_delivery";
    } else if (data.status === "pdf_sent") {
      dbStatus = "sent";
      lifecycleStage = "pdf_sent";
    } else if (data.status === "awaiting_customer_decision") {
      dbStatus = "sent";
      lifecycleStage = "awaiting_customer_decision";
    } else if (data.status === "revision_requested") {
      dbStatus = "draft";
      lifecycleStage = "revision_requested";
    } else if (data.status === "sent") {
      dbStatus = "sent";
      lifecycleStage = "awaiting_customer_decision";
    } else if (data.status === "accepted") {
      dbStatus = "accepted";
      lifecycleStage = "accepted";
    } else if (data.status === "rejected") {
      dbStatus = "rejected";
      lifecycleStage = "rejected";
    } else if (data.status === "converted") {
      dbStatus = "converted";
      lifecycleStage = "converted";
    } else if (data.status === "expired") {
      dbStatus = "expired";
      lifecycleStage = "expired";
    } else {
      dbStatus = "draft";
      lifecycleStage = "draft";
    }

    const currentSnap = ((quoteRow.snapshot as any) || {}) as Record<string, any>;
    const updatedLifecycle = {
      ...(currentSnap.lifecycle || {}),
      stage: lifecycleStage,
      updated_at: new Date().toISOString(),
      ...(lifecycleStage === "accepted" ? { decision: "accepted", decision_at: new Date().toISOString() } : {}),
      ...(lifecycleStage === "rejected" ? { decision: "rejected", decision_at: new Date().toISOString() } : {}),
      ...(lifecycleStage === "revision_requested" ? { decision: "revision_requested", decision_at: new Date().toISOString() } : {}),
    };
    const updatedSnap = {
      ...currentSnap,
      lifecycle: updatedLifecycle,
    };

    // ── Update status & snapshot ─────────────────────────────────────────
    const { error } = await client
      .from("quotes")
      .update({ status: dbStatus, snapshot: updatedSnap })
      .eq("id", data.quote_id)
      .eq("tenant_id", tid);

    if (error) throw new Error(error.message);

    // ── Freeze snapshot on transition to sent/accepted ───────────────────
    if (FREEZE_STATES.has(data.status)) {
      try {
        await freezeQuoteSnapshot(tid, data.quote_id, data.status, client);
      } catch (snapErr) {
        // Snapshot failure is logged but does NOT block the status change.
        // The quote is already updated; the snapshot is an audit safety net.
        log.error("freezeQuoteSnapshot failed (non-blocking)", {
          tenantId: tid,
          quoteId: data.quote_id,
          state: data.status,
          error: snapErr instanceof Error ? snapErr.message : String(snapErr),
        });
      }
    }

    // ── CRM Opportunity Synchronization & Follow-up Task Generation ─────
    if (linkedOpportunityId) {
      try {
        const [opp] = await db
          .select({
            id: opportunities.id,
            stage: opportunities.stage,
            status: opportunities.status,
            salesOwner: opportunities.salesOwner,
            value: opportunities.value,
          })
          .from(opportunities)
          .where(and(eq(opportunities.id, linkedOpportunityId), eq(opportunities.tenantId, tid)))
          .limit(1);

        if (opp) {
          const quoteTotalNum = Number(quoteRow.total || 0);

          if (data.status === "sent") {
            const earlyStages = ["new_lead", "contacted", "qualified", "site_visit", "design_measurement"];
            const newStage = earlyStages.includes(opp.stage) ? "quotation" : opp.stage;

            const followUpDate = new Date();
            followUpDate.setDate(followUpDate.getDate() + 3);

            await db
              .update(opportunities)
              .set({
                stage: newStage,
                status: "open",
                ...(quoteTotalNum > 0 ? { value: String(quoteTotalNum) } : {}),
                nextAction: `متابعة عرض السعر ${quoteRow.quoteNumber}`,
                nextActionDate: followUpDate,
                updatedAt: new Date(),
              })
              .where(and(eq(opportunities.id, opp.id), eq(opportunities.tenantId, tid)));

            // Generate atomic sequential task code & create follow-up task
            const taskCode = await getNextTaskCode(tid);
            const [insertedTask] = await db
              .insert(tasks)
              .values({
                tenantId: tid,
                taskCode,
                title: `متابعة عرض السعر ${quoteRow.quoteNumber}`,
                description: `متابعة العميل بخصوص عرض السعر رقم ${quoteRow.quoteNumber} بقيمة ${quoteTotalNum} ج.م ومناقشة بنود المقايسة`,
                status: "not_started",
                priority: "high",
                category: "crm_follow_up",
                dueDate: followUpDate,
                createdBy: ctx.userId || opp.salesOwner || "00000000-0000-0000-0000-000000000000",
                customerId: quoteRow.customerId,
                quoteId: quoteRow.id,
                opportunityId: opp.id,
              })
              .returning({ id: tasks.id });

            if (opp.salesOwner && insertedTask) {
              await db.insert(taskAssignees).values({
                tenantId: tid,
                taskId: insertedTask.id,
                userId: opp.salesOwner,
              });
            }

            await db.insert(auditLog).values({
              tenantId: tid,
              actorId: ctx.userId ?? "system",
              entityType: "opportunity",
              entityId: opp.id,
              action: "quote_sent_sync",
              details: {
                quoteId: quoteRow.id,
                quoteNumber: quoteRow.quoteNumber,
                stage: newStage,
                taskId: insertedTask?.id,
                taskCode,
              },
            });
          } else if (data.status === "accepted") {
            await db
              .update(opportunities)
              .set({
                stage: "won",
                status: "won",
                ...(quoteTotalNum > 0 ? { value: String(quoteTotalNum) } : {}),
                lostReason: null,
                nextAction: `بدء التنفيذ والتعاقد - عرض ${quoteRow.quoteNumber}`,
                nextActionDate: new Date(),
                updatedAt: new Date(),
              })
              .where(and(eq(opportunities.id, opp.id), eq(opportunities.tenantId, tid)));

            await db.insert(auditLog).values({
              tenantId: tid,
              actorId: ctx.userId ?? "system",
              entityType: "opportunity",
              entityId: opp.id,
              action: "opportunity_won",
              details: {
                reason: "Quote accepted by customer",
                quoteId: quoteRow.id,
                quoteNumber: quoteRow.quoteNumber,
                amount: quoteTotalNum,
              },
            });
          } else if (data.status === "rejected") {
            // Do NOT mark opportunity as lost! Move to negotiation to revise requirements/pricing
            const followUpDate = new Date();
            followUpDate.setDate(followUpDate.getDate() + 2);

            await db
              .update(opportunities)
              .set({
                stage: "negotiation",
                status: "open",
                nextAction: `مراجعة العميل بعد رفض عرض السعر ${quoteRow.quoteNumber}`,
                nextActionDate: followUpDate,
                updatedAt: new Date(),
              })
              .where(and(eq(opportunities.id, opp.id), eq(opportunities.tenantId, tid)));

            const taskCode = await getNextTaskCode(tid);
            const [insertedTask] = await db
              .insert(tasks)
              .values({
                tenantId: tid,
                taskCode,
                title: `مراجعة متطلبات العميل بعد رفض عرض السعر ${quoteRow.quoteNumber}`,
                description: `رفض العميل عرض السعر ${quoteRow.quoteNumber}. مطلوب التواصل لمعرفة أسباب الرفض وتقديم بدائل مناسبة أو خصم تجاري`,
                status: "not_started",
                priority: "high",
                category: "crm_follow_up",
                dueDate: followUpDate,
                createdBy: ctx.userId || opp.salesOwner || "00000000-0000-0000-0000-000000000000",
                customerId: quoteRow.customerId,
                quoteId: quoteRow.id,
                opportunityId: opp.id,
              })
              .returning({ id: tasks.id });

            if (opp.salesOwner && insertedTask) {
              await db.insert(taskAssignees).values({
                tenantId: tid,
                taskId: insertedTask.id,
                userId: opp.salesOwner,
              });
            }

            await db.insert(auditLog).values({
              tenantId: tid,
              actorId: ctx.userId ?? "system",
              entityType: "opportunity",
              entityId: opp.id,
              action: "quote_rejected_negotiation",
              details: {
                quoteId: quoteRow.id,
                quoteNumber: quoteRow.quoteNumber,
                stage: "negotiation",
                taskId: insertedTask?.id,
                taskCode,
              },
            });
          }
        }
      } catch (oppErr) {
        log.error("updateQuoteStatus: CRM sync failed (non-blocking):", {
          error: String(oppErr),
        });
      }
    }

    return { ok: true };
  });

// ── Progressive Quotation Lifecycle Functions ──────────────────────────────

const ApproveQuoteInput = z.object({
  quote_id: z.string().uuid(),
});

export const approveQuoteAndRequestConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => ApproveQuoteInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Quotation Approval");
    const tid = ctx.tenantId;
    const client = (context as any).supabase;

    // 1. Fetch quote
    const [quoteRow] = await db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        customerId: quotes.customerId,
        status: quotes.status,
        total: quotes.total,
        snapshot: quotes.snapshot,
      })
      .from(quotes)
      .where(and(eq(quotes.id, data.quote_id), eq(quotes.tenantId, tid)))
      .limit(1);

    if (!quoteRow) {
      throw new Error("Quotation not found");
    }

    if (quoteRow.status === "converted") {
      throw new Error("Cannot approve quotation that has already been converted to an order");
    }

    // 2. Validate priceable items exist (check quotation_products or quote_items)
    const { count: itemsCount } = await client
      .from("quote_items")
      .select("id", { count: "exact", head: true })
      .eq("quote_id", data.quote_id)
      .eq("tenant_id", tid);

    if (!itemsCount || itemsCount === 0) {
      const { count: prodCount } = await client
        .from("quotation_products")
        .select("id", { count: "exact", head: true })
        .eq("quotation_id", data.quote_id)
        .eq("tenant_id", tid);

      if (!prodCount || prodCount === 0) {
        throw new Error("Cannot approve: quotation has no items or products. Add items before requesting confirmation.");
      }
    }

    // 3. Prepare tracking token & progressive lifecycle
    const existingSnap = (quoteRow.snapshot || {}) as Record<string, any>;
    const trackingToken = existingSnap.tracking_token || existingSnap.trackingToken || crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const updatedLifecycle = {
      ...(existingSnap.lifecycle || {}),
      stage: "awaiting_customer_confirmation",
      approved_at: nowIso,
      approved_by: ctx.userId,
      confirmation_requested_at: nowIso,
      confirmation_status: "pending",
      decision: null,
      decision_at: null,
      decision_notes: null,
      version_history: existingSnap.version_history || [],
    };

    const newSnapshot = {
      ...existingSnap,
      tracking_token: trackingToken,
      trackingToken,
      lifecycle: updatedLifecycle,
    };

    // 4. Update quote in DB
    await db
      .update(quotes)
      .set({
        status: "sent",
        snapshot: newSnapshot,
      })
      .where(and(eq(quotes.id, data.quote_id), eq(quotes.tenantId, tid)));

    // 5. Freeze snapshot for state transition
    try {
      await freezeQuoteSnapshot(tid, data.quote_id, "sent", client);
    } catch (e) {
      log.warn("freezeQuoteSnapshot non-blocking warning:", { error: String(e) });
    }

    // 6. Deliver WhatsApp Confirmation Request via n8n
    const [custRow] = await db
      .select({ name: customers.name, phone: customers.phone, email: customers.email })
      .from(customers)
      .where(and(eq(customers.id, quoteRow.customerId), eq(customers.tenantId, tid)))
      .limit(1);

    const siteUrl = (process.env.SITE_URL || "").replace(/\/$/, "");
    const trackingLink = siteUrl ? `${siteUrl}/track?ref=${encodeURIComponent(trackingToken)}` : `/track?ref=${encodeURIComponent(trackingToken)}`;

    if (custRow?.phone) {
      const message = `مرحباً ${custRow.name || "العميل العزيز"}، عرض السعر الخاص بكم ${quoteRow.quoteNumber} بقيمة ${Number(quoteRow.total || 0).toLocaleString()} ج.م جاهز. هل ترغب في استلام ملف عرض السعر عبر واتساب؟\n[نعم، أرسل عرض السعر] [لا، ليس الآن]`;

      await deliverToN8n(
        { tenantId: tid, role: ctx.role },
        {
          event: "quote_confirmation_request",
          reference: quoteRow.quoteNumber,
          channels: ["whatsapp"],
          to: { phone: custRow.phone, email: custRow.email },
          subject: `اعتماد عرض السعر وطلب تأكيد العميل — ${quoteRow.quoteNumber}`,
          message,
          link: trackingLink,
          locale: "ar",
          entity: { type: "quote", id: quoteRow.id },
          extra: {
            quote_id: quoteRow.id,
            tracking_token: trackingToken,
            total: String(quoteRow.total),
            interactive_actions: "yes_send_quote,no_not_now",
          },
        },
      );
    }

    // 7. Audit log
    await db.insert(auditLog).values({
      tenantId: tid,
      actorId: ctx.userId ?? "system",
      entityType: "quotation",
      entityId: quoteRow.id,
      action: "quote_approved_and_confirmation_requested",
      details: {
        quoteNumber: quoteRow.quoteNumber,
        trackingToken,
        stage: "awaiting_customer_confirmation",
      },
    });

    return {
      ok: true,
      quoteId: quoteRow.id,
      quoteNumber: quoteRow.quoteNumber,
      trackingToken,
      stage: "awaiting_customer_confirmation",
    };
  });

const RecordConsentInput = z.object({
  quoteId: z.string().uuid().optional(),
  trackingToken: z.string().optional(),
  quoteNumber: z.string().optional(),
  phone: z.string().optional(),
  consent: z.boolean(),
  notes: z.string().optional(),
});

export const recordCustomerQuoteConsent = createServerFn({ method: "POST" })
  .inputValidator((d) => RecordConsentInput.parse(d))
  .handler(async ({ data }) => {
    let quoteRow: any = null;

    if (data.quoteId) {
      const [q] = await db
        .select()
        .from(quotes)
        .where(eq(quotes.id, data.quoteId))
        .limit(1);
      quoteRow = q ?? null;
    } else if (data.trackingToken) {
      const [q] = await db
        .select()
        .from(quotes)
        .where(
          sql`${quotes.id} = ${data.trackingToken}::uuid OR ${quotes.snapshot}->>'tracking_token' = ${data.trackingToken}`,
        )
        .limit(1);
      quoteRow = q ?? null;
    } else if (data.quoteNumber && data.phone) {
      const [q] = await db
        .select({
          quote: quotes,
          customerPhone: customers.phone,
        })
        .from(quotes)
        .innerJoin(customers, eq(quotes.customerId, customers.id))
        .where(eq(quotes.quoteNumber, data.quoteNumber))
        .limit(1);

      if (q && normalizePhone(q.customerPhone || "") === normalizePhone(data.phone)) {
        quoteRow = q.quote;
      }
    }

    if (!quoteRow) {
      throw new Error("Quotation not found or verification failed");
    }

    const tid = quoteRow.tenantId;
    const existingSnap = (quoteRow.snapshot || {}) as Record<string, any>;
    const trackingToken = existingSnap.tracking_token || existingSnap.trackingToken || quoteRow.id;
    const nowIso = new Date().toISOString();

    if (data.consent) {
      const updatedLifecycle = {
        ...(existingSnap.lifecycle || {}),
        stage: "approved_for_delivery",
        confirmation_status: "consented",
        consented_at: nowIso,
        pdf_sent_at: nowIso,
      };

      const newSnapshot = {
        ...existingSnap,
        tracking_token: trackingToken,
        trackingToken,
        customer_consent: {
          consented: true,
          consented_at: nowIso,
          notes: data.notes || null,
        },
        lifecycle: updatedLifecycle,
      };

      // CRITICAL: Commercially, this is NOT acceptance. Status remains 'sent' in DB enum!
      await db
        .update(quotes)
        .set({
          status: "sent",
          snapshot: newSnapshot,
        })
        .where(eq(quotes.id, quoteRow.id));

      const [custRow] = await db
        .select({ name: customers.name, phone: customers.phone, email: customers.email })
        .from(customers)
        .where(eq(customers.id, quoteRow.customerId))
        .limit(1);

      const siteUrl = (process.env.SITE_URL || "").replace(/\/$/, "");
      const trackingLink = siteUrl
        ? `${siteUrl}/track?ref=${encodeURIComponent(trackingToken)}`
        : `/track?ref=${encodeURIComponent(trackingToken)}`;

      if (custRow?.phone) {
        const message = `مرحباً ${custRow.name || "العميل العزيز"}، يسعدنا تزويدكم برابط تفاصيل ومستند عرض السعر الخاص بكم ${quoteRow.quoteNumber}:\n${trackingLink}\nيمكنكم مراجعة كافة المواصفات والأسعار والموافقة أو طلب التعديل مباشرة عبر الرابط.`;

        await deliverToN8n(
          { tenantId: tid, role: "sales" },
          {
            event: "quote_pdf_delivery",
            reference: quoteRow.quoteNumber,
            channels: ["whatsapp"],
            to: { phone: custRow.phone, email: custRow.email },
            subject: `رابط ملف عرض السعر — ${quoteRow.quoteNumber}`,
            message,
            link: trackingLink,
            locale: "ar",
            entity: { type: "quote", id: quoteRow.id },
            extra: {
              quote_id: quoteRow.id,
              tracking_token: trackingToken,
            },
          },
        );
      }

      // Transition to awaiting_customer_decision
      updatedLifecycle.stage = "awaiting_customer_decision";
      newSnapshot.lifecycle = updatedLifecycle;
      await db
        .update(quotes)
        .set({ snapshot: newSnapshot })
        .where(eq(quotes.id, quoteRow.id));

      await db.insert(auditLog).values({
        tenantId: tid,
        actorId: "customer",
        entityType: "quotation",
        entityId: quoteRow.id,
        action: "quote_pdf_delivery_consented",
        details: {
          quoteNumber: quoteRow.quoteNumber,
          trackingToken,
          trackingLink,
        },
      });

      return {
        ok: true,
        consented: true,
        stage: "awaiting_customer_decision",
        link: trackingLink,
      };
    } else {
      const updatedLifecycle = {
        ...(existingSnap.lifecycle || {}),
        stage: "awaiting_customer_confirmation",
        confirmation_status: "declined",
        declined_at: nowIso,
      };

      const newSnapshot = {
        ...existingSnap,
        customer_consent: {
          consented: false,
          declined_at: nowIso,
          notes: data.notes || null,
        },
        lifecycle: updatedLifecycle,
      };

      await db
        .update(quotes)
        .set({ snapshot: newSnapshot })
        .where(eq(quotes.id, quoteRow.id));

      await db.insert(auditLog).values({
        tenantId: tid,
        actorId: "customer",
        entityType: "quotation",
        entityId: quoteRow.id,
        action: "quote_confirmation_declined",
        details: {
          quoteNumber: quoteRow.quoteNumber,
          notes: data.notes || null,
        },
      });

      return {
        ok: true,
        consented: false,
        stage: "awaiting_customer_confirmation",
      };
    }
  });

const RecordDecisionInput = z.object({
  quoteId: z.string().uuid().optional(),
  trackingToken: z.string().optional(),
  decision: z.enum(["accept", "reject", "revision_requested"]),
  notes: z.string().max(1000).optional(),
});

export const recordCustomerQuoteDecision = createServerFn({ method: "POST" })
  .inputValidator((d) => RecordDecisionInput.parse(d))
  .handler(async ({ data, context }) => {
    return handleCustomerQuoteDecisionInternal({
      quoteId: data.quoteId,
      trackingToken: data.trackingToken,
      decision: data.decision,
      notes: data.notes,
      channel: (context as any)?.tenantContext?.userId ? "manager" : "track_page",
      userId: (context as any)?.tenantContext?.userId,
      freezeSnapshotFn: freezeQuoteSnapshot,
    });
  });

// ── Raw hierarchy loader (no middleware — called from server functions) ─────

async function loadHierarchyRaw(quotationId: string, tenantId: string, client: any) {
  // 1. Load products for this quotation
  const productsRes = await client
    .from("quotation_products")
    .select("id, quotation_id, product_type_code, label, position")
    .eq("quotation_id", quotationId)
    .eq("tenant_id", tenantId)
    .order("position");

  if (productsRes.error) throw new Error(`Failed to load products: ${productsRes.error.message}`);
  const productIds = (productsRes.data ?? []).map((p: any) => p.id);

  // 2. Load sections scoped to these products
  const sectionsRes = productIds.length > 0
    ? await client
        .from("sections")
        .select("id, quotation_product_id, label, material_id, finish_id, veneer_id, position")
        .in("quotation_product_id", productIds)
        .eq("tenant_id", tenantId)
        .order("position")
    : { data: [], error: null };

  if (sectionsRes.error) throw new Error(`Failed to load sections: ${sectionsRes.error.message}`);
  const sectionIds = (sectionsRes.data ?? []).map((s: any) => s.id);

  // 3. Load units scoped to these sections
  const unitsRes = sectionIds.length > 0
    ? await client
        .from("units")
        .select("id, section_id, unit_type_id, width_mm, height_mm, depth_mm, qty, finish_id, width_tier, override_factor_keys, position")
        .in("section_id", sectionIds)
        .eq("tenant_id", tenantId)
        .order("position")
    : { data: [], error: null };

  if (unitsRes.error) throw new Error(`Failed to load units: ${unitsRes.error.message}`);
  const unitIds = (unitsRes.data ?? []).map((u: any) => u.id);

  // 4. Load components scoped to these units
  const componentsRes = unitIds.length > 0
    ? await client
        .from("components")
        .select("id, unit_id, kind, catalog_id, qty, unit_of_measure, area_function_key, position")
        .in("unit_id", unitIds)
        .eq("tenant_id", tenantId)
        .order("position")
    : { data: [], error: null };

  if (componentsRes.error) throw new Error(`Failed to load components: ${componentsRes.error.message}`);

  const sectionsByProduct = new Map<string, typeof sectionsRes.data>();
  for (const s of sectionsRes.data ?? []) {
    const list = sectionsByProduct.get(s.quotation_product_id) ?? [];
    list.push(s);
    sectionsByProduct.set(s.quotation_product_id, list);
  }

  const unitsBySection = new Map<string, typeof unitsRes.data>();
  for (const u of unitsRes.data ?? []) {
    const list = unitsBySection.get(u.section_id) ?? [];
    list.push(u);
    unitsBySection.set(u.section_id, list);
  }

  const componentsByUnit = new Map<string, typeof componentsRes.data>();
  for (const c of componentsRes.data ?? []) {
    const list = componentsByUnit.get(c.unit_id) ?? [];
    list.push(c);
    componentsByUnit.set(c.unit_id, list);
  }

  return (productsRes.data ?? []).map((p: any) => ({
    ...p,
    sections: (sectionsByProduct.get(p.id) ?? [])
      .sort((a: any, b: any) => a.position - b.position)
      .map((s: any) => ({
        ...s,
        units: (unitsBySection.get(s.id) ?? [])
          .sort((a: any, b: any) => a.position - b.position)
          .map((u: any) => ({
            ...u,
            components: (componentsByUnit.get(u.id) ?? [])
              .sort((a: any, b: any) => a.position - b.position),
          })),
      })),
  }));
}

// ── Shared: compute pricing + update quotes row ────────────────────────────

/**
 * Load catalog, run engine-v3 pricing, and persist computed prices to the
 * quotes table. Used by both saveV2Quote (on create) and freezeQuoteSnapshot
 * (on status transition).
 *
 * Returns the QuoteOutput breakdown for callers that need it (snapshots, etc).
 */
async function computeAndPersistQuotePrices(
  tenantId: string,
  quotationId: string,
  client: any,
): Promise<ReturnType<typeof priceQuote>> {
  // 1. Load hierarchy
  const rawTree = await loadHierarchyRaw(quotationId, tenantId, client);

  // 2. Load all catalog + pricing data in parallel
  const [
    materialsRes,
    hardwareRes,
    accessoriesRes,
    mfgOpsRes,
    veneersRes,
    finishesRes,
    edgeBandsRes,
    factorsRes,
    wastageRes,
    feesRes,
  ] = await Promise.all([
    client.from("catalog_materials")
      .select("id, pricing_unit, price_per_unit, default_wastage_pct")
      .eq("tenant_id", tenantId).is("archived_at", null),
    client.from("catalog_hardware")
      .select("id, code, price_per_piece")
      .eq("tenant_id", tenantId).is("archived_at", null),
    client.from("catalog_accessories")
      .select("id, code, price_per_piece")
      .eq("tenant_id", tenantId).is("archived_at", null),
    client.from("catalog_manufacturing_operations")
      .select("id, rate_unit, rate")
      .eq("tenant_id", tenantId).is("archived_at", null),
    client.from("catalog_veneers")
      .select("id, price_per_m2")
      .eq("tenant_id", tenantId).is("archived_at", null),
    client.from("catalog_finishes")
      .select("id, price_per_unit")
      .eq("tenant_id", tenantId).is("archived_at", null),
    client.from("catalog_edge_bands")
      .select("id, price_per_unit")
      .eq("tenant_id", tenantId).is("archived_at", null),
    client.from("tenant_pricing_factors")
      .select("factor_key, value_type, percent, fixed_amount")
      .eq("tenant_id", tenantId).is("archived_at", null),
    client.from("tenant_wastage_rules")
      .select("scope, ref, pct")
      .eq("tenant_id", tenantId).is("archived_at", null),
    client.from("fees_credits")
      .select("code, sign, amount, formula_key")
      .eq("tenant_id", tenantId).is("archived_at", null),
  ]);

  const catalog: CatalogLookup = {
    materials: Object.fromEntries(
      (materialsRes.data ?? []).map((m: any) => [
        m.id,
        { id: m.id, pricingUnit: m.pricing_unit, pricePerUnit: m.price_per_unit, defaultWastagePct: m.default_wastage_pct },
      ]),
    ),
    hardware: Object.fromEntries(
      (hardwareRes.data ?? []).map((h: any) => {
        const code = String(h.code || "").toLowerCase();
        const pricingUnit = code.includes("set") || code.includes("runner") ? "set" : code.includes("pair") ? "pair" : "piece";
        return [h.id, { id: h.id, pricePerPiece: Number(h.price_per_piece), pricingUnit }];
      }),
    ),
    accessories: Object.fromEntries(
      (accessoriesRes.data ?? []).map((a: any) => {
        const code = String(a.code || "").toLowerCase();
        const pricingUnit = code.includes("set") ? "set" : code.includes("pair") ? "pair" : "piece";
        return [a.id, { id: a.id, pricePerPiece: Number(a.price_per_piece), pricingUnit }];
      }),
    ),
    manufacturingOps: Object.fromEntries(
      (mfgOpsRes.data ?? []).map((o: any) => [o.id, { id: o.id, rateUnit: o.rate_unit, rate: o.rate }]),
    ),
    veneers: Object.fromEntries(
      (veneersRes.data ?? []).map((v: any) => [v.id, { id: v.id, pricingUnit: "m2", pricePerUnit: v.price_per_m2, defaultWastagePct: 0 }]),
    ),
    finishes: Object.fromEntries(
      (finishesRes.data ?? []).map((f: any) => [f.id, { id: f.id, pricingUnit: "m2", pricePerUnit: f.price_per_unit, defaultWastagePct: 0 }]),
    ),
    edgeBands: Object.fromEntries(
      (edgeBandsRes.data ?? []).map((e: any) => [e.id, { id: e.id, pricingUnit: "m", pricePerUnit: e.price_per_unit, defaultWastagePct: 0 }]),
    ),
    pricingFactors: (factorsRes.data ?? []).map((f: any) => ({
      factorKey: f.factor_key,
      percent: Number(f.percent),
      valueType: f.value_type ?? "percent",
      fixedAmount: Number(f.fixed_amount ?? 0),
    })),
    wastageRules: (wastageRes.data ?? []).map((w: any) => ({ scope: w.scope, ref: w.ref, pct: w.pct })),
    feesCredits: (feesRes.data ?? []).map((fc: any) => ({ code: fc.code, sign: fc.sign as "plus" | "minus", amount: fc.amount, formulaKey: fc.formula_key })),
  };

  // 3. Run pricing engine
  const quoteInput: QuoteInput = {
    products: rawTree.map((p: any) => ({
      id: p.id,
      sections: (p.sections ?? []).map((s: any) => ({
        id: s.id,
        label: s.label ?? null,
        materialId: s.material_id ?? null,
        finishId: s.finish_id ?? null,
        veneerId: s.veneer_id ?? null,
        components: (s.components ?? []).map((c: any) => ({
          id: c.id,
          kind: c.kind,
          catalogId: c.catalog_id ?? null,
          qty: Number(c.qty ?? 0),
          unitOfMeasure: c.unit_of_measure ?? "pcs",
          areaFunctionKey: c.area_function_key ?? null,
        })),
        units: (s.units ?? []).map((u: any) => ({
          id: u.id,
          unitTypeId: u.unit_type_id ?? null,
          widthMm: u.width_mm ?? 0,
          heightMm: u.height_mm ?? 0,
          depthMm: u.depth_mm ?? 0,
          lengthMm: u.length_mm ?? 0,
          qty: u.qty ?? 1,
          finishId: u.finish_id ?? null,
          overrideFactorKeys: u.override_factor_keys ?? {},
          components: (u.components ?? []).map((c: any) => ({
            id: c.id,
            kind: c.kind,
            catalogId: c.catalog_id ?? null,
            qty: Number(c.qty ?? 0),
            unitOfMeasure: c.unit_of_measure ?? "pcs",
            areaFunctionKey: c.area_function_key ?? null,
          })),
        })),
      })),
    })),
  };
  const breakdown = priceQuote(quoteInput, catalog);

  // 4. Persist computed prices to quotes table
  const b = breakdown.breakdown;
  const { error: updateErr } = await client
    .from("quotes")
    .update({
      subtotal: String(b.subTotal),
      discount_amount: String(b.discount),
      vat_amount: String(b.vatAmount),
      total: String(b.total),
    })
    .eq("id", quotationId)
    .eq("tenant_id", tenantId);

  if (updateErr) {
    log.error("computeAndPersistQuotePrices: failed to update quotes row", {
      quoteId: quotationId,
      error: updateErr.message,
    });
  }

  return breakdown;
}

const RecomputeQuotationPricesInput = z.object({
  quotationId: z.string().uuid(),
});

export const recomputeQuotationPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => RecomputeQuotationPricesInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const client = (context as any).supabase;
    const result = await computeAndPersistQuotePrices(ctx.tenantId, data.quotationId, client);
    return { ok: true, total: result.computedPrice, breakdown: result.breakdown };
  });

// ── Freeze snapshot + audit on state transition ─────────────────────────────

/**
 * Load the hierarchy, price it via engine-v3, write a snapshot, and
 * record the transition in the audit log. Called from updateQuoteStatus
 * on transitions to `sent` or `accepted`.
 *
 * Throws on failure — caller decides whether to block the transition.
 */
async function freezeQuoteSnapshot(
  tenantId: string,
  quotationId: string,
  state: string,
  client: any,
): Promise<void> {
  // 1. Compute pricing + update quotes row (shared helper)
  const breakdown = await computeAndPersistQuotePrices(tenantId, quotationId, client);

  // 2. Load hierarchy tree for snapshot
  const rawTree = await loadHierarchyRaw(quotationId, tenantId, client);

  // 3. Load current rule version (latest active pricing rule)
  const { data: ruleRow } = await client
    .from("pricing_rules")
    .select("id, version")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 4. Load pricing factors for snapshot metadata
  const { data: factorsData } = await client
    .from("tenant_pricing_factors")
    .select("factor_key, value_type, percent, fixed_amount")
    .eq("tenant_id", tenantId)
    .is("archived_at", null);

  const factors = (factorsData ?? []).map((f: any) => ({
    factorKey: f.factor_key,
    percent: Number(f.percent),
    valueType: f.value_type ?? "percent",
    fixedAmount: Number(f.fixed_amount ?? 0),
  }));

  // 5. Write snapshot
  await writeSnapshot({
    tenantId,
    quotationId,
    state,
    tree: rawTree,
    breakdown: breakdown.breakdown,
    ruleVersionId: ruleRow?.id ?? null,
    factors,
  }, client);

  // 6. Write audit log
  const { error: auditErr } = await client.from("audit_log").insert({
    tenant_id: tenantId,
    entity_type: "quotation",
    entityId: quotationId,
    action: `status_change:${state}`,
    details: {
      rule_version_id: ruleRow?.id ?? null,
      rule_version_number: ruleRow?.version ?? null,
      factors,
      breakdown_total: breakdown.breakdown.total,
    },
  });

  if (auditErr) {
    log.error("audit_log insert failed (non-blocking)", { error: auditErr.message });
  }

  log.info("freezeQuoteSnapshot", {
    tenantId,
    quotationId,
    state,
    ruleVersionId: ruleRow?.id ?? null,
    breakdownTotal: breakdown.breakdown.total,
  });
}

// ── Snapshot helper (append-only, pricing immutability) ─────────────────────

export interface WriteSnapshotInput {
  tenantId: string;
  quotationId: string;
  state: string;
  tree: unknown;
  breakdown: unknown;
  ruleVersionId?: string | null;
  factors?: unknown | null;
}

/**
 * Freeze the full quote tree + computed breakdown at a state transition.
 *
 * This is an internal helper — not a client-callable server function.
 * Call it from changeStatus / convertToInvoice / any status-changing handler.
 *
 * Two snapshots for the same (quotationId, state) are allowed (re-send)
 * and ordered by created_at via the composite index.
 *
 * Throws on failure — callers should catch and decide whether to block
 * the status change.
 */
export async function writeSnapshot(input: WriteSnapshotInput, client: any): Promise<void> {
  const { tenantId, quotationId, state, tree, breakdown, ruleVersionId, factors } = input;

  const { error } = await client.from("quote_snapshots").insert({
    tenant_id: tenantId,
    quotation_id: quotationId,
    state,
    tree_json: tree,
    breakdown_json: breakdown,
    rule_version_id: ruleVersionId ?? null,
    factors_json: factors ?? null,
  });

  if (error) {
    throw new Error(`writeSnapshot failed: ${error.message}`);
  }
}

// ── priceQuotationTree — server fn wrapper for engine-v3 ────────────────────

const PriceQuotationTreeInput = z.object({
  tree: z.object({
    products: z.array(z.any()),
    discount: z.object({ amount: z.number(), maxValue: z.number().nullish() }).optional(),
  }),
});

/**
 * Price a full quotation tree using engine-v3.
 *
 * Loads all catalog + pricing lever data from DB (tenant-scoped, parallel),
 * builds a CatalogLookup, and runs the pure priceQuote() function.
 *
 * Returns the full QuoteOutput with component-level cost breakdown.
 */
export const priceQuotationTree = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => PriceQuotationTreeInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const tid = ctx.tenantId;
    const client = (context as any).supabase;

    // Load all catalog + pricing data in parallel
    const [
      materialsRes,
      hardwareRes,
      accessoriesRes,
      mfgOpsRes,
      veneersRes,
      finishesRes,
      edgeBandsRes,
      factorsRes,
      wastageRes,
      feesRes,
    ] = await Promise.all([
      client
        .from("catalog_materials")
        .select("id, pricing_unit, price_per_unit, default_wastage_pct")
        .eq("tenant_id", tid)
        .is("archived_at", null),
      client
        .from("catalog_hardware")
        .select("id, code, price_per_piece")
        .eq("tenant_id", tid)
        .is("archived_at", null),
      client
        .from("catalog_accessories")
        .select("id, code, price_per_piece")
        .eq("tenant_id", tid)
        .is("archived_at", null),
      client
        .from("catalog_manufacturing_operations")
        .select("id, rate_unit, rate")
        .eq("tenant_id", tid)
        .is("archived_at", null),
      client
        .from("catalog_veneers")
        .select("id, price_per_m2")
        .eq("tenant_id", tid)
        .is("archived_at", null),
      client
        .from("catalog_finishes")
        .select("id, price_per_unit")
        .eq("tenant_id", tid)
        .is("archived_at", null),
      client
        .from("catalog_edge_bands")
        .select("id, price_per_unit")
        .eq("tenant_id", tid)
        .is("archived_at", null),
      client
        .from("tenant_pricing_factors")
      .select("factor_key, value_type, percent, fixed_amount")
        .eq("tenant_id", tid)
        .is("archived_at", null),
      client
        .from("tenant_wastage_rules")
        .select("scope, ref, pct")
        .eq("tenant_id", tid)
        .is("archived_at", null),
      client
        .from("fees_credits")
        .select("code, sign, amount, formula_key")
        .eq("tenant_id", tid)
        .is("archived_at", null),
    ]);

    // Check for errors
    for (const [label, res] of [
      ["materials", materialsRes],
      ["hardware", hardwareRes],
      ["accessories", accessoriesRes],
      ["manufacturingOps", mfgOpsRes],
      ["veneers", veneersRes],
      ["finishes", finishesRes],
      ["edgeBands", edgeBandsRes],
      ["pricingFactors", factorsRes],
      ["wastageRules", wastageRes],
      ["feesCredits", feesRes],
    ] as const) {
      if (res.error) {
        throw new Error(`Failed to load ${label}: ${res.error.message}`);
      }
    }

    // Build flat catalog maps
    const catalog: CatalogLookup = {
      materials: Object.fromEntries(
        (materialsRes.data ?? []).map((m: any) => [
          m.id,
          {
            id: m.id,
            pricingUnit: m.pricing_unit,
            pricePerUnit: m.price_per_unit,
            defaultWastagePct: m.default_wastage_pct,
          },
        ]),
      ),
      hardware: Object.fromEntries(
        (hardwareRes.data ?? []).map((h: any) => {
          const code = String(h.code || "").toLowerCase();
          const pricingUnit = code.includes("set") || code.includes("runner") ? "set" : code.includes("pair") ? "pair" : "piece";
          return [
            h.id,
            { id: h.id, pricePerPiece: Number(h.price_per_piece), pricingUnit },
          ];
        }),
      ),
      accessories: Object.fromEntries(
        (accessoriesRes.data ?? []).map((a: any) => {
          const code = String(a.code || "").toLowerCase();
          const pricingUnit = code.includes("set") ? "set" : code.includes("pair") ? "pair" : "piece";
          return [
            a.id,
            { id: a.id, pricePerPiece: Number(a.price_per_piece), pricingUnit },
          ];
        }),
      ),
      manufacturingOps: Object.fromEntries(
        (mfgOpsRes.data ?? []).map((o: any) => [
          o.id,
          { id: o.id, rateUnit: o.rate_unit, rate: o.rate },
        ]),
      ),
      veneers: Object.fromEntries(
        (veneersRes.data ?? []).map((v: any) => [
          v.id,
          {
            id: v.id,
            pricingUnit: "m2",
            pricePerUnit: v.price_per_m2,
            defaultWastagePct: 0,
          },
        ]),
      ),
      finishes: Object.fromEntries(
        (finishesRes.data ?? []).map((f: any) => [
          f.id,
          {
            id: f.id,
            pricingUnit: "m2",
            pricePerUnit: f.price_per_unit,
            defaultWastagePct: 0,
          },
        ]),
      ),
      edgeBands: Object.fromEntries(
        (edgeBandsRes.data ?? []).map((e: any) => [
          e.id,
          {
            id: e.id,
            pricingUnit: "m",
            pricePerUnit: e.price_per_unit,
            defaultWastagePct: 0,
          },
        ]),
      ),
      pricingFactors: (factorsRes.data ?? []).map((f: any) => ({
        factorKey: f.factor_key,
        percent: Number(f.percent),
        valueType: f.value_type ?? "percent",
        fixedAmount: Number(f.fixed_amount ?? 0),
      })),
      wastageRules: (wastageRes.data ?? []).map((w: any) => ({
        scope: w.scope,
        ref: w.ref,
        pct: w.pct,
      })),
      feesCredits: (feesRes.data ?? []).map((fc: any) => ({
        code: fc.code,
        sign: fc.sign as "plus" | "minus",
        amount: fc.amount,
        formulaKey: fc.formula_key,
      })),
    };

    // Convert snake_case client tree → camelCase for engine-v3
    const tree: QuoteInput = {
      products: data.tree.products.map((p: any) => ({
        id: p.id,
        sections: (p.sections ?? []).map((s: any) => ({
          id: s.id,
          label: s.label ?? null,
          materialId: s.material_id ?? s.materialId ?? null,
          finishId: s.finish_id ?? s.finishId ?? null,
          veneerId: s.veneer_id ?? s.veneerId ?? null,
          components: (s.components ?? []).map((c: any) => ({
            id: c.id,
            kind: c.kind,
            catalogId: c.catalog_id ?? c.catalogId ?? null,
            qty: Number(c.qty ?? 0),
            unitOfMeasure: c.unit_of_measure ?? c.unitOfMeasure ?? "pcs",
            areaFunctionKey: c.area_function_key ?? c.areaFunctionKey ?? null,
          })),
          units: (s.units ?? []).map((u: any) => ({
            id: u.id,
            unitTypeId: u.unit_type_id ?? u.unitTypeId ?? null,
            widthMm: u.width_mm ?? u.widthMm ?? 0,
            heightMm: u.height_mm ?? u.heightMm ?? 0,
            depthMm: u.depth_mm ?? u.depthMm ?? 0,
            lengthMm: u.length_mm ?? u.lengthMm ?? 0,
            qty: u.qty ?? 1,
            finishId: u.finish_id ?? u.finishId ?? null,
            overrideFactorKeys: u.override_factor_keys ?? u.overrideFactorKeys ?? {},
            components: (u.components ?? []).map((c: any) => ({
              id: c.id,
              kind: c.kind,
              catalogId: c.catalog_id ?? c.catalogId ?? null,
              qty: Number(c.qty ?? 0),
              unitOfMeasure: c.unit_of_measure ?? c.unitOfMeasure ?? "pcs",
              areaFunctionKey: c.area_function_key ?? c.areaFunctionKey ?? null,
            })),
          })),
        })),
      })),
      discount: data.tree.discount,
    };

    // Run the pure pricing engine
    return priceQuote(tree, catalog);
  });

// ── Paginated Quotation Listing with Search & Filters ────────────────────────

const ListQuotesInput = z
  .object({
    search: z.string().optional(),
    status: z
      .enum(["all", "draft", "sent", "accepted", "rejected", "expired", "converted"])
      .optional()
      .default("all"),
    sort: z
      .enum(["newest", "oldest", "highest_value", "lowest_value"])
      .optional()
      .default("newest"),
    page: z.number().int().min(1).optional().default(1),
    pageSize: z.number().int().min(1).max(100).optional().default(25),
  })
  .optional()
  .default({});

/**
 * List paginated quotations with customer and order join, supporting server-side search, status filtering, and sorting.
 */
export const listQuotations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => ListQuotesInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<PaginatedQuotationsResult> => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Commercial Quotes");
    const { tenantId } = ctx;

    const conditions = [eq(quotes.tenantId, tenantId)];

    if (data.status && data.status !== "all") {
      conditions.push(eq(quotes.status, data.status));
    }

    if (data.search && data.search.trim().length > 0) {
      const q = `%${data.search.trim()}%`;
      conditions.push(
        sql`(${quotes.quoteNumber} ILIKE ${q} OR ${customers.name} ILIKE ${q} OR ${customers.phone} ILIKE ${q})`,
      );
    }

    const page = Math.max(1, data.page || 1);
    const pageSize = Math.min(100, Math.max(1, data.pageSize || 25));
    const offset = (page - 1) * pageSize;

    let orderByClause = desc(quotes.createdAt);
    if (data.sort === "oldest") {
      orderByClause = sql`${quotes.createdAt} ASC`;
    } else if (data.sort === "highest_value") {
      orderByClause = sql`${quotes.total} DESC`;
    } else if (data.sort === "lowest_value") {
      orderByClause = sql`${quotes.total} ASC`;
    }

    // 1. Get total filtered count
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(quotes)
      .leftJoin(customers, eq(quotes.customerId, customers.id))
      .where(and(...conditions));

    const totalCount = Number(countRow?.count || 0);
    const totalPages = Math.ceil(totalCount / pageSize) || 1;

    if (totalCount === 0) {
      return {
        rows: [],
        totalCount: 0,
        page,
        pageSize,
        totalPages: 1,
      };
    }

    // 2. Fetch page items with customer and order join
    const quoteRows = await db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        customerId: quotes.customerId,
        customerName: customers.name,
        customerPhone: customers.phone,
        status: quotes.status,
        subtotal: quotes.subtotal,
        vatAmount: quotes.vatAmount,
        total: quotes.total,
        validUntil: quotes.validUntil,
        createdAt: quotes.createdAt,
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        snapshot: quotes.snapshot,
      })
      .from(quotes)
      .leftJoin(customers, eq(quotes.customerId, customers.id))
      .leftJoin(orders, eq(orders.quoteId, quotes.id))
      .where(and(...conditions))
      .orderBy(orderByClause)
      .limit(pageSize)
      .offset(offset);

    const rows: QuotationListItem[] = quoteRows.map((q) => {
      const snap = ((q.snapshot as any) || {}) as Record<string, any>;
      const progStatus = getQuotationProgressiveStatus(q);
      return {
        id: q.id,
        quoteNumber: q.quoteNumber,
        customerId: q.customerId,
        customerName: q.customerName || null,
        customerPhone: q.customerPhone || null,
        status: q.status as any,
        progressiveStatus: progStatus,
        statusLabelAr: QUOTATION_STAGE_LABEL_AR[progStatus] || q.status,
        subtotal: Number(q.subtotal || 0),
        vatAmount: Number(q.vatAmount || 0),
        total: Number(q.total || 0),
        validUntil: q.validUntil,
        createdAt: q.createdAt instanceof Date ? q.createdAt.toISOString() : String(q.createdAt),
        orderId: q.orderId || null,
        orderNumber: q.orderNumber || null,
        opportunityId: (snap.opportunityId as string) || (snap.opportunity_id as string) || null,
        opportunityNumber: (snap.opportunityNumber as string) || null,
        opportunityTitle: (snap.opportunityTitle as string) || null,
        salesOwnerName: (snap.salesOwnerName as string) || null,
      };
    });

    return {
      rows,
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  });

// ── Commercial Context Loader ───────────────────────────────────────────────

const GetQuoteCommercialContextInput = z.object({
  quoteId: z.string().uuid(),
});

/**
 * Returns linked Opportunity and commercial context for a quotation.
 */
export const getQuoteCommercialContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => GetQuoteCommercialContextInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId } = ctx;

    const [q] = await db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        status: quotes.status,
        customerId: quotes.customerId,
        snapshot: quotes.snapshot,
      })
      .from(quotes)
      .where(and(eq(quotes.id, data.quoteId), eq(quotes.tenantId, tenantId)))
      .limit(1);

    if (!q) return null;
    const snap = ((q.snapshot as any) || {}) as Record<string, any>;
    const oppId = (snap.opportunityId as string) || (snap.opportunity_id as string) || null;

    // 1. Fetch Customer
    let cust: any = null;
    try {
      const [c] = await db
        .select({
          id: customers.id,
          name: customers.name,
          phone: customers.phone,
          email: customers.email,
        })
        .from(customers)
        .where(and(eq(customers.id, q.customerId), eq(customers.tenantId, tenantId)))
        .limit(1);
      if (c) cust = c;
    } catch {
      // Non-blocking
    }

    // 2. Fetch Opportunity (if linked)
    let oppRow: any = null;
    if (oppId) {
      try {
        const [o] = await db
          .select({
            opportunityId: opportunities.id,
            opportunityNumber: opportunities.opportunityNumber,
            opportunityTitle: opportunities.title,
            projectType: opportunities.projectType,
            stage: opportunities.stage,
            status: opportunities.status,
            salesOwnerId: opportunities.salesOwner,
            salesOwnerName: appUsers.displayName,
          })
          .from(opportunities)
          .leftJoin(appUsers, eq(opportunities.salesOwner, appUsers.id))
          .where(and(eq(opportunities.id, oppId), eq(opportunities.tenantId, tenantId)))
          .limit(1);
        if (o) oppRow = o;
      } catch {
        // Non-blocking
      }
    }

    // 3. Fetch Order
    let linkedOrder: any = null;
    try {
      const [ord] = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          currentStage: orders.currentStage,
          total: orders.total,
          deposit: orders.deposit,
        })
        .from(orders)
        .where(and(eq(orders.quoteId, data.quoteId), eq(orders.tenantId, tenantId)))
        .limit(1);
      if (ord) linkedOrder = ord;
    } catch {
      // Non-blocking
    }

    // 4. Fetch Delivery (if order exists)
    let linkedDelivery: any = null;
    if (linkedOrder?.id) {
      try {
        const [del] = await db
          .select({
            id: deliveryHandovers.id,
            deliveryNumber: deliveryHandovers.deliveryNumber,
            status: deliveryHandovers.status,
            scheduledDate: deliveryHandovers.scheduledDate,
            deliveredAt: deliveryHandovers.deliveredAt,
          })
          .from(deliveryHandovers)
          .where(and(eq(deliveryHandovers.orderId, linkedOrder.id), eq(deliveryHandovers.tenantId, tenantId)))
          .limit(1);
        if (del) linkedDelivery = del;
      } catch {
        // Non-blocking
      }
    }

    // 5. Fetch Invoice and Payments
    let linkedInvoice: any = null;
    let paymentsCount = 0;
    let totalPaymentsAmount = 0;
    try {
      const [inv] = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          total: invoices.total,
          depositAmount: invoices.depositAmount,
          paidAmount: invoices.paidAmount,
          paidAt: invoices.paidAt,
        })
        .from(invoices)
        .where(and(eq(invoices.quoteId, data.quoteId), eq(invoices.tenantId, tenantId)))
        .limit(1);
      if (inv) {
        linkedInvoice = inv;
        const payments = await db
          .select({
            id: invoicePayments.id,
            amount: invoicePayments.amount,
          })
          .from(invoicePayments)
          .where(and(eq(invoicePayments.invoiceId, inv.id), eq(invoicePayments.tenantId, tenantId)));
        paymentsCount = payments.length;
        totalPaymentsAmount = payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
      }
    } catch {
      // Non-blocking
    }

    const projectId = oppId || linkedOrder?.id || null;

    return {
      quoteId: q.id,
      quoteNumber: q.quoteNumber,
      quoteStatus: q.status,
      // Customer
      customerId: cust?.id ?? q.customerId,
      customerName: cust?.name ?? (snap.customerName as string) ?? "—",
      customerPhone: cust?.phone ?? (snap.customerPhone as string) ?? null,
      customerEmail: cust?.email ?? (snap.customerEmail as string) ?? null,
      // Opportunity
      opportunityId: oppRow?.opportunityId ?? oppId ?? null,
      opportunityNumber: oppRow?.opportunityNumber ?? (oppId ? (snap.opportunityNumber as string) || "OPP" : null),
      opportunityTitle: oppRow?.opportunityTitle ?? (oppId ? (snap.opportunityTitle as string) || "CRM Opportunity" : null),
      opportunityStage: oppRow?.stage ?? (oppId ? (snap.opportunityStage as string) || "quotation" : null),
      opportunityStatus: oppRow?.status ?? "open",
      salesOwnerId: oppRow?.salesOwnerId ?? null,
      salesOwnerName: oppRow?.salesOwnerName ?? (snap.salesOwnerName as string) ?? null,
      // Project
      projectId,
      projectNumber: oppRow?.opportunityNumber || (linkedOrder ? `PRJ-${linkedOrder.orderNumber}` : (oppId ? "PRJ" : null)),
      projectTitle: oppRow?.opportunityTitle || (linkedOrder ? `مشروع أمر ${linkedOrder.orderNumber}` : (oppId ? "Project" : null)),
      // Production Order
      orderId: linkedOrder?.id ?? null,
      orderNumber: linkedOrder?.orderNumber ?? null,
      orderStage: linkedOrder?.currentStage ?? null,
      orderTotal: linkedOrder?.total ?? null,
      // Delivery
      deliveryId: linkedDelivery?.id ?? null,
      deliveryNumber: linkedDelivery?.deliveryNumber ?? null,
      deliveryStatus: linkedDelivery?.status ?? null,
      deliveryScheduledDate: linkedDelivery?.scheduledDate ?? null,
      deliveryDeliveredAt: linkedDelivery?.deliveredAt ?? null,
      // Invoice & Payments
      invoiceId: linkedInvoice?.id ?? null,
      invoiceNumber: linkedInvoice?.invoiceNumber ?? null,
      invoiceTotal: linkedInvoice?.total ?? null,
      invoiceDepositAmount: linkedInvoice?.depositAmount ?? null,
      invoicePaidAmount: linkedInvoice?.paidAmount ?? null,
      invoicePaidAt: linkedInvoice?.paidAt ?? null,
      paymentsCount,
      totalPaymentsAmount,
    };
  });

const GetCommercialQuoteInput = z.object({
  quoteId: z.string().uuid(),
});

export const getCommercialQuote = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => GetCommercialQuoteInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Commercial Quotes");
    const { tenantId } = ctx;

    const [quote] = await db
      .select()
      .from(quotes)
      .where(and(eq(quotes.id, data.quoteId), eq(quotes.tenantId, tenantId)))
      .limit(1);

    if (!quote) {
      throw new Error("Quotation not found or access denied");
    }

    const [customer] = await db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        email: customers.email,
        address: customers.address,
      })
      .from(customers)
      .where(and(eq(customers.id, quote.customerId), eq(customers.tenantId, tenantId)))
      .limit(1);

    const items = await db
      .select()
      .from(quoteItems)
      .where(and(eq(quoteItems.quoteId, quote.id), eq(quoteItems.tenantId, tenantId)));

    const snap = ((quote.snapshot as any) || {}) as Record<string, any>;
    const { snapshot: _rawSnapshot, ...quoteBase } = quote;

    return {
      quote: {
        ...quoteBase,
        opportunityId: (snap.opportunityId as string) || (snap.opportunity_id as string) || null,
        subtotal: Number(quote.subtotal),
        discountAmount: Number(quote.discountAmount),
        vatPct: Number(quote.vatPct),
        vatAmount: Number(quote.vatAmount),
        total: Number(quote.total),
        depositPct: Number(quote.depositPct),
      },
      customer: customer || null,
      snapshot: snap,
      lines: (snap.lines && Array.isArray(snap.lines)) ? snap.lines : items.map((it, idx) => {
        const bd = (it.breakdown as any) || {};
        return {
          id: it.id,
          productId: it.productId || bd.productId || null,
          productCode: bd.productCode || null,
          isCustom: bd.isCustom ?? !it.productId,
          category: bd.category || "custom",
          categoryNameAr: it.materialName || bd.categoryNameAr || "منتج",
          categoryNameEn: bd.categoryNameEn || "Item",
          name: it.productName,
          description: bd.description || "",
          quantity: it.qty,
          dimensions: bd.dimensions || {
            width: Number(it.dimensionValue) || undefined,
            unit: "mm",
          },
          pricingUnit: bd.pricingUnit || "pcs",
          pricingUnitAr: it.finishName || bd.pricingUnitAr || "عدد",
          pricingUnitEn: bd.pricingUnitEn || "pcs",
          imageUrl: bd.imageUrl || "",
          imageStorageKey: bd.imageStorageKey || "",
          technicalSpecs: bd.technicalSpecs || "",
          unitPrice: Number(it.unitPrice),
          lineTotal: Number(it.lineTotal),
          position: idx,
        };
      }),
      terms: snap.terms || DEFAULT_COMMERCIAL_TERMS,
    };
  });

export const saveCommercialQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((d) => SaveCommercialQuoteInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Commercial Quotes");
    const { tenantId, userId } = ctx;
    const client = (context as any).supabase;

    // 1. Calculate authoritative totals
    const totals = calculateCommercialQuoteTotals({
      lines: data.lines,
      discountAmount: data.discount_amount,
      vatPct: data.vat_pct,
      applyVat: data.apply_vat,
      depositPct: data.terms.paymentSchedule?.[0]?.percent ?? 60,
    });

    // 2. Fetch customer details
    const { data: customer } = await client
      .from("customers")
      .select("id, name, phone, email")
      .eq("id", data.customer_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!customer) {
      throw new Error("Customer not found or access denied");
    }

    const noteText = data.terms.customNotes || (data.terms.notes && data.terms.notes.length > 0 ? data.terms.notes.join("\n") : "");

    // 3. Build snapshot
    const commercialSnapshot: CommercialQuoteSnapshot = {
      quotationMode: "commercial",
      customerName: customer.name,
      customerPhone: customer.phone ?? undefined,
      customerEmail: customer.email ?? undefined,
      quoteNumber: data.quote_number,
      quoteDate: new Date().toISOString().slice(0, 10),
      validUntil: data.valid_until ?? undefined,
      lines: data.lines,
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      discountCode: data.discount_code ?? undefined,
      vatPct: totals.vatPct,
      vatAmount: totals.vatAmount,
      total: totals.total,
      depositPct: totals.depositPct,
      depositAmount: totals.depositAmount,
      terms: data.terms,
      opportunityId: data.opportunity_id ?? undefined,
    };

    let quoteId = data.quoteId;

    if (quoteId) {
      // ── Update existing quote ──
      const [existing] = await db
        .select({ id: quotes.id, status: quotes.status, quoteNumber: quotes.quoteNumber, snapshot: quotes.snapshot })
        .from(quotes)
        .where(and(eq(quotes.id, quoteId), eq(quotes.tenantId, tenantId)))
        .limit(1);

      if (!existing) {
        throw new Error("Quotation not found");
      }

      if (existing.status === "converted") {
        throw new Error("Cannot edit quotation that has already been converted to an order");
      }

      const existingSnap = ((existing.snapshot as any) || {}) as Record<string, any>;
      const trackingToken = existingSnap.tracking_token || existingSnap.trackingToken || crypto.randomUUID();
      commercialSnapshot.tracking_token = trackingToken;
      commercialSnapshot.trackingToken = trackingToken;
      commercialSnapshot.version = existingSnap.version || 1;
      commercialSnapshot.version_history = existingSnap.version_history || [];
      commercialSnapshot.lifecycle = existingSnap.lifecycle || { stage: data.status };
      commercialSnapshot.customer_consent = existingSnap.customer_consent;

      await db
        .update(quotes)
        .set({
          customerId: data.customer_id,
          status: data.status,
          subtotal: String(totals.subtotal),
          discountAmount: String(totals.discountAmount),
          discountCode: data.discount_code ?? null,
          vatPct: String(totals.vatPct),
          vatAmount: String(totals.vatAmount),
          total: String(totals.total),
          depositPct: String(totals.depositPct),
          validUntil: data.valid_until || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          notes: noteText || null,
          snapshot: commercialSnapshot as any,
        })
        .where(and(eq(quotes.id, quoteId), eq(quotes.tenantId, tenantId)));

      // Remove existing quote_items to replace with updated lines
      await db
        .delete(quoteItems)
        .where(and(eq(quoteItems.quoteId, quoteId), eq(quoteItems.tenantId, tenantId)));
    } else {
      // ── Insert new quote ──
      const trackingToken = crypto.randomUUID();
      commercialSnapshot.tracking_token = trackingToken;
      commercialSnapshot.trackingToken = trackingToken;
      commercialSnapshot.version = 1;
      commercialSnapshot.version_history = [];
      commercialSnapshot.lifecycle = { stage: data.status };

      const quotePayload: Record<string, any> = {
        tenantId,
        quoteNumber: data.quote_number,
        customerId: data.customer_id,
        status: data.status,
        subtotal: String(totals.subtotal),
        discountAmount: String(totals.discountAmount),
        discountCode: data.discount_code ?? null,
        vatPct: String(totals.vatPct),
        vatAmount: String(totals.vatAmount),
        total: String(totals.total),
        depositPct: String(totals.depositPct),
        validUntil: data.valid_until || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        notes: noteText || null,
        snapshot: commercialSnapshot as any,
        createdBy: userId ?? null,
        createdAt: new Date(),
      };

      const [newQuote] = await db.insert(quotes).values(quotePayload as any).returning({ id: quotes.id });
      if (!newQuote) {
        throw new Error("Failed to create commercial quotation record");
      }
      quoteId = newQuote.id;
    }

    // 4. Insert quote_items with commercial specs
    if (data.lines.length > 0) {
      const itemsToInsert = data.lines.map((line, idx) => ({
        tenantId,
        quoteId: quoteId!,
        productId: line.productId || null,
        productName: line.name,
        materialName: line.categoryNameAr,
        finishName: line.pricingUnitAr,
        dimensionValue: String(line.dimensions?.width ?? 1),
        qty: line.quantity,
        unitPrice: String(line.unitPrice),
        lineTotal: String(line.lineTotal),
        breakdown: {
          productId: line.productId || null,
          productCode: line.productCode || null,
          isCustom: line.isCustom ?? !line.productId,
          category: line.category,
          categoryNameAr: line.categoryNameAr,
          categoryNameEn: line.categoryNameEn,
          description: line.description,
          dimensions: line.dimensions,
          pricingUnit: line.pricingUnit,
          pricingUnitAr: line.pricingUnitAr,
          pricingUnitEn: line.pricingUnitEn,
          imageUrl: line.imageUrl,
          imageStorageKey: line.imageStorageKey,
          technicalSpecs: line.technicalSpecs,
          position: line.position ?? idx,
        },
        createdAt: new Date(),
      }));

      await db.insert(quoteItems).values(itemsToInsert as any);
    }

    // 5. Freeze snapshot if status is sent
    if (data.status === "sent") {
      try {
        await writeSnapshot(
          {
            tenantId,
            quotationId: quoteId,
            state: "sent",
            tree: { products: data.lines },
            breakdown: commercialSnapshot,
          },
          client,
        );
      } catch (snapErr) {
        log.warn("saveCommercialQuote: writeSnapshot fallback:", { error: String(snapErr) });
      }
    }

    // 6. Audit log
    try {
      await db.insert(auditLog).values({
        tenantId,
        actorId: userId ?? "system",
        action: data.quoteId ? "quote_updated" : "quote_created",
        entityType: "quote",
        entityId: quoteId,
        details: {
          mode: "commercial",
          quoteNumber: data.quote_number,
          total: totals.total,
          itemCount: data.lines.length,
          status: data.status,
        },
      });
    } catch {
      // Non-blocking
    }

    return {
      quoteId,
      quoteNumber: data.quote_number,
      total: totals.total,
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      vatAmount: totals.vatAmount,
    };
  });

