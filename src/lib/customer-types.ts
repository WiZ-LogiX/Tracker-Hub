import type { TaskItem } from "@/lib/task-types";
import type { InvoiceItem } from "@/lib/invoice-types";

export interface PaginatedResult<T> {
  rows: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type CustomerSortOption = "newest" | "oldest" | "name_asc" | "name_desc";
export type CustomerFilterOption =
  | "all"
  | "active_orders"
  | "outstanding_balance"
  | "with_quotes"
  | "no_active_orders";

export interface CustomerListItem {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  governorate: string | null;
  createdAt: string | Date;
  quoteCount: number;
  activeOrderCount: number;
  totalInvoiced: number;
  totalPaid: number;
  outstandingBalance: number;
  lastActivityAt?: string | Date | null;
}

export type PaginatedCustomersResult = PaginatedResult<CustomerListItem>;

export interface CustomerQuoteItem {
  id: string;
  quoteNumber: string;
  status: string;
  progressiveStatus?: string;
  statusLabelAr?: string;
  total: number;
  validUntil?: string | null;
  opportunityId?: string | null;
  createdAt: string | Date;
  orderId?: string | null;
  orderNumber?: string | null;
  snapshot?: any;
}

export interface CustomerOrderItem {
  id: string;
  orderNumber: string;
  quoteId?: string | null;
  quoteNumber?: string | null;
  opportunityId?: string | null;
  currentStage: string;
  total: number;
  deposit: number;
  paidAmount: number;
  balanceDue: number;
  contractDate: string | Date;
  expectedDelivery?: string | null;
  deliveredAt?: string | Date | null;
  notes?: string | null;
  createdAt: string | Date;
}

import type { RemakeListItem } from "@/lib/remake-types";
import type { OpportunityItem } from "@/lib/crm-types";
import type { ProductionWorkOrder } from "@/lib/work-order-types";
import type { DeliveryHandover } from "@/lib/delivery-types";

export interface CustomerActivityItem {
  id: string;
  entityType:
    | "lead"
    | "opportunity"
    | "quote"
    | "order"
    | "invoice"
    | "payment"
    | "task"
    | "qc"
    | "remake"
    | "delivery"
    | "handover"
    | "warranty"
    | "customer";
  entityId?: string | null;
  action: string;
  title: string;
  description: string;
  actorName?: string | null;
  timestamp: string | Date;
  status?: string | null;
  metadata?: Record<string, any>;
}

export interface CustomerProjectItem {
  id: string;
  opportunityNumber?: string | null;
  title: string;
  projectType: string;
  value: number;
  stage: string;
  status: string;
  salesOwner?: string | null;
  salesOwnerName?: string | null;
  quotationStatus?: string | null;
  orderStatus?: string | null;
  productionStatus?: string | null;
  deliveryStatus?: string | null;
  outstandingBalance: number;
  openTasksCount: number;
  qualityCasesCount: number;
  nextAction?: string | null;
  nextActionDate?: string | null;
  quotesCount: number;
  ordersCount: number;
  quotes: CustomerQuoteItem[];
  orders: CustomerOrderItem[];
  workOrders: ProductionWorkOrder[];
  deliveries: DeliveryHandover[];
  tasks: TaskItem[];
  remakes: RemakeListItem[];
}

export interface CustomerPaymentRecord {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  paymentNumber: string;
  amount: number;
  paymentMethod: string;
  referenceNumber?: string | null;
  notes?: string | null;
  paidAt: string | Date;
}

export interface CustomerFinancials {
  totalInvoiced: number;
  totalCollected: number;
  outstandingBalance: number;
  openInvoicesCount: number;
  openInvoices: InvoiceItem[];
  recentPayments: CustomerPaymentRecord[];
}

export interface CustomerAfterSalesSummary {
  openCasesCount: number;
  resolvedCasesCount: number;
  remakesCount: number;
  complaintsCount: number;
  cases: import("@/lib/after-sales-types").ServiceCaseItem[];
  warranties: import("@/lib/after-sales-types").CustomerWarrantyStatus[];
  recentDelivery: DeliveryHandover | null;
  recentHandover: DeliveryHandover | null;
}

export interface Customer360Data {
  customer: CustomerListItem;
  projects: CustomerProjectItem[];
  opportunities: OpportunityItem[];
  quotes: CustomerQuoteItem[];
  orders: CustomerOrderItem[];
  invoices: InvoiceItem[];
  financials: CustomerFinancials;
  tasks: TaskItem[];
  workOrders: ProductionWorkOrder[];
  deliveries: DeliveryHandover[];
  remakes: RemakeListItem[];
  activities: CustomerActivityItem[];
  afterSales: CustomerAfterSalesSummary;
  hasCompletedProjects: boolean;
}


