import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Layers, ArrowRight } from "lucide-react";
import type { PipelineStageMetric } from "@/lib/crm-analytics-types";

interface PipelineStageAnalysisProps {
  stages: PipelineStageMetric[];
  totalPipelineValue: number;
  isRtl?: boolean;
}

function formatEgp(val: number): string {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(val || 0);
}

export function PipelineStageAnalysis({
  stages,
  totalPipelineValue,
  isRtl,
}: PipelineStageAnalysisProps) {
  // Find highest stage value for relative progress bar scaling
  const maxValue = Math.max(...stages.map((s) => s.totalValue), 1);
  const totalStalled = stages.reduce((acc, s) => acc + s.stalledCount, 0);

  return (
    <Card className="border rounded-2xl shadow-xs">
      <CardHeader className="pb-3 border-b">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <span>{isRtl ? "تحليل مراحل خط المبيعات (Pipeline Distribution)" : "Sales Pipeline Stage Distribution"}</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              {isRtl
                ? "توزيع الفرص وقيمتها التعاقدية عبر مراحل دورة البيع التسع مع كشف الاختناقات"
                : "Active deal distribution, monetary values, and bottleneck detection across 9 stages"}
            </CardDescription>
          </div>
          {totalStalled > 0 && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800 gap-1.5 self-start">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>
                {isRtl
                  ? `${totalStalled} فرصة متوقفة بدون إجراء قادم`
                  : `${totalStalled} deals stalled without next action`}
              </span>
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        {stages.map((s) => {
          const relativePercent = Math.min(Math.round((s.totalValue / maxValue) * 100), 100);
          const isTerminalWon = s.stage === "won";
          const isTerminalLost = s.stage === "lost";

          return (
            <div key={s.stage} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-medium">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {isRtl ? s.stageLabelAr : s.stageLabel}
                  </span>
                  <Badge variant="secondary" className="text-[11px] px-1.5 py-0 h-5">
                    {s.count} {isRtl ? "فرصة" : "deals"}
                  </Badge>
                  {s.stalledCount > 0 && (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0 h-4">
                      {s.stalledCount} {isRtl ? "متوقفة" : "stalled"}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="font-bold text-foreground">{formatEgp(s.totalValue)}</span>
                  {!isTerminalWon && !isTerminalLost && (
                    <span className="text-[11px]">({s.percentageOfPipeline}% of active)</span>
                  )}
                </div>
              </div>

              {/* Graphical distribution bar */}
              <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden flex">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isTerminalWon
                      ? "bg-emerald-500"
                      : isTerminalLost
                      ? "bg-rose-400"
                      : s.stalledCount > 0
                      ? "bg-amber-500"
                      : "bg-primary"
                  }`}
                  style={{ width: `${relativePercent}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
