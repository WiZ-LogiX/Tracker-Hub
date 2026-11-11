import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Package,
  Wrench,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  Calendar,
} from "lucide-react";
import type { ProjectWorkspaceData } from "@/lib/project-types";
import type { WorkOrderStatus, WorkOrderPriority } from "@/lib/work-order-types";

interface ProjectProductionTabProps {
  production: ProjectWorkspaceData["production"];
  orders: ProjectWorkspaceData["orders"];
}

export function ProjectProductionTab({ production, orders }: ProjectProductionTabProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");

  const getStatusBadge = (status: WorkOrderStatus) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">{isAr ? "مكتمل" : "Completed"}</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-600 hover:bg-blue-700 text-white">{isAr ? "قيد التشغيل" : "In Progress"}</Badge>;
      case "qc_pending":
        return <Badge className="bg-purple-600 hover:bg-purple-700 text-white">{isAr ? "بانتظار الفحص" : "QC Pending"}</Badge>;
      case "ready":
        return <Badge className="bg-amber-600 hover:bg-amber-700 text-white">{isAr ? "جاهز للبدء" : "Ready"}</Badge>;
      case "cancelled":
        return <Badge variant="destructive">{isAr ? "ملغي" : "Cancelled"}</Badge>;
      case "draft":
      default:
        return <Badge variant="outline">{isAr ? "مسودة" : "Draft"}</Badge>;
    }
  };

  const getPriorityBadge = (priority: WorkOrderPriority) => {
    switch (priority) {
      case "critical":
        return <Badge variant="destructive" className="text-[10px]">{isAr ? "حرج" : "Critical"}</Badge>;
      case "high":
        return <Badge className="bg-amber-600 text-white text-[10px]">{isAr ? "عالي" : "High"}</Badge>;
      case "low":
        return <Badge variant="secondary" className="text-[10px]">{isAr ? "منخفض" : "Low"}</Badge>;
      case "medium":
      default:
        return <Badge variant="outline" className="text-[10px]">{isAr ? "متوسط" : "Medium"}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Production Progress Header */}
      <Card className="shadow-xs">
        <CardHeader className="p-4 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              <CardTitle className="text-base font-bold">
                {isAr ? "متابعة أوامر التشغيل وخط التصنيع" : "Production Orders & Shop-Floor Execution"}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">
                {production.completionPercentage}% {isAr ? "مكتمل" : "Completed"}
              </span>
            </div>
          </div>
          <Progress value={production.completionPercentage} className="h-2 mt-3" />
        </CardHeader>
        <CardContent className="p-4 pt-2 text-xs text-muted-foreground flex flex-wrap items-center gap-4">
          <div>
            <span>{isAr ? "المرحلة الحالية لأمر التنفيذ:" : "Active Stage:"} </span>
            <span className="font-semibold text-foreground capitalize">
              {production.activeStage || (isAr ? "لا توجد مرحلة نشطة" : "None")}
            </span>
          </div>
          <div>
            <span>{isAr ? "إجمالي أوامر التشغيل:" : "Total Work Orders:"} </span>
            <span className="font-semibold text-foreground">{production.workOrders.length}</span>
          </div>
          <div>
            <span>{isAr ? "أوامر التشغيل المنجزة:" : "Completed Work Orders:"} </span>
            <span className="font-semibold text-emerald-600">
              {production.workOrders.filter((w) => w.status === "completed").length}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Work Orders Table */}
      <Card className="shadow-xs">
        <CardHeader className="p-4 pb-3 border-b flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            <CardTitle className="text-base font-bold">
              {isAr ? "أوامر تشغيل الورشة (Work Orders)" : "Shop-Floor Work Orders"}
            </CardTitle>
          </div>
          <Link to="/admin/work-orders">
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs">
              <span>{isAr ? "إدارة أوامر التشغيل" : "Manage Work Orders"}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {production.workOrders.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground space-y-3">
              <Package className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-medium">
                {isAr ? "لا توجد أوامر تشغيل صادرة لهذا المشروع بعد" : "No work orders issued for this project yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="px-4 py-3">{isAr ? "رقم أمر التشغيل" : "WO #"}</th>
                    <th className="px-4 py-3">{isAr ? "أمر البيع" : "Order #"}</th>
                    <th className="px-4 py-3">{isAr ? "الحالة" : "Status"}</th>
                    <th className="px-4 py-3">{isAr ? "الأولوية" : "Priority"}</th>
                    <th className="px-4 py-3">{isAr ? "تاريخ الجدولة" : "Scheduled Date"}</th>
                    <th className="px-4 py-3">{isAr ? "ملاحظات" : "Notes"}</th>
                    <th className="px-4 py-3 text-right rtl:text-left">{isAr ? "تاريخ الإنشاء" : "Created"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {production.workOrders.map((w) => (
                    <tr key={w.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-foreground">
                        {w.workOrderNumber}
                      </td>
                      <td className="px-4 py-3 font-medium text-muted-foreground">
                        {w.orderNumber}
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(w.status)}</td>
                      <td className="px-4 py-3">{getPriorityBadge(w.priority)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground" dir="ltr">
                        {w.scheduledDate || "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">
                        {w.notes || "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground text-right rtl:text-left" dir="ltr">
                        {typeof w.createdAt === "string" ? w.createdAt.slice(0, 10) : new Date(w.createdAt).toISOString().slice(0, 10)}
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
