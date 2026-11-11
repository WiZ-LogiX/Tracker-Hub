import type { PipelineStage, OpportunityStatus } from "@/lib/crm-types";
import type { TaskItem } from "@/lib/task-types";
import type { ProductionWorkOrder } from "@/lib/work-order-types";
import type { DeliveryHandover } from "@/lib/delivery-types";
import type { RemakeListItem } from "@/lib/remake-types";
import type { AttachmentRow } from "@/lib/attachments.functions";
import type { CustomerActivityItem, CustomerPaymentRecord } from "@/lib/customer-types";

export type ProjectLifecycleStage =
  | "lead"
  | "opportunity"
  | "measurement"
  | "design"
  | "quote"
  | "won"
  | "order"
  | "production"
  | "qc"
  | "delivery"
  | "installation"
  | "handover"
  | "warranty";

export interface ProjectLifecycleStep {
  stage: ProjectLifecycleStage;
  label: string;
  labelAr: string;
  status: "completed" | "current" | "pending";
  date?: string | null;
  detail?: string | null;
}

export type HealthSeverity = "good" | "warning" | "critical" | "neutral";

export interface HealthIndicator {
  dimension: "commercial" | "production" | "inventory" | "quality" | "delivery" | "financial";
  title: string;
  titleAr: string;
  statusText: string;
  statusTextAr: string;
  severity: HealthSeverity;
  detail: string;
  detailAr: string;
}

export interface ProjectHeaderData {
  projectId: string;
  projectNumber: string;
  projectName: string;
  projectType: string;
  customerId: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  primarySite?: string | null;
  salesOwnerId?: string | null;
  salesOwnerName?: string | null;
  currentStage: ProjectLifecycleStage;
  stageLabel: string;
  stageLabelAr: string;
  status: "open" | "won" | "lost" | "abandoned";
  totalValue: number;
  invoicedAmount: number;
  paidAmount: number;
  outstandingBalance: number;
  mainQuote?: {
    id: string;
    quoteNumber: string;
    total: number;
    status: string;
  } | null;
  mainOrder?: {
    id: string;
    orderNumber: string;
    total: number;
    currentStage: string;
  } | null;
  health: HealthIndicator[];
  lifecycle: ProjectLifecycleStep[];
}

export interface ProjectCommercialQuote {
  id: string;
  quoteNumber: string;
  total: number;
  subtotal: number;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  createdAt: string;
  updatedAt?: string | null;
  isMainQuote: boolean;
  notes?: string | null;
}

export interface ProjectOrderRecord {
  id: string;
  orderNumber: string;
  quoteId?: string | null;
  quoteNumber?: string | null;
  total: number;
  deposit: number;
  paidAmount: number;
  currentStage: string;
  contractDate: string;
  expectedDelivery?: string | null;
  deliveredAt?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface ProjectInventoryAllocation {
  id: string;
  stockItemId: string;
  sku: string;
  name: string;
  unit: string;
  reservedQuantity: number;
  status: "reserved" | "consumed" | "released" | "cancelled";
  createdAt: string;
}

export interface ProjectInvoiceRecord {
  id: string;
  invoiceNumber: string;
  orderId?: string | null;
  orderNumber?: string | null;
  total: number;
  paidAmount: number;
  balanceDue: number;
  status: "draft" | "issued" | "partially_paid" | "paid" | "void";
  issueDate: string;
  dueDate?: string | null;
}

export interface ProjectFinancials {
  totalProjectValue: number;
  totalInvoiced: number;
  totalCollected: number;
  outstandingBalance: number;
  invoices: ProjectInvoiceRecord[];
  payments: CustomerPaymentRecord[];
}

export interface ProjectWorkspaceData {
  header: ProjectHeaderData;
  commercial: {
    opportunityId: string;
    opportunityNumber: string;
    title: string;
    projectType: string;
    value: number;
    stage: PipelineStage;
    status: OpportunityStatus;
    lostReason?: string | null;
    nextAction?: string | null;
    nextActionDate?: string | null;
    quotes: ProjectCommercialQuote[];
  };
  orders: ProjectOrderRecord[];
  production: {
    workOrders: ProductionWorkOrder[];
    activeStage: string | null;
    completionPercentage: number;
  };
  tasks: TaskItem[];
  inventory: {
    allocations: ProjectInventoryAllocation[];
    readiness: "READY" | "PARTIAL" | "BLOCKED" | "NOT_RESERVED";
  };
  delivery: {
    handovers: DeliveryHandover[];
    currentDeliveryStatus: string | null;
  };
  financials: ProjectFinancials;
  quality: {
    remakes: RemakeListItem[];
    qcCount: number;
    defectsCount: number;
  };
  documents: AttachmentRow[];
  timeline: CustomerActivityItem[];
  currentUserRole: string;
}

export interface ProjectListItem {
  id: string;
  projectNumber: string;
  name: string;
  projectType: string;
  customerId: string;
  customerName: string;
  customerPhone?: string | null;
  salesOwnerName?: string | null;
  stage: ProjectLifecycleStage;
  stageLabel: string;
  stageLabelAr: string;
  status: "open" | "won" | "lost" | "abandoned";
  totalValue: number;
  outstandingBalance: number;
  commercialStatus: string;
  productionStatus: string;
  deliveryStatus: string;
  healthSeverity: HealthSeverity;
  quotesCount: number;
  ordersCount: number;
  openTasksCount: number;
  activeRemakesCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectListFilters {
  searchTerm?: string;
  stageFilter?: string;
  projectTypeFilter?: string;
  salesOwnerFilter?: string;
  page?: number;
  pageSize?: number;
}
