import type { PaginatedResult } from "@/lib/customer-types";
import type { TaskItem } from "@/lib/task-types";

export type RemakeType =
  | "qc_failure"
  | "manufacturing_defect"
  | "customer_complaint"
  | "warranty";

export type RemakeSeverity = "low" | "medium" | "high" | "critical";

export type RemakeStatus =
  | "reported"
  | "under_review"
  | "approved"
  | "in_remake"
  | "qc_pending"
  | "resolved"
  | "rejected"
  | "cancelled";

export interface RemakeListItem {
  id: string;
  remakeNumber: string;
  orderId: string;
  orderNumber: string;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  qcInspectionId?: string | null;
  componentId?: string | null;
  type: RemakeType;
  severity: RemakeSeverity;
  status: RemakeStatus;
  reason: string;
  defectDescription?: string | null;
  resolution?: string | null;
  assignedTo?: string | null;
  assignedToName?: string | null;
  dueDate?: string | Date | null;
  resolvedAt?: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface RemakeDetailData extends RemakeListItem {
  linkedTasks: TaskItem[];
  attachments: {
    id: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    caption?: string | null;
    storageKey: string;
    downloadUrl?: string | null;
    createdAt: string | Date;
  }[];
  qcInspection?: {
    id: string;
    stage: string;
    passed: boolean;
    notes?: string | null;
    createdAt: string | Date;
  } | null;
}

export interface RemakeKpis {
  totalCases: number;
  openCases: number;
  underReview: number;
  inRemake: number;
  qcPending: number;
  resolved: number;
  warrantyCases: number;
}

export interface PaginatedRemakesResult extends PaginatedResult<RemakeListItem> {
  kpis: RemakeKpis;
}

/** Valid transitions for the quality/remake state machine. */
export const REMAKE_STATUS_TRANSITIONS: Record<RemakeStatus, RemakeStatus[]> = {
  reported: ["under_review", "cancelled"],
  under_review: ["approved", "rejected", "cancelled"],
  approved: ["in_remake", "cancelled"],
  in_remake: ["qc_pending", "cancelled"],
  qc_pending: ["resolved", "in_remake"], // in_remake if reinspection fails
  resolved: ["under_review"], // Reopen if needed
  rejected: [],
  cancelled: [],
};

export function isValidRemakeTransition(
  currentStatus: RemakeStatus,
  targetStatus: RemakeStatus,
): boolean {
  if (currentStatus === targetStatus) return true;
  const allowed = REMAKE_STATUS_TRANSITIONS[currentStatus];
  return Boolean(allowed && allowed.includes(targetStatus));
}
