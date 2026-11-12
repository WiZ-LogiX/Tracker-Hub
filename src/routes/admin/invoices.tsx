import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/useAuth";
import { listInvoices, getInvoiceById } from "@/lib/invoice-payment.functions";
import { generatePdf } from "@/lib/pdf.functions";
import type { InvoiceItem } from "@/lib/invoice-types";
import { formatEGP } from "@/lib/pricing";
import { InvoiceFilterBar } from "@/components/invoices/InvoiceFilterBar";
import { InvoiceDetailDrawer } from "@/components/invoices/InvoiceDetailDrawer";
import { RecordPaymentModal } from "@/components/invoices/RecordPaymentModal";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Receipt,
  Download,
  Plus,
  ExternalLink,
  DollarSign,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/invoices")({
  component: InvoicesPage,
});

function InvoicesPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const { currentRole } = useAuth();
  const queryClient = useQueryClient();

  const listInvoicesFn = useServerFn(listInvoices);
  const getInvoiceByIdFn = useServerFn(getInvoiceById);
  const pdfFn = useServerFn(generatePdf);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [paymentModalInvoice, setPaymentModalInvoice] = useState<InvoiceItem | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // TanStack Query for Invoices
  const { data: invoices = [], isLoading, refetch } = useQuery({
    queryKey: ["invoices", status, search],
    queryFn: async () => {
      const s = status !== "all" ? (status as any) : undefined;
      const res = await listInvoicesFn({
        data: {
          status: s,
          search: search || undefined,
        },
      });
      return (res as unknown as InvoiceItem[]) || [];
    },
  });

  // Calculate totals for KPI header
  const totals = useMemo(() => {
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;

    for (const inv of invoices) {
      totalInvoiced += inv.total;
      totalPaid += inv.paidAmount;
      totalOutstanding += inv.balanceDue;
    }
    return { totalInvoiced, totalPaid, totalOutstanding };
  }, [invoices]);

  const handleOpenDetail = async (invoice: InvoiceItem) => {
    try {
      const detailed = await getInvoiceByIdFn({
        data: { invoiceId: invoice.id },
      });
      setSelectedInvoice(detailed as unknown as InvoiceItem);
    } catch {
      setSelectedInvoice(invoice);
    }
    setIsDetailOpen(true);
  };

  const handleOpenPayment = (invoice: InvoiceItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPaymentModalInvoice(invoice);
    setIsPaymentModalOpen(true);
  };

  const handleDownloadPdf = async (invoice: InvoiceItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!invoice?.id) {
      toast.error(isRtl ? "بيانات الفاتورة غير مكتملة" : "Invoice ID missing");
      return;
    }
    try {
      const { downloadUrl } = await pdfFn({
        data: { entityType: "invoice", entityId: invoice.id },
      });
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error(err?.message || (isRtl ? "فشل تحميل الفاتورة" : "Failed to download invoice"));
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2.5 text-foreground">
            <Receipt className="h-7 w-7 text-primary" />
            <span>{isRtl ? "الفواتير وسجل التحصيل" : "Invoices & Payments Ledger"}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isRtl
              ? "متابعة دفعات التعاقد، استحقاقات أوامر الإنتاج، وإيصالات السداد المالية"
              : "Track milestone contract payments, order balances, and payment receipts"}
          </p>
        </div>
      </div>

      {/* KPI & Filter Bar */}
      <InvoiceFilterBar
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={setStatus}
        totalInvoiced={totals.totalInvoiced}
        totalPaid={totals.totalPaid}
        totalOutstanding={totals.totalOutstanding}
      />

      {/* Invoices Table Card */}
      <Card className="border rounded-2xl shadow-xs overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-32">{isRtl ? "رقم الفاتورة" : "Invoice #"}</TableHead>
                <TableHead>{isRtl ? "العميل" : "Customer"}</TableHead>
                <TableHead>{isRtl ? "أمر الإنتاج" : "Order #"}</TableHead>
                <TableHead>{isRtl ? "إجمالي الفاتورة" : "Total"}</TableHead>
                <TableHead>{isRtl ? "المسدد" : "Paid"}</TableHead>
                <TableHead>{isRtl ? "المتبقي" : "Balance Due"}</TableHead>
                <TableHead>{isRtl ? "الحالة" : "Status"}</TableHead>
                <TableHead>{isRtl ? "تاريخ الإصدار" : "Issued Date"}</TableHead>
                <TableHead className="text-center w-36">{isRtl ? "الإجراءات" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-muted-foreground text-sm">
                    {isRtl ? "جاري تحميل سجل الفواتير..." : "Loading invoices ledger..."}
                  </TableCell>
                </TableRow>
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    <div className="space-y-1">
                      <Receipt className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="font-semibold text-sm">
                        {isRtl ? "لا توجد فواتير مطابقة للبحث" : "No invoices found"}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((inv) => (
                  <TableRow
                    key={inv.id}
                    className="hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => handleOpenDetail(inv)}
                  >
                    <TableCell className="font-mono text-xs font-bold text-primary">
                      {inv.invoiceNumber}
                    </TableCell>

                    <TableCell>
                      <div className="font-medium text-sm text-foreground">
                        {inv.customerName ?? "—"}
                      </div>
                      {inv.customerPhone && (
                        <div className="text-[11px] text-muted-foreground">{inv.customerPhone}</div>
                      )}
                    </TableCell>

                    <TableCell>
                      {inv.orderNumber ? (
                        <Link
                          to="/admin/orders"
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono text-xs text-primary hover:underline font-semibold flex items-center gap-1"
                        >
                          <span>{inv.orderNumber}</span>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>

                    <TableCell className="font-semibold text-sm text-foreground">
                      {formatEGP(inv.total)}
                    </TableCell>

                    <TableCell className="font-semibold text-sm text-emerald-600">
                      {formatEGP(inv.paidAmount)}
                    </TableCell>

                    <TableCell className="font-bold text-sm text-primary">
                      {formatEGP(inv.balanceDue)}
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[11px] capitalize font-medium ${
                          inv.status === "paid"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : inv.status === "partially_paid"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : inv.status === "overdue"
                            ? "bg-rose-50 text-rose-700 border-rose-200 animate-pulse"
                            : "bg-slate-50 text-slate-700 border-slate-200"
                        }`}
                      >
                        {inv.status === "paid"
                          ? (isRtl ? "مسددة" : "Paid")
                          : inv.status === "partially_paid"
                          ? (isRtl ? "جزئية" : "Partial")
                          : inv.status === "overdue"
                          ? (isRtl ? "متأخرة" : "Overdue")
                          : (isRtl ? "غير مسددة" : "Unpaid")}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(inv.issuedAt).toLocaleDateString(isRtl ? "ar-EG" : "en-US")}
                    </TableCell>

                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        {inv.balanceDue > 0 && currentRole !== "worker" && currentRole !== "viewer" && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={(e) => handleOpenPayment(inv, e)}
                            className="h-7 px-2 text-[11px] bg-primary text-primary-foreground gap-1"
                          >
                            <Plus className="h-3 w-3" />
                            <span>{isRtl ? "دفعة" : "Pay"}</span>
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => handleDownloadPdf(inv, e)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          title={isRtl ? "تحميل PDF" : "Download PDF"}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenDetail(inv)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          title={isRtl ? "عرض التفاصيل" : "View"}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Invoice Detail Drawer */}
      <InvoiceDetailDrawer
        invoice={selectedInvoice}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onRefresh={() => {
          refetch();
          if (selectedInvoice) {
            getInvoiceByIdFn({ data: { invoiceId: selectedInvoice.id } }).then((res) => {
              setSelectedInvoice(res as unknown as InvoiceItem);
            });
          }
        }}
        userRole={currentRole || undefined}
      />

      {/* Record Payment Modal */}
      <RecordPaymentModal
        open={isPaymentModalOpen}
        onOpenChange={setIsPaymentModalOpen}
        invoice={paymentModalInvoice}
        onPaymentRecorded={() => {
          refetch();
        }}
      />
    </div>
  );
}
