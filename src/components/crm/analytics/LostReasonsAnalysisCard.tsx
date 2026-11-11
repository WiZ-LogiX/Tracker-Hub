import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ShieldAlert } from "lucide-react";
import type { LostReasonDistributionMetric } from "@/lib/crm-analytics-types";

interface LostReasonsAnalysisCardProps {
  lostReasons: LostReasonDistributionMetric[];
  totalLostDeals: number;
  isRtl?: boolean;
}

function formatEgp(val: number): string {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(val || 0);
}

export function LostReasonsAnalysisCard({
  lostReasons,
  totalLostDeals,
  isRtl,
}: LostReasonsAnalysisCardProps) {
  return (
    <Card className="border rounded-2xl shadow-xs">
      <CardHeader className="pb-3 border-b">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-500" />
              <span>{isRtl ? "أسباب خسارة الصفقات (Lost Reasons)" : "Deal Lost Reasons Distribution"}</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              {isRtl
                ? "التوزيع الواقعي للأسباب المسجلة عند إغلاق الصفقات دون افتراضات أو تنبؤات غير موثقة"
                : "Actual documented loss reasons recorded by sales reps with zero inferred values"}
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs self-start">
            {totalLostDeals} {isRtl ? "صفقة خاسرة مسجلة" : "total lost deals"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        {lostReasons.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            <p>{isRtl ? "لا توجد صفقات خاسرة مسجلة في هذه الفترة." : "No lost deals recorded in this period."}</p>
          </div>
        ) : (
          lostReasons.map((lr) => (
            <div key={lr.reason} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-medium">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {isRtl ? lr.reasonLabelAr : lr.reasonLabel}
                  </span>
                  <Badge variant="secondary" className="text-[11px] px-1.5 py-0 h-5">
                    {lr.count} {isRtl ? "صفقة" : "deals"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="font-bold text-foreground">{formatEgp(lr.totalValue)}</span>
                  <span className="text-[11px]">({lr.percentage}%)</span>
                </div>
              </div>

              {/* Graphical distribution bar */}
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-rose-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(lr.percentage, 100)}%` }}
                />
              </div>
            </div>
          ))
        )}

        <div className="pt-2 text-[11px] text-muted-foreground border-t flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span>
            {isRtl
              ? "البيانات مستندة إلى الأسباب المحددة فعلياً بواسطة مسؤولي المبيعات ولا تتضمن أي تخمين رقمي."
              : "Metrics reflect explicit recorded reasons only. No speculative scoring or AI inference applied."}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
