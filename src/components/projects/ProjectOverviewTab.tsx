import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp,
  Package,
  Boxes,
  ShieldCheck,
  Truck,
  DollarSign,
  Plus,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  MessageSquare,
  Clock,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import type { ProjectWorkspaceData, HealthIndicator, HealthSeverity } from "@/lib/project-types";

interface ProjectOverviewTabProps {
  data: ProjectWorkspaceData;
  onOpenCreateTask?: () => void;
  onOpenRecordPayment?: () => void;
  onOpenCreateRemake?: () => void;
}

export function ProjectOverviewTab({
  data,
  onOpenCreateTask,
  onOpenRecordPayment,
  onOpenCreateRemake,
}: ProjectOverviewTabProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");

  const { header, commercial, orders, production, tasks, inventory, delivery, financials, quality } = data;

  const getSeverityStyle = (severity: HealthSeverity) => {
    switch (severity) {
      case "good":
        return {
          border: "border-emerald-200 dark:border-emerald-800",
          bg: "bg-emerald-50/50 dark:bg-emerald-950/20",
          badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
        };
      case "warning":
        return {
          border: "border-amber-200 dark:border-amber-800",
          bg: "bg-amber-50/50 dark:bg-amber-950/20",
          badge: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
          icon: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
        };
      case "critical":
        return {
          border: "border-rose-200 dark:border-rose-800",
          bg: "bg-rose-50/50 dark:bg-rose-950/20",
          badge: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
          icon: <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />,
        };
      case "neutral":
      default:
        return {
          border: "border-border",
          bg: "bg-muted/30",
          badge: "bg-muted text-muted-foreground",
          icon: <Clock className="w-4 h-4 text-muted-foreground" />,
        };
    }
  };

  const getDimensionIcon = (dimension: HealthIndicator["dimension"]) => {
    switch (dimension) {
      case "commercial":
        return <TrendingUp className="w-4 h-4" />;
      case "production":
        return <Package className="w-4 h-4" />;
      case "inventory":
        return <Boxes className="w-4 h-4" />;
      case "quality":
        return <ShieldCheck className="w-4 h-4" />;
      case "delivery":
        return <Truck className="w-4 h-4" />;
      case "financial":
        return <DollarSign className="w-4 h-4" />;
    }
  };

  const openTasks = tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  const overdueTasks = tasks.filter((t) => t.isOverdue);
  const activeRemakes = quality.remakes.filter((r) => r.status !== "resolved" && r.status !== "rejected" && r.status !== "cancelled");

  const whatsappUrl = header.customerPhone
    ? `https://wa.me/${header.customerPhone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
        isAr
          ? `مرحباً ${header.customerName}، بخصوص مشروع ${header.projectName} (${header.projectNumber}):`
          : `Hello ${header.customerName}, regarding project ${header.projectName} (${header.projectNumber}):`,
      )}`
    : null;

  return (
    <div className="space-y-6">
      {/* Quick Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-card border shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {isAr ? "إجراءات سريعة للمشروع:" : "Project Quick Actions:"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/admin/quotes/new"
            search={{ opportunityId: header.projectId, customerId: header.customerId }}
          >
            <Button size="sm" variant="default" className="gap-1.5 h-8">
              <Plus className="w-3.5 h-3.5" />
              <span>{isAr ? "إنشاء عرض سعر" : "New Quote"}</span>
            </Button>
          </Link>

          {onOpenCreateTask && (
            <Button size="sm" variant="outline" onClick={onOpenCreateTask} className="gap-1.5 h-8">
              <Plus className="w-3.5 h-3.5" />
              <span>{isAr ? "إضافة مهمة" : "Add Task"}</span>
            </Button>
          )}

          {onOpenRecordPayment && financials.invoices.length > 0 && financials.outstandingBalance > 0 && (
            <Button size="sm" variant="outline" onClick={onOpenRecordPayment} className="gap-1.5 h-8 text-emerald-600 hover:text-emerald-700">
              <DollarSign className="w-3.5 h-3.5" />
              <span>{isAr ? "تسجيل دفعة" : "Record Payment"}</span>
            </Button>
          )}

          {onOpenCreateRemake && orders.length > 0 && (
            <Button size="sm" variant="outline" onClick={onOpenCreateRemake} className="gap-1.5 h-8 text-rose-600 hover:text-rose-700">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{isAr ? "إبلاغ عن عيب" : "Report Defect"}</span>
            </Button>
          )}

          {whatsappUrl && (
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-emerald-600 hover:bg-emerald-50">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{isAr ? "مراسلة واتساب" : "WhatsApp"}</span>
              </Button>
            </a>
          )}
        </div>
      </div>

      {/* KPI Highlight Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-lg border bg-card space-y-1">
          <p className="text-xs text-muted-foreground">{isAr ? "عروض الأسعار" : "Quotes"}</p>
          <p className="text-lg font-bold text-foreground">
            {commercial.quotes.length}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {commercial.quotes.filter((q) => q.status === "accepted").length} {isAr ? "معتمد" : "Accepted"}
          </p>
        </div>

        <div className="p-3.5 rounded-lg border bg-card space-y-1">
          <p className="text-xs text-muted-foreground">{isAr ? "أوامر التنفيذ" : "Orders"}</p>
          <p className="text-lg font-bold text-foreground">{orders.length}</p>
          <p className="text-[11px] text-muted-foreground">
            {orders[0]?.currentStage || (isAr ? "لا توجد أوامر" : "None")}
          </p>
        </div>

        <div className="p-3.5 rounded-lg border bg-card space-y-1">
          <p className="text-xs text-muted-foreground">{isAr ? "تقدم التصنيع" : "Production"}</p>
          <p className="text-lg font-bold text-foreground">
            {production.completionPercentage}%
          </p>
          <Progress value={production.completionPercentage} className="h-1.5 mt-1" />
        </div>

        <div className="p-3.5 rounded-lg border bg-card space-y-1">
          <p className="text-xs text-muted-foreground">{isAr ? "جاهزية الخامات" : "Inventory"}</p>
          <p className="text-lg font-bold text-foreground">
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                inventory.readiness === "READY"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : inventory.readiness === "PARTIAL"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {inventory.readiness}
            </span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            {inventory.allocations.length} {isAr ? "عنصر محجوز" : "Reserved"}
          </p>
        </div>

        <div className="p-3.5 rounded-lg border bg-card space-y-1">
          <p className="text-xs text-muted-foreground">{isAr ? "المهام النشطة" : "Active Tasks"}</p>
          <p className="text-lg font-bold text-foreground">{openTasks.length}</p>
          <p className="text-[11px] text-muted-foreground">
            {overdueTasks.length > 0 ? (
              <span className="text-rose-600 font-semibold">
                {overdueTasks.length} {isAr ? "متأخرة" : "Overdue"}
              </span>
            ) : (
              <span className="text-emerald-600">{isAr ? "لا يوجد تأخير" : "On track"}</span>
            )}
          </p>
        </div>

        <div className="p-3.5 rounded-lg border bg-card space-y-1">
          <p className="text-xs text-muted-foreground">{isAr ? "ملاحظات الجودة" : "Quality Cases"}</p>
          <p className="text-lg font-bold text-foreground">{quality.remakes.length}</p>
          <p className="text-[11px] text-muted-foreground">
            {activeRemakes.length > 0 ? (
              <span className="text-rose-600 font-semibold">
                {activeRemakes.length} {isAr ? "نشط" : "Active"}
              </span>
            ) : (
              <span className="text-emerald-600">{isAr ? "لا توجد عيوب" : "0 defects"}</span>
            )}
          </p>
        </div>
      </div>

      {/* 6 Transparent Health Indicators Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold tracking-tight text-foreground">
            {isAr ? "التشخيص التشغيلي الشفاف (6 محاور)" : "Transparent Operational Diagnostics (6 Dimensions)"}
          </h2>
          <span className="text-xs text-muted-foreground">
            {isAr ? "مبني على البيانات الواقعية بدون خوارزميات اصطناعية" : "Real factual data with zero artificial scores"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {header.health.map((ind) => {
            const style = getSeverityStyle(ind.severity);
            return (
              <Card key={ind.dimension} className={`border ${style.border} ${style.bg} shadow-xs`}>
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-md bg-background border">
                        {getDimensionIcon(ind.dimension)}
                      </div>
                      <CardTitle className="text-sm font-bold">
                        {isAr ? ind.titleAr : ind.title}
                      </CardTitle>
                    </div>
                    <Badge variant="outline" className={`text-xs font-semibold ${style.badge}`}>
                      {isAr ? ind.statusTextAr : ind.statusText}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-1">
                  <div className="flex items-start gap-2 text-xs text-muted-foreground mt-1">
                    <div className="mt-0.5 shrink-0">{style.icon}</div>
                    <p className="leading-relaxed">
                      {isAr ? ind.detailAr : ind.detail}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
