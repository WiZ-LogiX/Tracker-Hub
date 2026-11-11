import { z } from "zod";

export const TaskStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "waiting_review",
  "completed",
  "cancelled",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskPrioritySchema = z.enum(["low", "medium", "high", "critical"]);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export interface TaskItem {
  id: string;
  tenantId: string;
  taskCode: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  category: string;
  dueDate?: string | Date | null;
  completedAt?: string | Date | null;
  createdBy: string;
  customerId?: string | null;
  opportunityId?: string | null;
  quoteId?: string | null;
  orderId?: string | null;
  workOrderId?: string | null;
  remakeId?: string | null;
  deliveryId?: string | null;
  caseId?: string | null;
  productionStage?: string | null;
  reviewNotes?: string | null;
  reviewedBy?: string | null;
  returnedAt?: string | Date | null;
  isAcknowledged?: boolean;
  acknowledgedAt?: string | Date | null;
  acknowledgedBy?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  customerName?: string | null;
  quoteNumber?: string | null;
  orderNumber?: string | null;
  workOrderNumber?: string | null;
  remakeNumber?: string | null;
  deliveryNumber?: string | null;
  caseNumber?: string | null;
  caseTitle?: string | null;
  isOverdue: boolean;
  assignees: {
    userId: string;
    assignedAt: string | Date;
    memberRole?: string | null;
    userName?: string | null;
    userEmail?: string | null;
  }[];
}

export interface WorkforceMember {
  userId: string;
  displayName: string;
  username: string;
  avatarKey?: string | null;
  role: string;
  status: "active" | "disabled";
  openTasksCount: number;
  criticalTasksCount: number;
  overdueTasksCount: number;
  waitingReviewCount: number;
  completedTodayCount: number;
}

export const TASK_CATEGORIES = [
  { key: "production", labelAr: "تصنيع وإنتاج", labelEn: "Production" },
  { key: "installation", labelAr: "تركيبات موقعية", labelEn: "Installation" },
  { key: "qc", labelAr: "مراقبة الجودة وفحص", labelEn: "Quality Control" },
  { key: "remake", labelAr: "إعادة تصنيع ومعالجة", labelEn: "Remake & Rework" },
  { key: "delivery", labelAr: "شحن وتسليم", labelEn: "Delivery & Dispatch" },
  { key: "after_sales_service", labelAr: "خدمة ما بعد البيع وضمان", labelEn: "After-Sales & Warranty" },
  { key: "measurement", labelAr: "معاينة ورفع مقاسات", labelEn: "Measurement" },
  { key: "sales", labelAr: "متابعة مبيعات وعملاء", labelEn: "Sales & Client" },
  { key: "general", labelAr: "مهام عامة وإدارية", labelEn: "General" },
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number]["key"];

export const TASK_PRIORITIES = [
  { key: "low", labelAr: "منخفضة", labelEn: "Low" },
  { key: "medium", labelAr: "متوسطة", labelEn: "Medium" },
  { key: "high", labelAr: "عالية", labelEn: "High" },
  { key: "critical", labelAr: "حرجة", labelEn: "Critical" },
] as const;

export function computeIsOverdue(
  status: TaskStatus,
  dueDate: string | Date | null | undefined,
): boolean {
  if (status === "completed" || status === "cancelled" || !dueDate) {
    return false;
  }
  return new Date(dueDate).getTime() < Date.now();
}
