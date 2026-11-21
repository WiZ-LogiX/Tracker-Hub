/**
 * PDF generation for quotes and invoices.
 *
 * Uses dedicated server-only pdf-renderer.server.tsx for RTL Arabic text and React-PDF.
 * Supports:
 *   1. V2 Quotation hierarchy (quotation_products → sections → units → components)
 *   2. Immutable frozen snapshots (quote_snapshots breakdown_json & tree_json)
 *   3. Backwards-compatible legacy quote_items fallback
 *
 * Generates PDF server-side, stores in R2, returns a 30-minute
 * presigned GET URL so the download works regardless of whether
 * the bucket itself is publicly addressable.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { TenantContext } from "@/lib/tenant-context";
import { log } from "@/lib/log";

// Signed URLs expire after 30 minutes
const SIGNED_URL_TTL_SECONDS = 60 * 30;

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Tenant info (fetched once per PDF generation)
// ---------------------------------------------------------------------------
export interface TenantInfo {
  name: string;
  logoUrl: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxNumber: string | null;
  commercialRegistry: string | null;
  primaryColor: string | null;
}

export async function fetchTenantInfo(tenantId: string, client: any): Promise<TenantInfo> {
  const { data: tenant } = await client
    .from("tenants")
    .select("name, logo_url, phone, email, address, tax_number, commercial_registry, primary_color")
    .eq("id", tenantId)
    .single();

  if (!tenant) {
    return {
      name: "PeleCanon",
      logoUrl: null,
      phone: null,
      email: null,
      address: null,
      taxNumber: null,
      commercialRegistry: null,
      primaryColor: null,
    };
  }

  return {
    name: (tenant as any).name ?? "PeleCanon",
    logoUrl: (tenant as any).logo_url ?? null,
    phone: (tenant as any).phone ?? null,
    email: (tenant as any).email ?? null,
    address: (tenant as any).address ?? null,
    taxNumber: (tenant as any).tax_number ?? null,
    commercialRegistry: (tenant as any).commercial_registry ?? null,
    primaryColor: (tenant as any).primary_color ?? null,
  };
}

export async function fetchLogoAsDataUri(logoUrl: string): Promise<string | null> {
  try {
    // 1. Direct R2 retrieval if logoUrl is an R2 key or R2 URL
    let r2Key: string | null = null;
    if (logoUrl.startsWith("http")) {
      const parsed = new URL(logoUrl);
      if (parsed.hostname.includes("r2.dev") || parsed.hostname.includes("r2.cloudflarestorage.com")) {
        const parts = parsed.pathname.replace(/^\/+/, "").split("/");
        if (parts[0] === getBucket()) {
          r2Key = parts.slice(1).join("/");
        } else {
          r2Key = parts.join("/");
        }
      }
    } else {
      r2Key = logoUrl.replace(/^\/+/, "");
    }

    if (r2Key && r2Key.includes("/")) {
      try {
        const res = await getR2Client().send(new GetObjectCommand({
          Bucket: getBucket(),
          Key: r2Key,
        }));
        const contentType = res.ContentType || "image/png";
        if (contentType.includes("svg") || r2Key.toLowerCase().endsWith(".svg")) {
          log.warn("SVG logo format not supported by PDF raster engine; falling back to default brand PNG", { key: r2Key });
          return null;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of res.Body as any) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const buf = Buffer.concat(chunks);
        return `data:${contentType};base64,${buf.toString("base64")}`;
      } catch (s3Err) {
        log.warn("Direct R2 retrieval failed for logo, attempting HTTP fetch fallback", { key: r2Key, error: String(s3Err) });
      }
    }

    const parsed = new URL(logoUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    const resp = await fetch(parsed.href);
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") || "image/png";
    if (contentType.includes("svg") || parsed.pathname.toLowerCase().endsWith(".svg")) {
      log.warn("SVG logo format not supported by PDF raster engine; falling back to default brand PNG", { url: logoUrl });
      return null;
    }
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const b64 = btoa(binary);
    return `data:${contentType};base64,${b64}`;
  } catch (err) {
    log.warn("Failed to fetch logo for PDF", { url: logoUrl, error: String(err) });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Data interfaces
// ---------------------------------------------------------------------------
export interface PdfLineItem {
  name: string;
  details?: string | null;
  dimensions?: string | null;
  qty: number;
  unit_price: number;
  line_total: number;
  category?: string | null;
  categoryNameAr?: string | null;
  pricingUnit?: string | null;
  pricingUnitAr?: string | null;
  imageUrl?: string | null;
  technicalSpecs?: string | null;
}

export interface QuoteData {
  id: string;
  quote_number: string;
  status: string;
  subtotal: number;
  discount_amount: number;
  discount_code: string | null;
  vat_amount: number;
  total: number;
  deposit_pct: number;
  valid_until: string | null;
  notes: string | null;
  snapshot?: Record<string, unknown>;
  customers: { name: string; phone: string | null; email: string | null } | null;
  items: PdfLineItem[];
  quotationMode?: "commercial" | "manufacturing_v2";
  commercialTerms?: {
    deliveryDays?: number;
    warrantyYears?: number;
    transportAndInstallIncluded?: boolean;
    paymentSchedule?: Array<{ percent: number; timing: string; timingAr: string }>;
    notes?: string[];
    customNotes?: string;
  };
}

export interface InvoiceData {
  id: string;
  invoice_number: string;
  total: number;
  deposit_amount: number;
  paid_amount: number;
  paid_at: string | null;
  issued_at: string;
  customers: { name: string; phone: string | null; email: string | null } | null;
  items: PdfLineItem[];
}

// ---------------------------------------------------------------------------
// Data loaders (V2 Hierarchy, Snapshot, and Legacy fallback)
// ---------------------------------------------------------------------------
/**
 * Load quote data with unified hierarchy resolution:
 * Hierarchy priority:
 *   1. Frozen snapshot (quote_snapshots) — sent/accepted/converted quotes
 *   2. Live V2 tree (quotation_products → sections → units) — draft quotes
 *   3. Legacy quote_items fallback — historical V1 quotes
 */
export async function loadQuotePdfData(
  quoteId: string,
  tenantId: string,
  client: any,
): Promise<QuoteData> {
  const { data: quote, error: quoteErr } = await client
    .from("quotes")
    .select(`
      id, quote_number, status, subtotal, discount_amount, discount_code,
      vat_amount, total, deposit_pct, valid_until, notes, snapshot, tenant_id,
      customers(name, phone, email)
    `)
    .eq("id", quoteId)
    .eq("tenant_id", tenantId)
    .single();

  if (quoteErr || !quote) {
    throw new Error("Quote not found or access denied");
  }

  let subtotal = Number(quote.subtotal || 0);
  let discount_amount = Number(quote.discount_amount || 0);
  let discount_code = quote.discount_code ?? null;
  let vat_amount = Number(quote.vat_amount || 0);
  let total = Number(quote.total || 0);
  const deposit_pct = Number(quote.deposit_pct ?? 50);
  const valid_until = quote.valid_until ?? null;
  const notes = quote.notes ?? null;
  const customers = quote.customers ?? null;

  const items: PdfLineItem[] = [];

  // Check for commercial quote in snapshot
  const rawSnap = (quote.snapshot as any) || {};
  const isCommercial =
    rawSnap.quotationMode === "commercial" ||
    (Array.isArray(rawSnap.lines) && rawSnap.lines.length > 0);

  if (isCommercial && Array.isArray(rawSnap.lines) && rawSnap.lines.length > 0) {
    for (const line of rawSnap.lines) {
      const dims = line.dimensions
        ? `${line.dimensions.width ?? ""}${line.dimensions.height ? ` × ${line.dimensions.height}` : ""}${line.dimensions.depth ? ` × ${line.dimensions.depth}` : ""} ${line.dimensions.unit || "مم"}`.trim()
        : null;

      items.push({
        name: line.name || line.categoryNameAr || "منتج",
        category: line.category || null,
        categoryNameAr: line.categoryNameAr || null,
        pricingUnit: line.pricingUnit || null,
        pricingUnitAr: line.pricingUnitAr || null,
        dimensions: dims || null,
        imageUrl: line.imageUrl || null,
        technicalSpecs: line.technicalSpecs || null,
        qty: Number(line.quantity ?? line.qty ?? 1),
        unit_price: round2(Number(line.unitPrice ?? line.unit_price ?? 0)),
        line_total: round2(Number(line.lineTotal ?? line.line_total ?? 0)),
      });
    }

    return {
      id: quote.id,
      quote_number: quote.quote_number,
      status: quote.status,
      subtotal: rawSnap.subtotal != null ? Number(rawSnap.subtotal) : subtotal,
      discount_amount: rawSnap.discountAmount != null ? Number(rawSnap.discountAmount) : discount_amount,
      discount_code: rawSnap.discountCode ?? discount_code,
      vat_amount: rawSnap.vatAmount != null ? Number(rawSnap.vatAmount) : vat_amount,
      total: rawSnap.total != null ? Number(rawSnap.total) : total,
      deposit_pct: rawSnap.depositPct != null ? Number(rawSnap.depositPct) : deposit_pct,
      valid_until,
      notes,
      customers,
      items,
      quotationMode: "commercial",
      commercialTerms: rawSnap.terms,
    };
  }

  // 1. Try to load from quote_snapshots
  const isDraft = quote.status === "draft";
  let snapshotBreakdown: Record<string, any> | null = null;

  const { data: snapRow } = await client
    .from("quote_snapshots")
    .select("breakdown_json, tree_json")
    .eq("quotation_id", quoteId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (snapRow?.tree_json) {
    const rawTree = snapRow.tree_json as any;
    snapshotBreakdown = snapRow.breakdown_json as Record<string, any> | null;

    if (snapshotBreakdown) {
      subtotal = snapshotBreakdown.subTotal ?? subtotal;
      discount_amount = snapshotBreakdown.discount ?? discount_amount;
      vat_amount = snapshotBreakdown.vatAmount ?? vat_amount;
      total = snapshotBreakdown.total ?? total;
    }

    const productsList = Array.isArray(rawTree)
      ? rawTree
      : Array.isArray(rawTree?.products)
      ? rawTree.products
      : [];

    const breakdownProducts = Array.isArray(snapshotBreakdown?.products) ? snapshotBreakdown.products : [];

    for (let pIdx = 0; pIdx < productsList.length; pIdx++) {
      const p = productsList[pIdx];
      if (!p) continue;
      const bp = breakdownProducts[pIdx] || breakdownProducts.find((x: any) => x?.id && p?.id && x.id === p.id);
      const prodLabel = p.label || p.product_type_code || `منتج ${pIdx + 1}`;
      const sections = Array.isArray(p.sections) ? p.sections : [];
      const bSections = Array.isArray(bp?.sections) ? bp.sections : [];

      let hasRenderedUnit = false;

      for (let sIdx = 0; sIdx < sections.length; sIdx++) {
        const s = sections[sIdx];
        if (!s) continue;
        const bs = bSections[sIdx] || bSections.find((x: any) => x?.id && s?.id && x.id === s.id);
        const secLabel = s.label ? ` - ${s.label}` : "";
        const units = Array.isArray(s.units) ? s.units : [];
        const bUnits = Array.isArray(bs?.units) ? bs.units : [];

        for (let uIdx = 0; uIdx < units.length; uIdx++) {
          const u = units[uIdx];
          if (!u) continue;
          const bu = bUnits[uIdx] || bUnits.find((x: any) => x?.id && u?.id && x.id === u.id);
          const unitPrice = bu?.computedUnitPrice ?? bu?.price ?? Number(u.computed_unit_price ?? u.computedUnitPrice ?? 0);
          const qty = Number(u.qty ?? 1);
          const lineTotal = round2(unitPrice * qty);

          const w = u.width_mm ?? u.widthMm;
          const h = u.height_mm ?? u.heightMm;
          const d = u.depth_mm ?? u.depthMm;
          const dims = (w && h && d) ? `${w} × ${h} × ${d} مم` : (w && h) ? `${w} × ${h} مم` : null;

          items.push({
            name: `${prodLabel}${secLabel}`,
            dimensions: dims,
            qty,
            unit_price: round2(unitPrice),
            line_total: lineTotal,
          });
          hasRenderedUnit = true;
        }
      }

      if (!hasRenderedUnit) {
        const prodPrice = bp?.computedPrice ?? Number(p.computed_price ?? p.price ?? 0);
        items.push({
          name: prodLabel,
          dimensions: null,
          qty: 1,
          unit_price: round2(prodPrice),
          line_total: round2(prodPrice),
        });
      }
    }

    if (items.length > 0) {
      return {
        id: quote.id,
        quote_number: quote.quote_number,
        status: quote.status,
        subtotal,
        discount_amount,
        discount_code,
        vat_amount,
        total,
        deposit_pct,
        valid_until,
        notes,
        customers,
        items,
      };
    }
  } else if (!isDraft) {
    // Missing snapshot for non-draft quote — log but continue
    // with the stored quote totals (they were set at creation time).
    log.error("Missing snapshot for non-draft quote (using stored totals)", {
      quoteId,
      status: quote.status,
    });
  }

  // 2. Try to load from live V2 hierarchy tables (scoped down the tree)
  const { data: products } = await client
    .from("quotation_products")
    .select("id, product_type_code, label, position")
    .eq("quotation_id", quoteId)
    .eq("tenant_id", tenantId)
    .order("position");

  if (products && products.length > 0) {
    const productIds = products.map((p: any) => p?.id).filter(Boolean);

    const { data: sections } = productIds.length > 0
      ? await client
          .from("sections")
          .select("id, quotation_product_id, label, position")
          .in("quotation_product_id", productIds)
          .eq("tenant_id", tenantId)
          .order("position")
      : { data: [] };

    const sectionIds = (sections ?? []).map((s: any) => s?.id).filter(Boolean);

    const { data: units } = sectionIds.length > 0
      ? await client
          .from("units")
          .select("id, section_id, unit_type_id, width_mm, height_mm, depth_mm, qty, computed_unit_price, position")
          .in("section_id", sectionIds)
          .eq("tenant_id", tenantId)
          .order("position")
      : { data: [] };

    const sectionsByProduct = new Map<string, any[]>();
    for (const s of sections ?? []) {
      const list = sectionsByProduct.get(s.quotation_product_id) ?? [];
      list.push(s);
      sectionsByProduct.set(s.quotation_product_id, list);
    }

    const unitsBySection = new Map<string, any[]>();
    for (const u of units ?? []) {
      const list = unitsBySection.get(u.section_id) ?? [];
      list.push(u);
      unitsBySection.set(u.section_id, list);
    }

    for (const p of products) {
      const prodLabel = p.label || p.product_type_code || "منتج";
      const pSections = sectionsByProduct.get(p.id) ?? [];
      let hasRenderedUnit = false;

      for (const s of pSections) {
        const secLabel = s.label ? ` - ${s.label}` : "";
        const sUnits = unitsBySection.get(s.id) ?? [];

        for (const u of sUnits) {
          const unitPrice = Number(u.computed_unit_price ?? 0);
          const qty = Number(u.qty ?? 1);
          const lineTotal = round2(unitPrice * qty);
          const dims = `${u.width_mm} × ${u.height_mm} × ${u.depth_mm} مم`;

          items.push({
            name: `${prodLabel}${secLabel}`,
            dimensions: dims,
            qty,
            unit_price: round2(unitPrice),
            line_total: lineTotal,
          });
          hasRenderedUnit = true;
        }
      }

      if (!hasRenderedUnit) {
        items.push({
          name: prodLabel,
          dimensions: null,
          qty: 1,
          unit_price: 0,
          line_total: 0,
        });
      }
    }

    if (items.length > 0) {
      return {
        id: quote.id,
        quote_number: quote.quote_number,
        status: quote.status,
        subtotal,
        discount_amount,
        discount_code,
        vat_amount,
        total,
        deposit_pct,
        valid_until,
        notes,
        customers,
        items,
      };
    }
  }

  // 3. Fallback to legacy/commercial quote_items
  const { data: quoteItems } = await client
    .from("quote_items")
    .select("product_name, material_name, finish_name, dimension_value, qty, unit_price, line_total, breakdown")
    .eq("quote_id", quoteId);

  let hasCommercialLine = false;
  for (const qi of quoteItems ?? []) {
    const bd = (qi.breakdown as any) || {};
    if (bd.technicalSpecs || bd.imageUrl || bd.category) {
      hasCommercialLine = true;
    }
    const dims = bd.dimensions
      ? `${bd.dimensions.width ?? ""}${bd.dimensions.height ? ` × ${bd.dimensions.height}` : ""}${bd.dimensions.depth ? ` × ${bd.dimensions.depth}` : ""} ${bd.dimensions.unit || "مم"}`.trim()
      : (qi.dimension_value ? String(qi.dimension_value) : null);

    items.push({
      name: qi.product_name,
      category: bd.category ?? null,
      categoryNameAr: qi.material_name ?? bd.categoryNameAr ?? null,
      pricingUnit: bd.pricingUnit ?? null,
      pricingUnitAr: qi.finish_name ?? bd.pricingUnitAr ?? null,
      details: [qi.material_name, qi.finish_name].filter(Boolean).join(" - ") || null,
      dimensions: dims || null,
      imageUrl: bd.imageUrl ?? null,
      technicalSpecs: bd.technicalSpecs ?? null,
      qty: Number(qi.qty ?? 1),
      unit_price: round2(Number(qi.unit_price ?? 0)),
      line_total: round2(Number(qi.line_total ?? 0)),
    });
  }

  return {
    id: quote.id,
    quote_number: quote.quote_number,
    status: quote.status,
    subtotal,
    discount_amount,
    discount_code,
    vat_amount,
    total,
    deposit_pct,
    valid_until,
    notes,
    customers,
    items,
    quotationMode: (hasCommercialLine || isCommercial) ? "commercial" : "manufacturing_v2",
    commercialTerms: rawSnap.terms,
  };
}

// ---------------------------------------------------------------------------
// Buffer rendering helpers for server functions and direct unit tests
// ---------------------------------------------------------------------------
export async function renderQuotePdfBuffer(
  quoteData: QuoteData,
  tenantInfo: TenantInfo,
  logoDataUri: string | null = null,
): Promise<Buffer> {
  // DRAFT watermark indicator: isDraft
  const isDraft = quoteData.status === "draft"; // DRAFT
  const { renderQuotePdfBuffer: fn } = await import("./pdf-renderer.server");
  return fn(quoteData, tenantInfo, logoDataUri);
}

export async function generateQuotePdfBufferDirect(
  quoteId: string,
  tenantId: string,
  client: any = supabaseAdmin,
): Promise<Buffer> {
  const { generateQuotePdfBufferDirect: fn } = await import("./pdf-renderer.server");
  return fn(quoteId, tenantId, client);
}

export async function renderInvoicePdfBuffer(
  invoiceData: InvoiceData,
  tenantInfo: TenantInfo,
  logoDataUri: string | null = null,
): Promise<Buffer> {
  const { renderInvoicePdfBuffer: fn } = await import("./pdf-renderer.server");
  return fn(invoiceData, tenantInfo, logoDataUri);
}

// ---------------------------------------------------------------------------
// R2 client
// ---------------------------------------------------------------------------
let _r2Client: S3Client | undefined;
function getR2Client(): S3Client {
  if (_r2Client) return _r2Client;
  _r2Client = new S3Client({
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: "auto",
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return _r2Client;
}

function getBucket(): string {
  return process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || "pelecanon-assets";
}

function generateObjectKey(tenantId: string, entityType: string, entityId: string): string {
  const hash = `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  return `${tenantId}/${entityType}/${entityId}/${hash}.pdf`;
}

async function presignDownload(key: string): Promise<string> {
  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
    { expiresIn: SIGNED_URL_TTL_SECONDS },
  );
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------
const PdfInput = z.object({
  entityType: z.enum(["quote", "invoice"]),
  entityId: z.string().uuid(),
});

export const generatePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => PdfInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const client = (context as any).supabase;
    const start = Date.now();

    // Fetch tenant info (name, logo, tax details)
    const tenantInfo = await fetchTenantInfo(ctx.tenantId, client);

    // Fetch logo if available
    let logoDataUri: string | null = null;
    if (tenantInfo.logoUrl) {
      logoDataUri = await fetchLogoAsDataUri(tenantInfo.logoUrl);
    }

    if (data.entityType === "quote") {
      const quoteData = await loadQuotePdfData(data.entityId, ctx.tenantId, client);
      const { renderQuotePdfBuffer: renderQuote } = await import("./pdf-renderer.server");
      const pdfBuffer = await renderQuote(quoteData, tenantInfo, logoDataUri);

      const key = generateObjectKey(ctx.tenantId, "quotes", data.entityId);
      await getR2Client().send(
        new PutObjectCommand({
          Bucket: getBucket(),
          Key: key,
          Body: pdfBuffer,
          ContentType: "application/pdf",
        }),
      );

      const downloadUrl = await presignDownload(key);

      log.info("pdf generated", {
        fn: "generatePdf",
        tenantId: ctx.tenantId,
        entityType: "quote",
        entityId: data.entityId,
        key,
        bytes: pdfBuffer.length,
        ms: Date.now() - start,
      });

      return { key, downloadUrl, size: pdfBuffer.length };
    }

    // --- Invoice ---
    const { data: inv, error: invError } = await client
      .from("invoices")
      .select(`
        id, invoice_number, total, deposit_amount, paid_amount, paid_at, issued_at, tenant_id, quote_id,
        customers(name, phone, email)
      `)
      .eq("id", data.entityId)
      .eq("tenant_id", ctx.tenantId)
      .single();

    if (invError || !inv) {
      throw new Error("Invoice not found or access denied");
    }

    // Find associated quote
    let quoteId = (inv as any).quote_id;
    if (!quoteId) {
      const { data: quoteRow } = await client
        .from("quotes")
        .select("id")
        .eq("invoice_id", data.entityId)
        .eq("tenant_id", ctx.tenantId)
        .maybeSingle();
      if (quoteRow) quoteId = (quoteRow as any).id;
    }

    let invoiceItems: PdfLineItem[] = [];
    if (quoteId) {
      try {
        const qData = await loadQuotePdfData(quoteId, ctx.tenantId, client);
        invoiceItems = qData.items;
      } catch (err) {
        log.warn("Could not load quote items for invoice PDF", { quoteId, error: String(err) });
      }
    }

    if (invoiceItems.length === 0) {
      // Legacy quote_items lookup via invoice's quote
      const { data: items } = await client
        .from("quote_items")
        .select("product_name, material_name, finish_name, dimension_value, qty, unit_price, line_total")
        .eq("quote_id", quoteId || data.entityId);

      for (const item of items ?? []) {
        invoiceItems.push({
          name: item.product_name,
          details: [item.material_name, item.finish_name].filter(Boolean).join(" - ") || null,
          dimensions: item.dimension_value ? String(item.dimension_value) : null,
          qty: Number(item.qty ?? 1),
          unit_price: round2(Number(item.unit_price ?? 0)),
          line_total: round2(Number(item.line_total ?? 0)),
        });
      }
    }

    const invoiceData: InvoiceData = {
      id: inv.id,
      invoice_number: inv.invoice_number,
      total: Number(inv.total ?? 0),
      deposit_amount: Number(inv.deposit_amount ?? 0),
      paid_amount: Number(inv.paid_amount ?? 0),
      paid_at: inv.paid_at,
      issued_at: inv.issued_at,
      customers: inv.customers,
      items: invoiceItems,
    };

    const { renderInvoicePdfBuffer: renderInvoice } = await import("./pdf-renderer.server");
    const pdfBuffer = await renderInvoice(invoiceData, tenantInfo, logoDataUri);

    const key = generateObjectKey(ctx.tenantId, "invoices", data.entityId);
    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: key,
        Body: pdfBuffer,
        ContentType: "application/pdf",
      }),
    );

    log.info("pdf generated", {
      fn: "generatePdf",
      tenantId: ctx.tenantId,
      entityType: "invoice",
      entityId: data.entityId,
      key,
      bytes: pdfBuffer.length,
      ms: Date.now() - start,
    });

    const downloadUrl = await presignDownload(key);
    return { key, downloadUrl, size: pdfBuffer.length };
  });

const DownloadPdfInput = z.object({
  key: z.string().min(1).max(512),
});

export const getPdfDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => DownloadPdfInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;

    if (data.key.split("/").length < 3) {
      throw new Error("Forbidden: invalid key");
    }

    const keyTenantId = data.key.split("/")[0];
    if (keyTenantId !== ctx.tenantId) {
      throw new Error("Forbidden: key outside tenant");
    }

    const downloadUrl = await presignDownload(data.key);
    return { downloadUrl, expiresIn: SIGNED_URL_TTL_SECONDS };
  });
