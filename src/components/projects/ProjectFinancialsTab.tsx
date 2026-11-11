import React from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  Plus,
  Receipt,
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import type { ProjectWorkspaceData, ProjectInvoiceRecord } from "@/lib/project-types";

interface ProjectFinancialsTabProps {
  financials: ProjectWorkspaceData["financials"];
  onOpenRecordPayment?: (invoiceId?: string) => void;
  currentUserRole?: string;
}

export function ProjectFinancialsTab({
  financials,
  onOpenRecordPayment,
  currentUserRole,
}: ProjectFinancialsTabProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");

  if (currentUserRole === "worker") {
    return (
      <div className="p-8 text-center text-muted-foreground border rounded-xl bg-card">
        <DollarSign className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-sm font-medium">
          {isAr ? "البيانات المالية غير متاحة لحسابات الفنيين والعمال." : "Financial data is restricted for worker roles."}
        </p>
      </div>
    );
  }

  const getInvoiceStatusBadge = (status: ProjectInvoiceRecord["status"]) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">{isAr ? "مسدد بالكامل" : "Paid"}</Badge>;
      case "partially_paid":
        return <Badge className="bg-amber-600 hover:bg-amber-700 text-white">{isAr ? "سداد جزئي" : "Partial"}</Badge>;
      case "issued":
        return <Badge className="bg-blue-600 hover:bg-blue-700 text-white">{isAr ? "مستحقة" : "Issued"}</Badge>;
      case "void":
        return <Badge variant="destructive">{isAr ? "ملغاة" : "Void"}</Badge>;
      case "draft":
      default:
        return <Badge variant="outline">{isAr ? "مسودة" : "Draft"}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* 4 Financial KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border bg-card space-y-1 shadow-xs">
          <span className="text-xs text-muted-foreground">{isAr ? "إجمالي قيمة المشروع" : "Project Value"}</span>
          <p className="text-xl font-bold text-foreground">
            {financials.totalProjectValue.toLocaleString()}{" "}
            <span className="text-xs font-normal text-muted-foreground">{isAr ? "ج.م." : "EGP"}</span>
          </p>
        </div>

        <div className="p-4 rounded-xl border bg-card space-y-1 shadow-xs">
          <span className="text-xs text-muted-foreground">{isAr ? "إجمالي المفوتر" : "Invoiced Total"}</span>
          <p className="text-xl font-bold text-foreground">
            {financials.totalInvoiced.toLocaleString()}{" "}
            <span className="text-xs font-normal text-muted-foreground">{isAr ? "ج.م." : "EGP"}</span>
          </p>
        </div>

        <div className="p-4 rounded-xl border bg-card space-y-1 shadow-xs">
          <span className="text-xs text-muted-foreground">{isAr ? "إجمالي المحصل" : "Total Collected"}</span>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {financials.totalCollected.toLocaleString()}{" "}
            <span className="text-xs font-normal text-muted-foreground">{isAr ? "ج.م." : "EGP"}</span>
          </p>
        </div>

        <div className="p-4 rounded-xl border bg-card space-y-1 shadow-xs">
          <span className="text-xs text-muted-foreground">{isAr ? "المتبقي للتحصيل" : "Balance Due"}</span>
          <p
            className={`text-xl font-bold ${
              financials.outstandingBalance > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {financials.outstandingBalance.toLocaleString()}{" "}
            <span className="text-xs font-normal text-muted-foreground">{isAr ? "ج.م." : "EGP"}</span>
          </p>
        </div>
      </div>

      {/* Invoices Table */}
      <Card className="shadow-xs">
        <CardHeader className="p-4 pb-3 border-b flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary" />
            <CardTitle className="text-base font-bold">
              {isAr ? "الفواتير الصادرة للمشروع" : "Project Invoices"}
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {financials.invoices.length}
            </Badge>
          </div>
          {onOpenRecordPayment && financials.invoices.some((i) => i.balanceDue > 0) && (
            <Button size="sm" onClick={() => onOpenRecordPayment()} className="gap-1.5 h-8">
              <Plus className="w-3.5 h-3.5" />
              <span>{isAr ? "تسجيل دفعة سداد" : "Record Payment"}</span>
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {financials.invoices.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground space-y-2">
              <Receipt className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-medium">
                {isAr ? "لا توجد فواتير مصدرة لهذا المشروع بعد" : "No invoices issued for this project yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="px-4 py-3">{isAr ? "رقم الفاتورة" : "Invoice #"}</th>
                    <th className="px-4 py-3">{isAr ? "أمر التنفيذ" : "Order #"}</th>
                    <th className="px-4 py-3">{isAr ? "الإجمالي" : "Total"}</th>
                    <th className="px-4 py-3">{isAr ? "المسدد" : "Paid"}</th>
                    <th className="px-4 py-3">{isAr ? "المستحق" : "Balance Due"}</th>
                    <th className="px-4 py-3">{isAr ? "الحالة" : "Status"}</th>
                    <th className="px-4 py-3 text-right rtl:text-left">{isAr ? "الإجراءات" : "Actions"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {financials.invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-foreground">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-medium">
                        {inv.orderNumber || "—"}
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {inv.total.toLocaleString()} {isAr ? "ج.م." : "EGP"}
                      </td>
                      <td className="px-4 py-3 text-emerald-600 font-semibold">
                        {inv.paidAmount.toLocaleString()} {isAr ? "ج.م." : "EGP"}
                      </td>
                      <td className="px-4 py-3 font-bold text-foreground">
                        {inv.balanceDue > 0 ? (
                          <span className="text-amber-600">
                            {inv.balanceDue.toLocaleString()} {isAr ? "ج.م." : "EGP"}
                          </span>
                        ) : (
                          <span className="text-emerald-600">0 {isAr ? "ج.م." : "EGP"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{getInvoiceStatusBadge(inv.status)}</td>
                      <td className="px-4 py-3 text-right rtl:text-left">
                        {inv.balanceDue > 0 && onOpenRecordPayment && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onOpenRecordPayment(inv.id)}
                            className="h-7 text-xs gap-1"
                          >
                            <DollarSign className="w-3 h-3" />
                            <span>{isAr ? "سداد" : "Pay"}</span>
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payments Ledger Table */}
      <Card className="shadow-xs">
        <CardHeader className="p-4 pb-3 border-b flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            <CardTitle className="text-base font-bold">
              {isAr ? "سجل الدفعات والتحصيلات" : "Payment Ledger"}
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {financials.payments.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {financials.payments.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground space-y-2">
              <CreditCard className="w-8 h-8 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-medium">
                {isAr ? "لا توجد دفعات محصلة مسجلة بعد" : "No payments collected yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="px-4 py-3">{isAr ? "رقم إيصال السداد" : "Receipt #"}</th>
                    <th className="px-4 py-3">{isAr ? "الفاتورة" : "Invoice #"}</th>
                    <th className="px-4 py-3">{isAr ? "المبلغ" : "Amount"}</th>
                    <th className="px-4 py-3">{isAr ? "طريقة الدفع" : "Method"}</th>
                    <th className="px-4 py-3">{isAr ? "رقم المرجع" : "Ref #"}</th>
                    <th className="px-4 py-3 text-right rtl:text-left">{isAr ? "تاريخ السداد" : "Date"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {financials.payments.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-foreground">
                        {p.paymentNumber}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-medium">
                        {p.invoiceNumber}
                      </td>
                      <td className="px-4 py-3 font-bold text-emerald-600">
                        {p.amount.toLocaleString()} {isAr ? "ج.م." : "EGP"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground capitalize">
                        {p.paymentMethod}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                        {p.referenceNumber || "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground text-right rtl:text-left" dir="ltr">
                        {typeof p.paidAt === "string" ? p.paidAt.slice(0, 10) : new Date(p.paidAt).toISOString().slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
