import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  Plus,
  ExternalLink,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import type { ProjectWorkspaceData } from "@/lib/project-types";
import type { RemakeListItem, RemakeSeverity, RemakeStatus } from "@/lib/remake-types";

interface ProjectQualityTabProps {
  quality: ProjectWorkspaceData["quality"];
  onOpenCreateRemake?: () => void;
}

export function ProjectQualityTab({ quality, onOpenCreateRemake }: ProjectQualityTabProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");

  const getSeverityBadge = (sev: RemakeSeverity) => {
    switch (sev) {
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

  const getStatusBadge = (st: RemakeStatus) => {
    switch (st) {
      case "resolved":
        return <Badge className="bg-emerald-600 text-white">{isAr ? "تم الحل والإغلاق" : "Resolved"}</Badge>;
      case "in_remake":
        return <Badge className="bg-blue-600 text-white">{isAr ? "قيد إعادة التصنيع" : "In Remake"}</Badge>;
      case "under_review":
        return <Badge className="bg-purple-600 text-white">{isAr ? "قيد المراجعة" : "Under Review"}</Badge>;
      case "rejected":
        return <Badge variant="destructive">{isAr ? "مرفوض" : "Rejected"}</Badge>;
      case "reported":
      default:
        return <Badge className="bg-amber-600 text-white">{isAr ? "تم الإبلاغ" : "Reported"}</Badge>;
    }
  };

  const activeRemakes = quality.remakes.filter(
    (r) => r.status !== "resolved" && r.status !== "rejected" && r.status !== "cancelled",
  );

  return (
    <div className="space-y-6">
      <Card className="shadow-xs">
        <CardHeader className="p-4 pb-3 border-b flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <CardTitle className="text-base font-bold">
              {isAr ? "فحص الجودة وطلبات إعادة التصنيع" : "QC Inspections & Remake Cases"}
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {quality.remakes.length}
            </Badge>
            {activeRemakes.length > 0 && (
              <Badge variant="destructive" className="text-xs flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                <span>{activeRemakes.length} {isAr ? "نشط" : "Active"}</span>
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onOpenCreateRemake && (
              <Button size="sm" onClick={onOpenCreateRemake} className="gap-1.5 h-8">
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? "إبلاغ عن عيب / طلب تصنيع" : "Report Case"}</span>
              </Button>
            )}
            <Link to="/admin/remakes">
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs">
                <span>{isAr ? "إدارة الجودة" : "Quality Hub"}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {quality.remakes.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground space-y-2">
              <ShieldCheck className="w-10 h-10 mx-auto text-emerald-600/50" />
              <p className="text-sm font-medium">
                {isAr ? "سجل الجودة نظيف — لا توجد طلبات إعادة تصنيع أو عيوب مسجلة" : "Clean Quality Record — Zero active defect reports."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="px-4 py-3">{isAr ? "رقم الطلب" : "Case #"}</th>
                    <th className="px-4 py-3">{isAr ? "أمر التنفيذ" : "Order #"}</th>
                    <th className="px-4 py-3">{isAr ? "السبب" : "Reason"}</th>
                    <th className="px-4 py-3">{isAr ? "النوع" : "Type"}</th>
                    <th className="px-4 py-3">{isAr ? "الخطورة" : "Severity"}</th>
                    <th className="px-4 py-3">{isAr ? "الحالة" : "Status"}</th>
                    <th className="px-4 py-3 text-right rtl:text-left">{isAr ? "تاريخ التسجيل" : "Reported At"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {quality.remakes.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-foreground">
                        {r.remakeNumber}
                      </td>
                      <td className="px-4 py-3 font-medium text-muted-foreground">
                        {r.orderNumber}
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {r.reason}
                        {r.defectDescription && (
                          <div className="text-xs text-muted-foreground font-normal line-clamp-1 mt-0.5">
                            {r.defectDescription}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground capitalize">
                        {r.type}
                      </td>
                      <td className="px-4 py-3">{getSeverityBadge(r.severity)}</td>
                      <td className="px-4 py-3">{getStatusBadge(r.status)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground text-right rtl:text-left" dir="ltr">
                        {typeof r.createdAt === "string" ? r.createdAt.slice(0, 10) : new Date(r.createdAt).toISOString().slice(0, 10)}
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
