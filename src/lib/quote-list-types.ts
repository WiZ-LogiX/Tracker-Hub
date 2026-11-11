import type { PaginatedResult } from "@/lib/customer-types";

export type QuoteSortOption = "newest" | "oldest" | "highest_value" | "lowest_value";
export type QuoteStatusFilter =
  | "all"
  | "draft"
  | "sent"
  | "accepted"
  | "rejected"
  | "expired"
  | "converted";

export interface QuotationListItem {
  id: string;
  quoteNumber: string;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  status: string;
  progressiveStatus?: string;
  statusLabelAr?: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  validUntil: string;
  createdAt: string | Date;
  orderId?: string | null;
  orderNumber?: string | null;
  opportunityId?: string | null;
  opportunityNumber?: string | null;
  opportunityTitle?: string | null;
  salesOwnerName?: string | null;
}

export type PaginatedQuotationsResult = PaginatedResult<QuotationListItem>;
