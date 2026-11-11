import { z } from "zod";

export type CommercialDimensionUnit = "mm" | "cm" | "m";
export type CommercialPricingUnit = "pcs" | "m" | "m2" | "set" | "pair" | "lot";

export interface CommercialProductCategory {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  defaultDimensionUnit: CommercialDimensionUnit;
  defaultPricingUnit: CommercialPricingUnit;
  defaultSpecsTemplateAr?: string;
  active?: boolean;
}

export const DEFAULT_COMMERCIAL_CATEGORIES: CommercialProductCategory[] = [
  {
    id: "kitchen",
    code: "kitchen",
    nameAr: "مطبخ",
    nameEn: "Kitchen",
    defaultDimensionUnit: "m",
    defaultPricingUnit: "set",
    defaultSpecsTemplateAr:
      "• شاسيه وحدات سفلية وعلوية من خشب كونتر جودوود معالج ضد الرطوبة.\n• دلف وخوارج HPL / بولي لاك مقاوم للماء والحرارة مع إكسسوارات ومفصلات سوفت كلوز.\n• مقابض بلت إن بتصميم مخفي مودرن ومجر أدراج هيدروليك.",
    active: true,
  },
  {
    id: "dressing",
    code: "dressing",
    nameAr: "دريسنج",
    nameEn: "Dressing",
    defaultDimensionUnit: "m",
    defaultPricingUnit: "m",
    defaultSpecsTemplateAr:
      "• دريسنج روم مفتوح أو مغلق حسب المقاس والمساحة المتاحة.\n• تقسيمات أرفف، شماعات ملابس هيدروليك، وأدراج إكسسوارات مقسمة.\n• إضاءة LED بروفايل مدمجة بمستشعر حركة.",
    active: true,
  },
  {
    id: "door",
    code: "door",
    nameAr: "باب",
    nameEn: "Door",
    defaultDimensionUnit: "mm",
    defaultPricingUnit: "pcs",
    defaultSpecsTemplateAr:
      "• هيكل داخلي من خشب سويدي طبيعي مجفف بالفرن، معالج ضد الرطوبة والتسوس.\n• مغطى بكونتر فنلندي متعدد الطبقات سمك 8 مم لزيادة الصلابة.\n• مكسي بطبقتين HPL هندي عالي الجودة ومقاوم للخدش والحرارة.\n• سمك الباب 5 سم بعد التجليد والقشاط الزان الروماني.",
    active: true,
  },
  {
    id: "library",
    code: "library",
    nameAr: "مكتبة",
    nameEn: "Library / Shelving",
    defaultDimensionUnit: "cm",
    defaultPricingUnit: "pcs",
    defaultSpecsTemplateAr:
      "• مكتبة حائطية مفتوحة بتصميم مودرن بهيكل معدني أسود مطلي إلكتروستاتيك تخانة 1.5 مم.\n• أرفف ووحدات تخزين سفلية من MDF تايلندي مكسو بميلامين هندي عالي الجودة.\n• تشطيب نهائي مقاوم للخدش والرطوبة وتثبيت ميكانيكي محكم بين الأرضية والسقف.",
    active: true,
  },
  {
    id: "buffet",
    code: "buffet",
    nameAr: "بوفيه",
    nameEn: "Buffet / Console",
    defaultDimensionUnit: "cm",
    defaultPricingUnit: "pcs",
    defaultSpecsTemplateAr:
      "• مكتبة بوفيه بعرض 2 متر وارتفاع 90 سم بتصميم راقي.\n• مفصلات إسباني Indaux مع ميزة الإغلاق السلس (soft close).\n• مجر أدراج جانبي هيدروليك عالي التحمل.",
    active: true,
  },
  {
    id: "cladding",
    code: "cladding",
    nameAr: "تجاليد حوائط",
    nameEn: "Wall Cladding",
    defaultDimensionUnit: "cm",
    defaultPricingUnit: "m2",
    defaultSpecsTemplateAr:
      "• تجاليد حوائط خشبية من خامة الميلامين عالي الجودة.\n• يتم التثبيت بنظام مخفي (برنجانة) لضمان استقامة السطح وسهولة الفك والصيانة.\n• استخدام سيليكون عظم عالي الجودة أثناء التركيب لزيادة التماسك.",
    active: true,
  },
  {
    id: "tv_unit",
    code: "tv_unit",
    nameAr: "وحدة تلفزيون",
    nameEn: "TV Unit",
    defaultDimensionUnit: "cm",
    defaultPricingUnit: "pcs",
    defaultSpecsTemplateAr:
      "• وحدة شاشة معلقة بتصميم حديث مع رفوف عائمة وخلفية بديل خشب / رخام.\n• فتحات ومسارات مخفية لكابلات التلفزيون والأجهزة الإلكترونية.",
    active: true,
  },
  {
    id: "custom",
    code: "custom",
    nameAr: "مخصص",
    nameEn: "Custom Furniture",
    defaultDimensionUnit: "mm",
    defaultPricingUnit: "pcs",
    defaultSpecsTemplateAr:
      "• تصنيع وتوريد حسب الرسومات التنفيذية المعتمدة والمواصفات الفنية المتفق عليها.",
    active: true,
  },
];

export const COMMERCIAL_PRICING_UNITS: Array<{
  code: CommercialPricingUnit;
  labelAr: string;
  labelEn: string;
}> = [
  { code: "pcs", labelAr: "عدد", labelEn: "Pieces" },
  { code: "m", labelAr: "متر طولي", labelEn: "Linear Meter" },
  { code: "m2", labelAr: "متر مربع", labelEn: "Square Meter" },
  { code: "set", labelAr: "طقم", labelEn: "Set" },
  { code: "pair", labelAr: "زوج", labelEn: "Pair" },
  { code: "lot", labelAr: "مقطوعية", labelEn: "Lot" },
];

export const COMMERCIAL_DIMENSION_UNITS: Array<{
  code: CommercialDimensionUnit;
  labelAr: string;
  labelEn: string;
}> = [
  { code: "mm", labelAr: "مم", labelEn: "mm" },
  { code: "cm", labelAr: "سم", labelEn: "cm" },
  { code: "m", labelAr: "متر", labelEn: "m" },
];

export interface CommercialQuoteLine {
  id: string;
  productId?: string | null;
  productCode?: string | null;
  isCustom?: boolean;
  category: string;
  categoryNameAr: string;
  categoryNameEn: string;
  name: string;
  description?: string;
  quantity: number;
  dimensions?: {
    width?: number;
    height?: number;
    depth?: number;
    unit: CommercialDimensionUnit;
  };
  pricingUnit: CommercialPricingUnit;
  pricingUnitAr: string;
  pricingUnitEn: string;
  imageUrl?: string;
  imageStorageKey?: string;
  technicalSpecs: string;
  unitPrice: number;
  lineTotal: number;
  position?: number;
}

export interface CommercialPaymentMilestone {
  percent: number;
  timing: string;
  timingAr: string;
}

export const DEFAULT_PAYMENT_SCHEDULE: CommercialPaymentMilestone[] = [
  { percent: 60, timing: "Advance upon contract", timingAr: "مقدم عند التعاقد" },
  { percent: 30, timing: "15 days after contract", timingAr: "بعد التعاقد بـ 15 يوم" },
  { percent: 10, timing: "Upon delivery and installation", timingAr: "عند الاستلام والتركيب" },
];

export const DEFAULT_NOTES_AR: string[] = [
  "الباب شامل المفصلات (توريد & تركيب)",
  "الخامات المستخدمة مناسبة للأعمال السكنية الراقية والاستخدام طويل الأجل.",
  "موعد التسليم 30 يوم عمل من يوم التعاقد",
  "السعر شامل النقل والتركيب",
  "ضمان فعلي لمدة 5 سنوات",
];

export interface CommercialQuoteTerms {
  deliveryDays: number;
  warrantyYears: number;
  transportAndInstallIncluded: boolean;
  paymentSchedule: CommercialPaymentMilestone[];
  notes: string[];
  customNotes?: string;
}

export const DEFAULT_COMMERCIAL_TERMS: CommercialQuoteTerms = {
  deliveryDays: 30,
  warrantyYears: 5,
  transportAndInstallIncluded: true,
  paymentSchedule: DEFAULT_PAYMENT_SCHEDULE,
  notes: DEFAULT_NOTES_AR,
  customNotes: "",
};

export interface CommercialQuoteSnapshot {
  quotationMode: "commercial";
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  quoteNumber: string;
  quoteDate: string;
  validUntil?: string;
  lines: CommercialQuoteLine[];
  subtotal: number;
  discountAmount: number;
  discountCode?: string;
  vatPct: number;
  vatAmount: number;
  total: number;
  depositPct: number;
  depositAmount: number;
  terms: CommercialQuoteTerms;
  opportunityId?: string;
  trackingToken?: string;
  tracking_token?: string;
  version?: number;
  version_history?: any[];
  lifecycle?: {
    stage: string;
    approved_at?: string | null;
    approved_by?: string | null;
    confirmation_requested_at?: string | null;
    confirmation_status?: "pending" | "consented" | "declined" | null;
    consented_at?: string | null;
    declined_at?: string | null;
    pdf_sent_at?: string | null;
    decision?: "accepted" | "rejected" | "revision_requested" | null;
    decision_at?: string | null;
    decision_notes?: string | null;
    decision_channel?: string | null;
    version_history?: any[];
  };
  customer_consent?: {
    consented: boolean;
    consented_at?: string | null;
    declined_at?: string | null;
    notes?: string | null;
  };
}

// ── Validation Schemas ────────────────────────────────────────────────────────

export const CommercialDimensionsSchema = z.object({
  width: z.number().nonnegative().optional(),
  height: z.number().nonnegative().optional(),
  depth: z.number().nonnegative().optional(),
  unit: z.enum(["mm", "cm", "m"]).default("mm"),
});

export const CommercialQuoteLineSchema = z.object({
  id: z.string().min(1),
  productId: z.string().uuid().optional().nullable(),
  productCode: z.string().optional().nullable(),
  isCustom: z.boolean().optional(),
  category: z.string().min(1),
  categoryNameAr: z.string().min(1),
  categoryNameEn: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().default(""),
  quantity: z.number().positive(),
  dimensions: CommercialDimensionsSchema.optional(),
  pricingUnit: z.enum(["pcs", "m", "m2", "set", "pair", "lot"]).default("pcs"),
  pricingUnitAr: z.string().min(1),
  pricingUnitEn: z.string().min(1),
  imageUrl: z.string().optional().default(""),
  imageStorageKey: z.string().optional().default(""),
  technicalSpecs: z.string().default(""),
  unitPrice: z.number().nonnegative(),
  lineTotal: z.number().nonnegative(),
  position: z.number().optional().default(0),
});

export const CommercialPaymentMilestoneSchema = z.object({
  percent: z.number().min(0).max(100),
  timing: z.string().min(1),
  timingAr: z.string().min(1),
});

export const CommercialQuoteTermsSchema = z.object({
  deliveryDays: z.number().int().positive().default(30),
  warrantyYears: z.number().int().nonnegative().default(5),
  transportAndInstallIncluded: z.boolean().default(true),
  paymentSchedule: z.array(CommercialPaymentMilestoneSchema).default(DEFAULT_PAYMENT_SCHEDULE),
  notes: z.array(z.string()).default(DEFAULT_NOTES_AR),
  customNotes: z.string().optional().default(""),
});

export const SaveCommercialQuoteInput = z.object({
  quoteId: z.string().uuid().optional().nullable(),
  customer_id: z.string().uuid(),
  opportunity_id: z.string().uuid().optional().nullable(),
  quote_number: z.string().min(1),
  status: z.enum(["draft", "sent"]).default("draft"),
  lines: z.array(CommercialQuoteLineSchema).min(1),
  discount_amount: z.number().nonnegative().default(0),
  discount_code: z.string().optional().nullable(),
  vat_pct: z.number().nonnegative().default(14),
  apply_vat: z.boolean().default(false),
  valid_until: z.string().optional().nullable(),
  terms: CommercialQuoteTermsSchema.default(DEFAULT_COMMERCIAL_TERMS),
});

export type SaveCommercialQuoteInputType = z.infer<typeof SaveCommercialQuoteInput>;

// ── Calculation Helpers ───────────────────────────────────────────────────────

export function calculateCommercialLineTotal(qty: number, unitPrice: number): number {
  return Math.round(qty * unitPrice * 100) / 100;
}

export function calculateCommercialQuoteTotals(params: {
  lines: Array<{ lineTotal: number }>;
  discountAmount?: number;
  vatPct?: number;
  applyVat?: boolean;
  depositPct?: number;
}) {
  const subtotal = params.lines.reduce((s, l) => s + (Number(l.lineTotal) || 0), 0);
  const discountAmount = Math.min(subtotal, Math.max(0, Number(params.discountAmount) || 0));
  const afterDiscount = Math.max(0, subtotal - discountAmount);

  const vatPct = params.applyVat ? (Number(params.vatPct) || 14) : 0;
  const vatAmount = Math.round((afterDiscount * (vatPct / 100)) * 100) / 100;
  const total = Math.round((afterDiscount + vatAmount) * 100) / 100;

  const depositPct = Number(params.depositPct ?? 60);
  const depositAmount = Math.round((total * (depositPct / 100)) * 100) / 100;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discountAmount: Math.round(discountAmount * 100) / 100,
    afterDiscount: Math.round(afterDiscount * 100) / 100,
    vatPct,
    vatAmount,
    total,
    depositPct,
    depositAmount,
  };
}
