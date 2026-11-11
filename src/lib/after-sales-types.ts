import { z } from "zod";
import type { TaskItem } from "@/lib/task-types";
import type { RemakeListItem } from "@/lib/remake-types";
import type { DeliveryHandover } from "@/lib/delivery-types";

export type ServiceCaseType =
  | "warranty"
  | "complaint"
  | "service"
  | "maintenance"
  | "other";

export type ServiceCasePriority = "low" | "medium" | "high" | "critical";

export type ServiceCaseStatus =
  | "new"
  | "under_review"
  | "assigned"
  | "in_progress"
  | "waiting_customer"
  | "resolved"
  | "closed";

export const CASE_STATUS_TRANSITIONS: Record<ServiceCaseStatus, ServiceCaseStatus[]> = {
  new: ["under_review", "assigned", "closed"],
  under_review: ["assigned", "in_progress", "waiting_customer", "closed"],
  assigned: ["in_progress", "under_review", "closed"],
  in_progress: ["waiting_customer", "resolved", "under_review", "closed"],
  waiting_customer: ["in_progress", "resolved", "closed"],
  resolved: ["closed", "in_progress"], // Can be reopened if customer not satisfied
  closed: ["in_progress"], // Reopen
};

export function isValidCaseTransition(from: ServiceCaseStatus, to: ServiceCaseStatus): boolean {
  if (from === to) return true;
  return (CASE_STATUS_TRANSITIONS[from] || []).includes(to);
}

/** Statuses considered "open" (still requiring after-sales action). */
export const OPEN_CASE_STATUSES: ServiceCaseStatus[] = [
  "new",
  "under_review",
  "assigned",
  "in_progress",
  "waiting_customer",
];

export function isOpenCaseStatus(status: ServiceCaseStatus): boolean {
  return OPEN_CASE_STATUSES.includes(status);
}

export type ServiceCaseAction =
  | "view"
  | "create"
  | "transition"
  | "assign"
  | "create_task"
  | "create_remake"
  | "create_opportunity";

/**
 * Authoritative after-sales role matrix (PeleCanon built-in roles only).
 * - owner / admin: full control, including (re)assignment.
 * - sales: customer-facing case handling (create, transition, tasks, remake requests, repeat deals) but no assignment.
 * - worker / viewer / custom roles: read-only.
 */
export function canPerformCaseAction(
  role: string | null | undefined,
  action: ServiceCaseAction,
): boolean {
  if (!role) return false;
  const VALID_ROLES = ["owner", "admin", "sales", "worker", "viewer"];
  if (!VALID_ROLES.includes(role)) return false;
  if (action === "view") return true;
  if (role === "owner" || role === "admin") return true;
  if (role === "sales") return action !== "assign";
  return false;
}

/**
 * Strict contractual warranty duration parser.
 *
 * Only accepts an explicit "warranty/ضمان : N <unit>" or "N <unit> warranty/ضمان" phrase.
 * The unit is read from the SAME phrase (never from elsewhere in the text) so unrelated
 * words like "سنة 2026" cannot alter the duration. Returns null when no reliable value exists.
 */
export function parseWarrantyMonths(notes: string | null | undefined): number | null {
  if (!notes) return null;
  const UNIT = "(months?|m|شهر|شهور|شهرا|شهراً|أشهر|years?|سنة|سنوات|سنين|عام|أعوام)";
  const patterns = [
    new RegExp(`(?:warranty|ضمان)\\s*[:=]?\\s*(\\d{1,3})\\s*${UNIT}`, "i"),
    new RegExp(`(\\d{1,3})\\s*${UNIT}\\s*(?:warranty|ضمان)`, "i"),
  ];
  for (const re of patterns) {
    const m = notes.match(re);
    if (m && m[1] && m[2]) {
      const value = parseInt(m[1], 10);
      if (!Number.isFinite(value) || value <= 0) return null;
      const unit = m[2].toLowerCase();
      const isYears = /^(years?|سنة|سنوات|سنين|عام|أعوام)$/.test(unit);
      const months = isYears ? value * 12 : value;
      // Reject implausible values rather than guess (max 30 years).
      return months > 0 && months <= 360 ? months : null;
    }
  }
  return null;
}

export interface CustomerWarrantyStatus {
  orderId: string;
  orderNumber: string;
  deliveryId?: string | null;
  deliveryNumber?: string | null;
  handoverDate?: string | null;
  contractDate?: string | null;
  warrantyPeriodMonths?: number | null;
  warrantyExpirationDate?: string | null;
  isWarrantyActive: boolean;
  isReliable: boolean;
  warrantyStatusLabel: string; // e.g. "Active Warranty" | "Expired Warranty" | "Warranty Period Unknown"
  warrantyStatusLabelAr: string; // "ضمان ساري" | "انتهى الضمان" | "فترة الضمان غير محددة"
  warrantyDetails?: string | null;
  warrantyDetailsAr?: string | null;
}

export interface ServiceCaseItem {
  id: string;
  tenantId: string;
  caseNumber: string; // CAS-XXXX
  customerId: string;
  customerName: string;
  customerPhone?: string | null;
  projectId?: string | null;
  projectTitle?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
  remakeId?: string | null;
  remakeNumber?: string | null;
  deliveryId?: string | null;
  deliveryNumber?: string | null;
  taskId?: string | null;
  taskCode?: string | null;
  type: ServiceCaseType;
  priority: ServiceCasePriority;
  status: ServiceCaseStatus;
  title: string;
  description?: string | null;
  assignedTo?: string | null;
  assignedToName?: string | null;
  dueDate?: string | null;
  resolution?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceCaseDetailData extends ServiceCaseItem {
  warranty: CustomerWarrantyStatus;
  linkedOrder?: {
    id: string;
    orderNumber: string;
    total: number;
    currentStage: string;
    contractDate: string;
    deliveredAt?: string | null;
  } | null;
  linkedDelivery?: DeliveryHandover | null;
  linkedRemake?: RemakeListItem | null;
  linkedTasks: TaskItem[];
  attachments: {
    id: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    caption?: string | null;
    storageKey: string;
    downloadUrl?: string | null;
    createdAt: string;
  }[];
}

export interface AfterSalesKpiMetrics {
  totalCases: number;
  openCases: number;
  underReviewCount: number;
  inProgressCount: number;
  waitingCustomerCount: number;
  resolvedCount: number;
  warrantyCasesCount: number;
  complaintsCount: number;
  repeatOpportunityCount: number;
}

export const ListServiceCasesInput = z.object({
  searchTerm: z.string().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  priority: z.string().optional(),
  customerId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().default(20),
});

export const CreateServiceCaseInput = z.object({
  customerId: z.string().uuid(),
  orderId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  deliveryId: z.string().uuid().optional().nullable(),
  remakeId: z.string().uuid().optional().nullable(),
  type: z.enum(["warranty", "complaint", "service", "maintenance", "other"]).default("complaint"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  title: z.string().min(3).max(255),
  description: z.string().optional().nullable(),
  assignedTo: z.string().uuid().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  createInspectionTask: z.boolean().optional(),
  inspectionTaskTitle: z.string().optional(),
});

export const UpdateServiceCaseStatusInput = z.object({
  caseId: z.string().uuid(),
  status: z.enum(["new", "under_review", "assigned", "in_progress", "waiting_customer", "resolved", "closed"]),
  resolution: z.string().optional().nullable(),
});

export const AssignServiceCaseInput = z.object({
  caseId: z.string().uuid(),
  assignedTo: z.string().uuid().optional().nullable(),
  dueDate: z.string().optional().nullable(),
});

export const CreateCaseTaskInput = z.object({
  caseId: z.string().uuid(),
  title: z.string().min(3).max(255),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  assignedTo: z.string().uuid().optional(),
  dueDate: z.string().optional(),
});

export const CreateCaseRemakeInput = z.object({
  caseId: z.string().uuid(),
  reason: z.string().min(3).max(255),
  defectDescription: z.string().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  assignedTo: z.string().uuid().optional(),
  dueDate: z.string().optional(),
});

export const CreateRepeatOpportunityInput = z.object({
  customerId: z.string().uuid(),
  title: z.string().min(3).max(255),
  projectType: z.enum(["residential", "commercial", "developer"]).default("residential"),
  estimatedValue: z.number().nonnegative().optional(),
  source: z.string().default("existing_customer"),
  notes: z.string().optional(),
});
