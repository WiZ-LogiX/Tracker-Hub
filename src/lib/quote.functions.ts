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
import type { TenantContext } from "@/lib/tenant-context";
import { deliverToN8n, type NotifyPayload } from "@/lib/whatsapp-share.functions";
import { generatePdf } from "@/lib/pdf.functions";
import { log } from "@/lib/log";
import {
  priceQuote,
  type QuoteInput,
  type CatalogLookup,
} from "@/lib/pricing/engine-v3";
import { runShadow } from "@/lib/pricing/shadow";

// ── Snapshot-freeze states ──────────────────────────────────────────────────
/** States that trigger a pricing snapshot freeze on transition. */
const FREEZE_STATES = new Set(["sent", "accepted"]);

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
    const client = (context as any).supabase;

    // Insert quote with tenant_id
    const { data: quote, error: quoteError } = await client
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
      widthMm: z.number().int().default(0),
      heightMm: z.number().int().default(0),
      depthMm: z.number().int().default(0),
      qty: z.number().int().min(1).default(1),
      finishId: z.string().uuid().nullable().optional(),
      widthTier: z.enum(["narrow", "standard", "wide", "extra_wide"]).nullable().optional(),
      overrideFactorKeys: z.record(z.number()).optional(),
      position: z.number().int().default(0),
      components: z.array(z.object({
        kind: z.enum(["material", "hardware", "accessory", "manufacturing", "edge_band"]),
        catalogId: z.string().uuid().nullable().optional(),
        qty: z.number().min(0).default(1),
        unitOfMeasure: z.string().default("pcs"),
        position: z.number().int().default(0),
      })).default([]),
    })).default([]),
  })).default([]),
});

const SaveV2QuoteInput = z.object({
  customer_id: z.string().uuid(),
  request_id: z.string().uuid().nullable().optional(),
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
    const tid = ctx.tenantId;
    const client = (context as any).supabase;

    // 1. Insert quote
    const { data: quote, error: quoteErr } = await client
      .from("quotes")
      .insert({
        customer_id: data.customer_id,
        request_id: data.request_id ?? null,
        status: data.status,
        quote_number: data.quote_number,
        subtotal: 0,
        discount_amount: 0,
        vat_pct: 14,
        vat_amount: 0,
        total: 0,
        notes: data.notes ?? null,
        snapshot: {},
        tenant_id: tid,
      })
      .select("id")
      .single();

    if (quoteErr || !quote) {
      throw new Error(quoteErr?.message ?? "فشل إنشاء عرض السعر");
    }

    const quoteId = quote.id;

    // 2. Insert products → sections → units → components
    try {
      for (const product of data.products) {
        const { data: prodRow, error: prodErr } = await client
          .from("quotation_products")
          .insert({
            quotation_id: quoteId,
            product_type_code: product.productTypeCode,
            label: product.label ?? null,
            position: product.position,
            tenant_id: tid,
          })
          .select("id")
          .single();

        if (prodErr || !prodRow) {
          throw new Error(`Failed to insert product: ${prodErr?.message ?? "no id"}`);
        }

        for (const section of product.sections) {
          const { data: secRow, error: secErr } = await client
            .from("sections")
            .insert({
              quotation_product_id: prodRow.id,
              label: section.label ?? null,
              position: section.position,
              tenant_id: tid,
            })
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
                width_mm: unit.widthMm,
                height_mm: unit.heightMm,
                depth_mm: unit.depthMm,
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

      // 3. Run shadow comparison if feature flag is on (non-blocking)
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

    return { quoteId };
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
    const tid = ctx.tenantId;
    const client = (context as any).supabase;

    // ── Block send with no priceable units ──────────────────────────────
    if (data.status === "sent") {
      // Get section IDs for this quote's products
      const { data: productRows } = await client
        .from("quotation_products")
        .select("id")
        .eq("quotation_id", data.quote_id)
        .eq("tenant_id", tid);

      const productIds = (productRows ?? []).map((p: any) => p.id);

      if (productIds.length === 0) {
        throw new Error("Cannot send: quote has no products. Add at least one product with units.");
      }

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

    // ── Update status ───────────────────────────────────────────────────
    const { error } = await client
      .from("quotes")
      .update({ status: data.status })
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

    return { ok: true };
  });

// ── Raw hierarchy loader (no middleware — called from server functions) ─────

async function loadHierarchyRaw(quotationId: string, tenantId: string, client: any) {
  const [productsRes, sectionsRes, unitsRes, componentsRes] = await Promise.all([
    client
      .from("quotation_products")
      .select("id, quotation_id, product_type_code, label, position")
      .eq("quotation_id", quotationId)
      .eq("tenant_id", tenantId)
      .order("position"),
    client
      .from("sections")
      .select("id, quotation_product_id, label, position")
      .eq("tenant_id", tenantId)
      .order("position"),
    client
      .from("units")
      .select("id, section_id, unit_type_id, width_mm, height_mm, depth_mm, qty, finish_id, width_tier, override_factor_keys, position")
      .eq("tenant_id", tenantId)
      .order("position"),
    client
      .from("components")
      .select("id, unit_id, kind, catalog_id, qty, unit_of_measure, position")
      .eq("tenant_id", tenantId)
      .order("position"),
  ]);

  if (productsRes.error) throw new Error(`Failed to load products: ${productsRes.error.message}`);
  if (sectionsRes.error) throw new Error(`Failed to load sections: ${sectionsRes.error.message}`);
  if (unitsRes.error) throw new Error(`Failed to load units: ${unitsRes.error.message}`);
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
  // 1. Load hierarchy tree
  const rawTree = await loadHierarchyRaw(quotationId, tenantId, client);

  // 2. Load catalog lookup (same pattern as priceQuotationTree)
  const [
    materialsRes, hardwareRes, accessoriesRes,
    mfgOpsRes, veneersRes, finishesRes, factorsRes, wastageRes, feesRes,
  ] = await Promise.all([
    client.from("catalog_materials")
      .select("id, pricing_unit, price_per_unit, default_wastage_pct")
      .eq("tenant_id", tenantId).is("archived_at", null),
    client.from("catalog_hardware")
      .select("id, price_per_piece")
      .eq("tenant_id", tenantId).is("archived_at", null),
    client.from("catalog_accessories")
      .select("id, price_per_piece")
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
    client.from("tenant_pricing_factors")
      .select("factor_key, percent")
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
      (hardwareRes.data ?? []).map((h: any) => [h.id, { id: h.id, pricePerPiece: h.price_per_piece }]),
    ),
    accessories: Object.fromEntries(
      (accessoriesRes.data ?? []).map((a: any) => [a.id, { id: a.id, pricePerPiece: a.price_per_piece }]),
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
    pricingFactors: (factorsRes.data ?? []).map((f: any) => ({ factorKey: f.factor_key, percent: f.percent })),
    wastageRules: (wastageRes.data ?? []).map((w: any) => ({ scope: w.scope, ref: w.ref, pct: w.pct })),
    feesCredits: (feesRes.data ?? []).map((fc: any) => ({ code: fc.code, sign: fc.sign as "plus" | "minus", amount: fc.amount, formulaKey: fc.formula_key })),
  };

  // 3. Compute pricing
  const quoteInput: QuoteInput = { products: rawTree as any };
  const breakdown = priceQuote(quoteInput, catalog);

  // 4. Load current rule version (latest active pricing rule)
  const { data: ruleRow } = await client
    .from("pricing_rules")
    .select("id, version")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 5. Write snapshot
  await writeSnapshot({
    tenantId,
    quotationId,
    state,
    tree: rawTree,
    breakdown: breakdown.breakdown,
    ruleVersionId: ruleRow?.id ?? null,
    factors: catalog.pricingFactors,
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
      factors: catalog.pricingFactors,
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
        .select("id, price_per_piece")
        .eq("tenant_id", tid)
        .is("archived_at", null),
      client
        .from("catalog_accessories")
        .select("id, price_per_piece")
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
        .from("tenant_pricing_factors")
        .select("factor_key, percent")
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
