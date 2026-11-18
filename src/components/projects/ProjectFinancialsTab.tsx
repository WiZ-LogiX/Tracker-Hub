import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  DollarSign,
  Plus,
  Receipt,
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  FileCheck2,
  Loader2,
} from "lucide-react";
import { issueMilestoneInvoice } from "@/lib/invoice-payment.functions";
import type { ProjectWorkspaceData, ProjectInvoiceRecord } from "@/lib/project-types";

interface ProjectFinancialsTabProps {
  financials: ProjectWorkspaceData["financials"];
  onOpenRecordPayment?: (invoiceId?: string) => void;
  onRefresh?: () => void;
  currentUserRole?: string;
}

export function ProjectFinancialsTab({
  financials,
  onOpenRecordPayment,
  onRefresh,
  currentUserRole,
}: ProjectFinancialsTabProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");
  const issueInvoiceFn = useServerFn(issueMilestoneInvoice);
  const [issuingInvoiceId, setIssuingInvoiceId] = useState<string | null>(null);

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

  const handleIssueInvoice = async (invoiceId: string) => {
    setIssuingInvoiceId(invoiceId);
    try {
      const res = await issueInvoiceFn({ data: { invoiceId } });
      if (res.success) {
        toast.success(
          isAr
            ? `تم إصدار فاتورة المرحلة ${res.invoiceNumber} بنجاح`
            : `Milestone invoice ${res.invoiceNumber} issued successfully`,
        );
        onRefresh?.();
      }
    } catch (err: any) {
      toast.error(err?.message || (isAr ? "فشل إصدار فاتورة المرحلة" : "Failed to issue milestone invoice"));
    } finally {
      setIssuingInvoiceId(null);
    }
  };

  const getInvoiceStatusBadge = (status: ProjectInvoiceRecord["status"], billingStatus?: string) => {
    if (billingStatus === "scheduled") {
      return (
        <Badge variant="outline" className="border-dashed text-muted-foreground gap-1">
          <Clock className="w-3 h-3" />
          <span>{isAr ? "مجدولة" : "Scheduled"}</span>
        </Badge>
      );
    }
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

  const scheduledMilestones = (financials.totalScheduled ?? 0);
  const estimatedMargin = financials.estimatedMargin ?? 0;
  const estimatedCost = financials.estimatedCost ?? 0;
  const marginPct = financials.marginPct ?? 0;

  return (
    <div className="space-y-6">
      {/* Financial KPIs Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* 1. Project Total Value */}
        <div className="p-3.5 rounded-xl border bg-card space-y-1 shadow-xs">
          <span className="text-xs text-muted-foreground">{isAr ? "قيمة المشروع الإجمالية" : "Project Total Value"}</span>
          <p className="text-lg font-bold text-foreground">
            {financials.totalProjectValue.toLocaleString()}{" "}
            <span className="text-[11px] font-normal text-muted-foreground">{isAr ? "ج.م." : "EGP"}</span>
          </p>
        </div>

        {/* 2. Invoiced Total */}
        <div className="p-3.5 rounded-xl border bg-card space-y-1 shadow-xs">
          <span className="text-xs text-muted-foreground">{isAr ? "إجمالي الفواتير الصادرة" : "Invoiced Total"}</span>
          <p className="text-lg font-bold text-foreground">
            {financials.totalInvoiced.toLocaleString()}{" "}
            <span className="text-[11px] font-normal text-muted-foreground">{isAr ? "ج.م." : "EGP"}</span>
          </p>
        </div>

        {/* 3. Scheduled Milestones */}
        <div className="p-3.5 rounded-xl border bg-card space-y-1 shadow-xs">
          <span className="text-xs text-muted-foreground">{isAr ? "دفعات مجدولة قادمة" : "Scheduled Milestones"}</span>
          <p className="text-lg font-bold text-sky-600 dark:text-sky-400">
            {scheduledMilestones.toLocaleString()}{" "}
            <span className="text-[11px] font-normal text-muted-foreground">{isAr ? "ج.م." : "EGP"}</span>
          </p>
        </div>

        {/* 4. Total Collected */}
        <div className="p-3.5 rounded-xl border bg-card space-y-1 shadow-xs">
          <span className="text-xs text-muted-foreground">{isAr ? "إجمالي المحصل" : "Total Collected"}</span>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {financials.totalCollected.toLocaleString()}{" "}
            <span className="text-[11px] font-normal text-muted-foreground">{isAr ? "ج.م." : "EGP"}</span>
          </p>
        </div>

        {/* 5. Balance Due */}
        <div className="p-3.5 rounded-xl border bg-card space-y-1 shadow-xs">
          <span className="text-xs text-muted-foreground">{isAr ? "المتبقي للتحصيل" : "Balance Due"}</span>
          <p
            className={`text-lg font-bold ${
              financials.outstandingBalance > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {financials.outstandingBalance.toLocaleString()}{" "}
            <span className="text-[11px] font-normal text-muted-foreground">{isAr ? "ج.م." : "EGP"}</span>
          </p>
        </div>

        {/* 6. Estimated Gross Margin */}
        <div className="p-3.5 rounded-xl border bg-card space-y-1 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{isAr ? "هامش الربح التقديري" : "Estimated Margin"}</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {estimatedMargin.toLocaleString()}{" "}
            <span className="text-xs font-semibold">({marginPct}%)</span>
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            {isAr ? "تكلفة مباشرة: " : "Cost: "}{estimatedCost.toLocaleString()} {isAr ? "ج.م." : "EGP"}
          </p>
        </div>
      </div>

      {/* Payment Milestones Schedule Card */}
      <Card className="shadow-xs border-primary/20">
        <CardHeader className="p-4 pb-3 border-b flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-primary" />
            <CardTitle className="text-base font-bold">
              {isAr ? "جدول دفعات وفواتير مراحل المشروع" : "Project Milestone Billing Schedule"}
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {financials.invoices.length} {isAr ? "مراحل" : "milestones"}
            </Badge>
          </div>
          {onOpenRecordPayment && financials.invoices.some((i) => i.billingStatus !== "scheduled" && i.balanceDue > 0) && (
            <Button size="sm" onClick={() => onOpenRecordPayment()} className="gap-1.5 h-8">
              <Plus className="w-3.5 h-3.5" />
              <span>{isAr ? "تسجيل دفعة سداد" : "Record Payment"}</span>
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {financials.invoices.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground space-y-2">
              <Receipt className="w-8 h-8 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-medium">
                {isAr ? "لا توجد دفعات أو مراحل مجدولة لهذا المشروع بعد" : "No milestones scheduled for this project yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="px-4 py-3">{isAr ? "المرحلة" : "Milestone"}</th>
                    <th className="px-4 py-3">{isAr ? "رقم الفاتورة" : "Invoice #"}</th>
                    <th className="px-4 py-3">{isAr ? "النسبة" : "%"}</th>
                    <th className="px-4 py-3">{isAr ? "القيمة" : "Amount"}</th>
                    <th className="px-4 py-3">{isAr ? "المحصل" : "Paid"}</th>
                    <th className="px-4 py-3">{isAr ? "المستحق" : "Balance"}</th>
                    <th className="px-4 py-3">{isAr ? "الحالة" : "Status"}</th>
                    <th className="px-4 py-3 text-right rtl:text-left">{isAr ? "الإجراء" : "Action"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {financials.invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">
                        <div className="flex flex-col">
                          <span className="font-semibold text-xs">
                            {inv.milestoneLabel || (isAr ? `المرحلة ${inv.milestoneIndex ?? 1}` : `Milestone ${inv.milestoneIndex ?? 1}`)}
                          </span>
                          {inv.dueStage && (
                            <span className="text-[11px] text-muted-foreground">
                              {inv.dueStage}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground font-medium">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                        {inv.milestonePct ? `${inv.milestonePct}%` : "—"}
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {inv.total.toLocaleString()} {isAr ? "ج.م." : "EGP"}
                      </td>
                      <td className="px-4 py-3 text-emerald-600 font-semibold">
                        {inv.paidAmount.toLocaleString()} {isAr ? "ج.م." : "EGP"}
                      </td>
                      <td className="px-4 py-3 font-bold">
                        {inv.billingStatus === "scheduled" ? (
                          <span className="text-muted-foreground text-xs italic">
                            {isAr ? "مجدولة لاحقاً" : "Scheduled"}
                          </span>
                        ) : inv.balanceDue > 0 ? (
                          <span className="text-amber-600">
                            {inv.balanceDue.toLocaleString()} {isAr ? "ج.م." : "EGP"}
                          </span>
                        ) : (
                          <span className="text-emerald-600">0 {isAr ? "ج.م." : "EGP"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {getInvoiceStatusBadge(inv.status, inv.billingStatus)}
                      </td>
                      <td className="px-4 py-3 text-right rtl:text-left">
                        {inv.billingStatus === "scheduled" ? (
                          <Button
                            size="sm"
                            variant="default"
                            disabled={issuingInvoiceId === inv.id}
                            onClick={() => handleIssueInvoice(inv.id)}
                            className="h-7 text-xs gap-1 bg-sky-600 hover:bg-sky-700 text-white"
                          >
                            {issuingInvoiceId === inv.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Receipt className="w-3 h-3" />
                            )}
                            <span>{isAr ? "إصدار الفاتورة الآن" : "Issue Invoice"}</span>
                          </Button>
                        ) : inv.balanceDue > 0 && onOpenRecordPayment ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onOpenRecordPayment(inv.id)}
                            className="h-7 text-xs gap-1"
                          >
                            <DollarSign className="w-3 h-3" />
                            <span>{isAr ? "سداد" : "Pay"}</span>
                          </Button>
                        ) : (
                          <span className="inline-flex items-center text-xs text-emerald-600 font-medium gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{isAr ? "مسددة" : "Settled"}</span>
                          </span>
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
