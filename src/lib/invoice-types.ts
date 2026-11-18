import { z } from "zod";

export const InvoiceStatusSchema = z.enum([
  "unpaid",
  "partially_paid",
  "paid",
  "overdue",
]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

export const BillingStatusSchema = z.enum([
  "scheduled",
  "issued",
  "void",
]);
export type BillingStatus = z.infer<typeof BillingStatusSchema>;

export const MilestonePresetSchema = z.enum([
  "100",
  "50_50",
  "60_30_10",
  "50_30_20",
]);
export type MilestonePreset = z.infer<typeof MilestonePresetSchema>;

export interface MilestonePresetItem {
  label: string;
  labelAr: string;
  pct: number;
  stage: string;
}

export const MILESTONE_CONFIGS: Record<MilestonePreset, MilestonePresetItem[]> = {
  "60_30_10": [
    { label: "Contract Deposit", labelAr: "عربون تعاقد وتوريد خامات", pct: 60, stage: "deposit" },
    { label: "Delivery & Assembly", labelAr: "بدء التجميع وتركيب الموقع", pct: 30, stage: "delivery" },
    { label: "Installation & Handover", labelAr: "تسليم نهائي واعتماد العميل", pct: 10, stage: "installation" },
  ],
  "50_50": [
    { label: "Contract Deposit", labelAr: "دفعة مقدمة واعتماد تشغيل", pct: 50, stage: "deposit" },
    { label: "Final Handover", labelAr: "عند التوريد والاستلام", pct: 50, stage: "handover" },
  ],
  "50_30_20": [
    { label: "Contract Deposit", labelAr: "دفعة مقدمة", pct: 50, stage: "deposit" },
    { label: "Manufacturing Completion", labelAr: "إتمام التصنيع والتوريد", pct: 30, stage: "qc" },
    { label: "Installation & Handover", labelAr: "استلام الموقع النهائي", pct: 20, stage: "handover" },
  ],
  "100": [
    { label: "Full Payment", labelAr: "دفعة كاملة عند التعاقد", pct: 100, stage: "deposit" },
  ],
};

export function computeMilestoneBreakdown(
  total: number,
  preset: MilestonePreset,
): Array<{
  index: number;
  totalCount: number;
  label: string;
  labelAr: string;
  pct: number;
  stage: string;
  amount: number;
  billingStatus: "issued" | "scheduled";
}> {
  const configs = MILESTONE_CONFIGS[preset] || MILESTONE_CONFIGS["100"];
  let sumAllocated = 0;
  return configs.map((c, idx) => {
    const isLast = idx === configs.length - 1;
    const amount = isLast
      ? Math.max(0, Math.round((total - sumAllocated) * 100) / 100)
      : Math.round(total * (c.pct / 100) * 100) / 100;
    sumAllocated += amount;
    return {
      index: idx + 1,
      totalCount: configs.length,
      label: c.label,
      labelAr: c.labelAr,
      pct: c.pct,
      stage: c.stage,
      amount,
      billingStatus: idx === 0 ? ("issued" as const) : ("scheduled" as const),
    };
  });
}

export const PaymentMethodSchema = z.enum([
  "bank_transfer",
  "instapay",
  "cash",
  "cheque",
  "card",
  "other",
]);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export interface InvoicePaymentItem {
  id: string;
  invoiceId: string;
  paymentNumber: string;
  amount: number;
  paymentMethod: string;
  referenceNumber?: string | null;
  notes?: string | null;
  recordedBy: string;
  paidAt: string | Date;
  createdAt: string | Date;
}

export interface InvoiceItem {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  quoteId: string;
  projectId?: string | null;
  orderId?: string | null;
  customerId: string;
  customerName?: string | null;
  customerPhone?: string | null;
  orderNumber?: string | null;
  quoteNumber?: string | null;
  total: number;
  depositAmount: number;
  paidAmount: number;
  balanceDue: number;
  status: InvoiceStatus;
  billingStatus?: BillingStatus;
  milestoneIndex?: number;
  milestoneTotalCount?: number;
  milestoneLabel?: string | null;
  milestonePct?: number | null;
  dueStage?: string | null;
  issuedAt: string | Date;
  paidAt?: string | Date | null;
  paymentCount: number;
  payments?: InvoicePaymentItem[];
}

export function computeInvoiceStatus(
  total: number,
  paidAmount: number,
  issuedAt?: string | Date | null,
  billingStatus?: string | null,
): InvoiceStatus {
  if (paidAmount >= total && total > 0) {
    return "paid";
  }
  if (paidAmount > 0) {
    return "partially_paid";
  }
  if (billingStatus === "scheduled") {
    return "unpaid";
  }
  // If unpaid and over 30 days old, classify as overdue
  if (issuedAt) {
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - new Date(issuedAt).getTime() > thirtyDays) {
      return "overdue";
    }
  }
  return "unpaid";
}
