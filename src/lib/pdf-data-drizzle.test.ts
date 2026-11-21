import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/db/client.server";
import { quotes, invoices } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  loadQuotePdfData,
  loadInvoicePdfData,
  fetchTenantInfo,
} from "./pdf-data.server";

describe("PDF Data Loading via Direct Drizzle PostgreSQL (Zero Supabase Leaks)", () => {
  const TENANT_A = "2bf7cd99-d567-42d3-b5fc-22cc40654293";
  const TENANT_B = "00000000-0000-0000-0000-000000000003";
  const CUSTOMER_ID = "33333333-3333-3333-3333-333333333331";

  const testQuoteId = "ffffffff-1111-2222-3333-444444444444";
  const testInvoiceId = "ffffffff-5555-6666-7777-888888888888";

  afterAll(async () => {
    // Self-cleaning test data
    try {
      await db.delete(invoices).where(eq(invoices.id, testInvoiceId));
      await db.delete(quotes).where(eq(quotes.id, testQuoteId));
    } catch {}
  });

  it("1. Loads a quote created via Drizzle through loadQuotePdfData without remote PostgREST", async () => {
    // Clean up any stale records first
    await db.delete(invoices).where(eq(invoices.id, testInvoiceId));
    await db.delete(quotes).where(eq(quotes.id, testQuoteId));

    // Insert quote via Drizzle
    await db.insert(quotes).values({
      id: testQuoteId,
      quoteNumber: "PLC-TEST-PDF-01",
      customerId: CUSTOMER_ID,
      status: "draft",
      subtotal: "15000.00",
      discountAmount: "500.00",
      vatPct: "14.00",
      vatAmount: "2030.00",
      total: "16530.00",
      depositPct: "50.00",
      validUntil: "2026-12-31",
      notes: "Test quotation for Drizzle PDF data loading",
      snapshot: {
        quotationMode: "commercial",
        lines: [
          {
            name: "مطبخ خشبي كلاسيكي",
            category: "kitchen",
            categoryNameAr: "مطابخ",
            pricingUnit: "meter",
            pricingUnitAr: "متر طولي",
            quantity: 3,
            unitPrice: 5000,
            lineTotal: 15000,
            dimensions: { width: 3000, height: 2200, depth: 600, unit: "مم" },
            technicalSpecs: "خشب زان طبيعي مع مفصلات بلوم نمساوي",
          },
        ],
      },
      tenantId: TENANT_A,
    } as any);

    const quoteData = await loadQuotePdfData(testQuoteId, TENANT_A);

    expect(quoteData).toBeDefined();
    expect(quoteData.id).toBe(testQuoteId);
    expect(quoteData.quote_number).toBe("PLC-TEST-PDF-01");
    expect(quoteData.status).toBe("draft");
    expect(quoteData.total).toBe(16530);
    expect(quoteData.customers?.name).toBe("م. شريف المنشاوي");
    expect(quoteData.items).toHaveLength(1);
    expect(quoteData.items[0].name).toBe("مطبخ خشبي كلاسيكي");
    expect(quoteData.items[0].qty).toBe(3);
    expect(quoteData.items[0].unit_price).toBe(5000);
    expect(quoteData.items[0].line_total).toBe(15000);
    expect(quoteData.items[0].technicalSpecs).toBe("خشب زان طبيعي مع مفصلات بلوم نمساوي");
  });

  it("2. Cross-tenant access with a different tenantId strictly throws 'Quote not found or access denied'", async () => {
    await expect(loadQuotePdfData(testQuoteId, TENANT_B)).rejects.toThrow(
      "Quote not found or access denied",
    );
  });

  it("3. Loads an invoice created via Drizzle through loadInvoicePdfData and enforces tenant isolation", async () => {
    // Insert invoice linked to test quote
    await db.insert(invoices).values({
      id: testInvoiceId,
      invoiceNumber: "INV-TEST-PDF-01",
      quoteId: testQuoteId,
      customerId: CUSTOMER_ID,
      total: "16530.00",
      depositAmount: "8265.00",
      paidAmount: "8265.00",
      paidAt: new Date(),
      issuedAt: new Date(),
      milestoneIndex: 1,
      milestoneTotalCount: 2,
      milestoneLabel: "دفعة مقدمة 50%",
      milestonePct: "50.00",
      billingStatus: "issued",
      tenantId: TENANT_A,
    } as any);

    const invoiceData = await loadInvoicePdfData(testInvoiceId, TENANT_A);

    expect(invoiceData).toBeDefined();
    expect(invoiceData.id).toBe(testInvoiceId);
    expect(invoiceData.invoice_number).toBe("INV-TEST-PDF-01");
    expect(invoiceData.total).toBe(16530);
    expect(invoiceData.deposit_amount).toBe(8265);
    expect(invoiceData.paid_amount).toBe(8265);
    expect(invoiceData.customers?.name).toBe("م. شريف المنشاوي");
    expect(invoiceData.milestoneIndex).toBe(1);
    expect(invoiceData.milestoneTotalCount).toBe(2);
    expect(invoiceData.billingStatus).toBe("issued");
    expect(invoiceData.items).toHaveLength(1);
    expect(invoiceData.items[0].name).toBe("مطبخ خشبي كلاسيكي");

    // Cross-tenant invoice access must reject
    await expect(loadInvoicePdfData(testInvoiceId, TENANT_B)).rejects.toThrow(
      "Invoice not found or access denied",
    );
  });

  it("4. fetchTenantInfo resolves tenant details directly via Drizzle", async () => {
    const tenantInfo = await fetchTenantInfo(TENANT_A);

    expect(tenantInfo).toBeDefined();
    expect(tenantInfo.name).toBe("PeleCanon");
    expect(tenantInfo.currency).toBe("EGP");
    expect(tenantInfo.taxRate).toBe("14");
  });
});
