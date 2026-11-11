import {
  parseWarrantyMonths,
  type CustomerWarrantyStatus,
} from "@/lib/after-sales-types";

/**
 * Authoritative Warranty Evaluation
 *
 * Rules:
 * 1. Do not invent legal warranty periods globally.
 * 2. Use configurable or existing business data where available.
 * 3. If warranty expiration cannot be determined reliably, display: "Warranty Period Unknown".
 * 4. Do not guess.
 */
export function calculateWarrantyStatus(
  order: {
    id: string;
    orderNumber: string;
    contractDate?: string | Date | null;
    deliveredAt?: string | Date | null;
    notes?: string | null;
  },
  delivery?: {
    id: string;
    deliveryNumber: string;
    status: string;
    deliveredAt?: string | Date | null;
    handedOverAt?: string | Date | null;
  } | null,
): CustomerWarrantyStatus {
  // Determine start date: priority to official customer handover date, then deliveredAt, then contractDate
  const handoverDateRaw = delivery?.handedOverAt || delivery?.deliveredAt || order.deliveredAt;
  const handoverDate = handoverDateRaw
    ? typeof handoverDateRaw === "string"
      ? handoverDateRaw.slice(0, 10)
      : new Date(handoverDateRaw).toISOString().slice(0, 10)
    : null;

  const contractDate = order.contractDate
    ? typeof order.contractDate === "string"
      ? order.contractDate.slice(0, 10)
      : new Date(order.contractDate).toISOString().slice(0, 10)
    : null;

  // Explicit contractual warranty duration recorded on the order (e.g. "warranty: 12 months" / "ضمان: 2 سنة").
  const warrantyMonths: number | null = parseWarrantyMonths(order.notes);

  // If no explicit warranty duration or start date can be reliably established:
  if (!warrantyMonths || !handoverDate) {
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      deliveryId: delivery?.id || null,
      deliveryNumber: delivery?.deliveryNumber || null,
      handoverDate,
      contractDate,
      warrantyPeriodMonths: null,
      warrantyExpirationDate: null,
      isWarrantyActive: false,
      isReliable: false,
      warrantyStatusLabel: "Warranty Period Unknown",
      warrantyStatusLabelAr: "فترة الضمان غير محددة",
      warrantyDetails: "No explicit warranty duration or handover signoff registered for this order",
      warrantyDetailsAr: "لم يتم تسجيل مدة ضمان تعاقدية صريحة أو محضر تسليم نهائي لهذا الطلب",
    };
  }

  // Calculate reliable expiration date
  const startDateObj = new Date(handoverDate);
  const expDateObj = new Date(startDateObj);
  expDateObj.setMonth(expDateObj.getMonth() + warrantyMonths);
  const warrantyExpirationDate = expDateObj.toISOString().slice(0, 10);

  const now = new Date();
  const isWarrantyActive = now <= expDateObj;

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    deliveryId: delivery?.id || null,
    deliveryNumber: delivery?.deliveryNumber || null,
    handoverDate,
    contractDate,
    warrantyPeriodMonths: warrantyMonths,
    warrantyExpirationDate,
    isWarrantyActive,
    isReliable: true,
    warrantyStatusLabel: isWarrantyActive
      ? `Active Warranty (Valid until ${warrantyExpirationDate})`
      : `Expired Warranty (${warrantyExpirationDate})`,
    warrantyStatusLabelAr: isWarrantyActive
      ? `ضمان ساري (صالح حتى ${warrantyExpirationDate})`
      : `انتهت فترة الضمان (${warrantyExpirationDate})`,
    warrantyDetails: isWarrantyActive
      ? `Contractual warranty valid for ${warrantyMonths} months from handover`
      : `Contractual warranty expired on ${warrantyExpirationDate}`,
    warrantyDetailsAr: isWarrantyActive
      ? `ضمان تعاقدي سارٍ لمدة ${warrantyMonths} شهراً من تاريخ التسليم`
      : `انتهت فترة الضمان التعاقدي بتاريخ ${warrantyExpirationDate}`,
  };
}
