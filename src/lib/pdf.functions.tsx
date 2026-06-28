/**
 * PDF generation for quotes and invoices.
 *
 * Uses @react-pdf/renderer with Cairo font for RTL Arabic text.
 * Generates PDF server-side, stores in R2, returns a 30-minute
 * presigned GET URL so the download works regardless of whether
 * the bucket itself is publicly addressable.
 *
 * Font strategy: Cairo TTF inlined as base64 data URIs at module
 * init (`src/lib/fonts/cairo.b64.ts`). No network fetch at PDF
 * render time, so PDFs render reliably inside Cloudflare Workers
 * and in offline-ish environments where Google Fonts egress is blocked.
 * Regenerate with `node scripts/build-font-b64.mjs` after upgrading fonts.
 *
 * Key strategy: per AGENTS.md hard-rule-5, every R2 object key for
 * tenant-owned files starts with `<tenantId>/...`.
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

// Signed URLs expire after 30 minutes — matches the rest of the app:
// private-by-default attachments stay valid long enough to be opened
// or downloaded by an authenticated user.
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
// Styles
// ---------------------------------------------------------------------------
const DEFAULT_BRAND_COLOR = "#1a5276";
const GRAY = "#666";
const LIGHT_GRAY = "#999";
const BORDER = "#ddd";
const HEADER_BG = "#f0f4f8";

function createStyles(brandColor: string) {
  return StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Cairo",
    fontSize: 10,
  },
  // --- Header ---
  header: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: brandColor,
    paddingBottom: 15,
  },
  headerRight: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  logo: {
    width: 50,
    height: 50,
    objectFit: "contain",
  },
  companyName: {
    fontSize: 18,
    fontWeight: 700,
    color: brandColor,
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
    color: brandColor,
  },
  subtitle: {
    fontSize: 9,
    color: GRAY,
    marginTop: 2,
  },
  badge: {
    backgroundColor: brandColor,
    color: "#fff",
    fontSize: 8,
    padding: "3px 8px",
    borderRadius: 3,
    marginTop: 4,
    alignSelf: "flex-end",
  },
  // --- Sections ---
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: brandColor,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingBottom: 4,
  },
  row: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  label: {
    color: GRAY,
    fontSize: 9,
  },
  value: {
    fontWeight: 600,
    fontSize: 9,
  },
  // --- Table ---
  table: {
    marginBottom: 15,
  },
  tableHeader: {
    flexDirection: "row-reverse",
    backgroundColor: HEADER_BG,
    padding: 6,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableHeaderText: {
    fontSize: 8,
    fontWeight: 700,
    color: "#333",
    textAlign: "center",
    flex: 1,
  },
  tableRow: {
    flexDirection: "row-reverse",
    padding: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  tableCell: {
    fontSize: 8,
    textAlign: "center",
    flex: 1,
  },
  // --- Totals ---
  totalsSection: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 10,
  },
  totalRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  totalLabel: {
    fontSize: 10,
    color: GRAY,
  },
  totalValue: {
    fontSize: 10,
    fontWeight: 600,
  },
  grandTotalRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 2,
    borderTopColor: brandColor,
  },
  grandTotalLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: brandColor,
  },
  grandTotalValue: {
    fontSize: 12,
    fontWeight: 700,
    color: brandColor,
  },
  // --- Footer ---
  footer: {
    marginTop: 20,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: "#ccc",
    textAlign: "center",
    fontSize: 7,
    color: LIGHT_GRAY,
  },
  notesBox: {
    backgroundColor: "#fafafa",
    padding: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(dateStr: string): string {
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
    rejected: "مرفوض",
    expired: "منتهي",
    paid: "مدفوعة",
    unpaid: "بانتظار السداد",
  };
  return map[status] ?? status;
}

// ---------------------------------------------------------------------------
// Tenant info (fetched once per PDF generation)
// ---------------------------------------------------------------------------
interface TenantInfo {
  name: string;
  logoUrl: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxNumber: string | null;
  commercialRegistry: string | null;
  primaryColor: string | null;
}

async function fetchTenantInfo(tenantId: string): Promise<TenantInfo> {
  const { data: tenant } = await supabaseAdmin
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

// ---------------------------------------------------------------------------
// Logo fetching — convert R2 URL to base64 data URI for react-pdf Image
// ---------------------------------------------------------------------------
async function fetchLogoAsDataUri(logoUrl: string): Promise<string | null> {
  try {
    // SSRF guard: only allow HTTPS URLs from trusted domains
    let parsed: URL;
    try {
      parsed = new URL(logoUrl);
    } catch {
      log.warn("Invalid logo URL", { url: logoUrl });
      return null;
    }
    if (parsed.protocol !== "https:") {
      log.warn("Rejected non-HTTPS logo URL", { url: logoUrl });
      return null;
    }
    const hostname = parsed.hostname;
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.startsWith("169.254.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.") ||
      hostname.startsWith("192.168.")
    ) {
      log.warn("Rejected private IP logo URL", { url: logoUrl });
      return null;
    }

    const resp = await fetch(parsed.href);
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") || "image/png";
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
interface QuoteData {
  id: string;
  quote_number: string;
  status: string;
  subtotal: number;
  discount_amount: number;
  discount_code: string | null;
  vat_amount: number;
  total: number;
  deposit_pct: number;
  valid_until: string;
  notes: string | null;
  snapshot: Record<string, unknown>;
  customers: { name: string; phone: string | null; email: string | null } | null;
  quote_items: Array<{
    product_name: string;
    material_name: string | null;
    finish_name: string | null;
    dimension_value: number;
    qty: number;
    unit_price: number;
    line_total: number;
    accessories: unknown;
  }>;
}

interface InvoiceData {
  id: string;
  invoice_number: string;
  total: number;
  deposit_amount: number;
  paid_amount: number;
  paid_at: string | null;
  issued_at: string;
  customers: { name: string; phone: string | null; email: string | null } | null;
  quote_items: Array<{
    product_name: string;
    material_name: string | null;
    finish_name: string | null;
    dimension_value: number;
    qty: number;
    unit_price: number;
    line_total: number;
    accessories: unknown;
  }>;
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

function QuotePdf({
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
    <Document language="ar">
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
            <Text style={[styles.tableHeaderText, { flex: 2 }]}>المنتج</Text>
            <Text style={styles.tableHeaderText}>الخامة</Text>
            <Text style={styles.tableHeaderText}>المقاس</Text>
            <Text style={styles.tableHeaderText}>الكمية</Text>
            <Text style={styles.tableHeaderText}>سعر الوحدة</Text>
            <Text style={styles.tableHeaderText}>الإجمالي</Text>
          </View>
          {data.quote_items.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 2 }]}>
                {item.product_name}
              </Text>
              <Text style={styles.tableCell}>{item.material_name ?? "—"}</Text>
              <Text style={styles.tableCell}>
                {String(item.dimension_value)}
              </Text>
              <Text style={styles.tableCell}>{String(item.qty)}</Text>
              <Text style={styles.tableCell}>
                {formatEGP(item.unit_price)}
              </Text>
              <Text style={styles.tableCell}>
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
                خصم ({data.discount_code})
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
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              عربون مقترح ({data.deposit_pct}%):{" "}
              {formatEGP((data.total * data.deposit_pct) / 100)}
            </Text>
          </View>
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

function InvoicePdf({
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
    <Document language="ar">
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
            <Text style={[styles.tableHeaderText, { flex: 2 }]}>المنتج</Text>
            <Text style={styles.tableHeaderText}>الخامة</Text>
            <Text style={styles.tableHeaderText}>المقاس</Text>
            <Text style={styles.tableHeaderText}>الكمية</Text>
            <Text style={styles.tableHeaderText}>سعر الوحدة</Text>
            <Text style={styles.tableHeaderText}>الإجمالي</Text>
          </View>
          {data.quote_items.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 2 }]}>
                {item.product_name}
              </Text>
              <Text style={styles.tableCell}>{item.material_name ?? "—"}</Text>
              <Text style={styles.tableCell}>
                {String(item.dimension_value)}
              </Text>
              <Text style={styles.tableCell}>{String(item.qty)}</Text>
              <Text style={styles.tableCell}>
                {formatEGP(item.unit_price)}
              </Text>
              <Text style={styles.tableCell}>
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
              {formatEGP(data.total - data.paid_amount)}
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
    const start = Date.now();

    // Fetch tenant info (name, logo, tax details)
    const tenantInfo = await fetchTenantInfo(ctx.tenantId);

    // Fetch logo if available
    let logoDataUri: string | null = null;
    if (tenantInfo.logoUrl) {
      logoDataUri = await fetchLogoAsDataUri(tenantInfo.logoUrl);
    }

    if (data.entityType === "quote") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: quote, error } = await supabaseAdmin
        .from("quotes")
        .select(
          `
          id, quote_number, status, subtotal, discount_amount, discount_code,
          vat_amount, total, deposit_pct, valid_until, notes, snapshot, tenant_id,
          customers(name, phone, email),
          quote_items(product_name, material_name, finish_name, dimension_value, qty, unit_price, line_total, accessories)
        `,
        )
        .eq("id", data.entityId)
        .single();

      if (error || !quote || (quote as any).tenant_id !== ctx.tenantId) {
        throw new Error("Quote not found or access denied");
      }

      // PostgREST .single() may denormalize a 1-row to-many join to a plain object.
      const quoteData = quote as unknown as QuoteData;
      if (quoteData.quote_items && !Array.isArray(quoteData.quote_items)) {
        (quoteData as any).quote_items = [quoteData.quote_items];
      }

      // ── Snapshot-based pricing for sent/accepted quotes ───────────────
      // On transition to sent/accepted, writeSnapshot freezes the full
      // tree + breakdown. The PDF must render from that snapshot so that
      // catalog price changes afterward never alter the sent quote.
      let isDraft = quoteData.status === "draft";
      let snapshotBreakdown: Record<string, any> | null = null;

      if (!isDraft) {
        // Fetch latest snapshot for this quote + state
        const { data: snapRow } = await supabaseAdmin
          .from("quote_snapshots")
          .select("breakdown_json, tree_json")
          .eq("quotation_id", data.entityId)
          .eq("tenant_id", ctx.tenantId)
          .eq("state", quoteData.status)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (snapRow?.breakdown_json) {
          snapshotBreakdown = snapRow.breakdown_json as Record<string, any>;
          // Override quote totals with frozen snapshot values
          quoteData.subtotal = snapshotBreakdown.subTotal ?? quoteData.subtotal;
          quoteData.discount_amount = snapshotBreakdown.discount ?? quoteData.discount_amount;
          quoteData.vat_amount = snapshotBreakdown.vatAmount ?? quoteData.vat_amount;
          quoteData.total = snapshotBreakdown.total ?? quoteData.total;
        } else {
          // Missing snapshot for a non-draft quote — log but continue
          // with the stored quote totals (they were set at creation time).
          log.error("Missing snapshot for non-draft quote (using stored totals)", {
            quoteId: data.entityId,
            status: quoteData.status,
          });
        }
      }

      const quoteStyles = createStyles(tenantInfo.primaryColor || DEFAULT_BRAND_COLOR);
      const pdfBuffer = await renderToBuffer(
        <QuotePdf
          data={quoteData}
          tenant={tenantInfo}
          logoDataUri={logoDataUri}
          styles={quoteStyles}
          isDraft={isDraft}
        />,
      );

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inv, error } = await supabaseAdmin
      .from("invoices")
      .select(
        `
        id, invoice_number, total, deposit_amount, paid_amount, paid_at, issued_at, tenant_id,
        customers(name, phone, email)
      `,
      )
      .eq("id", data.entityId)
      .single();

    if (error || !inv || (inv as any).tenant_id !== ctx.tenantId) {
      throw new Error("Invoice not found or access denied");
    }

    // Get quote items via the invoice's quote
    const { data: quoteRow } = await supabaseAdmin
      .from("quotes")
      .select("id")
      .eq("invoice_id", data.entityId)
      .maybeSingle();

    let quoteItems: InvoiceData["quote_items"] = [];
    if (quoteRow) {
      const { data: items } = await supabaseAdmin
        .from("quote_items")
        .select(
          "product_name, material_name, finish_name, dimension_value, qty, unit_price, line_total, accessories",
        )
        .eq("quote_id", (quoteRow as { id: string }).id);
      quoteItems = (items ?? []) as InvoiceData["quote_items"];
    }

    const invoiceData: InvoiceData = {
      ...(inv as unknown as Omit<InvoiceData, "quote_items">),
      quote_items: quoteItems,
    };

    const invoiceStyles = createStyles(tenantInfo.primaryColor || DEFAULT_BRAND_COLOR);
    const pdfBuffer = await renderToBuffer(
      <InvoicePdf
        data={invoiceData}
        tenant={tenantInfo}
        logoDataUri={logoDataUri}
        styles={invoiceStyles}
      />,
    );

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
