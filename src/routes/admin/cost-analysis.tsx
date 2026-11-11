import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/useAuth";
import { getGlobalCostAnalysis } from "@/lib/cost-analysis.functions";
import type { GlobalCostAnalysisSummary } from "@/lib/cost-analysis-types";
import { formatEGP } from "@/lib/pricing";
import { QuotationCostDrawer } from "@/components/cost-analysis/QuotationCostDrawer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart3,
  TrendingUp,
  Percent,
  Layers,
  Sparkles,
  Eye,
  Loader2,
  DollarSign,
  PieChart,
} from "lucide-react";

export const Route = createFileRoute("/admin/cost-analysis")({
  component: CostAnalysisPage,
});

function CostAnalysisPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const { currentRole } = useAuth();
  const getGlobalCostAnalysisFn = useServerFn(getGlobalCostAnalysis);

  const [days, setDays] = useState("90");
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // TanStack Query for V2 global cost analysis
  const { data: analysis, isLoading } = useQuery({
    queryKey: ["cost-analysis", days],
    queryFn: async () => {
      const res = await getGlobalCostAnalysisFn({
        data: { days },
      });
      return (res as unknown as GlobalCostAnalysisSummary) || null;
    },
  });

  const handleOpenCostDrawer = (quoteId: string) => {
    setSelectedQuoteId(quoteId);
    setIsDrawerOpen(true);
  };

  const ranges = [
    { v: "30", l: isRtl ? "آخر 30 يوماً" : "Last 30 days" },
    { v: "90", l: isRtl ? "آخر 90 يوماً" : "Last 90 days" },
    { v: "365", l: isRtl ? "آخر سنة" : "Last year" },
    { v: "0", l: isRtl ? "كل الفترات" : "All time" },
  ];

  const totalCat = analysis?.totalManufacturingCost && analysis.totalManufacturingCost > 0
    ? analysis.totalManufacturingCost
    : 1;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border-b pb-5">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <BarChart3 className="h-7 w-7 text-primary" />
            <span>{isRtl ? "تحليل التكاليف وهامش الربحية (V2)" : "V2 Cost Analysis & Profitability"}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isRtl
              ? "تحليل تكاليف الخامات والمصنعيات وحساب هامش المساهمة لجميع المقايسات وأوامر الإنتاج"
              : "Manufacturing cost breakdown, gross profit margins, and BOM cost drivers"}
          </p>
        </div>

        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-44 h-9 text-sm rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ranges.map((r) => (
              <SelectItem key={r.v} value={r.v}>
                {r.l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Top Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border rounded-2xl shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="text-xs text-muted-foreground uppercase font-semibold">
              {isRtl ? "إجمالي قيمة البيع (قبل الضريبة)" : "Total Selling Value"}
            </div>
            <div className="text-2xl font-bold font-serif text-foreground">
              {formatEGP(analysis?.totalSellingPrice || 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="border rounded-2xl shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="text-xs text-muted-foreground uppercase font-semibold">
              {isRtl ? "إجمالي تكلفة التصنيع" : "Total Mfg Cost"}
            </div>
            <div className="text-2xl font-bold font-serif text-foreground">
              {formatEGP(analysis?.totalManufacturingCost || 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="border rounded-2xl shadow-xs bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/80">
          <CardContent className="p-4 space-y-1">
            <div className="text-xs text-emerald-700 dark:text-emerald-400 uppercase font-semibold">
              {isRtl ? "إجمالي الربح التشغيلي" : "Total Gross Profit"}
            </div>
            <div className="text-2xl font-bold font-serif text-emerald-700 dark:text-emerald-400">
              {formatEGP(analysis?.totalGrossProfit || 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="border rounded-2xl shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="text-xs text-primary uppercase font-semibold">
              {isRtl ? "متوسط هامش الربح" : "Average Margin"}
            </div>
            <div className="text-2xl font-bold font-serif text-primary">
              {(analysis?.averageGrossMarginPct || 0).toFixed(1)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Cost Breakdown Bars */}
      <Card className="border rounded-2xl shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold font-serif flex items-center justify-between">
            <span className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-primary" />
              <span>{isRtl ? "هيكل التكلفة الصناعية الإجمالي" : "Overall Manufacturing Cost Structure"}</span>
            </span>
            <span className="font-mono text-sm text-muted-foreground font-normal">
              {analysis?.totalQuotesAnalyzed || 0} {isRtl ? "مقايسة محللة" : "quotes analyzed"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>{isRtl ? "جاري تحميل تحليل التكاليف..." : "Loading cost analytics..."}</span>
            </div>
          ) : !analysis ? (
            <p className="text-xs text-muted-foreground py-6 text-center">
              {isRtl ? "لا توجد بيانات متاحة في هذه الفترة" : "No cost data available for this period"}
            </p>
          ) : (
            <div className="space-y-3 text-xs">
              {/* Materials */}
              <div className="space-y-1">
                <div className="flex justify-between font-medium">
                  <span>{isRtl ? "الألواح والخامات الرئيسية" : "Main Materials & Boards"}</span>
                  <span className="font-mono">{formatEGP(analysis.categories.materials)} ({((analysis.categories.materials / totalCat) * 100).toFixed(1)}%)</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${Math.min(100, (analysis.categories.materials / totalCat) * 100)}%` }} />
                </div>
              </div>

              {/* Hardware */}
              <div className="space-y-1">
                <div className="flex justify-between font-medium">
                  <span>{isRtl ? "المفصلات والميكانيزمات" : "Hardware & Mechanisms"}</span>
                  <span className="font-mono">{formatEGP(analysis.categories.hardware)} ({((analysis.categories.hardware / totalCat) * 100).toFixed(1)}%)</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min(100, (analysis.categories.hardware / totalCat) * 100)}%` }} />
                </div>
              </div>

              {/* Accessories */}
              <div className="space-y-1">
                <div className="flex justify-between font-medium">
                  <span>{isRtl ? "المقابض والإكسسوارات" : "Accessories"}</span>
                  <span className="font-mono">{formatEGP(analysis.categories.accessories)} ({((analysis.categories.accessories / totalCat) * 100).toFixed(1)}%)</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-purple-600 rounded-full" style={{ width: `${Math.min(100, (analysis.categories.accessories / totalCat) * 100)}%` }} />
                </div>
              </div>

              {/* Finishes */}
              <div className="space-y-1">
                <div className="flex justify-between font-medium">
                  <span>{isRtl ? "التشطيب والقشرة وشريط الحرف" : "Finishes & Edge Banding"}</span>
                  <span className="font-mono">{formatEGP(analysis.categories.finishes)} ({((analysis.categories.finishes / totalCat) * 100).toFixed(1)}%)</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-amber-600 rounded-full" style={{ width: `${Math.min(100, (analysis.categories.finishes / totalCat) * 100)}%` }} />
                </div>
              </div>

              {/* Manufacturing */}
              <div className="space-y-1">
                <div className="flex justify-between font-medium">
                  <span>{isRtl ? "عمليات التصنيع والمصنعيات" : "Manufacturing Operations"}</span>
                  <span className="font-mono">{formatEGP(analysis.categories.manufacturing)} ({((analysis.categories.manufacturing / totalCat) * 100).toFixed(1)}%)</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-rose-600 rounded-full" style={{ width: `${Math.min(100, (analysis.categories.manufacturing / totalCat) * 100)}%` }} />
                </div>
              </div>

              {/* Wastage */}
              <div className="space-y-1">
                <div className="flex justify-between font-medium text-destructive">
                  <span>{isRtl ? "هدر الخامات الصناعي (Wastage)" : "Industrial Wastage"}</span>
                  <span className="font-mono">{formatEGP(analysis.categories.wastage)} ({((analysis.categories.wastage / totalCat) * 100).toFixed(1)}%)</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-destructive rounded-full" style={{ width: `${Math.min(100, (analysis.categories.wastage / totalCat) * 100)}%` }} />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Cost Drivers Grid */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="border rounded-2xl shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold font-serif">
              {isRtl ? "أبرز بنود تكلفة الخامات" : "Top Material Cost Drivers"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {analysis?.topMaterials.map((m) => (
              <div key={m.name} className="flex justify-between items-center text-xs p-2.5 rounded-xl bg-muted/40 border">
                <span className="font-medium text-foreground">{m.name}</span>
                <span className="font-mono font-bold text-primary">{formatEGP(m.cost)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border rounded-2xl shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold font-serif">
              {isRtl ? "أبرز بنود المستلزمات والمصنعيات" : "Top Hardware & Op Drivers"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {analysis?.topHardware.map((h) => (
              <div key={h.name} className="flex justify-between items-center text-xs p-2.5 rounded-xl bg-muted/40 border">
                <span className="font-medium text-foreground">{h.name}</span>
                <span className="font-mono font-bold text-primary">{formatEGP(h.cost)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Quotations Margin Table */}
      <Card className="border rounded-2xl shadow-xs overflow-hidden">
        <CardHeader className="bg-muted/30 pb-3">
          <CardTitle className="text-sm font-bold font-serif">
            {isRtl ? "تفصيل ربحية المقايسات المسجلة" : "Quotation Margins & Unit Economics"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>{isRtl ? "رقم المقايسة" : "Quote #"}</TableHead>
                <TableHead>{isRtl ? "العميل" : "Customer"}</TableHead>
                <TableHead>{isRtl ? "سعر البيع" : "Selling Price"}</TableHead>
                <TableHead>{isRtl ? "تكلفة التصنيع" : "Mfg Cost"}</TableHead>
                <TableHead>{isRtl ? "الربح الإجمالي" : "Gross Profit"}</TableHead>
                <TableHead>{isRtl ? "هامش الربح" : "Margin %"}</TableHead>
                <TableHead>{isRtl ? "الحالة" : "Status"}</TableHead>
                <TableHead className="text-center w-24">{isRtl ? "التفاصيل" : "BOM"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-xs">
                    {isRtl ? "جاري تحميل المقايسات..." : "Loading quotations..."}
                  </TableCell>
                </TableRow>
              ) : (!analysis?.quotes || analysis.quotes.length === 0) ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-xs">
                    {isRtl ? "لا توجد مقايسات في هذه الفترة" : "No quotations in this period"}
                  </TableCell>
                </TableRow>
              ) : (
                analysis.quotes.map((q) => (
                  <TableRow
                    key={q.id}
                    className="hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => handleOpenCostDrawer(q.id)}
                  >
                    <TableCell className="font-mono text-xs font-bold text-primary">
                      {q.quoteNumber}
                    </TableCell>

                    <TableCell className="text-xs font-medium text-foreground">
                      {q.customerName || "—"}
                    </TableCell>

                    <TableCell className="font-semibold text-xs text-foreground">
                      {formatEGP(q.sellingPrice)}
                    </TableCell>

                    <TableCell className="font-semibold text-xs text-muted-foreground">
                      {formatEGP(q.manufacturingCost)}
                    </TableCell>

                    <TableCell className="font-bold text-xs text-emerald-600">
                      {formatEGP(q.grossProfit)}
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-mono font-bold ${
                          q.grossMarginPct >= 25
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : q.grossMarginPct >= 15
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                        }`}
                      >
                        {q.grossMarginPct.toFixed(1)}%
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {q.status}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenCostDrawer(q.id)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        title={isRtl ? "عرض تفصيل التكاليف" : "View Cost Analysis"}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Quotation Cost Analysis Drawer */}
      <QuotationCostDrawer
        quoteId={selectedQuoteId}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
      />
    </div>
  );
}