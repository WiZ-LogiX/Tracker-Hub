import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { generatePdf } from "@/lib/pdf.functions";
import type { InvoiceItem } from "@/lib/invoice-types";
import { formatEGP } from "@/lib/pricing";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { RecordPaymentModal } from "@/components/invoices/RecordPaymentModal";
import {
  Receipt,
  Download,
  CreditCard,
  UserCircle,
  Package,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  Plus,
} from "lucide-react";
import { toast } from "sonner";

interface InvoiceDetailDrawerProps {
  invoice: InvoiceItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
  userRole?: string;
}

export function InvoiceDetailDrawer({
  invoice,
  open,
  onOpenChange,
  onRefresh,
  userRole,
}: InvoiceDetailDrawerProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const pdfFn = useServerFn(generatePdf);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  if (!invoice) return null;

  const canRecordPayment = userRole !== "worker" && userRole !== "viewer" && invoice.balanceDue > 0;

  const handleDownloadPdf = async () => {
    if (!invoice?.id) {
      toast.error(isRtl ? "بيانات الفاتورة غير مكتملة" : "Invoice ID missing");
      return;
    }
    setDownloadingPdf(true);
    try {
      const { downloadUrl } = await pdfFn({
        data: { entityType: "invoice", entityId: invoice.id },
      });
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
      toast.success(isRtl ? "تم إصدار الفاتورة PDF بنجاح" : "Invoice PDF generated");
    } catch (e: any) {
      toast.error(e?.message || (isRtl ? "فشل إصدار الفاتورة" : "Failed to generate PDF"));
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side={isRtl ? "left" : "right"} className="sm:max-w-lg w-full overflow-y-auto">
          <SheetHeader className="space-y-2 pb-4 border-b">
            <div className="flex items-center justify-between">
              <span className="font-mono text-base font-bold text-primary bg-primary/10 px-3 py-1 rounded-md">
                {invoice.invoiceNumber}
              </span>
              <Badge
                variant="outline"
                className={`text-xs font-semibold capitalize ${
                  invoice.status === "paid"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : invoice.status === "partially_paid"
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : invoice.status === "overdue"
                    ? "bg-rose-50 text-rose-700 border-rose-200 animate-pulse"
                    : "bg-slate-50 text-slate-700 border-slate-200"
                }`}
              >
                {invoice.status === "paid"
                  ? (isRtl ? "مدفوعة بالكامل" : "Paid")
                  : invoice.status === "partially_paid"
                  ? (isRtl ? "مدفوعة جزئياً" : "Partially Paid")
                  : invoice.status === "overdue"
                  ? (isRtl ? "متأخرة" : "Overdue")
                  : (isRtl ? "غير مدفوعة" : "Unpaid")}
              </Badge>
            </div>
            <SheetTitle className="text-xl font-bold font-serif">
              {isRtl ? "بيانات الفاتورة والدفعات" : "Invoice & Payment Ledger"}
            </SheetTitle>
            <SheetDescription className="text-xs">
              {isRtl ? "سجل السداد والمستحقات المالية" : "Financial settlement record"}
            </SheetDescription>
          </SheetHeader>

          <div className="py-5 space-y-6 text-sm">
            {/* Quick Actions Bar */}
            <div className="flex items-center gap-2">
              {canRecordPayment && (
                <Button
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="flex-1 gap-2 bg-primary text-primary-foreground font-semibold h-9"
                >
                  <Plus className="h-4 w-4" />
                  <span>{isRtl ? "تسجيل دفعة جديدة" : "Record Payment"}</span>
                </Button>
              )}

              <Button
                variant="outline"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="gap-2 h-9 border-primary/40 text-primary hover:bg-primary/5"
              >
                <Download className="h-4 w-4" />
                <span>{isRtl ? "تحميل PDF" : "Download PDF"}</span>
              </Button>
            </div>

            {/* Financial Status Summary Card */}
            <div className="bg-card border rounded-2xl p-4 shadow-xs space-y-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {isRtl ? "الملخص المالي" : "Financial Breakdown"}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-muted/40 rounded-xl border">
                  <div className="text-muted-foreground">{isRtl ? "إجمالي التعاقد:" : "Total Contract:"}</div>
                  <div className="font-bold text-sm text-foreground mt-0.5">{formatEGP(invoice.total)}</div>
                </div>

                <div className="p-3 bg-muted/40 rounded-xl border">
                  <div className="text-muted-foreground">{isRtl ? "الدفعة المقدمة المطلوبة:" : "Deposit Required:"}</div>
                  <div className="font-semibold text-sm text-foreground mt-0.5">{formatEGP(invoice.depositAmount)}</div>
                </div>

                <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/80 rounded-xl border">
                  <div className="text-emerald-700 dark:text-emerald-400 font-medium">{isRtl ? "المسدد حتى الآن:" : "Total Paid:"}</div>
                  <div className="font-bold text-base text-emerald-700 dark:text-emerald-400 mt-0.5">{formatEGP(invoice.paidAmount)}</div>
                </div>

                <div className="p-3 bg-primary/5 border-primary/20 rounded-xl border">
                  <div className="text-primary font-medium">{isRtl ? "المتبقي للاستحقاق:" : "Balance Remaining:"}</div>
                  <div className="font-bold text-base text-primary mt-0.5">{formatEGP(invoice.balanceDue)}</div>
                </div>
              </div>
            </div>

            {/* Linked Entities */}
            <div className="space-y-2 bg-card border rounded-xl p-4 shadow-xs text-xs">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                {isRtl ? "بيانات العميل والأمر" : "Client & Order Relationship"}
              </div>

              {invoice.customerName && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <UserCircle className="h-3.5 w-3.5 text-primary" />
                    {isRtl ? "العميل:" : "Customer:"}
                  </span>
                  <span className="font-semibold">{invoice.customerName} {invoice.customerPhone && `(${invoice.customerPhone})`}</span>
                </div>
              )}

              {invoice.orderNumber && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 text-secondary" />
                    {isRtl ? "أمر الإنتاج:" : "Order #:"}
                  </span>
                  <Link to="/admin/orders" className="font-mono font-bold text-primary hover:underline flex items-center gap-1">
                    <span>{invoice.orderNumber}</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )}

              {invoice.quoteId && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Receipt className="h-3.5 w-3.5 text-secondary" />
                    {isRtl ? "عرض السعر الأصلي:" : "Originating Quote:"}
                  </span>
                  <Link to="/admin/quotes/$id" params={{ id: invoice.quoteId }} className="font-mono font-bold text-primary hover:underline flex items-center gap-1">
                    <span>{invoice.invoiceNumber || (isRtl ? "عرض السعر" : "Quote")}</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )}

              {invoice.orderId && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 text-primary" />
                    {isRtl ? "مساحة عمل المشروع:" : "Project Workspace:"}
                  </span>
                  <Link to="/admin/projects/$id" params={{ id: invoice.orderId }} className="font-mono font-bold text-primary hover:underline flex items-center gap-1">
                    <span>{isRtl ? "عرض المشروع" : "View Project"}</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )}

              <div className="flex items-center justify-between pt-1 border-t border-border/60">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {isRtl ? "تاريخ الإصدار:" : "Issued Date:"}
                </span>
                <span className="font-medium">
                  {new Date(invoice.issuedAt).toLocaleDateString(isRtl ? "ar-EG" : "en-US")}
                </span>
              </div>
            </div>

            {/* Milestone Payments History */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Receipt className="h-4 w-4 text-primary" />
                  <span>{isRtl ? "سجل إيصالات السداد" : "Payment Receipts"}</span>
                </div>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {invoice.payments?.length || 0} {isRtl ? "إيصال" : "receipts"}
                </Badge>
              </div>

              {(!invoice.payments || invoice.payments.length === 0) ? (
                <div className="text-center p-6 border-2 border-dashed rounded-xl text-xs text-muted-foreground bg-muted/20">
                  {isRtl ? "لم يتم تسجيل أي دفعات حتى الآن" : "No payments recorded yet"}
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
                  {invoice.payments.map((p) => (
                    <div
                      key={p.id}
                      className="p-3 border rounded-xl bg-card hover:bg-muted/20 transition-colors space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-primary">{p.paymentNumber}</span>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {p.paymentMethod}
                          </Badge>
                        </div>
                        <span className="font-bold text-sm text-emerald-600">
                          {formatEGP(p.amount)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                        <span>
                          {new Date(p.paidAt).toLocaleDateString(isRtl ? "ar-EG" : "en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        {p.referenceNumber && <span>{p.referenceNumber}</span>}
                      </div>

                      {p.notes && (
                        <p className="text-[11px] text-foreground/80 bg-muted/40 p-1.5 rounded mt-1">
                          {p.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Payment Modal */}
      <RecordPaymentModal
        open={isPaymentModalOpen}
        onOpenChange={setIsPaymentModalOpen}
        invoice={invoice}
        onPaymentRecorded={() => {
          onRefresh();
        }}
      />
    </>
  );
}
