import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCrmAnalytics } from "@/lib/crm-analytics.functions";
import { listSalesMembers } from "@/lib/crm.functions";
import {
  TIME_WINDOW_OPTIONS,
  type TimeWindow,
  type CrmAnalyticsDashboardData,
} from "@/lib/crm-analytics-types";
import { CrmAnalyticsKpis } from "@/components/crm/analytics/CrmAnalyticsKpis";
import { PipelineStageAnalysis } from "@/components/crm/analytics/PipelineStageAnalysis";
import { LeadSourcePerformanceTable } from "@/components/crm/analytics/LeadSourcePerformanceTable";
import { QuotePerformanceCard } from "@/components/crm/analytics/QuotePerformanceCard";
import { LostReasonsAnalysisCard } from "@/components/crm/analytics/LostReasonsAnalysisCard";
import { SalesOwnerPerformanceTable } from "@/components/crm/analytics/SalesOwnerPerformanceTable";
import { CustomerRepeatAnalysisCard } from "@/components/crm/analytics/CustomerRepeatAnalysisCard";
import { AfterSalesSummaryCard } from "@/components/crm/analytics/AfterSalesSummaryCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart3,
  Calendar,
  RefreshCcw,
  SlidersHorizontal,
  Users,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

const crmAnalyticsSearchSchema = z.object({
  window: z.enum(["today", "this_week", "this_month", "this_quarter", "custom"]).optional().default("this_month"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  salesOwnerId: z.string().optional(),
});

type CrmAnalyticsSearchParams = z.infer<typeof crmAnalyticsSearchSchema>;

export const Route = createFileRoute("/admin/crm/analytics")({
  validateSearch: crmAnalyticsSearchSchema,
  component: CrmAnalyticsPage,
});

function CrmAnalyticsPage() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const searchParams = (Route.useSearch?.() || {}) as CrmAnalyticsSearchParams;
  const navigate = useNavigate();

  const getAnalyticsFn = useServerFn(getCrmAnalytics);
  const listMembersFn = useServerFn(listSalesMembers);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CrmAnalyticsDashboardData | null>(null);
  const [salesMembers, setSalesMembers] = useState<Array<{ id: string; name: string }>>([]);

  // Time Window Filters
  const [activeWindow, setActiveWindow] = useState<TimeWindow>(searchParams.window || "this_month");
  const [customStart, setCustomStart] = useState<string>(searchParams.startDate || "");
  const [customEnd, setCustomEnd] = useState<string>(searchParams.endDate || "");
  const [selectedOwner, setSelectedOwner] = useState<string>(searchParams.salesOwnerId || "all");

  const loadData = async (
    targetWindow = activeWindow,
    tStart = customStart,
    tEnd = customEnd,
    tOwner = selectedOwner,
  ) => {
    setLoading(true);
    try {
      const res = await getAnalyticsFn({
        data: {
          timeWindow: targetWindow,
          startDate: targetWindow === "custom" ? tStart : undefined,
          endDate: targetWindow === "custom" ? tEnd : undefined,
          salesOwnerId: tOwner !== "all" ? tOwner : undefined,
        },
      });
      setData(res);
    } catch (err: any) {
      console.error("Failed to load CRM analytics:", err);
      toast.error(isRtl ? "فشل تحميل تحليلات المبيعات" : "Failed to load CRM analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    listMembersFn()
      .then((members) => {
        setSalesMembers(members.map((m) => ({ id: m.id, name: m.name })));
      })
      .catch((err) => console.warn("Failed to load team members:", err));
  }, []);

  const handleWindowChange = (newWindow: TimeWindow) => {
    setActiveWindow(newWindow);
    if (newWindow !== "custom") {
      loadData(newWindow, customStart, customEnd, selectedOwner);
    }
  };

  const handleApplyCustomRange = () => {
    if (!customStart || !customEnd) {
      toast.error(isRtl ? "يرجى تحديد تاريخ البداية والنهاية" : "Please select both start and end dates");
      return;
    }
    loadData("custom", customStart, customEnd, selectedOwner);
  };

  const handleOwnerChange = (newOwner: string) => {
    setSelectedOwner(newOwner);
    loadData(activeWindow, customStart, customEnd, newOwner);
  };

  return (
    <div className="space-y-6 pb-16">
      {/* ── Top Header & Controls ─────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-serif">
                {isRtl ? "ذكاء وتحليلات المبيعات (Commercial Analytics)" : "CRM Intelligence & Analytics"}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                {isRtl
                  ? "لوحة استخبارات المبيعات الواقعية: أداء القنوات، مسار الصفقات، كفاءة العروض وأسباب الخسارة دون تنبؤات غير موثقة"
                  : "Transparent commercial performance: lead conversion, pipeline stages, quotes, and deal outcomes"}
              </p>
            </div>
          </div>
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-2 self-start lg:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData()}
            disabled={loading}
            className="gap-1.5 h-9"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span>{isRtl ? "تحديث" : "Refresh"}</span>
          </Button>
        </div>
      </div>

      {/* ── Time Window & Filter Toolbar ────────────────────────────────────── */}
      <Card className="border rounded-2xl shadow-xs bg-card/60 backdrop-blur-xs">
        <CardContent className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Time Window Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground me-2 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {isRtl ? "الفترة الزمنية:" : "Time Window:"}
            </span>
            {TIME_WINDOW_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={activeWindow === opt.value ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs font-medium rounded-lg"
                onClick={() => handleWindowChange(opt.value)}
              >
                {isRtl ? opt.labelAr : opt.label}
              </Button>
            ))}
          </div>

          {/* Salesperson Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              {isRtl ? "مسؤول المبيعات:" : "Sales Rep:"}
            </span>
            <Select value={selectedOwner} onValueChange={handleOwnerChange}>
              <SelectTrigger className="w-44 h-8 text-xs rounded-lg">
                <SelectValue placeholder={isRtl ? "كل الفريق" : "All Sales Team"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isRtl ? "كل الفريق" : "All Sales Team"}</SelectItem>
                {salesMembers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>

        {/* Custom Date Pickers (Shown when window === 'custom') */}
        {activeWindow === "custom" && (
          <div className="px-4 pb-4 pt-1 border-t flex flex-wrap items-center gap-3 text-xs bg-muted/20">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{isRtl ? "من:" : "From:"}</span>
              <Input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-8 w-36 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{isRtl ? "إلى:" : "To:"}</span>
              <Input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-8 w-36 text-xs"
              />
            </div>
            <Button
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={handleApplyCustomRange}
              disabled={loading}
            >
              {isRtl ? "تطبيق الفترة" : "Apply Range"}
            </Button>
          </div>
        )}
      </Card>

      {/* ── Active Date Range Confirmation Strip ───────────────────────────── */}
      {data && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-muted/30 border text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <span>
              {isRtl ? "الفترة المعروضة:" : "Active Period:"}{" "}
              <strong className="text-foreground font-semibold">
                {isRtl ? data.dateRange.labelAr : data.dateRange.label}
              </strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[11px] bg-background">
              {isRtl ? "بيانات تاريخية موثقة" : "Documented CRM Data"}
            </Badge>
          </div>
        </div>
      )}

      {/* ── Loading Skeleton or Analytics Dashboard ─────────────────────────── */}
      {loading && !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-muted/50 border" />
          ))}
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* 1. Summary KPI Cards */}
          <CrmAnalyticsKpis summary={data.summary} isRtl={isRtl} />

          {/* 2. Pipeline Analysis & Quote Conversion */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PipelineStageAnalysis
              stages={data.pipelineStages}
              totalPipelineValue={data.summary.totalPipelineValue}
              isRtl={isRtl}
            />
            <QuotePerformanceCard quotes={data.quotes} isRtl={isRtl} />
          </div>

          {/* 3. Lead Source Performance & Lost Reasons */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <LeadSourcePerformanceTable sources={data.leadsBySource} isRtl={isRtl} />
            <LostReasonsAnalysisCard
              lostReasons={data.lostReasons}
              totalLostDeals={data.summary.dealsLostCount}
              isRtl={isRtl}
            />
          </div>

          {/* 4. Sales Owner Objective Performance Table */}
          <SalesOwnerPerformanceTable salesOwners={data.salesOwners} isRtl={isRtl} />

          {/* 5. Customer Retention & After-Sales Quality */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CustomerRepeatAnalysisCard customers={data.customers} isRtl={isRtl} />
            <AfterSalesSummaryCard afterSales={data.afterSales} isRtl={isRtl} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
