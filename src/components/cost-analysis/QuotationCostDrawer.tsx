import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { getQuotationCostAnalysis } from "@/lib/cost-analysis.functions";
import type { QuotationCostAnalysis } from "@/lib/cost-analysis-types";
import { formatEGP } from "@/lib/pricing";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  TrendingUp,
  Percent,
  Layers,
  ShieldCheck,
  Package,
  Wrench,
  Sparkles,
  DollarSign,
  AlertCircle,
  Clock,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface QuotationCostDrawerProps {
  quoteId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuotationCostDrawer({
  quoteId,
  open,
  onOpenChange,
}: QuotationCostDrawerProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const getCostAnalysisFn = useServerFn(getQuotationCostAnalysis);

  const [data, setData] = useState<QuotationCostAnalysis | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && quoteId) {
      setLoading(true);
      getCostAnalysisFn({ data: { quoteId } })
        .then((res) => setData(res))
        .catch((err) => {
          toast.error(err?.message || "Failed to load cost analysis");
        })
        .finally(() => setLoading(false));
    }
  }, [open, quoteId]);

  if (!quoteId) return null;

  const totalCat = data?.totalManufacturingCost && data.totalManufacturingCost > 0
    ? data.totalManufacturingCost
    : 1;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isRtl ? "left" : "right"} className="sm:max-w-xl w-full overflow-y-auto p-0 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b bg-card space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-base font-bold text-primary bg-primary/10 px-3 py-1 rounded-md">
              {data?.quotationNumber || "..."}
            </span>

            <div className="flex items-center gap-1.5">
              {data?.isSnapshot && (
                <Badge variant="secondary" className="text-[10px] gap-1 bg-emerald-50 text-emerald-700 border-emerald-200">
                  <ShieldCheck className="h-3 w-3" />
                  <span>{isRtl ? "لقطة سعرية مجمدة" : "Frozen Snapshot"}</span>
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px] capitalize">
                {data?.status || "..."}
              </Badge>
            </div>
          </div>

          <div>
            <SheetTitle className="text-xl font-bold font-serif flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <span>{isRtl ? "تحليل التكاليف وهامش الربحية" : "Cost Breakdown & Profitability"}</span>
            </SheetTitle>
            <SheetDescription className="text-xs mt-0.5">
              {data?.customerName && (
                <span>{isRtl ? `العميل: ${data.customerName}` : `Client: ${data.customerName}`} • </span>
              )}
              <span>{isRtl ? "تفصيل تكاليف الخامات والمصنعيات وحساب هامش المساهمة" : "Manufacturing cost structure and gross margin analysis"}</span>
            </SheetDescription>
          </div>

          {/* Top 4 KPI Cards */}
          {data && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs">
              <div className="p-2.5 bg-muted/40 rounded-xl border">
                <div className="text-[10px] text-muted-foreground">{isRtl ? "سعر البيع (قبل الضريبة)" : "Selling Price"}</div>
                <div className="font-bold text-sm text-foreground mt-0.5">{formatEGP(data.sellingPriceBeforeVat)}</div>
              </div>

              <div className="p-2.5 bg-muted/40 rounded-xl border">
                <div className="text-[10px] text-muted-foreground">{isRtl ? "تكلفة التصنيع" : "Mfg Cost"}</div>
                <div className="font-bold text-sm text-foreground mt-0.5">{formatEGP(data.totalManufacturingCost)}</div>
              </div>

              <div className="p-2.5 bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/70 rounded-xl border">
                <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">{isRtl ? "الربح الإجمالي" : "Gross Profit"}</div>
                <div className="font-bold text-sm text-emerald-700 dark:text-emerald-400 mt-0.5">{formatEGP(data.grossProfit)}</div>
              </div>

              <div className={`p-2.5 rounded-xl border ${
                data.grossMarginPct >= 25
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : data.grossMarginPct >= 15
                  ? "bg-blue-50 text-blue-800 border-blue-200"
                  : "bg-rose-50 text-rose-800 border-rose-200"
              }`}>
                <div className="text-[10px] font-medium opacity-80">{isRtl ? "هامش الربح %" : "Gross Margin"}</div>
                <div className="font-bold text-base mt-0.5">{data.grossMarginPct.toFixed(1)}%</div>
              </div>
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6 text-sm">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-xs">{isRtl ? "جاري احتساب التكاليف..." : "Calculating costs..."}</span>
            </div>
          ) : !data ? (
            <div className="text-center py-12 text-muted-foreground text-xs">
              {isRtl ? "لا توجد بيانات تكاليف متاحة" : "No cost data available"}
            </div>
          ) : (
            <>
              {/* Cost Category Breakdown */}
              <div className="bg-card border rounded-2xl p-4 shadow-xs space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span>{isRtl ? "تصنيف بنود التكلفة الصناعية" : "Cost Categories Breakdown"}</span>
                  <span className="font-mono text-primary font-bold">{formatEGP(data.totalManufacturingCost)}</span>
                </div>

                <div className="space-y-2.5 pt-1 text-xs">
                  {/* Materials */}
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="font-medium text-foreground">{isRtl ? "الخامات والألواح الأساسية" : "Raw Materials & Boards"}</span>
                      <span className="font-mono">{formatEGP(data.categories.materials)} ({((data.categories.materials / totalCat) * 100).toFixed(1)}%)</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${Math.min(100, (data.categories.materials / totalCat) * 100)}%` }} />
                    </div>
                  </div>

                  {/* Hardware */}
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="font-medium text-foreground">{isRtl ? "المفصلات والميكانيزمات" : "Hardware & Hinges"}</span>
                      <span className="font-mono">{formatEGP(data.categories.hardware)} ({((data.categories.hardware / totalCat) * 100).toFixed(1)}%)</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min(100, (data.categories.hardware / totalCat) * 100)}%` }} />
                    </div>
                  </div>

                  {/* Accessories */}
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="font-medium text-foreground">{isRtl ? "المقابض والإكسسوارات" : "Accessories"}</span>
                      <span className="font-mono">{formatEGP(data.categories.accessories)} ({((data.categories.accessories / totalCat) * 100).toFixed(1)}%)</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-purple-600 rounded-full" style={{ width: `${Math.min(100, (data.categories.accessories / totalCat) * 100)}%` }} />
                    </div>
                  </div>

                  {/* Finishes */}
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="font-medium text-foreground">{isRtl ? "التشطيب والقشرة وشريط الحرف" : "Finishes & Edge Banding"}</span>
                      <span className="font-mono">{formatEGP(data.categories.finishes)} ({((data.categories.finishes / totalCat) * 100).toFixed(1)}%)</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-amber-600 rounded-full" style={{ width: `${Math.min(100, (data.categories.finishes / totalCat) * 100)}%` }} />
                    </div>
                  </div>

                  {/* Manufacturing Operations */}
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="font-medium text-foreground">{isRtl ? "عمليات التصنيع والمصنعيات" : "Manufacturing Operations"}</span>
                      <span className="font-mono">{formatEGP(data.categories.manufacturing)} ({((data.categories.manufacturing / totalCat) * 100).toFixed(1)}%)</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-rose-600 rounded-full" style={{ width: `${Math.min(100, (data.categories.manufacturing / totalCat) * 100)}%` }} />
                    </div>
                  </div>

                  {/* Wastage */}
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="font-medium text-foreground">{isRtl ? "هدر الخامات الصناعي (Wastage)" : "Industrial Material Wastage"}</span>
                      <span className="font-mono text-destructive">{formatEGP(data.categories.wastage)} ({((data.categories.wastage / totalCat) * 100).toFixed(1)}%)</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-destructive rounded-full" style={{ width: `${Math.min(100, (data.categories.wastage / totalCat) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Hierarchical Drilldown (Product -> Section -> Unit -> Component) */}
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {isRtl ? "تفصيل التكلفة حسب الهيكل الشجري (BOM Drilldown)" : "Hierarchy Tree Cost Breakdown"}
                </div>

                <Accordion type="multiple" className="w-full space-y-2">
                  {data.products.map((p) => (
                    <AccordionItem key={p.id} value={p.id} className="border rounded-xl px-3 bg-card">
                      <AccordionTrigger className="hover:no-underline py-2.5 text-xs font-bold">
                        <div className="flex items-center justify-between w-full pr-2 rtl:pr-0 rtl:pl-2">
                          <span className="flex items-center gap-1.5 text-primary">
                            <Package className="h-3.5 w-3.5" />
                            <span>{p.name}</span>
                          </span>
                          <span className="font-mono text-muted-foreground font-normal">
                            {formatEGP(p.totalCost)} (Margin: {p.grossMarginPct.toFixed(1)}%)
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pt-2 pb-3 space-y-3 border-t">
                        {p.sections.map((s) => (
                          <div key={s.id} className="bg-muted/30 p-2.5 rounded-lg border space-y-2 text-xs">
                            <div className="flex items-center justify-between font-semibold">
                              <span>{s.name}</span>
                              <span className="font-mono text-muted-foreground">{formatEGP(s.totalCost)}</span>
                            </div>

                            <div className="space-y-1.5 pl-2 rtl:pl-0 rtl:pr-2">
                              {s.components && s.components.length > 0 && (
                                <div className="bg-card p-2 rounded border space-y-1.5 mb-1.5">
                                  <div className="text-[11px] font-medium text-foreground">
                                    {isRtl ? "المكونات المشتركة للقسم:" : "Section Shared Components:"}
                                  </div>
                                  <div className="space-y-1 pt-1 border-t border-border/60 text-[10px]">
                                    {s.components.map((c) => (
                                      <div key={c.id} className="flex items-center justify-between text-muted-foreground">
                                        <div className="flex items-center gap-1">
                                          <Badge variant="outline" className="text-[9px] px-1 py-0 uppercase">
                                            {c.kind}
                                          </Badge>
                                          <span className="text-foreground">{c.name}</span>
                                          {c.wastageCost > 0 && (
                                            <span className="text-destructive font-mono">(+{formatEGP(c.wastageCost)} {isRtl ? "هدر" : "waste"})</span>
                                          )}
                                        </div>
                                        <span className="font-mono font-semibold text-foreground">
                                          {formatEGP(c.totalCost)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {s.units.map((u) => (
                                <div key={u.id} className="bg-card p-2 rounded border space-y-1.5">
                                  <div className="flex items-center justify-between text-[11px] font-medium">
                                    <span className="font-bold text-foreground">{u.name} (x{u.qty})</span>
                                    <span className="font-mono text-primary font-bold">{formatEGP(u.totalCost)}</span>
                                  </div>

                                  {/* Components List */}
                                  <div className="space-y-1 pt-1 border-t border-border/60 text-[10px]">
                                    {u.components.map((c) => (
                                      <div key={c.id} className="flex items-center justify-between text-muted-foreground">
                                        <div className="flex items-center gap-1">
                                          <Badge variant="outline" className="text-[9px] px-1 py-0 uppercase">
                                            {c.kind}
                                          </Badge>
                                          <span className="text-foreground">{c.name}</span>
                                          {c.wastageCost > 0 && (
                                            <span className="text-destructive font-mono">(+{formatEGP(c.wastageCost)} هدر)</span>
                                          )}
                                        </div>
                                        <span className="font-mono font-semibold text-foreground">
                                          {formatEGP(c.totalCost)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>

              {/* VAT & Commercial Invariant Note */}
              <div className="bg-muted/20 p-3 rounded-xl border text-[11px] text-muted-foreground space-y-1">
                <div className="flex justify-between font-semibold text-foreground">
                  <span>{isRtl ? "ضريبة القيمة المضافة (14% VAT):" : "14% VAT:"}</span>
                  <span className="font-mono">{formatEGP(data.vatAmount)}</span>
                </div>
                <p className="text-[10px] text-muted-foreground/80">
                  {isRtl
                    ? "ملاحظة إدارية: ضريبة القيمة المضافة تلتزم بها الشركة لصالح مصلحة الضرائب وليست جزءاً من هامش الربح التشغيلي."
                    : "Note: VAT is a statutory remittance and is strictly excluded from gross profit calculations."}
                </p>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
