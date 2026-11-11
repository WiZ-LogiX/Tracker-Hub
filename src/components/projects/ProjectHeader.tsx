import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Briefcase,
  User,
  Phone,
  MapPin,
  FileText,
  Package,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  ShieldCheck,
  TrendingUp,
  Truck,
  DollarSign,
  Boxes,
} from "lucide-react";
import type { ProjectHeaderData, HealthIndicator, HealthSeverity } from "@/lib/project-types";

interface ProjectHeaderProps {
  header: ProjectHeaderData;
  onOpenCustomer360?: (customerId: string) => void;
}

export function ProjectHeader({ header, onOpenCustomer360 }: ProjectHeaderProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");

  const getSeverityBadge = (severity: HealthSeverity) => {
    switch (severity) {
      case "good":
        return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800";
      case "warning":
        return "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400 border-amber-200 dark:border-amber-800";
      case "critical":
        return "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400 border-rose-200 dark:border-rose-800";
      case "neutral":
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  const getDimensionIcon = (dimension: HealthIndicator["dimension"]) => {
    switch (dimension) {
      case "commercial":
        return <TrendingUp className="w-3.5 h-3.5" />;
      case "production":
        return <Package className="w-3.5 h-3.5" />;
      case "inventory":
        return <Boxes className="w-3.5 h-3.5" />;
      case "quality":
        return <ShieldCheck className="w-3.5 h-3.5" />;
      case "delivery":
        return <Truck className="w-3.5 h-3.5" />;
      case "financial":
        return <DollarSign className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="rounded-xl border bg-card p-5 shadow-xs space-y-4">
      {/* Top Bar: Project ID, Stage, Status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20">
            {header.projectNumber}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {header.projectName}
          </h1>
          <Badge variant="outline" className="text-xs capitalize font-medium">
            {header.projectType}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            className={`text-xs px-3 py-1 font-medium capitalize ${
              header.status === "won"
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : header.status === "lost"
                  ? "bg-rose-600 hover:bg-rose-700 text-white"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            {isAr ? header.stageLabelAr : header.stageLabel}
          </Badge>
        </div>
      </div>

      {/* Meta Grid: Customer, Sales Owner, Value, Outstanding, Site */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 pt-2 border-t text-sm">
        {/* Customer */}
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <User className="w-3.5 h-3.5" />
            {isAr ? "العميل" : "Customer"}
          </span>
          <div className="font-semibold truncate">
            {onOpenCustomer360 ? (
              <button
                type="button"
                onClick={() => onOpenCustomer360(header.customerId)}
                className="text-primary hover:underline flex items-center gap-1 text-left truncate cursor-pointer"
              >
                <span className="truncate">{header.customerName}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </button>
            ) : (
              <Link
                to="/admin/customers"
                className="text-primary hover:underline flex items-center gap-1 text-left truncate"
              >
                <span className="truncate">{header.customerName}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </Link>
            )}
          </div>
          {header.customerPhone && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="w-3 h-3" />
              <span dir="ltr">{header.customerPhone}</span>
            </p>
          )}
        </div>

        {/* Sales Owner */}
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Briefcase className="w-3.5 h-3.5" />
            {isAr ? "المسؤول التجاري" : "Sales Owner"}
          </span>
          <p className="font-semibold text-foreground truncate">
            {header.salesOwnerName || (isAr ? "غير محدد" : "Unassigned")}
          </p>
        </div>

        {/* Total Value */}
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">
            {isAr ? "القيمة الإجمالية" : "Project Value"}
          </span>
          <p className="font-bold text-foreground text-base">
            {header.totalValue.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{isAr ? "ج.م." : "EGP"}</span>
          </p>
        </div>

        {/* Outstanding Balance */}
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">
            {isAr ? "المبلغ المستحق" : "Outstanding Balance"}
          </span>
          <p className={`font-bold text-base ${header.outstandingBalance > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
            {header.outstandingBalance.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{isAr ? "ج.م." : "EGP"}</span>
          </p>
        </div>

        {/* Main Quote */}
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" />
            {isAr ? "عرض السعر الرئيسي" : "Main Quote"}
          </span>
          {header.mainQuote ? (
            <Link
              to="/admin/quotes/$id"
              params={{ id: header.mainQuote.id }}
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 truncate"
            >
              <span>{header.mainQuote.quoteNumber}</span>
              <span className="text-muted-foreground">({header.mainQuote.total.toLocaleString()} {isAr ? "ج.م." : "EGP"})</span>
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>

        {/* Main Order */}
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Package className="w-3.5 h-3.5" />
            {isAr ? "أمر التنفيذ" : "Main Order"}
          </span>
          {header.mainOrder ? (
            <Link
              to="/admin/orders"
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 truncate"
            >
              <span>{header.mainOrder.orderNumber}</span>
              <Badge variant="secondary" className="text-[10px] py-0 px-1 font-normal">
                {header.mainOrder.currentStage}
              </Badge>
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </div>

      {/* Primary Site Info if available */}
      {header.primarySite && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span>{header.primarySite}</span>
        </div>
      )}

      {/* Transparent Health Indicators Strip (6 Dimensions) */}
      <div className="pt-3 border-t">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {isAr ? "مؤشرات الحالة التشغيلية:" : "Health Indicators:"}
          </span>
          {header.health.map((ind) => (
            <div
              key={ind.dimension}
              title={isAr ? ind.detailAr : ind.detail}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium cursor-help transition-colors ${getSeverityBadge(
                ind.severity,
              )}`}
            >
              {getDimensionIcon(ind.dimension)}
              <span className="font-semibold">{isAr ? ind.titleAr : ind.title}:</span>
              <span>{isAr ? ind.statusTextAr : ind.statusText}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
