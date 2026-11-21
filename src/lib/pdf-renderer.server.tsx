/**
 * Dedicated server-only PDF rendering engine for PeleCanon quotations and invoices.
 *
 * Keeps @react-pdf/renderer, Cairo TTF base64 fonts, and React-PDF document JSX
 * completely out of client browser bundles.
 */
import {
  renderToBuffer,
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
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
import { formatEGP } from "@/lib/pricing";
import {
  fetchTenantInfo,
  fetchLogoAsDataUri,
  loadQuotePdfData,
} from "./pdf-data.server";
import type {
  TenantInfo,
  PdfLineItem,
  QuoteData,
  InvoiceData,
} from "./pdf.functions";

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
export const DEFAULT_BRAND_COLOR = "#064e3b";
export const GOLD_ACCENT = "#c9a84c";
export const GRAY = "#475569";
export const LIGHT_GRAY = "#94a3b8";
export const BORDER = "#e2e8f0";
export const HEADER_BG = "#f8fafc";
export const ROW_ALT_BG = "#fafaf9";

export function createStyles(brandColor: string) {
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
export function formatDate(dateStr: string | null | undefined): string {
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

export function statusLabel(status: string): string {
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

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ---------------------------------------------------------------------------
// PDF components
// ---------------------------------------------------------------------------
export function Header({
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
// Standard Commercial Quotation PDF
// ---------------------------------------------------------------------------
export const SHAHEEN_GREEN = "#008269";
export const SHAHEEN_GREEN_DARK = "#006d58";
export const SHAHEEN_BORDER = "#1e293b";

export const shaheenStyles = StyleSheet.create({
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

export function formatCategorySinglePrice(cat: string | null | undefined, name: string): string {
  const label = (cat || name || "الوحدة").trim();
  if (label.startsWith("ال")) return `سعر ${label} الواحد`;
  return `سعر ال${label} الواحد`;
}

export function CommercialQuotationPdf({
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
  const customerName = data.customers?.name || (data.snapshot as any)?.customerName || "";

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
            {customerName ? `إلى السيد : ${customerName}` : "إلى العميل المحترم"}
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

export const ShaheenQuotationPdf = CommercialQuotationPdf;

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
              color: "#e2e8f0",
              fontWeight: 700,
              transform: "rotate(-35deg)",
              opacity: 0.35,
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
          {data.valid_until ? (
            <View style={styles.row}>
              <Text style={styles.label}>صالح حتى:</Text>
              <Text style={styles.value}>{formatDate(data.valid_until)}</Text>
            </View>
          ) : null}
        </View>

        {/* Items table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 2 }]}>البند</Text>
            <Text style={[styles.tableHeaderText, { flex: 2 }]}>التفاصيل</Text>
            <Text style={styles.tableHeaderText}>الأبعاد</Text>
            <Text style={styles.tableHeaderText}>الكمية</Text>
            <Text style={styles.tableHeaderText}>سعر الوحدة</Text>
            <Text style={styles.tableHeaderText}>الإجمالي</Text>
          </View>

          {data.items.map((item, idx) => (
            <View
              key={idx}
              style={[
                styles.tableRow,
                idx % 2 === 1 ? { backgroundColor: ROW_ALT_BG } : {},
              ]}
              wrap={false}
            >
              <Text style={[styles.tableCell, { flex: 2, textAlign: "right", fontWeight: 600 }]}>
                {item.name}
              </Text>
              <Text style={[styles.tableCell, { flex: 2, textAlign: "right" }]}>
                {item.details ?? "—"}
              </Text>
              <Text style={styles.tableCell}>{item.dimensions ?? "—"}</Text>
              <Text style={styles.tableCell}>{item.qty}</Text>
              <Text style={styles.tableCell}>{formatEGP(item.unit_price)}</Text>
              <Text style={[styles.tableCell, { fontWeight: 600 }]}>
                {formatEGP(item.line_total)}
              </Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsSection} wrap={false}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>المجموع الفرعي:</Text>
            <Text style={styles.totalValue}>{formatEGP(data.subtotal)}</Text>
          </View>

          {Number(data.discount_amount) > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                الخصم {data.discount_code ? `(${data.discount_code})` : ""}:
              </Text>
              <Text style={[styles.totalValue, { color: "#b91c1c" }]}>
                - {formatEGP(data.discount_amount)}
              </Text>
            </View>
          ) : null}

          {Number(data.vat_amount) > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>ضريبة القيمة المضافة (14%):</Text>
              <Text style={styles.totalValue}>{formatEGP(data.vat_amount)}</Text>
            </View>
          ) : null}

          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>الإجمالي النهائي:</Text>
            <Text style={styles.grandTotalValue}>{formatEGP(data.total)}</Text>
          </View>

          {data.deposit_pct && data.deposit_pct > 0 ? (
            <View style={[styles.totalRow, { marginTop: 4 }]}>
              <Text style={styles.totalLabel}>
                الدفعة المقدمة ({data.deposit_pct}%):
              </Text>
              <Text style={styles.totalValue}>
                {formatEGP(Math.round((data.total * data.deposit_pct) / 100))}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Notes */}
        {data.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.label}>ملاحظات:</Text>
            <Text style={[styles.value, { marginTop: 2 }]}>{data.notes}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <Text style={styles.footer}>
          {tenant.name}
          {tenant.taxNumber ? ` — الرقم الضريبي: ${tenant.taxNumber}` : ""}
          {tenant.commercialRegistry ? ` — س.ت: ${tenant.commercialRegistry}` : ""}
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

        {/* Line items (from associated quote) */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 2 }]}>البند</Text>
            <Text style={[styles.tableHeaderText, { flex: 2 }]}>التفاصيل</Text>
            <Text style={styles.tableHeaderText}>الأبعاد</Text>
            <Text style={styles.tableHeaderText}>الكمية</Text>
            <Text style={styles.tableHeaderText}>سعر الوحدة</Text>
            <Text style={styles.tableHeaderText}>الإجمالي</Text>
          </View>

          {data.items.map((item, idx) => (
            <View
              key={idx}
              style={[
                styles.tableRow,
                idx % 2 === 1 ? { backgroundColor: ROW_ALT_BG } : {},
              ]}
              wrap={false}
            >
              <Text style={[styles.tableCell, { flex: 2, textAlign: "right", fontWeight: 600 }]}>
                {item.name}
              </Text>
              <Text style={[styles.tableCell, { flex: 2, textAlign: "right" }]}>
                {item.details ?? "—"}
              </Text>
              <Text style={styles.tableCell}>{item.dimensions ?? "—"}</Text>
              <Text style={styles.tableCell}>{item.qty}</Text>
              <Text style={styles.tableCell}>{formatEGP(item.unit_price)}</Text>
              <Text style={[styles.tableCell, { fontWeight: 600 }]}>
                {formatEGP(item.line_total)}
              </Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsSection} wrap={false}>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>إجمالي الفاتورة:</Text>
            <Text style={styles.grandTotalValue}>{formatEGP(data.total)}</Text>
          </View>
          {data.deposit_amount && data.deposit_amount > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>الدفعة المقدمة المطلوبة:</Text>
              <Text style={styles.totalValue}>{formatEGP(data.deposit_amount)}</Text>
            </View>
          ) : null}
          {data.paid_amount && data.paid_amount > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>المبلغ المدفوع:</Text>
              <Text style={[styles.totalValue, { color: DEFAULT_BRAND_COLOR }]}>
                {formatEGP(data.paid_amount)}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          {tenant.name}
          {tenant.taxNumber ? ` — الرقم الضريبي: ${tenant.taxNumber}` : ""}
          {tenant.commercialRegistry ? ` — س.ت: ${tenant.commercialRegistry}` : ""}
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
  client?: any,
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
