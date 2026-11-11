import { z } from "zod";

export const InvoiceStatusSchema = z.enum([
  "unpaid",
  "partially_paid",
  "paid",
  "overdue",
]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

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
  issuedAt: string | Date;
  paidAt?: string | Date | null;
  paymentCount: number;
  payments?: InvoicePaymentItem[];
}

export function computeInvoiceStatus(
  total: number,
  paidAmount: number,
  issuedAt?: string | Date | null,
): InvoiceStatus {
  if (paidAmount >= total && total > 0) {
    return "paid";
  }
  if (paidAmount > 0) {
    return "partially_paid";
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
