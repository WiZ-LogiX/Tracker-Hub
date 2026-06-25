/**
 * Quote CRUD — tenant-scoped server functions.
 *
 * Uses supabaseAdmin (service-role) to bypass RLS. The primary tenant
 * isolation guard is the .eq('tenant_id') filter on every query, enforced
 * by the requireTenant middleware.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TenantContext } from "@/lib/tenant-context";
import { deliverToN8n, type NotifyPayload } from "@/lib/whatsapp-share.functions";
import { generatePdf } from "@/lib/pdf.functions";
import { log } from "@/lib/log";
import {
  priceQuote,
  type QuoteInput,
  type CatalogLookup,
} from "@/lib/pricing/engine-v3";

const CreateQuoteInput = z.object({
  customer_id: z.string().uuid(),
  request_id: z.string().uuid().nullable().optional(),
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

export const createQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => CreateQuoteInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;

    // Insert quote with tenant_id
    const { data: quote, error: quoteError } = await supabaseAdmin
      .from("quotes")
      .insert({
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
      })
      .select("id")
      .single();

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

      const { data: insertedItems, error: itemsError } = await supabaseAdmin
        .from("quote_items")
        .insert(itemsToInsert as any)
        .select("id");

      if (itemsError) {
        // Quote was created but items failed — clean up
        await supabaseAdmin.from("quotes").delete().eq("id", quote.id);
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

      const { error: configError } = await supabaseAdmin
        .from("configurations")
        .insert(configsToInsert as any);

      if (configError) {
        // Log but don't fail — configurations are optional
        log.error("Failed to insert configurations:", { error: configError.message });
      }
    }

    // Update quote_requests status if linked
    if (data.request_id) {
      await supabaseAdmin
        .from("quote_requests")
        .update({ status: "quoted" as any })
        .eq("id", data.request_id)
        .eq("tenant_id", ctx.tenantId);
    }

    // Send WhatsApp notification to customer (with PDF attachment)
    try {
      const { data: customer } = await supabaseAdmin
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
        let { data: tpl } = await supabaseAdmin
          .from("notification_templates")
          .select("subject, body")
          .eq("event", "quote_created")
          .eq("channel", "whatsapp")
          .eq("language", "ar")
          .eq("tenant_id", ctx.tenantId)
          .eq("active", true)
          .maybeSingle();
        if (!tpl) {
          const { data: fallback } = await supabaseAdmin
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

    return { quoteId: quote.id };
  });

const UpdateQuoteStatusInput = z.object({
  quote_id: z.string().uuid(),
  status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]),
});

export const updateQuoteStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => UpdateQuoteStatusInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;

    const { error } = await supabaseAdmin
      .from("quotes")
      .update({ status: data.status })
      .eq("id", data.quote_id)
      .eq("tenant_id", ctx.tenantId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

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
export async function writeSnapshot(input: WriteSnapshotInput): Promise<void> {
  const { tenantId, quotationId, state, tree, breakdown, ruleVersionId, factors } = input;

  const { error } = await supabaseAdmin.from("quote_snapshots").insert({
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

    // Load all catalog + pricing data in parallel
    const [
      materialsRes,
      hardwareRes,
      accessoriesRes,
      mfgOpsRes,
      factorsRes,
      wastageRes,
      feesRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("catalog_materials")
        .select("id, pricing_unit, price_per_unit, default_wastage_pct")
        .eq("tenant_id", tid)
        .is("archived_at", null),
      supabaseAdmin
        .from("catalog_hardware")
        .select("id, price_per_piece")
        .eq("tenant_id", tid)
        .is("archived_at", null),
      supabaseAdmin
        .from("catalog_accessories")
        .select("id, price_per_piece")
        .eq("tenant_id", tid)
        .is("archived_at", null),
      supabaseAdmin
        .from("catalog_manufacturing_operations")
        .select("id, rate_unit, rate")
        .eq("tenant_id", tid)
        .is("archived_at", null),
      supabaseAdmin
        .from("tenant_pricing_factors")
        .select("factor_key, percent")
        .eq("tenant_id", tid)
        .is("archived_at", null),
      supabaseAdmin
        .from("tenant_wastage_rules")
        .select("scope, ref, pct")
        .eq("tenant_id", tid)
        .is("archived_at", null),
      supabaseAdmin
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
        (hardwareRes.data ?? []).map((h: any) => [
          h.id,
          { id: h.id, pricePerPiece: h.price_per_piece },
        ]),
      ),
      accessories: Object.fromEntries(
        (accessoriesRes.data ?? []).map((a: any) => [
          a.id,
          { id: a.id, pricePerPiece: a.price_per_piece },
        ]),
      ),
      manufacturingOps: Object.fromEntries(
        (mfgOpsRes.data ?? []).map((o: any) => [
          o.id,
          { id: o.id, rateUnit: o.rate_unit, rate: o.rate },
        ]),
      ),
      pricingFactors: (factorsRes.data ?? []).map((f: any) => ({
        factorKey: f.factor_key,
        percent: f.percent,
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

    // Run the pure pricing engine
    return priceQuote(data.tree as QuoteInput, catalog);
  });
