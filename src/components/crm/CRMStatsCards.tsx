import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatEGP } from "@/lib/pricing";
import type { CRMStats } from "@/lib/crm-types";
import {
  TrendingUp,
  Award,
  Users,
  AlertTriangle,
  ArrowUpRight,
  Flame,
} from "lucide-react";

interface CRMStatsCardsProps {
  stats: CRMStats;
  onFilterAttention?: () => void;
}

export function CRMStatsCards({ stats, onFilterAttention }: CRMStatsCardsProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const winRate =
    stats.wonDealsCount + stats.openDealsCount > 0
      ? (stats.wonDealsCount / (stats.wonDealsCount + stats.openDealsCount)) * 100
      : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Active Pipeline Value */}
      <Card className="border shadow-xs hover:shadow-md transition-all border-border/80">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {isRtl ? "قيمة الفرص النشطة" : "Active Pipeline Value"}
              </p>
              <p className="text-2xl font-serif font-bold tracking-tight text-foreground">
                {formatEGP(stats.totalPipelineValue)}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <div>
              <span className="font-bold text-foreground">{stats.openDealsCount}</span>{" "}
              <span>{isRtl ? "فرصة جارية" : "open opportunities"}</span>
            </div>
            <div className="flex items-center gap-1 text-primary font-semibold">
              <ArrowUpRight className="h-3.5 w-3.5" />
              <span>{isRtl ? "نشطة بالمسار" : "In Pipeline"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Closed Won Deals */}
      <Card className="border shadow-xs hover:shadow-md transition-all border-border/80">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {isRtl ? "الصفقات الرابحة المغلقة" : "Deals Won"}
              </p>
              <p className="text-2xl font-serif font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                {formatEGP(stats.wonDealsValue)}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Award className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <div>
              <span className="font-bold text-foreground">{stats.wonDealsCount}</span>{" "}
              <span>{isRtl ? "صفقة ناجحة" : "deals closed"}</span>
            </div>
            <div className="flex items-center gap-1 text-emerald-600 font-semibold">
              <span>{isRtl ? "نسبة الفوز:" : "Win rate:"}</span>
              <span className="font-mono">{winRate.toFixed(1)}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Leads Inflow */}
      <Card className="border shadow-xs hover:shadow-md transition-all border-border/80">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {isRtl ? "العملاء المحتملون" : "Leads & Prospects"}
              </p>
              <p className="text-2xl font-serif font-bold tracking-tight text-foreground">
                {stats.leadsCount}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200">
                {stats.newLeadsCount} {isRtl ? "جديد" : "New"}
              </Badge>
              <span>{isRtl ? "بانتظار المتابعة" : "awaiting contact"}</span>
            </div>
            <div className="flex items-center gap-1 text-blue-600 font-semibold">
              <Flame className="h-3.5 w-3.5 text-amber-500" />
              <span>{isRtl ? "تدفق قنوات البيع" : "Omnichannel"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Attention Required */}
      <Card
        className={`border shadow-xs hover:shadow-md transition-all cursor-pointer ${
          stats.attentionRequiredCount > 0
            ? "border-amber-400/80 bg-amber-500/5 hover:bg-amber-500/10"
            : "border-border/80"
        }`}
        onClick={onFilterAttention}
      >
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                {isRtl ? "تتطلب إجراءً ومتابعة" : "Requires Next Action"}
              </p>
              <p className="text-2xl font-serif font-bold tracking-tight text-amber-700 dark:text-amber-400">
                {stats.attentionRequiredCount}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs">
            <span className="text-amber-700 dark:text-amber-400 font-medium">
              {isRtl ? "بدون إجراء قادم أو متأخرة" : "No next action / overdue"}
            </span>
            <span className="text-xs text-muted-foreground underline">
              {isRtl ? "عرض الفرص" : "Review"}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
