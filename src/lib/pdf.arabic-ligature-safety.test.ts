import { describe, it, expect } from "vitest";
import { renderQuotePdfBuffer, type QuoteData, type TenantInfo } from "./pdf.functions";

describe("PDF Arabic Ligature & Bidi Layout Safety", () => {
  const tenantInfo: TenantInfo = {
    name: "PeleCanon",
    primaryColor: "#008269",
    commercialRegistry: "123456",
    taxNumber: "654321",
    phone: "01000000000",
    email: "info@pelecanon.com",
    address: "Cairo, Egypt",
    logoUrl: null,
  };

  const sampleQuoteWithLigaturesA: QuoteData = {
    id: "00000000-0000-0000-0000-000000000001",
    quote_number: "PLC-TEST-001",
    status: "draft",
    subtotal: 4500,
    discount_amount: 0,
    discount_code: null,
    vat_amount: 0,
    total: 4500,
    deposit_pct: 60,
    valid_until: "2026-12-31",
    notes: "ملاحظات معتمدة خاصة بالمعاينة والتسليم",
    customers: {
      name: "أحمد شاهين",
      email: "ahmed@example.com",
      phone: "01012345678",
    },
    items: [
      {
        name: "تسريحة كاملة بمراية",
        category: "custom",
        categoryNameAr: "غرف نوم",
        pricingUnit: "pcs",
        pricingUnitAr: "عدد",
        dimensions: "120 × 80 × 45 سم",
        imageUrl: null,
        technicalSpecs: "تسريحة خشب بمراية كبيرة و3 أدراج",
        qty: 1,
        unit_price: 4500,
        line_total: 4500,
      },
    ],
    quotationMode: "commercial",
    commercialTerms: {
      deliveryDays: 30,
      warrantyYears: 5,
      transportAndInstallIncluded: true,
      paymentSchedule: [
        { percent: 60, timing: "Advance", timingAr: "مقدم عند التعاقد" },
        { percent: 30, timing: "Middle", timingAr: "بعد التعاقد بـ 15 يوم" },
        { percent: 10, timing: "Final", timingAr: "عند الاستلام والتركيب" },
      ],
      notes: [
        "الباب شامل المفصلات (توريد & تركيب)",
        "الخامات المستخدمة مناسبة للأعمال السكنية الراقية والاستخدام طويل الأجل.",
        "موعد التسليم 30 يوم عمل من يوم التعاقد",
        "السعر شامل النقل والتركيب",
        "ضمان فعلي لمدة 5 سنوات",
      ],
    },
  };

  const sampleQuoteWithLigaturesB: QuoteData = {
    id: "00000000-0000-0000-0000-000000000002",
    quote_number: "PLC-TEST-002",
    status: "sent",
    subtotal: 5000,
    discount_amount: 0,
    discount_code: null,
    vat_amount: 0,
    total: 5000,
    deposit_pct: 60,
    valid_until: "2026-12-31",
    notes: "عرض سعر تجاري معتمد",
    customers: {
      name: "معتز سليمان",
      email: "moataz@example.com",
      phone: "01024887007",
    },
    items: [
      {
        name: "دولاب مكتبي",
        category: "custom",
        categoryNameAr: "أثاث مكتبي",
        pricingUnit: "m2",
        pricingUnitAr: "متر مربع",
        dimensions: "متر",
        imageUrl: null,
        technicalSpecs: "دولاب حفظ ملفات مكتبي ببابين زجاج",
        qty: 1,
        unit_price: 5000,
        line_total: 5000,
      },
    ],
    quotationMode: "commercial",
  };

  it("renders quote A without textkit undefined 'id' crash", async () => {
    const buf = await renderQuotePdfBuffer(sampleQuoteWithLigaturesA, tenantInfo);
    expect(buf.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });

  it("renders quote B sequentially without textkit undefined 'id' crash", async () => {
    const buf = await renderQuotePdfBuffer(sampleQuoteWithLigaturesB, tenantInfo);
    expect(buf.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });

  it("renders multiple consecutive Arabic quotes with text wrap and ligatures safely", async () => {
    for (let i = 0; i < 5; i++) {
      const q = i % 2 === 0 ? sampleQuoteWithLigaturesA : sampleQuoteWithLigaturesB;
      const buf = await renderQuotePdfBuffer(q, tenantInfo);
      expect(buf.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
    }
  });
});
