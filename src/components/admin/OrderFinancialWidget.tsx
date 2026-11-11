import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { listInvoices } from "@/lib/invoice-payment.functions";
import { generatePdf } from "@/lib/pdf.functions";
import type { InvoiceItem } from "@/lib/invoice-types";
import { formatEGP } from "@/lib/pricing";
import { RecordPaymentModal } from "@/components/invoices/RecordPaymentModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Receipt, DollarSign, Download, Plus, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface OrderFinancialWidgetProps {
  orderId: string;
  invoiceId?: string | null;
  onPaymentRecorded?: () => void;
  userRole?: string;
}

export function OrderFinancialWidget({
  orderId,
  invoiceId,
  onPaymentRecorded,
  userRole,
}: OrderFinancialWidgetProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const listInvoicesFn = useServerFn(listInvoices);
  const pdfFn = useServerFn(generatePdf);

  const [invoice, setInvoice] = useState<InvoiceItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const loadInvoice = async () => {
    setLoading(true);
    try {
      const invoicesList = await listInvoicesFn({
        data: {
          orderId,
        },
      });
      if (invoicesList && invoicesList.length > 0) {
        setInvoice(invoicesList[0]);
      }
    } catch (e) {
      console.error("Failed to load order invoice", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orderId) {
      loadInvoice();
    }
  }, [orderId, invoiceId]);

  const canRecord = userRole !== "worker" && userRole !== "viewer" && invoice && invoice.balanceDue > 0;

  const handleDownloadPdf = async () => {
    if (!invoice) return;
    setDownloadingPdf(true);
    try {
      const { downloadUrl } = await pdfFn({
        data: { entityType: "invoice", entityId: invoice.id },
      });
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e?.message || "Failed to download invoice");
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (!invoice && !loading) {
    return null;
  }

  return (
    <div className="pt-3 border-t space-y-2.5">
      {/* Widget Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary" />
          <span className="font-semibold text-xs text-foreground">
            {isRtl ? "المستحقات والتحصيل المالي" : "Financial & Payments Ledger"}
          </span>
          {invoice && (
            <Badge
              variant="outline"
              className={`text-[10px] capitalize px-1.5 py-0 ${
                invoice.status === "paid"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : invoice.status === "partially_paid"
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-slate-50 text-slate-700 border-slate-200"
              }`}
            >
              {invoice.status === "paid"
                ? (isRtl ? "مسدد" : "Paid")
                : invoice.status === "partially_paid"
                ? (isRtl ? "مسدد جزئياً" : "Partial")
                : (isRtl ? "غير مسدد" : "Unpaid")}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {canRecord && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsPaymentModalOpen(true)}
              className="h-6 px-2 text-[11px] gap-1 text-primary hover:bg-primary/10"
            >
              <Plus className="h-3 w-3" />
              <span>{isRtl ? "تسجيل دفعة" : "Add Payment"}</span>
            </Button>
          )}

          {invoice && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              title={isRtl ? "تحميل الفاتورة PDF" : "Download PDF"}
            >
              <Download className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Financial Details Row */}
      {invoice && (
        <div className="grid grid-cols-3 gap-2 bg-muted/40 p-2.5 rounded-xl border text-xs">
          <div>
            <div className="text-[10px] text-muted-foreground">{isRtl ? "إجمالي الأمر:" : "Total:"}</div>
            <div className="font-bold text-foreground">{formatEGP(invoice.total)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">{isRtl ? "المحصل:" : "Collected:"}</div>
            <div className="font-bold text-emerald-600">{formatEGP(invoice.paidAmount)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">{isRtl ? "المتبقي:" : "Balance Due:"}</div>
            <div className="font-bold text-primary">{formatEGP(invoice.balanceDue)}</div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      <RecordPaymentModal
        open={isPaymentModalOpen}
        onOpenChange={setIsPaymentModalOpen}
        invoice={invoice}
        onPaymentRecorded={() => {
          loadInvoice();
          if (onPaymentRecorded) onPaymentRecorded();
        }}
      />
    </div>
  );
}
