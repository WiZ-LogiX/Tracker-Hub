/**
 * PDF generation for quotes and invoices.
 *
 * Uses @react-pdf/renderer with Cairo font for RTL Arabic text.
 * Supports:
 *   1. V2 Quotation hierarchy (quotation_products → sections → units → components)
 *   2. Immutable frozen snapshots (quote_snapshots breakdown_json & tree_json)
 *   3. Backwards-compatible legacy quote_items fallback
 *
 * Generates PDF server-side, stores in R2, returns a 30-minute
 * presigned GET URL so the download works regardless of whether
 * the bucket itself is publicly addressable.
 *
 * Font strategy: Cairo TTF inlined as base64 data URIs at module
 * init (`src/lib/fonts/cairo.b64.ts`).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { renderToBuffer } from "@react-pdf/renderer";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { TenantContext } from "@/lib/tenant-context";
import { log } from "@/lib/log";
import { formatEGP } from "@/lib/pricing";
import {
  CAIRO_REGULAR_B64,
  CAIRO_SEMIBOLD_B64,
  CAIRO_BOLD_B64,
} from "@/lib/fonts/cairo.b64";
import {
  PELECANON_LOGO_DATA_URI,
  THANK_YOU_DATA_URI,
  PHONE_ICON_DATA_URI,
} from "@/lib/pdf/branding-assets";

// Signed URLs expire after 30 minutes
const SIGNED_URL_TTL_SECONDS = 60 * 30;

Font.register({
  family: "Cairo",
  fonts: [
    { src: `data:font/ttf;base64,${CAIRO_REGULAR_B64}`, fontWeight: 400 },
    { src: `data:font/ttf;base64,${CAIRO_SEMIBOLD_B64}`, fontWeight: 600 },
    { src: `data:font/ttf;base64,${CAIRO_BOLD_B64}`, fontWeight: 700 },
  ],
});

// ---------------------------------------------------------------------------
// Styles — Emerald Prestige Visual System
// ---------------------------------------------------------------------------
const DEFAULT_BRAND_COLOR = "#064e3b";
const GOLD_ACCENT = "#c9a84c";
const GRAY = "#475569";
const LIGHT_GRAY = "#94a3b8";
const BORDER = "#e2e8f0";
const HEADER_BG = "#f8fafc";
const ROW_ALT_BG = "#fafaf9";

function createStyles(brandColor: string) {
  const activeBrand = brandColor || DEFAULT_BRAND_COLOR;
  return StyleSheet.create({
    page: {
      paddingTop: 36,
      paddingBottom: 36,
      paddingHorizontal: 40,
      fontFamily: "Cairo",
      fontSize: 9,
      color: "#1e293b",
    },
    // --- Header ---
    header: {
      flexDirection: "row-reverse",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 18,
      borderBottomWidth: 2,
      borderBottomColor: activeBrand,
      paddingBottom: 14,
    },
    headerRight: {
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: 12,
    },
    logo: {
      width: 48,
      height: 48,
      objectFit: "contain",
    },
    companyName: {
      fontSize: 18,
      fontWeight: 700,
      color: activeBrand,
    },
    companyInfo: {
      fontSize: 8,
      color: GRAY,
      marginTop: 2,
    },
    titleBlock: {
      alignItems: "flex-end",
    },
    title: {
      fontSize: 16,
      fontWeight: 700,
      color: activeBrand,
    },
    subtitle: {
      fontSize: 9,
      fontWeight: 600,
      color: GRAY,
      marginTop: 2,
    },
    badge: {
      backgroundColor: activeBrand,
      color: "#ffffff",
      fontSize: 8,
      fontWeight: 600,
      paddingVertical: 2,
      paddingHorizontal: 8,
      borderRadius: 4,
      marginTop: 4,
      alignSelf: "flex-end",
    },
    // --- Customer & Document Details Card ---
    section: {
      marginBottom: 14,
      backgroundColor: "#ffffff",
      borderRadius: 4,
    },
    sectionTitle: {
      fontSize: 10,
      fontWeight: 700,
      color: activeBrand,
      marginBottom: 6,
      borderBottomWidth: 1,
      borderBottomColor: BORDER,
      paddingBottom: 3,
    },
    row: {
      flexDirection: "row-reverse",
      justifyContent: "space-between",
      marginBottom: 3,
    },
    label: {
      color: GRAY,
      fontSize: 8.5,
    },
    value: {
      fontWeight: 600,
      fontSize: 8.5,
      color: "#0f172a",
    },
    // --- Table ---
    table: {
      marginBottom: 14,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: BORDER,
      overflow: "hidden",
    },
    tableHeader: {
      flexDirection: "row-reverse",
      backgroundColor: HEADER_BG,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderBottomWidth: 1,
      borderBottomColor: BORDER,
    },
    tableHeaderText: {
      fontSize: 8,
      fontWeight: 700,
      color: "#1e293b",
      textAlign: "center",
      flex: 1,
    },
    tableRow: {
      flexDirection: "row-reverse",
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderBottomWidth: 0.5,
      borderBottomColor: BORDER,
      alignItems: "center",
    },
    tableCell: {
      fontSize: 8,
      textAlign: "center",
      flex: 1,
      color: "#334155",
    },
    // --- Totals Box ---
    totalsSection: {
      marginTop: 6,
      padding: 10,
      backgroundColor: HEADER_BG,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: BORDER,
    },
    totalRow: {
      flexDirection: "row-reverse",
      justifyContent: "space-between",
      marginBottom: 4,
    },
    totalLabel: {
      fontSize: 9,
      color: GRAY,
    },
    totalValue: {
      fontSize: 9,
      fontWeight: 600,
      color: "#0f172a",
    },
    grandTotalRow: {
      flexDirection: "row-reverse",
      justifyContent: "space-between",
      marginTop: 6,
      paddingTop: 6,
      borderTopWidth: 1.5,
      borderTopColor: activeBrand,
    },
    grandTotalLabel: {
      fontSize: 12,
      fontWeight: 700,
      color: activeBrand,
    },
    grandTotalValue: {
      fontSize: 13,
      fontWeight: 700,
      color: activeBrand,
    },
    // --- Footer ---
    footer: {
      marginTop: 16,
      paddingTop: 8,
      borderTopWidth: 0.5,
      borderTopColor: BORDER,
      textAlign: "center",
      fontSize: 7.5,
      color: LIGHT_GRAY,
    },
    notesBox: {
      backgroundColor: HEADER_BG,
      padding: 8,
      borderRadius: 4,
      borderWidth: 0.5,
      borderColor: BORDER,
      marginTop: 4,
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: "مسودة",
    sent: "مرسل",
    accepted: "مقبول",
    converted: "محول لأمر إنتاج",
    rejected: "مرفوض",
    expired: "منتهي",
    paid: "مدفوعة",
    unpaid: "بانتظار السداد",
  };
  return map[status] ?? status;
}

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

async function fetchTenantInfo(tenantId: string, client: any): Promise<TenantInfo> {
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

async function fetchLogoAsDataUri(logoUrl: string): Promise<string | null> {
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
      // @react-pdf/renderer Image component only supports PNG and JPEG rasters.
      // Returning null triggers the high-resolution brand PNG fallback.
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
 * Load complete customer-facing quotation data for PDF rendering.
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
      const bp = breakdownProducts[pIdx] || breakdownProducts.find((x: any) => x.id === p.id);
      const prodLabel = p.label || p.product_type_code || `منتج ${pIdx + 1}`;
      const sections = Array.isArray(p.sections) ? p.sections : [];
      const bSections = Array.isArray(bp?.sections) ? bp.sections : [];

      let hasRenderedUnit = false;

      for (let sIdx = 0; sIdx < sections.length; sIdx++) {
        const s = sections[sIdx];
        const bs = bSections[sIdx] || bSections.find((x: any) => x.id === s.id);
        const secLabel = s.label ? ` - ${s.label}` : "";
        const units = Array.isArray(s.units) ? s.units : [];
        const bUnits = Array.isArray(bs?.units) ? bs.units : [];

        for (let uIdx = 0; uIdx < units.length; uIdx++) {
          const u = units[uIdx];
          const bu = bUnits[uIdx] || bUnits.find((x: any) => x.id === u.id);
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
    const productIds = products.map((p: any) => p.id);

    const { data: sections } = await client
      .from("sections")
      .select("id, quotation_product_id, label, position")
      .in("quotation_product_id", productIds)
      .eq("tenant_id", tenantId)
      .order("position");

    const sectionIds = (sections ?? []).map((s: any) => s.id);

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
// PDF components
// ---------------------------------------------------------------------------
function Header({
  tenant,
  title,
  subtitle,
  badgeText,
  logoDataUri,
  styles,
}: {
  tenant: TenantInfo;
  title: string;
  subtitle: string;
  badgeText: string;
  logoDataUri: string | null;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerRight}>
        {logoDataUri ? (
          <Image src={logoDataUri} style={styles.logo} />
        ) : null}
        <View>
          <Text style={styles.companyName}>{tenant.name}</Text>
          {tenant.phone ? (
            <Text style={styles.companyInfo}>{tenant.phone}</Text>
          ) : null}
          {tenant.email ? (
            <Text style={styles.companyInfo}>{tenant.email}</Text>
          ) : null}
          {tenant.address ? (
            <Text style={styles.companyInfo}>{tenant.address}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <Text style={styles.badge}>{badgeText}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shaheen Commercial Quotation PDF (Reference: "Mr. Shaheen Q.pdf")
// ---------------------------------------------------------------------------
const SHAHEEN_GREEN = "#008269";
const SHAHEEN_GREEN_DARK = "#006d58";
const SHAHEEN_BORDER = "#1e293b";

const shaheenStyles = StyleSheet.create({
  page: {
    paddingTop: 0,
    paddingBottom: 42,
    paddingHorizontal: 36,
    fontFamily: "Cairo",
    fontSize: 9,
    color: "#1e293b",
    backgroundColor: "#ffffff",
  },
  topBar: {
    height: 14,
    backgroundColor: SHAHEEN_GREEN,
    marginHorizontal: -36,
    marginBottom: 10,
  },
  watermark: {
    position: "absolute",
    top: "45%",
    left: "15%",
    fontSize: 72,
    color: "#e5e5e5",
    fontWeight: 700,
    transform: "rotate(-30deg)",
    opacity: 0.25,
    zIndex: 0,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 4,
  },
  logoImage: {
    width: 240,
    height: 68,
    objectFit: "contain",
  },
  title: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: 700,
    color: "#111827",
    marginBottom: 8,
  },
  customerRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  customerName: {
    fontSize: 11,
    fontWeight: 700,
    color: "#111827",
    textAlign: "right",
  },
  quoteMetaContainer: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  quoteMeta: {
    fontSize: 8.5,
    color: "#64748b",
  },
  quoteMetaBold: {
    fontSize: 8.5,
    fontWeight: 700,
    color: "#1e293b",
  },
  table: {
    borderWidth: 1.5,
    borderColor: SHAHEEN_BORDER,
    marginBottom: 12,
  },
  tableHeader: {
    backgroundColor: "#ffffff",
    height: 26,
    flexDirection: "row-reverse",
    alignItems: "center",
    borderBottomWidth: 1.5,
    borderBottomColor: SHAHEEN_BORDER,
  },
  thText: {
    textAlign: "center",
    color: "#111827",
    fontSize: 10,
    fontWeight: 700,
  },
  headerDivider: {
    width: 1,
    height: "100%",
    backgroundColor: SHAHEEN_BORDER,
  },
  tableRow: {
    flexDirection: "row-reverse",
    borderBottomWidth: 1,
    borderBottomColor: SHAHEEN_BORDER,
    minHeight: 95,
  },
  cell: {
    justifyContent: "center",
  },
  cellDivider: {
    width: 1,
    backgroundColor: SHAHEEN_BORDER,
  },
  itemCategory: {
    fontSize: 11,
    fontWeight: 700,
    color: "#111827",
    textAlign: "center",
  },
  itemName: {
    fontSize: 8,
    color: "#475569",
    marginTop: 2,
    textAlign: "center",
  },
  itemDims: {
    fontSize: 7.5,
    color: "#64748b",
    marginTop: 2,
    textAlign: "center",
  },
  itemQty: {
    fontSize: 12,
    fontWeight: 700,
    color: "#111827",
  },
  itemUnit: {
    fontSize: 7.5,
    color: "#64748b",
    marginTop: 1,
  },
  designImage: {
    maxWidth: 145,
    maxHeight: 105,
    objectFit: "contain",
    borderRadius: 3,
  },
  imagePlaceholder: {
    width: 125,
    height: 80,
    backgroundColor: "#f8fafc",
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    justifyContent: "center",
    alignItems: "center",
  },
  imagePlaceholderText: {
    fontSize: 8,
    color: "#94a3b8",
  },
  specsText: {
    fontSize: 8,
    color: "#1f2937",
    lineHeight: 1.45,
    textAlign: "right",
  },
  unitPriceRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: SHAHEEN_BORDER,
  },
  unitPriceLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: "#111827",
  },
  unitPriceValue: {
    fontSize: 9.5,
    fontWeight: 700,
    color: "#111827",
  },
  totalsRow: {
    flexDirection: "row-reverse",
    height: 28,
    backgroundColor: "#ffffff",
    alignItems: "center",
  },
  totalsCell: {
    width: "25%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  totalsCellDivider: {
    width: 1,
    height: "100%",
    backgroundColor: SHAHEEN_BORDER,
  },
  totalLabel: {
    fontSize: 9.5,
    fontWeight: 700,
    color: "#111827",
    textAlign: "center",
  },
  totalVal: {
    fontSize: 10.5,
    fontWeight: 700,
    color: "#111827",
    textAlign: "center",
  },
  termsContainer: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 10,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  termsRight: {
    width: "65%",
  },
  termsLeft: {
    width: "35%",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeading: {
    fontSize: 10,
    fontWeight: 700,
    color: "#111827",
    textAlign: "right",
    marginBottom: 4,
  },
  bulletRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    marginBottom: 2.5,
  },
  bulletDot: {
    fontSize: 8.5,
    color: "#334155",
    lineHeight: 1.5,
    marginLeft: 4,
  },
  bulletText: {
    fontSize: 8,
    color: "#334155",
    lineHeight: 1.5,
    textAlign: "right",
  },
  thankYouImage: {
    width: 155,
    height: 38,
    objectFit: "contain",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 32,
    backgroundColor: SHAHEEN_GREEN,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  footerAddress: {
    alignItems: "flex-end",
  },
  footerAddressText: {
    color: "#ffffff",
    fontSize: 7.5,
    fontWeight: 600,
  },
  footerPhone: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  phoneIcon: {
    width: 12,
    height: 12,
  },
  footerPhoneText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: 700,
  },
});

function formatCategorySinglePrice(cat: string | null | undefined, name: string): string {
  const label = (cat || name || "الوحدة").trim();
  if (label.startsWith("ال")) return `سعر ${label} الواحد`;
  return `سعر ال${label} الواحد`;
}

export function ShaheenQuotationPdf({
  data,
  tenant,
  logoDataUri,
  isDraft = false,
}: {
  data: QuoteData;
  tenant: TenantInfo;
  logoDataUri: string | null;
  isDraft?: boolean;
}) {
  const terms = data.commercialTerms || {
    deliveryDays: 30,
    warrantyYears: 5,
    transportAndInstallIncluded: true,
    paymentSchedule: [
      { percent: 60, timing: "Advance upon contract", timingAr: "مقدم عند التعاقد" },
      { percent: 30, timing: "15 days after contract", timingAr: "بعد التعاقد بـ 15 يوم" },
      { percent: 10, timing: "Upon delivery and installation", timingAr: "عند الاستلام والتركيب" },
    ],
    notes: [
      "الباب شامل المفصلات (توريد & تركيب)",
      "الخامات المستخدمة مناسبة للأعمال السكنية الراقية والاستخدام طويل الأجل.",
      "موعد التسليم 30 يوم عمل من يوم التعاقد",
      "السعر شامل النقل والتركيب",
      "ضمان فعلي لمدة 5 سنوات",
    ],
  };

  const quoteLogo = logoDataUri || PELECANON_LOGO_DATA_URI;
  const customerName = data.customers?.name || "مستر شاهين";

  return (
    <Document language="ar">
      <Page size="A4" style={shaheenStyles.page}>
        {/* Top Accent Bar */}
        <View style={shaheenStyles.topBar} fixed />

        {/* Draft watermark */}
        {isDraft ? (
          <Text style={shaheenStyles.watermark} fixed>
            DRAFT
          </Text>
        ) : null}

        {/* Centered Brand Logo */}
        <View style={shaheenStyles.logoContainer}>
          <Image src={quoteLogo} style={shaheenStyles.logoImage} />
        </View>

        {/* Bilingual Title */}
        <Text style={shaheenStyles.title}>
          عرض سعر منتجات - Products Quotation
        </Text>

        {/* Customer greeting row */}
        <View style={shaheenStyles.customerRow}>
          <Text style={shaheenStyles.customerName}>
            إلى السيد : {customerName}
          </Text>
          <View style={shaheenStyles.quoteMetaContainer}>
            <Text style={shaheenStyles.quoteMeta}>رقم العرض:</Text>
            <Text style={shaheenStyles.quoteMetaBold}>{data.quote_number}</Text>
          </View>
        </View>

        {/* 4-Column Item Table */}
        <View style={shaheenStyles.table}>
          {/* Table Header */}
          <View style={shaheenStyles.tableHeader} fixed>
            <Text style={[shaheenStyles.thText, { width: "14%" }]}>البند</Text>
            <View style={shaheenStyles.headerDivider} />
            <Text style={[shaheenStyles.thText, { width: "10%" }]}>العدد</Text>
            <View style={shaheenStyles.headerDivider} />
            <Text style={[shaheenStyles.thText, { width: "30%" }]}>التصميم</Text>
            <View style={shaheenStyles.headerDivider} />
            <Text style={[shaheenStyles.thText, { width: "46%" }]}>المواصفات الفنية</Text>
          </View>

          {/* Table Rows */}
          {data.items.map((item, idx) => (
            <View key={idx} wrap={false}>
              <View style={shaheenStyles.tableRow}>
                {/* Col 1: البند */}
                <View style={[shaheenStyles.cell, { width: "14%", alignItems: "center", padding: 6 }]}>
                  <Text style={shaheenStyles.itemCategory}>
                    {item.categoryNameAr || item.name}
                  </Text>
                  {item.categoryNameAr && item.name !== item.categoryNameAr && (
                    <Text style={shaheenStyles.itemName}>
                      {item.name}
                    </Text>
                  )}
                  {item.dimensions && (
                    <Text style={shaheenStyles.itemDims}>
                      {item.dimensions}
                    </Text>
                  )}
                </View>

                <View style={shaheenStyles.cellDivider} />

                {/* Col 2: العدد */}
                <View style={[shaheenStyles.cell, { width: "10%", alignItems: "center", padding: 4 }]}>
                  <Text style={shaheenStyles.itemQty}>
                    {String(item.qty)}
                  </Text>
                  <Text style={shaheenStyles.itemUnit}>
                    {item.pricingUnitAr || "عدد"}
                  </Text>
                </View>

                <View style={shaheenStyles.cellDivider} />

                {/* Col 3: التصميم */}
                <View style={[shaheenStyles.cell, { width: "30%", alignItems: "center", padding: 6 }]}>
                  {item.imageUrl ? (
                    <Image src={item.imageUrl} style={shaheenStyles.designImage} />
                  ) : (
                    <View style={shaheenStyles.imagePlaceholder}>
                      <Text style={shaheenStyles.imagePlaceholderText}>
                        تصميم معتمد
                      </Text>
                    </View>
                  )}
                </View>

                <View style={shaheenStyles.cellDivider} />

                {/* Col 4: المواصفات الفنية */}
                <View style={[shaheenStyles.cell, { width: "46%", padding: 8 }]}>
                  <Text style={shaheenStyles.specsText}>
                    {item.technicalSpecs || item.details || item.name}
                  </Text>
                </View>
              </View>

              {/* Single Unit Price callout row ONLY if item.qty > 1 */}
              {item.qty > 1 && item.unit_price > 0 && (
                <View style={shaheenStyles.unitPriceRow}>
                  <Text style={shaheenStyles.unitPriceLabel}>
                    {formatCategorySinglePrice(item.categoryNameAr, item.name)}
                  </Text>
                  <Text style={shaheenStyles.unitPriceValue}>
                    {formatEGP(item.unit_price)}
                  </Text>
                </View>
              )}
            </View>
          ))}

          {/* Table Totals Row — matching reference 4-cell layout */}
          <View style={shaheenStyles.totalsRow} wrap={false}>
            <View style={shaheenStyles.totalsCell}>
              <Text style={shaheenStyles.totalLabel}>السعر الإجمالي</Text>
            </View>
            <View style={shaheenStyles.totalsCellDivider} />
            <View style={shaheenStyles.totalsCell}>
              <Text style={shaheenStyles.totalVal}>{formatEGP(data.subtotal)}</Text>
            </View>
            <View style={shaheenStyles.totalsCellDivider} />
            <View style={shaheenStyles.totalsCell}>
              <Text style={shaheenStyles.totalLabel}>السعر بعد الخصم</Text>
            </View>
            <View style={shaheenStyles.totalsCellDivider} />
            <View style={shaheenStyles.totalsCell}>
              <Text style={shaheenStyles.totalVal}>{formatEGP(data.total)}</Text>
            </View>
          </View>
        </View>

        {/* Second-Page / Terms & Notes Section */}
        <View style={shaheenStyles.termsContainer} wrap={false}>
          {/* Notes and Payment terms column (Right) */}
          <View style={shaheenStyles.termsRight}>
            {/* Notes */}
            <View style={{ marginBottom: 10 }}>
              <Text style={shaheenStyles.sectionHeading}>ملاحظات:</Text>
              {(terms.notes || []).map((note, i) => (
                <View key={i} style={shaheenStyles.bulletRow}>
                  <Text style={shaheenStyles.bulletDot}>•</Text>
                  <Text style={shaheenStyles.bulletText}>{note}</Text>
                </View>
              ))}
              {terms.customNotes ? (
                <View style={shaheenStyles.bulletRow}>
                  <Text style={shaheenStyles.bulletDot}>•</Text>
                  <Text style={shaheenStyles.bulletText}>{terms.customNotes}</Text>
                </View>
              ) : null}
            </View>

            {/* Payment Terms */}
            <View>
              <Text style={shaheenStyles.sectionHeading}>شروط التعاقد والدفع:</Text>
              {(terms.paymentSchedule || []).map((ms, i) => (
                <View key={i} style={shaheenStyles.bulletRow}>
                  <Text style={shaheenStyles.bulletDot}>•</Text>
                  <Text style={shaheenStyles.bulletText}>{`${ms.percent}% ${ms.timingAr || ms.timing}`}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Cursive Thank You branding (Left) */}
          <View style={shaheenStyles.termsLeft}>
            <Image src={THANK_YOU_DATA_URI} style={shaheenStyles.thankYouImage} />
          </View>
        </View>

        {/* Bottom Contact Footer */}
        <View style={shaheenStyles.footer} fixed>
          <View style={shaheenStyles.footerAddress}>
            <Text style={shaheenStyles.footerAddressText}>
              الفرع الرئيسي: القاهرة - مدينة نصر - مكرم عبيد
            </Text>
            <Text style={shaheenStyles.footerAddressText}>
              فرع الإسكندرية: سموحة
            </Text>
          </View>
          <View style={shaheenStyles.footerPhone}>
            <Image src={PHONE_ICON_DATA_URI} style={shaheenStyles.phoneIcon} />
            <Text style={shaheenStyles.footerPhoneText}>
              {tenant.phone || "+20 11 16322271"}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export function QuotePdf({
  data,
  tenant,
  logoDataUri,
  styles,
  isDraft = false,
}: {
  data: QuoteData;
  tenant: TenantInfo;
  logoDataUri: string | null;
  styles: ReturnType<typeof createStyles>;
  isDraft?: boolean;
}) {
  const isCommercial =
    data.quotationMode === "commercial" ||
    !!data.commercialTerms ||
    tenant.name === "PeleCanon" ||
    tenant.primaryColor === "#008269";

  if (isCommercial) {
    return (
      <ShaheenQuotationPdf
        data={data}
        tenant={tenant}
        logoDataUri={logoDataUri}
        isDraft={isDraft}
      />
    );
  }

  return (
    <EmeraldPrestigeQuotePdf
      data={data}
      tenant={tenant}
      logoDataUri={logoDataUri}
      styles={styles}
      isDraft={isDraft}
    />
  );
}

export function EmeraldPrestigeQuotePdf({
  data,
  tenant,
  logoDataUri,
  styles,
  isDraft = false,
}: {
  data: QuoteData;
  tenant: TenantInfo;
  logoDataUri: string | null;
  styles: ReturnType<typeof createStyles>;
  isDraft?: boolean;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* DRAFT watermark — only on draft quotes */}
        {isDraft ? (
          <Text
            style={{
              position: "absolute",
              top: "45%",
              left: "15%",
              fontSize: 72,
              color: "#e5e5e5",
              fontWeight: 700,
              transform: "rotate(-30deg)",
              opacity: 0.3,
              zIndex: 0,
            }}
          >
            DRAFT
          </Text>
        ) : null}

        <Header
          tenant={tenant}
          title="عرض سعر"
          subtitle={`#${data.quote_number}`}
          badgeText={statusLabel(data.status)}
          logoDataUri={logoDataUri}
          styles={styles}
        />

        {/* Customer info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>بيانات العميل</Text>
          <View style={styles.row}>
            <Text style={styles.label}>الاسم:</Text>
            <Text style={styles.value}>{data.customers?.name ?? "—"}</Text>
          </View>
          {data.customers?.phone ? (
            <View style={styles.row}>
              <Text style={styles.label}>الهاتف:</Text>
              <Text style={styles.value}>{data.customers.phone}</Text>
            </View>
          ) : null}
          {data.customers?.email ? (
            <View style={styles.row}>
              <Text style={styles.label}>البريد:</Text>
              <Text style={styles.value}>{data.customers.email}</Text>
            </View>
          ) : null}
          <View style={styles.row}>
            <Text style={styles.label}>صالح حتى:</Text>
            <Text style={styles.value}>{formatDate(data.valid_until)}</Text>
          </View>
        </View>

        {/* Items table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 2.5 }]}>البيان / المنتج</Text>
            <Text style={[styles.tableHeaderText, { flex: 1.2 }]}>المقاس</Text>
            <Text style={[styles.tableHeaderText, { flex: 0.8 }]}>الكمية</Text>
            <Text style={[styles.tableHeaderText, { flex: 1.2 }]}>سعر الوحدة</Text>
            <Text style={[styles.tableHeaderText, { flex: 1.3 }]}>الإجمالي</Text>
          </View>
          {data.items.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <View style={{ flex: 2.5 }}>
                <Text style={[styles.tableCell, { fontWeight: 600, textAlign: "right" }]}>
                  {item.name}
                </Text>
                {item.details ? (
                  <Text style={{ fontSize: 7, color: GRAY, marginTop: 1, textAlign: "right" }}>
                    {item.details}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.tableCell, { flex: 1.2 }]}>
                {item.dimensions || "—"}
              </Text>
              <Text style={[styles.tableCell, { flex: 0.8 }]}>
                {String(item.qty)}
              </Text>
              <Text style={[styles.tableCell, { flex: 1.2 }]}>
                {formatEGP(item.unit_price)}
              </Text>
              <Text style={[styles.tableCell, { flex: 1.3 }]}>
                {formatEGP(item.line_total)}
              </Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>المجموع الفرعي</Text>
            <Text style={styles.totalValue}>{formatEGP(data.subtotal)}</Text>
          </View>
          {data.discount_amount > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                خصم {data.discount_code ? `(${data.discount_code})` : ""}
              </Text>
              <Text style={styles.totalValue}>
                − {formatEGP(data.discount_amount)}
              </Text>
            </View>
          ) : null}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>ضريبة القيمة المضافة (14%)</Text>
            <Text style={styles.totalValue}>{formatEGP(data.vat_amount)}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>الإجمالي</Text>
            <Text style={styles.grandTotalValue}>
              {formatEGP(data.total)}
            </Text>
          </View>
          {data.deposit_pct > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                عربون مقترح ({data.deposit_pct}%):{" "}
                {formatEGP(round2((data.total * data.deposit_pct) / 100))}
              </Text>
            </View>
          ) : null}
        </View>

        {data.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ملاحظات</Text>
            <View style={styles.notesBox}>
              <Text style={{ fontSize: 9, color: "#333" }}>{data.notes}</Text>
            </View>
          </View>
        ) : null}

        {/* Tax info */}
        {tenant.taxNumber ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>معلومات ضريبية</Text>
            <View style={styles.row}>
              <Text style={styles.label}>الرقم الضريبي:</Text>
              <Text style={styles.value}>{tenant.taxNumber}</Text>
            </View>
            {tenant.commercialRegistry ? (
              <View style={styles.row}>
                <Text style={styles.label}>السجل التجاري:</Text>
                <Text style={styles.value}>{tenant.commercialRegistry}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.footer}>
          {tenant.name} — نظام إدارة الإنتاج
        </Text>
      </Page>
    </Document>
  );
}

export function InvoicePdf({
  data,
  tenant,
  logoDataUri,
  styles,
}: {
  data: InvoiceData;
  tenant: TenantInfo;
  logoDataUri: string | null;
  styles: ReturnType<typeof createStyles>;
}) {
  const paid = !!data.paid_at;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header
          tenant={tenant}
          title="فاتورة"
          subtitle={`#${data.invoice_number}`}
          badgeText={paid ? "مدفوعة" : "بانتظار السداد"}
          logoDataUri={logoDataUri}
          styles={styles}
        />

        {/* Customer info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>بيانات العميل</Text>
          <View style={styles.row}>
            <Text style={styles.label}>الاسم:</Text>
            <Text style={styles.value}>{data.customers?.name ?? "—"}</Text>
          </View>
          {data.customers?.phone ? (
            <View style={styles.row}>
              <Text style={styles.label}>الهاتف:</Text>
              <Text style={styles.value}>{data.customers.phone}</Text>
            </View>
          ) : null}
          <View style={styles.row}>
            <Text style={styles.label}>تاريخ الإصدار:</Text>
            <Text style={styles.value}>{formatDate(data.issued_at)}</Text>
          </View>
          {data.paid_at ? (
            <View style={styles.row}>
              <Text style={styles.label}>تاريخ السداد:</Text>
              <Text style={styles.value}>{formatDate(data.paid_at)}</Text>
            </View>
          ) : null}
        </View>

        {/* Items table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 2.5 }]}>البيان / المنتج</Text>
            <Text style={[styles.tableHeaderText, { flex: 1.2 }]}>المقاس</Text>
            <Text style={[styles.tableHeaderText, { flex: 0.8 }]}>الكمية</Text>
            <Text style={[styles.tableHeaderText, { flex: 1.2 }]}>سعر الوحدة</Text>
            <Text style={[styles.tableHeaderText, { flex: 1.3 }]}>الإجمالي</Text>
          </View>
          {data.items.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <View style={{ flex: 2.5 }}>
                <Text style={[styles.tableCell, { fontWeight: 600, textAlign: "right" }]}>
                  {item.name}
                </Text>
                {item.details ? (
                  <Text style={{ fontSize: 7, color: GRAY, marginTop: 1, textAlign: "right" }}>
                    {item.details}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.tableCell, { flex: 1.2 }]}>
                {item.dimensions || "—"}
              </Text>
              <Text style={[styles.tableCell, { flex: 0.8 }]}>
                {String(item.qty)}
              </Text>
              <Text style={[styles.tableCell, { flex: 1.2 }]}>
                {formatEGP(item.unit_price)}
              </Text>
              <Text style={[styles.tableCell, { flex: 1.3 }]}>
                {formatEGP(item.line_total)}
              </Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>الإجمالي</Text>
            <Text style={styles.totalValue}>{formatEGP(data.total)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>العربون</Text>
            <Text style={styles.totalValue}>
              {formatEGP(data.deposit_amount)}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>المسدد</Text>
            <Text style={styles.totalValue}>{formatEGP(data.paid_amount)}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>المتبقي</Text>
            <Text style={styles.grandTotalValue}>
              {formatEGP(round2(data.total - data.paid_amount))}
            </Text>
          </View>
        </View>

        {/* Tax info */}
        {tenant.taxNumber ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>معلومات ضريبية</Text>
            <View style={styles.row}>
              <Text style={styles.label}>الرقم الضريبي:</Text>
              <Text style={styles.value}>{tenant.taxNumber}</Text>
            </View>
            {tenant.commercialRegistry ? (
              <View style={styles.row}>
                <Text style={styles.label}>السجل التجاري:</Text>
                <Text style={styles.value}>{tenant.commercialRegistry}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.footer}>
          {tenant.name} — نظام إدارة الإنتاج
        </Text>
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Buffer rendering helpers for server functions and direct unit tests
// ---------------------------------------------------------------------------
export async function renderQuotePdfBuffer(
  quoteData: QuoteData,
  tenantInfo: TenantInfo,
  logoDataUri: string | null = null,
): Promise<Buffer> {
  const quoteStyles = createStyles(tenantInfo.primaryColor || DEFAULT_BRAND_COLOR);
  const isDraft = quoteData.status === "draft";
  return renderToBuffer(
    <QuotePdf
      data={quoteData}
      tenant={tenantInfo}
      logoDataUri={logoDataUri}
      styles={quoteStyles}
      isDraft={isDraft}
    />,
  );
}

export async function generateQuotePdfBufferDirect(
  quoteId: string,
  tenantId: string,
  client: any = supabaseAdmin,
): Promise<Buffer> {
  const tenantInfo = await fetchTenantInfo(tenantId, client);
  let logoDataUri: string | null = null;
  if (tenantInfo.logoUrl) {
    logoDataUri = await fetchLogoAsDataUri(tenantInfo.logoUrl);
  }
  const quoteData = await loadQuotePdfData(quoteId, tenantId, client);
  return renderQuotePdfBuffer(quoteData, tenantInfo, logoDataUri);
}

export async function renderInvoicePdfBuffer(
  invoiceData: InvoiceData,
  tenantInfo: TenantInfo,
  logoDataUri: string | null = null,
): Promise<Buffer> {
  const invoiceStyles = createStyles(tenantInfo.primaryColor || DEFAULT_BRAND_COLOR);
  return renderToBuffer(
    <InvoicePdf
      data={invoiceData}
      tenant={tenantInfo}
      logoDataUri={logoDataUri}
      styles={invoiceStyles}
    />,
  );
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
      const pdfBuffer = await renderQuotePdfBuffer(quoteData, tenantInfo, logoDataUri);

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

    const pdfBuffer = await renderInvoicePdfBuffer(invoiceData, tenantInfo, logoDataUri);

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
