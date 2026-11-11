import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Target,
  Trophy,
  Percent,
  FileCheck2,
  RefreshCw,
  Headphones,
  TrendingUp,
} from "lucide-react";
import type { CrmAnalyticsSummaryKpis } from "@/lib/crm-analytics-types";

interface CrmAnalyticsKpisProps {
  summary: CrmAnalyticsSummaryKpis;
  isRtl?: boolean;
}

function formatEgp(val: number): string {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(val || 0);
}

export function CrmAnalyticsKpis({ summary, isRtl }: CrmAnalyticsKpisProps) {
  const kpis = [
    {
      id: "leads",
      title: isRtl ? "إجمالي العملاء المحتملين" : "Total Leads",
      value: summary.totalLeads.toLocaleString(),
      subtext: isRtl
        ? `معدل التحويل: ${summary.leadConversionRate}%`
        : `Conversion: ${summary.leadConversionRate}%`,
      icon: Users,
      color: "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800",
    },
    {
      id: "pipeline",
      title: isRtl ? "قيمة خط الفرص المفتوح" : "Active Pipeline Value",
      value: formatEgp(summary.totalPipelineValue),
      subtext: isRtl
        ? `${summary.openOpportunitiesCount} فرصة قيد المتابعة`
        : `${summary.openOpportunitiesCount} active deals`,
      icon: Target,
      color: "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800",
    },
    {
      id: "won",
      title: isRtl ? "الصفقات الرابحة (Won)" : "Deals Won",
      value: formatEgp(summary.dealsWonValue),
      subtext: isRtl
        ? `${summary.dealsWonCount} صفقة تم إغلاقها`
        : `${summary.dealsWonCount} closed won`,
      icon: Trophy,
      color: "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800",
    },
    {
      id: "winRate",
      title: isRtl ? "نسبة الفوز بالصفقات" : "Win Rate",
      value: `${summary.winRate}%`,
      subtext: isRtl
        ? `${summary.dealsLostCount} صفقة خاسرة`
        : `${summary.dealsLostCount} deals lost`,
      icon: Percent,
      color: "text-purple-600 bg-purple-50 border-purple-200 dark:bg-purple-950/40 dark:border-purple-800",
    },
    {
      id: "quoteConversion",
      title: isRtl ? "تحويل عروض الأسعار" : "Quote Conversion",
      value: `${summary.quoteConversionRate}%`,
      subtext: isRtl
        ? `قيمة العروض المعتمدة: ${formatEgp(summary.acceptedQuotesValue)}`
        : `Accepted: ${formatEgp(summary.acceptedQuotesValue)}`,
      icon: FileCheck2,
      color: "text-indigo-600 bg-indigo-50 border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-800",
    },
    {
      id: "repeat",
      title: isRtl ? "معدل عودة العملاء" : "Repeat Customer Rate",
      value: `${summary.repeatCustomerRate}%`,
      subtext: isRtl ? "عملاء تعاملوا أكثر من مرة" : "Multi-order customer base",
      icon: RefreshCw,
      color: "text-teal-600 bg-teal-50 border-teal-200 dark:bg-teal-950/40 dark:border-teal-800",
    },
    {
      id: "afterSales",
      title: isRtl ? "حالات ما بعد البيع" : "After-Sales Cases",
      value: summary.openCasesCount.toLocaleString(),
      subtext: isRtl
        ? `${summary.remakesCount} طلبات إعادة تصنيع ورشة`
        : `${summary.remakesCount} workshop remakes`,
      icon: Headphones,
      color: "text-rose-600 bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-800",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <Card key={kpi.id} className="border rounded-2xl shadow-xs transition hover:shadow-sm">
            <CardContent className="p-5 flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {kpi.title}
                </p>
                <p className="text-2xl font-bold tracking-tight text-foreground">{kpi.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{kpi.subtext}</p>
              </div>
              <div className={`p-2.5 rounded-xl border ${kpi.color}`}>
                <Icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
