/**
 * PDF generation RPC entrypoints for quotes and invoices.
 *
 * Keeps @react-pdf/renderer, Cairo TTF base64 fonts, Drizzle DB queries,
 * and S3/R2 storage SDKs completely out of client browser bundles.
 * All heavy data loading is isolated in pdf-data.server.ts and rendering
 * in pdf-renderer.server.tsx.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import type { TenantContext } from "@/lib/tenant-context";

// ---------------------------------------------------------------------------
// Client-safe Data Types
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
  currency?: string | null;
  taxRate?: string | null;
}

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
  milestoneIndex?: number;
  milestoneTotalCount?: number;
  milestoneLabel?: string | null;
  milestonePct?: number | null;
  billingStatus?: string | null;
  dueStage?: string | null;
  orderNumber?: string | null;
  quoteNumber?: string | null;
}

// ---------------------------------------------------------------------------
// Server Functions (Thin client RPC stubs)
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
    const {
      fetchTenantInfo,
      fetchLogoAsDataUri,
      loadQuotePdfData,
      loadInvoicePdfData,
      savePdfToStorageAndPresign,
    } = await import("./pdf-data.server");
    const { renderQuotePdfBuffer, renderInvoicePdfBuffer } = await import("./pdf-renderer.server");

    // Fetch tenant info (name, logo, tax details) via Drizzle
    const tenantInfo = await fetchTenantInfo(ctx.tenantId);

    // Fetch logo data URI if available
    let logoDataUri: string | null = null;
    if (tenantInfo.logoUrl) {
      logoDataUri = await fetchLogoAsDataUri(tenantInfo.logoUrl);
    }

    if (data.entityType === "quote") {
      const quoteData = await loadQuotePdfData(data.entityId, ctx.tenantId);
      const pdfBuffer = await renderQuotePdfBuffer(quoteData, tenantInfo, logoDataUri);
      return await savePdfToStorageAndPresign(ctx.tenantId, "quotes", data.entityId, pdfBuffer);
    }

    // --- Invoice ---
    const invoiceData = await loadInvoicePdfData(data.entityId, ctx.tenantId);
    const pdfBuffer = await renderInvoicePdfBuffer(invoiceData, tenantInfo, logoDataUri);
    return await savePdfToStorageAndPresign(ctx.tenantId, "invoices", data.entityId, pdfBuffer);
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

    const { presignDownload, SIGNED_URL_TTL_SECONDS } = await import("./pdf-data.server");
    const downloadUrl = await presignDownload(data.key);
    return { downloadUrl, expiresIn: SIGNED_URL_TTL_SECONDS };
  });
