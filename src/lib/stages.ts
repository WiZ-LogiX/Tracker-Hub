export const ORDER_STAGES = [
  "deposit_received",
  "design_approved",
  "cutting",
  "assembly",
  "finishing",
  "quality_check",
  "ready_for_pickup",
  "delivered",
  "completed",
] as const;

export type OrderStage = (typeof ORDER_STAGES)[number];

export const STAGE_LABEL_AR: Record<OrderStage, string> = {
  deposit_received: "استلام العربون",
  design_approved: "اعتماد التصميم",
  cutting: "قص الخامات",
  assembly: "التجميع",
  finishing: "التشطيب والدهان",
  quality_check: "فحص الجودة",
  ready_for_pickup: "جاهز للاستلام",
  delivered: "تم التسليم",
  completed: "مكتمل",
};

/**
 * 6-Stage Simplified Customer-Facing Tracking Model
 */
export const CUSTOMER_TRACKING_STAGES = [
  "order_confirmed",
  "design_approval",
  "in_production",
  "quality_check",
  "ready_for_delivery",
  "delivered",
] as const;

export type CustomerTrackingStage = (typeof CUSTOMER_TRACKING_STAGES)[number];

export const CUSTOMER_STAGE_LABEL_AR: Record<CustomerTrackingStage, string> = {
  order_confirmed: "تم تأكيد الطلب",
  design_approval: "اعتماد التصميم",
  in_production: "قيد التصنيع",
  quality_check: "فحص الجودة",
  ready_for_delivery: "جاهز للتسليم",
  delivered: "تم التسليم",
};

export const INTERNAL_SUB_STAGE_LABEL_AR: Record<string, string> = {
  cutting: "قص الخامات",
  assembly: "التجميع",
  finishing: "التشطيب والدهان",
};

/**
 * Maps granular internal workshop stages into the 6 customer-facing tracking stages.
 */
export function mapInternalStageToCustomerStage(internalStage: string | null | undefined): CustomerTrackingStage {
  if (!internalStage) return "order_confirmed";
  switch (internalStage) {
    case "deposit_received":
      return "order_confirmed";
    case "design_approved":
      return "design_approval";
    case "cutting":
    case "assembly":
    case "finishing":
      return "in_production";
    case "quality_check":
      return "quality_check";
    case "ready_for_pickup":
      return "ready_for_delivery";
    case "delivered":
    case "completed":
      return "delivered";
    default:
      return "order_confirmed";
  }
}

export function customerStageIndex(s: CustomerTrackingStage): number {
  return CUSTOMER_TRACKING_STAGES.indexOf(s);
}

export function getInternalSubStageLabelAr(internalStage: string | null | undefined): string | null {
  if (!internalStage) return null;
  return INTERNAL_SUB_STAGE_LABEL_AR[internalStage] || null;
}

/**
 * Progressive Quotation Lifecycle Stages
 */
export const QUOTATION_LIFECYCLE_STAGES = [
  "draft",
  "awaiting_customer_confirmation",
  "approved_for_delivery",
  "pdf_sent",
  "awaiting_customer_decision",
  "accepted",
  "rejected",
  "revision_requested",
  "expired",
  "converted",
] as const;

export type QuotationLifecycleStage = (typeof QUOTATION_LIFECYCLE_STAGES)[number];

export const QUOTATION_STAGE_LABEL_AR: Record<QuotationLifecycleStage, string> = {
  draft: "مسودة",
  awaiting_customer_confirmation: "بانتظار تأكيد العميل عبر واتساب",
  approved_for_delivery: "وافق على استلام عرض السعر",
  pdf_sent: "تم إرسال مستند العرض",
  awaiting_customer_decision: "بانتظار قرار العميل",
  accepted: "معتمد من العميل",
  rejected: "مرفوض",
  revision_requested: "مطلوب تعديل",
  expired: "منتهي الصلاحية",
  converted: "تم التحويل لأمر إنتاج",
};

/**
 * Type-safe accessor for stage labels. Returns the Arabic label for known stages,
 * or the raw stage string for unknown values (e.g. legacy or invalid db rows).
 */
export function getStageLabelAr(stage: string | null | undefined): string {
  if (!stage) return "—";
  if ((ORDER_STAGES as readonly string[]).includes(stage)) {
    return STAGE_LABEL_AR[stage as OrderStage];
  }
  return stage;
}

export function stageIndex(s: OrderStage): number {
  return ORDER_STAGES.indexOf(s);
}

export function nextStage(s: OrderStage): OrderStage | null {
  const i = stageIndex(s);
  return i < ORDER_STAGES.length - 1 ? ORDER_STAGES[i + 1] : null;
}

export function getQuotationProgressiveStatus(quote: {
  status?: string | null;
  snapshot?: any;
}): QuotationLifecycleStage {
  const snap = (quote.snapshot || {}) as Record<string, any>;
  const lifecycle = (snap.lifecycle || {}) as Record<string, any>;
  const rawStatus = quote.status;

  if (rawStatus === "converted") return "converted";
  if (rawStatus === "expired") return "expired";

  if (lifecycle?.stage) {
    const stage = lifecycle.stage as QuotationLifecycleStage;
    if ((QUOTATION_LIFECYCLE_STAGES as readonly string[]).includes(stage)) {
      return stage;
    }
  }

  if (rawStatus === "accepted") return "accepted";
  if (rawStatus === "rejected") return "rejected";
  if (rawStatus === "sent") return "awaiting_customer_decision";
  return "draft";
}
