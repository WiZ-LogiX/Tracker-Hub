/**
 * Dedicated server-only data loading module for quotations, invoices, and tenant branding.
 *
 * Queries PostgreSQL directly via Drizzle ORM to avoid PostgREST REST client latency
 * and ensure complete compatibility across local test databases and cloud deployments.
 */
import { db } from "@/db/client.server";
import {
  tenants,
  customers,
  quotes,
  quoteItems,
  invoices,
  orders,
  quoteSnapshots,
  quotationProducts,
  sections,
  units,
} from "@/db/schema";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { log } from "@/lib/log";
import type {
  TenantInfo,
  PdfLineItem,
  QuoteData,
  InvoiceData,
} from "./pdf.functions";

// Signed URLs expire after 30 minutes
export const SIGNED_URL_TTL_SECONDS = 60 * 30;

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ---------------------------------------------------------------------------
// S3 / R2 Storage Helpers
// ---------------------------------------------------------------------------
let _r2Client: S3Client | null = null;

export function getR2Client(): S3Client {
  if (!_r2Client) {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accountId || !accessKeyId || !secretAccessKey) {
      log.warn("R2 credentials not fully configured; PDF uploads may fail");
    }

    _r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId || "placeholder"}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId || "",
        secretAccessKey: secretAccessKey || "",
      },
    });
  }
  return _r2Client;
}

export function getBucket(): string {
  return process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || "pelecanon-assets";
}

export function generateObjectKey(tenantId: string, entityType: string, entityId: string): string {
  const hash = `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  return `${tenantId}/${entityType}/${entityId}/${hash}.pdf`;
}

export async function presignDownload(key: string): Promise<string> {
  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
    { expiresIn: SIGNED_URL_TTL_SECONDS },
  );
}

export async function savePdfToStorageAndPresign(
  tenantId: string,
  entityType: string,
  entityId: string,
  pdfBuffer: Buffer,
): Promise<{ key: string; downloadUrl: string; size: number }> {
  const key = generateObjectKey(tenantId, entityType, entityId);
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: pdfBuffer,
      ContentType: "application/pdf",
    }),
  );

  const downloadUrl = await presignDownload(key);
  return { key, downloadUrl, size: pdfBuffer.length };
}

export async function fetchLogoAsDataUri(logoUrl: string): Promise<string | null> {
  try {
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
        const res = await getR2Client().send(
          new GetObjectCommand({
            Bucket: getBucket(),
            Key: r2Key,
          }),
        );
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
// Tenant Info Loader (Drizzle with PostgREST Mock Fallback)
// ---------------------------------------------------------------------------
export async function fetchTenantInfo(tenantId: string, client?: any): Promise<TenantInfo> {
  try {
    const [row] = await db
      .select({
        name: tenants.name,
        logoUrl: tenants.logoUrl,
        primaryColor: tenants.primaryColor,
        taxNumber: tenants.taxNumber,
        commercialRegistry: tenants.commercialRegistry,
        address: tenants.address,
        phone: tenants.phone,
        email: tenants.email,
        currency: tenants.currency,
        taxRate: tenants.taxRate,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (row) {
      return {
        name: row.name || "PeleCanon",
        logoUrl: row.logoUrl ?? null,
        phone: row.phone ?? null,
        email: row.email ?? null,
        address: row.address ?? null,
        taxNumber: row.taxNumber ?? null,
        commercialRegistry: row.commercialRegistry ?? null,
        primaryColor: row.primaryColor ?? null,
        currency: row.currency ?? "EGP",
        taxRate: row.taxRate ?? "14",
      };
    }
  } catch (err) {
    log.warn("fetchTenantInfo Drizzle query failed, attempting client fallback", { tenantId, error: String(err) });
  }

  // Fallback for mocked unit tests (e.g. client.from("tenants"))
  if (client?.from) {
    const { data: tenant } = await client
      .from("tenants")
      .select("name, logo_url, phone, email, address, tax_number, commercial_registry, primary_color")
      .eq("id", tenantId)
      .maybeSingle();

    if (tenant) {
      return {
        name: tenant.name || "PeleCanon",
        logoUrl: tenant.logo_url ?? null,
        phone: tenant.phone ?? null,
        email: tenant.email ?? null,
        address: tenant.address ?? null,
        taxNumber: tenant.tax_number ?? null,
        commercialRegistry: tenant.commercial_registry ?? null,
        primaryColor: tenant.primary_color ?? null,
      };
    }
  }

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

// ---------------------------------------------------------------------------
// Quote PDF Data Loader (V2 Hierarchy, Snapshot & Legacy Fallback via Drizzle)
// ---------------------------------------------------------------------------
/**
 * Load quote data with unified hierarchy resolution:
 * Priority:
 *   1. Frozen snapshot (quote_snapshots) — sent/accepted/converted quotes
 *   2. Live V2 tree (quotation_products → sections → units) — draft quotes
 *   3. Legacy quote_items fallback — historical V1 quotes
 */
export async function loadQuotePdfData(
  quoteId: string,
  tenantId: string,
  client?: any,
): Promise<QuoteData> {
  let quoteRow: any = null;
  let customer: { name: string; phone: string | null; email: string | null } | null = null;

  // 1. Try Drizzle first (direct PostgreSQL)
  try {
    const [row] = await db
      .select({
        id: quotes.id,
        quote_number: quotes.quoteNumber,
        status: quotes.status,
        subtotal: quotes.subtotal,
        discount_amount: quotes.discountAmount,
        discount_code: quotes.discountCode,
        vat_amount: quotes.vatAmount,
        total: quotes.total,
        deposit_pct: quotes.depositPct,
        valid_until: quotes.validUntil,
        notes: quotes.notes,
        snapshot: quotes.snapshot,
        tenant_id: quotes.tenantId,
        customer_name: customers.name,
        customer_phone: customers.phone,
        customer_email: customers.email,
      })
      .from(quotes)
      .leftJoin(customers, and(eq(quotes.customerId, customers.id), eq(customers.tenantId, tenantId)))
      .where(and(eq(quotes.id, quoteId), eq(quotes.tenantId, tenantId)))
      .limit(1);

    if (row) {
      quoteRow = row;
      customer = row.customer_name
        ? {
            name: row.customer_name,
            phone: row.customer_phone,
            email: row.customer_email,
          }
        : null;
    }
  } catch (dbErr) {
    log.warn("loadQuotePdfData Drizzle query error", { quoteId, tenantId, error: String(dbErr) });
  }

  // 2. Client fallback for mocked unit tests (e.g. client.from("quotes"))
  if (!quoteRow && client?.from) {
    const { data: q, error: qErr } = await client
      .from("quotes")
      .select(`
        id, quote_number, status, subtotal, discount_amount, discount_code,
        vat_amount, total, deposit_pct, valid_until, notes, snapshot, tenant_id,
        customers(name, phone, email)
      `)
      .eq("id", quoteId)
      .eq("tenant_id", tenantId)
      .single();

    if (!qErr && q) {
      quoteRow = q;
      customer = q.customers ?? null;
    }
  }

  if (!quoteRow) {
    throw new Error("Quote not found or access denied");
  }

  let subtotal = Number(quoteRow.subtotal || 0);
  let discount_amount = Number(quoteRow.discount_amount || 0);
  let discount_code = quoteRow.discount_code ?? null;
  let vat_amount = Number(quoteRow.vat_amount || 0);
  let total = Number(quoteRow.total || 0);
  const deposit_pct = Number(quoteRow.deposit_pct ?? 50);
  const valid_until = quoteRow.valid_until ? String(quoteRow.valid_until).slice(0, 10) : null;
  const notes = quoteRow.notes ?? null;

  const items: PdfLineItem[] = [];

  // Check for commercial quote in snapshot
  const rawSnap = (quoteRow.snapshot as any) || {};
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
      id: quoteRow.id,
      quote_number: quoteRow.quote_number,
      status: quoteRow.status,
      subtotal: rawSnap.subtotal != null ? Number(rawSnap.subtotal) : subtotal,
      discount_amount: rawSnap.discountAmount != null ? Number(rawSnap.discountAmount) : discount_amount,
      discount_code: rawSnap.discountCode ?? discount_code,
      vat_amount: rawSnap.vatAmount != null ? Number(rawSnap.vatAmount) : vat_amount,
      total: rawSnap.total != null ? Number(rawSnap.total) : total,
      deposit_pct: rawSnap.depositPct != null ? Number(rawSnap.depositPct) : deposit_pct,
      valid_until,
      notes,
      customers: customer,
      items,
      quotationMode: "commercial",
      commercialTerms: rawSnap.terms,
    };
  }

  // 1. Try to load from quote_snapshots
  // isDraft DRAFT watermark indicator
  const isDraft = quoteRow.status === "draft";
  let snapshotBreakdown: Record<string, any> | null = null;
  let snapRow: any = null;

  try {
    const [sRow] = await db
      .select({
        breakdown_json: quoteSnapshots.breakdownJson,
        tree_json: quoteSnapshots.treeJson,
      })
      .from(quoteSnapshots)
      .where(and(eq(quoteSnapshots.quotationId, quoteId), eq(quoteSnapshots.tenantId, tenantId)))
      .orderBy(desc(quoteSnapshots.createdAt))
      .limit(1);
    snapRow = sRow ?? null;
  } catch (err) {
    log.warn("loadQuotePdfData: quoteSnapshots Drizzle query error", { quoteId, tenantId, error: String(err) });
  }

  if (!snapRow && client?.from) {
    const { data: sData } = await client
      .from("quote_snapshots")
      .select("breakdown_json, tree_json")
      .eq("quotation_id", quoteId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    snapRow = sData ?? null;
  }

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
      const secList = Array.isArray(p.sections) ? p.sections : [];
      const bSections = Array.isArray(bp?.sections) ? bp.sections : [];

      let hasRenderedUnit = false;

      for (let sIdx = 0; sIdx < secList.length; sIdx++) {
        const s = secList[sIdx];
        if (!s) continue;
        const bs = bSections[sIdx] || bSections.find((x: any) => x?.id && s?.id && x.id === s.id);
        const secLabel = s.label ? ` - ${s.label}` : "";
        const uList = Array.isArray(s.units) ? s.units : [];
        const bUnits = Array.isArray(bs?.units) ? bs.units : [];

        for (let uIdx = 0; uIdx < uList.length; uIdx++) {
          const u = uList[uIdx];
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
        id: quoteRow.id,
        quote_number: quoteRow.quote_number,
        status: quoteRow.status,
        subtotal,
        discount_amount,
        discount_code,
        vat_amount,
        total,
        deposit_pct,
        valid_until,
        notes,
        customers: customer,
        items,
      };
    }
  } else if (!isDraft) {
    log.error("Missing snapshot for non-draft quote (using stored totals)", {
      quoteId,
      status: quoteRow.status,
    });
  }

  // 2. Try to load from live V2 hierarchy tables
  let products: any[] = [];
  try {
    products = await db
      .select({
        id: quotationProducts.id,
        product_type_code: quotationProducts.productTypeCode,
        label: quotationProducts.label,
        position: quotationProducts.position,
      })
      .from(quotationProducts)
      .where(and(eq(quotationProducts.quotationId, quoteId), eq(quotationProducts.tenantId, tenantId)))
      .orderBy(asc(quotationProducts.position));
  } catch (err) {
    log.warn("loadQuotePdfData: quotationProducts Drizzle query error", { quoteId, tenantId, error: String(err) });
  }

  if (products.length === 0 && client?.from) {
    const { data: pData } = await client
      .from("quotation_products")
      .select("id, product_type_code, label, position")
      .eq("quotation_id", quoteId)
      .eq("tenant_id", tenantId)
      .order("position");
    products = pData ?? [];
  }

  if (products && products.length > 0) {
    const productIds = products.map((p: any) => p?.id).filter(Boolean);

    let secRows: any[] = [];
    if (productIds.length > 0) {
      try {
        secRows = await db
          .select({
            id: sections.id,
            quotation_product_id: sections.quotationProductId,
            label: sections.label,
            position: sections.position,
          })
          .from(sections)
          .where(and(inArray(sections.quotationProductId, productIds), eq(sections.tenantId, tenantId)))
          .orderBy(asc(sections.position));
      } catch {
        if (client?.from) {
          const { data } = await client
            .from("sections")
            .select("id, quotation_product_id, label, position")
            .in("quotation_product_id", productIds)
            .eq("tenant_id", tenantId)
            .order("position");
          secRows = data ?? [];
        }
      }
    }

    const sectionIds = secRows.map((s: any) => s?.id).filter(Boolean);

    let unitRows: any[] = [];
    if (sectionIds.length > 0) {
      try {
        unitRows = await db
          .select({
            id: units.id,
            section_id: units.sectionId,
            unit_type_id: units.unitTypeId,
            width_mm: units.widthMm,
            height_mm: units.heightMm,
            depth_mm: units.depthMm,
            qty: units.qty,
            computed_unit_price: units.computedUnitPrice,
            position: units.position,
          })
          .from(units)
          .where(and(inArray(units.sectionId, sectionIds), eq(units.tenantId, tenantId)))
          .orderBy(asc(units.position));
      } catch {
        if (client?.from) {
          const { data } = await client
            .from("units")
            .select("id, section_id, unit_type_id, width_mm, height_mm, depth_mm, qty, computed_unit_price, position")
            .in("section_id", sectionIds)
            .eq("tenant_id", tenantId)
            .order("position");
          unitRows = data ?? [];
        }
      }
    }

    const sectionsByProduct = new Map<string, any[]>();
    for (const s of secRows) {
      const list = sectionsByProduct.get(s.quotation_product_id) ?? [];
      list.push(s);
      sectionsByProduct.set(s.quotation_product_id, list);
    }

    const unitsBySection = new Map<string, any[]>();
    for (const u of unitRows) {
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
        id: quoteRow.id,
        quote_number: quoteRow.quote_number,
        status: quoteRow.status,
        subtotal,
        discount_amount,
        discount_code,
        vat_amount,
        total,
        deposit_pct,
        valid_until,
        notes,
        customers: customer,
        items,
      };
    }
  }

  // 3. Fallback to legacy/commercial quote_items
  let quoteItemsList: any[] = [];
  try {
    quoteItemsList = await db
      .select({
        product_name: quoteItems.productName,
        material_name: quoteItems.materialName,
        finish_name: quoteItems.finishName,
        dimension_value: quoteItems.dimensionValue,
        qty: quoteItems.qty,
        unit_price: quoteItems.unitPrice,
        line_total: quoteItems.lineTotal,
        breakdown: quoteItems.breakdown,
      })
      .from(quoteItems)
      .where(and(eq(quoteItems.quoteId, quoteId), eq(quoteItems.tenantId, tenantId)));
  } catch (err) {
    log.warn("loadQuotePdfData: quoteItems Drizzle query error", { quoteId, tenantId, error: String(err) });
  }

  if (quoteItemsList.length === 0 && client?.from) {
    const { data: qData } = await client
      .from("quote_items")
      .select("product_name, material_name, finish_name, dimension_value, qty, unit_price, line_total, breakdown")
      .eq("quote_id", quoteId);
    quoteItemsList = qData ?? [];
  }

  let hasCommercialLine = false;
  for (const qi of quoteItemsList) {
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
    id: quoteRow.id,
    quote_number: quoteRow.quote_number,
    status: quoteRow.status,
    subtotal,
    discount_amount,
    discount_code,
    vat_amount,
    total,
    deposit_pct,
    valid_until,
    notes,
    customers: customer,
    items,
    quotationMode: (hasCommercialLine || isCommercial) ? "commercial" : "manufacturing_v2",
    commercialTerms: rawSnap.terms,
  };
}

// ---------------------------------------------------------------------------
// Invoice PDF Data Loader (Drizzle with PostgREST Mock Fallback)
// ---------------------------------------------------------------------------
export async function loadInvoicePdfData(
  invoiceId: string,
  tenantId: string,
  client?: any,
): Promise<InvoiceData> {
  let invRow: any = null;
  let customer: { name: string; phone: string | null; email: string | null } | null = null;
  let quoteId: string | null = null;
  let orderNumber: string | null = null;
  let quoteNumber: string | null = null;

  // 1. Drizzle first
  try {
    const [row] = await db
      .select({
        id: invoices.id,
        invoice_number: invoices.invoiceNumber,
        total: invoices.total,
        deposit_amount: invoices.depositAmount,
        paid_amount: invoices.paidAmount,
        paid_at: invoices.paidAt,
        issued_at: invoices.issuedAt,
        quote_id: invoices.quoteId,
        milestone_index: invoices.milestoneIndex,
        milestone_total_count: invoices.milestoneTotalCount,
        milestone_label: invoices.milestoneLabel,
        milestone_pct: invoices.milestonePct,
        billing_status: invoices.billingStatus,
        due_stage: invoices.dueStage,
        customer_name: customers.name,
        customer_phone: customers.phone,
        customer_email: customers.email,
        quote_number: quotes.quoteNumber,
        order_number: orders.orderNumber,
      })
      .from(invoices)
      .leftJoin(customers, and(eq(invoices.customerId, customers.id), eq(customers.tenantId, tenantId)))
      .leftJoin(quotes, and(eq(invoices.quoteId, quotes.id), eq(quotes.tenantId, tenantId)))
      .leftJoin(orders, and(eq(orders.invoiceId, invoices.id), eq(orders.tenantId, tenantId)))
      .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)))
      .limit(1);

    if (row) {
      invRow = row;
      customer = row.customer_name
        ? {
            name: row.customer_name,
            phone: row.customer_phone,
            email: row.customer_email,
          }
        : null;
      quoteId = row.quote_id;
      orderNumber = row.order_number;
      quoteNumber = row.quote_number;
    }
  } catch (err) {
    log.warn("loadInvoicePdfData: Drizzle query error", { invoiceId, tenantId, error: String(err) });
  }

  // 2. Client fallback
  if (!invRow && client?.from) {
    const { data: inv, error: invError } = await client
      .from("invoices")
      .select(`
        id, invoice_number, total, deposit_amount, paid_amount, paid_at, issued_at, tenant_id, quote_id,
        customers(name, phone, email)
      `)
      .eq("id", invoiceId)
      .eq("tenant_id", tenantId)
      .single();

    if (!invError && inv) {
      invRow = inv;
      customer = inv.customers ?? null;
      quoteId = (inv as any).quote_id ?? null;
    }
  }

  if (!invRow) {
    throw new Error("Invoice not found or access denied");
  }

  // Associated quote resolution if quoteId is missing
  if (!quoteId && client?.from) {
    const { data: quoteRow } = await client
      .from("quotes")
      .select("id")
      .eq("invoice_id", invoiceId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (quoteRow) quoteId = (quoteRow as any).id;
  }

  let invoiceItems: PdfLineItem[] = [];
  if (quoteId) {
    try {
      const qData = await loadQuotePdfData(quoteId, tenantId, client);
      invoiceItems = qData.items;
    } catch (err) {
      log.warn("Could not load quote items for invoice PDF", { quoteId, error: String(err) });
    }
  }

  if (invoiceItems.length === 0 && quoteId) {
    try {
      const items = await db
        .select({
          product_name: quoteItems.productName,
          material_name: quoteItems.materialName,
          finish_name: quoteItems.finishName,
          dimension_value: quoteItems.dimensionValue,
          qty: quoteItems.qty,
          unit_price: quoteItems.unitPrice,
          line_total: quoteItems.lineTotal,
        })
        .from(quoteItems)
        .where(and(eq(quoteItems.quoteId, quoteId), eq(quoteItems.tenantId, tenantId)));

      for (const item of items) {
        invoiceItems.push({
          name: item.product_name,
          details: [item.material_name, item.finish_name].filter(Boolean).join(" - ") || null,
          dimensions: item.dimension_value ? String(item.dimension_value) : null,
          qty: Number(item.qty ?? 1),
          unit_price: round2(Number(item.unit_price ?? 0)),
          line_total: round2(Number(item.line_total ?? 0)),
        });
      }
    } catch {
      if (client?.from) {
        const { data: items } = await client
          .from("quote_items")
          .select("product_name, material_name, finish_name, dimension_value, qty, unit_price, line_total")
          .eq("quote_id", quoteId);

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
    }
  }

  return {
    id: invRow.id,
    invoice_number: invRow.invoice_number,
    total: Number(invRow.total ?? 0),
    deposit_amount: Number(invRow.deposit_amount ?? 0),
    paid_amount: Number(invRow.paid_amount ?? 0),
    paid_at: invRow.paid_at ? new Date(invRow.paid_at).toISOString() : null,
    issued_at: invRow.issued_at ? new Date(invRow.issued_at).toISOString() : new Date().toISOString(),
    customers: customer,
    items: invoiceItems,
    milestoneIndex: invRow.milestone_index ?? 1,
    milestoneTotalCount: invRow.milestone_total_count ?? 1,
    milestoneLabel: invRow.milestone_label ?? null,
    milestonePct: invRow.milestone_pct ? Number(invRow.milestone_pct) : null,
    billingStatus: invRow.billing_status ?? "issued",
    dueStage: invRow.due_stage ?? null,
    orderNumber: orderNumber ?? null,
    quoteNumber: quoteNumber ?? null,
  };
}
