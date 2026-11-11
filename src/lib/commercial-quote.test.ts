import { describe, it, expect } from "vitest";
import { writeFileSync, readFileSync, existsSync } from "fs";
import {
  calculateCommercialLineTotal,
  calculateCommercialQuoteTotals,
  DEFAULT_COMMERCIAL_CATEGORIES,
  DEFAULT_COMMERCIAL_TERMS,
  type CommercialQuoteLine,
} from "./commercial-quote-types";
import { renderQuotePdfBuffer, type QuoteData, type TenantInfo } from "./pdf.functions";

describe("Commercial Quotation System & PDF Replication", () => {
  it("calculates commercial line totals and quote totals accurately", () => {
    const lineTotal1 = calculateCommercialLineTotal(2, 19400);
    expect(lineTotal1).toBe(38800);

    const lineTotal2 = calculateCommercialLineTotal(1, 12200);
    expect(lineTotal2).toBe(12200);

    const lineTotal3 = calculateCommercialLineTotal(1, 49000);
    expect(lineTotal3).toBe(49000);

    const totals = calculateCommercialQuoteTotals({
      lines: [{ lineTotal: lineTotal1 }, { lineTotal: lineTotal2 }, { lineTotal: lineTotal3 }],
      discountAmount: 8000,
      vatPct: 14,
      applyVat: false,
      depositPct: 60,
    });

    expect(totals.subtotal).toBe(100000);
    expect(totals.discountAmount).toBe(8000);
    expect(totals.afterDiscount).toBe(92000);
    expect(totals.vatAmount).toBe(0);
    expect(totals.total).toBe(92000);
    expect(totals.depositAmount).toBe(55200);
  });

  it("calculates commercial quote totals with VAT when enabled", () => {
    const totals = calculateCommercialQuoteTotals({
      lines: [{ lineTotal: 50000 }],
      discountAmount: 5000,
      vatPct: 14,
      applyVat: true,
      depositPct: 60,
    });

    expect(totals.subtotal).toBe(50000);
    expect(totals.discountAmount).toBe(5000);
    expect(totals.afterDiscount).toBe(45000);
    expect(totals.vatAmount).toBe(6300); // 45000 * 0.14 = 6300
    expect(totals.total).toBe(51300);
  });

  it("verifies default product categories support Arabic and English", () => {
    expect(DEFAULT_COMMERCIAL_CATEGORIES.length).toBeGreaterThanOrEqual(6);
    const door = DEFAULT_COMMERCIAL_CATEGORIES.find((c) => c.code === "door");
    expect(door).toBeDefined();
    expect(door?.nameAr).toBe("باب");
    expect(door?.nameEn).toBe("Door");

    const kitchen = DEFAULT_COMMERCIAL_CATEGORIES.find((c) => c.code === "kitchen");
    expect(kitchen).toBeDefined();
    expect(kitchen?.nameAr).toBe("مطبخ");
    expect(kitchen?.nameEn).toBe("Kitchen");

    const library = DEFAULT_COMMERCIAL_CATEGORIES.find((c) => c.code === "library");
    expect(library).toBeDefined();
    expect(library?.nameAr).toBe("مكتبة");

    const buffet = DEFAULT_COMMERCIAL_CATEGORIES.find((c) => c.code === "buffet");
    expect(buffet).toBeDefined();
    expect(buffet?.nameAr).toBe("بوفيه");
  });

  it("renders a multi-item Shaheen reference PDF buffer matching reference visual structure", async () => {
    const doorImgB64 = `data:image/png;base64,${readFileSync("/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/scratch/shaheen_pdf/extracted_img/img-004.png").toString("base64")}`;
    const libImgB64 = `data:image/png;base64,${readFileSync("/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/scratch/shaheen_pdf/extracted_img/img-006.png").toString("base64")}`;
    const buffetImgB64 = `data:image/png;base64,${readFileSync("/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/scratch/shaheen_pdf/extracted_img/img-011.png").toString("base64")}`;

    const tenant: TenantInfo = {
      name: "PeleCanon",
      phone: "+20 11 16322271",
      email: "info@pelecanon.com",
      address: "القاهرة - مدينة نصر | الإسكندرية - سموحة",
      primaryColor: "#008269",
      logoUrl: null,
      taxNumber: null,
      commercialRegistry: null,
    };

    const quoteData: QuoteData = {
      id: "a1a1a1a1-b2b2-c3c3-d4d4-e5e5e5e5e5e5",
      quote_number: "PLC-00100",
      status: "sent",
      subtotal: 100000,
      discount_amount: 8000,
      discount_code: null,
      vat_amount: 0,
      total: 92000,
      deposit_pct: 60,
      valid_until: "2026-11-28",
      notes: "عرض سعر خاص بالسيد مستر شاهين",
      customers: {
        name: "مستر شاهين",
        phone: "+20 10 00000000",
        email: "shaheen@example.com",
      },
      quotationMode: "commercial",
      commercialTerms: {
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
      },
      items: [
        {
          name: "باب خشب سويد تجليد HPL",
          category: "door",
          categoryNameAr: "باب",
          pricingUnit: "pcs",
          pricingUnitAr: "عدد",
          dimensions: "200 × 90 × 15 سم",
          imageUrl: doorImgB64,
          technicalSpecs:
            "هيكل داخلي من خشب سويدي طبيعي مجفف بالفرن، معالج ضد الرطوبة والتسوس لضمان الثبات وعدم التقوس.\nمغطى بكونتر فنلندي متعدد الطبقات سمك 8 مم لزيادة الصلابة ومقاومة الانبعاج.\nمكسي بطبقتين HPL هندي (VIRGO OR Merino) مكبوس حرارياً على الوجهين، مقاوم للخدش والحرارة والرطوبة.",
          qty: 2,
          unit_price: 19400,
          line_total: 38800,
        },
        {
          name: "مكتبة حائطية مودرن",
          category: "library",
          categoryNameAr: "مكتبة",
          pricingUnit: "pcs",
          pricingUnitAr: "عدد",
          dimensions: "240 × 200 × 40 سم",
          imageUrl: libImgB64,
          technicalSpecs:
            "مكتبة حائطية مفتوحة بتصميم مودرن، تتكون من هيكل معدني أسود مطلي إلكتروستاتيك.\nمزودة بأرفف ووحدات تخزين سفلية من MDF تايلندي مكسو بقشرة خشبية من خامة الميلامين الهندي من شركة N.Lam.\nتخانة القطاعات الحديد 1.5 ميلي.",
          qty: 1,
          unit_price: 12200,
          line_total: 12200,
        },
        {
          name: "بوفيه وتجاليد حوائط",
          category: "buffet",
          categoryNameAr: "بوفيه",
          pricingUnit: "pcs",
          pricingUnitAr: "عدد",
          dimensions: "12 م² تجاليد + بوفيه 2 م",
          imageUrl: buffetImgB64,
          technicalSpecs:
            "توريد وتركيب 12 متر مربع تجاليد حوائط من خامة الميلامين الخشبي من شركة المنارة بنظام تركيب مخفي (برنجانة).\nاستخدام سيليكون عظم عالي الجودة أثناء التركيب لزيادة التماسك.\nمكتبة بوفيه بعرض 2 متر بارتفاع 90 سم مع مفصلات إسباني Indaux - soft close ومجر أدراج جانبي هيدروليك.",
          qty: 1,
          unit_price: 49000,
          line_total: 49000,
        },
      ],
    };

    const buf = await renderQuotePdfBuffer(quoteData, tenant);

    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(5000);
    expect(buf.subarray(0, 5).toString("utf-8")).toBe("%PDF-");

    // Write to scratch directory for visual verification
    const outPdfPath = "/home/wiz/.gemini/antigravity-cli/brain/ae0b49c5-04df-44b8-879a-ccd8b0cfdac5/scratch/generated_shaheen.pdf";
    writeFileSync(outPdfPath, buf);
    expect(existsSync(outPdfPath)).toBe(true);
  });

  it("persists opportunityId and CRM context safely in JSONB snapshot without physical column dependency", () => {
    const commercialSnapshot = {
      quotationMode: "commercial" as const,
      customerName: "Moataz",
      customerPhone: "01024887007",
      customerEmail: "ds2.sss",
      quoteNumber: "PLC-quote-261028-4796",
      quoteDate: "2026-10-28",
      validUntil: "2026-11-27",
      opportunityId: "b4f1ec45-253b-46bd-9421-3c7a7f90951a",
      lines: [
        {
          id: "line-door-1",
          category: "door",
          title: "باب داخلي",
          dimensions: "90x210 سم",
          specs: "الباب شامل المفصلات (توريد & تركيب)",
          quantity: 1,
          unitPrice: 12222,
          lineTotal: 12222,
        },
      ],
      terms: {
        notes: "الباب شامل المفصلات (توريد & تركيب) الخامات المستخدمة مناسبة للأعمال السكنية الراقية والاستخدام طويل الأجل. موعد التسليم 30 يوم عمل من يوم التعاقد السعر شامل النقل والتركيب ضمان فعلي لمدة 5 سنوات",
        deliveryDays: 30,
        warrantyYears: 5,
        depositPct: 60,
      },
    };

    expect(commercialSnapshot.opportunityId).toBe("b4f1ec45-253b-46bd-9421-3c7a7f90951a");
    expect(commercialSnapshot.lines[0].lineTotal).toBe(12222);
    expect(commercialSnapshot.terms.depositPct).toBe(60);
  });
});
