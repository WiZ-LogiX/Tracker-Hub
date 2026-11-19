import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { issueMilestoneInvoice } from "@/lib/invoice-payment.functions";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Truck,
  ExternalLink,
  MapPin,
  Calendar,
  CheckCircle2,
  Clock,
  User,
  Wrench,
  Copy,
  DollarSign,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { formatEGP } from "@/lib/pricing";
import type { ProjectWorkspaceData } from "@/lib/project-types";
import type { DeliveryHandover } from "@/lib/delivery-types";

interface ProjectDeliveryTabProps {
  delivery: ProjectWorkspaceData["delivery"];
  onRefresh?: () => void;
}

export function ProjectDeliveryTab({ delivery, onRefresh }: ProjectDeliveryTabProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");

  const issueInvoiceFn = useServerFn(issueMilestoneInvoice);
  const [issuingInvoiceId, setIssuingInvoiceId] = React.useState<string | null>(null);

  const scheduledInvoices = React.useMemo(() => {
    const invMap = new Map<string, any>();
    for (const h of delivery.handovers) {
      for (const inv of h.scheduledMilestoneInvoices || []) {
        if (!invMap.has(inv.id)) {
          invMap.set(inv.id, inv);
        }
      }
    }
    return Array.from(invMap.values());
  }, [delivery.handovers]);

  const handleCopyTrackingLink = (token: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/track?ref=${token}`;
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(url);
      toast.success(
        isAr ? "تم نسخ رابط متابعة العميل للحافظة" : "Client tracking link copied to clipboard",
      );
    } else {
      toast.info(url);
    }
  };

  const handleIssueMilestone = async (invoiceId: string) => {
    setIssuingInvoiceId(invoiceId);
    try {
      const res = await issueInvoiceFn({ data: { invoiceId } });
      toast.success(
        isAr
          ? `تم إصدار الفاتورة المرحلية بنجاح (${res.invoiceNumber})`
          : `Milestone invoice issued successfully (${res.invoiceNumber})`,
      );
      onRefresh?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to issue milestone invoice");
    } finally {
      setIssuingInvoiceId(null);
    }
  };

  const getStatusBadge = (status: DeliveryHandover["status"]) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">{isAr ? "تم التسليم بنجاح" : "Completed"}</Badge>;
      case "delivered":
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">{isAr ? "وصل للموقع" : "Delivered"}</Badge>;
      case "installed":
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">{isAr ? "تم التركيب" : "Installed"}</Badge>;
      case "installation_pending":
        return <Badge className="bg-purple-600 hover:bg-purple-700 text-white">{isAr ? "قيد التركيب" : "Installation Pending"}</Badge>;
      case "out_for_delivery":
        return <Badge className="bg-blue-600 hover:bg-blue-700 text-white">{isAr ? "في الطريق" : "Out for Delivery"}</Badge>;
      case "dispatched":
        return <Badge className="bg-blue-600 hover:bg-blue-700 text-white">{isAr ? "خرج من المصنع" : "Dispatched"}</Badge>;
      case "ready_for_dispatch":
        return <Badge className="bg-amber-600 hover:bg-amber-700 text-white">{isAr ? "جاهز للشحن" : "Ready for Dispatch"}</Badge>;
      case "delivery_failed":
      case "cancelled":
        return <Badge variant="destructive">{isAr ? "فشل / ملغي" : "Failed"}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Scheduled Milestone Invoices Prompt Banner */}
      {scheduledInvoices.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/10 shadow-xs">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between border-b border-amber-500/20">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-amber-600" />
              <CardTitle className="text-sm font-bold text-amber-900 dark:text-amber-200">
                {isAr
                  ? "مطالبات مالية مرحلية مجدولة مستحقة عند التوريد / التركيب"
                  : "Scheduled Milestone Invoices Due Upon Delivery"}
              </CardTitle>
              <Badge className="bg-amber-600 text-white text-xs">{scheduledInvoices.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-2.5">
            {scheduledInvoices.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between bg-card p-3 rounded-xl border border-amber-500/20 text-xs"
              >
                <div>
                  <span className="font-mono font-bold text-primary">{inv.invoiceNumber}</span>
                  <span className="text-muted-foreground mx-2">•</span>
                  <span className="font-semibold">{inv.milestoneLabel || (isAr ? "دفعة مرحلية" : "Milestone Payment")}</span>
                  {inv.milestonePct && (
                    <span className="text-muted-foreground ml-1">({inv.milestonePct}%)</span>
                  )}
                  <div className="font-mono font-bold text-emerald-600 mt-1">
                    {formatEGP(Number(inv.amount))}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleIssueMilestone(inv.id)}
                  disabled={issuingInvoiceId === inv.id}
                  className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-1.5 px-3"
                >
                  {issuingInvoiceId === inv.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>{isAr ? "إصدار الفاتورة الآن" : "Issue Invoice"}</span>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="shadow-xs">
        <CardHeader className="p-4 pb-3 border-b flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            <CardTitle className="text-base font-bold">
              {isAr ? "شحنات التوريد والتركيبات الموقعية" : "Delivery Handovers & Site Installations"}
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {delivery.handovers.length}
            </Badge>
          </div>
          <Link to="/admin/deliveries">
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs">
              <span>{isAr ? "إدارة التوصيل والتسليم" : "Deliveries Workspace"}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {delivery.handovers.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground space-y-2">
              <Truck className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-medium">
                {isAr ? "لا توجد شحنات توريد مسجلة لهذا المشروع بعد" : "No delivery handovers recorded for this project yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="px-4 py-3">{isAr ? "رقم الشحنة" : "Delivery #"}</th>
                    <th className="px-4 py-3">{isAr ? "أمر التنفيذ" : "Order #"}</th>
                    <th className="px-4 py-3">{isAr ? "الحالة" : "Status"}</th>
                    <th className="px-4 py-3">{isAr ? "عنوان الموقع والمستلم" : "Site & Recipient"}</th>
                    <th className="px-4 py-3">{isAr ? "تاريخ الجدولة" : "Scheduled Date"}</th>
                    <th className="px-4 py-3">{isAr ? "التركيب" : "Installation"}</th>
                    <th className="px-4 py-3 text-right rtl:text-left">{isAr ? "إجراءات" : "Actions"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {delivery.handovers.map((d) => (
                    <tr key={d.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-foreground">
                        {d.deliveryNumber}
                      </td>
                      <td className="px-4 py-3 font-medium text-muted-foreground">
                        {d.orderNumber}
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(d.status)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 font-medium text-foreground">
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate max-w-[200px]">{d.deliveryAddress}</span>
                        </div>
                        {d.recipientName && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {d.recipientName} {d.recipientPhone && `(${d.recipientPhone})`}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground" dir="ltr">
                        {d.scheduledDate || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {d.installationRequired ? (
                          <Badge variant="outline" className="text-xs gap-1 border-primary text-primary">
                            <Wrench className="w-3 h-3" />
                            <span>{isAr ? "مطلوب تركيب" : "Required"}</span>
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">{isAr ? "توريد فقط" : "Delivery only"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right rtl:text-left">
                        <div className="flex items-center justify-end rtl:justify-start gap-1.5">
                          {d.trackingToken && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleCopyTrackingLink(d.trackingToken!)}
                              title={isAr ? "نسخ رابط متابعة العميل" : "Copy Client Tracking Link"}
                              className="h-7 px-2 text-xs text-primary gap-1"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">
                                {isAr ? "رابط المتابعة" : "Tracking"}
                              </span>
                            </Button>
                          )}
                          <Link to="/admin/deliveries" search={{ deliveryId: d.id }}>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1">
                              <span>{isAr ? "تفاصيل" : "View"}</span>
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                          </Link>
                        </div>
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
