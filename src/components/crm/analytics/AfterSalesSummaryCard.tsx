import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Headphones, ShieldCheck, AlertCircle, Wrench, RefreshCcw } from "lucide-react";
import type { AfterSalesAnalyticsMetric } from "@/lib/crm-analytics-types";

interface AfterSalesSummaryCardProps {
  afterSales: AfterSalesAnalyticsMetric;
  isRtl?: boolean;
}

export function AfterSalesSummaryCard({ afterSales, isRtl }: AfterSalesSummaryCardProps) {
  return (
    <Card className="border rounded-2xl shadow-xs">
      <CardHeader className="pb-3 border-b">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Headphones className="h-5 w-5 text-rose-500" />
              <span>{isRtl ? "مؤشرات ما بعد البيع والجودة (After-Sales & Quality)" : "After-Sales & Quality Feedback"}</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              {isRtl
                ? "تتبع الشكاوى ومطالبات الضمان وطلبات الصيانة وإعادة التصنيع بالفترة المحددة"
                : "Tracking complaints, warranty service requests, and workshop rework tickets"}
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={
              afterSales.openCases > 0
                ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800 text-xs self-start"
                : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 text-xs self-start"
            }
          >
            {afterSales.openCases} {isRtl ? "حالة مفتوحة" : "open cases"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          <div className="p-3 rounded-xl bg-muted/40 border space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground uppercase flex items-center justify-center gap-1">
              <Headphones className="h-3.5 w-3.5" />
              {isRtl ? "إجمالي الحالات" : "Total Cases"}
            </span>
            <p className="text-xl font-bold">{afterSales.totalCases}</p>
          </div>

          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800 space-y-1 text-blue-950 dark:text-blue-100">
            <span className="text-[11px] font-medium uppercase text-blue-700 dark:text-blue-300 flex items-center justify-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              {isRtl ? "مطالبات الضمان" : "Warranty"}
            </span>
            <p className="text-xl font-bold">{afterSales.warrantyCases}</p>
          </div>

          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 dark:bg-rose-950/30 dark:border-rose-800 space-y-1 text-rose-950 dark:text-rose-100">
            <span className="text-[11px] font-medium uppercase text-rose-700 dark:text-rose-300 flex items-center justify-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" />
              {isRtl ? "شكاوى العملاء" : "Complaints"}
            </span>
            <p className="text-xl font-bold">{afterSales.complaintsCases}</p>
          </div>

          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 space-y-1 text-amber-950 dark:text-amber-100">
            <span className="text-[11px] font-medium uppercase text-amber-700 dark:text-amber-300 flex items-center justify-center gap-1">
              <Wrench className="h-3.5 w-3.5" />
              {isRtl ? "صيانة وخدمة" : "Maintenance"}
            </span>
            <p className="text-xl font-bold">{afterSales.serviceMaintenanceCases}</p>
          </div>

          <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 dark:bg-purple-950/30 dark:border-purple-800 space-y-1 text-purple-950 dark:text-purple-100 col-span-2 sm:col-span-1">
            <span className="text-[11px] font-medium uppercase text-purple-700 dark:text-purple-300 flex items-center justify-center gap-1">
              <RefreshCcw className="h-3.5 w-3.5" />
              {isRtl ? "إعادة تصنيع ورشة" : "Remakes"}
            </span>
            <p className="text-xl font-bold">{afterSales.remakesCount}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
