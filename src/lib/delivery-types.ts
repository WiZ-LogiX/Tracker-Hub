import type { PaginatedResult } from "@/lib/customer-types";

export type DeliveryStatus =
  | "ready_for_dispatch"
  | "dispatched"
  | "out_for_delivery"
  | "delivered"
  | "installation_pending"
  | "installed"
  | "handover_pending"
  | "completed"
  | "delivery_failed"
  | "cancelled";

export const DELIVERY_STATUS_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  ready_for_dispatch: ["dispatched", "cancelled"],
  dispatched: ["out_for_delivery", "delivery_failed", "cancelled"],
  out_for_delivery: ["delivered", "delivery_failed"],
  delivered: ["installation_pending", "handover_pending", "completed"],
  installation_pending: ["installed", "handover_pending"],
  installed: ["handover_pending", "completed"],
  handover_pending: ["completed"],
  delivery_failed: ["ready_for_dispatch", "out_for_delivery", "cancelled"],
  completed: [],
  cancelled: [],
};

export function isValidDeliveryTransition(from: DeliveryStatus, to: DeliveryStatus): boolean {
  return (DELIVERY_STATUS_TRANSITIONS[from] || []).includes(to);
}

export interface DeliveryHandover {
  id: string;
  tenantId: string;
  deliveryNumber: string;
  orderId: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  status: DeliveryStatus;
  deliveryAddress: string;
  recipientName?: string | null;
  recipientPhone?: string | null;
  scheduledDate?: string | null;
  dispatchedAt?: string | Date | null;
  deliveredAt?: string | Date | null;
  installationRequired: boolean;
  installedAt?: string | Date | null;
  installerName?: string | null;
  installerNotes?: string | null;
  handedOverAt?: string | Date | null;
  signerName?: string | null;
  customerNotes?: string | null;
  handoverNotes?: string | null;
  signatureDataUrl?: string | null;
  createdBy?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface DeliveryKpis {
  totalDeliveries: number;
  readyForDispatch: number;
  dispatched: number;
  outForDelivery: number;
  installationPending: number;
  handoverPending: number;
  completed: number;
}

export interface PaginatedDeliveryResult extends PaginatedResult<DeliveryHandover> {
  kpis: DeliveryKpis;
}
