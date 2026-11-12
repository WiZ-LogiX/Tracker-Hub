import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle2, XCircle, Send, FileEdit } from "lucide-react";
import type { QuoteConversionAnalytics } from "@/lib/crm-analytics-types";

interface QuotePerformanceCardProps {
  quotes: QuoteConversionAnalytics;
  isRtl?: boolean;
}

function formatEgp(val: number): string {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(val || 0);
}

export function QuotePerformanceCard({ quotes, isRtl }: QuotePerformanceCardProps) {
  return (
    <Card className="border rounded-2xl shadow-xs">
      <CardHeader className="pb-3 border-b">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <span>{isRtl ? "كفاءة عروض الأسعار (Quote Conversion)" : "Quotation Conversion"}</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              {isRtl
                ? "متابعة العروض الصادرة والمعتمدة ونسب الرفض والاعتماد الفعلي"
                : "Funnel metrics of quotes generated, dispatched to customers, accepted, and rejected"}
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 text-xs px-2.5 py-0.5 font-bold self-start"
          >
            {quotes.conversionRate}% {isRtl ? "نسبة التحويل" : "Conversion Rate"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-5">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="p-3 rounded-xl bg-muted/40 border space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground uppercase flex items-center justify-center gap-1">
              <FileEdit className="h-3.5 w-3.5" />
              {isRtl ? "مسودة" : "Draft"}
            </span>
            <p className="text-lg font-bold">{quotes.draftCount}</p>
            <p className="text-[11px] text-muted-foreground">{formatEgp(quotes.draftValue)}</p>
          </div>

          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800 space-y-1 text-blue-900 dark:text-blue-100">
            <span className="text-[11px] font-medium uppercase flex items-center justify-center gap-1 text-blue-700 dark:text-blue-300">
              <Send className="h-3.5 w-3.5" />
              {isRtl ? "مرسل للعميل" : "Sent"}
            </span>
            <p className="text-lg font-bold">{quotes.sentCount}</p>
            <p className="text-[11px] opacity-80">{formatEgp(quotes.sentValue)}</p>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 space-y-1 text-emerald-900 dark:text-emerald-100">
            <span className="text-[11px] font-medium uppercase flex items-center justify-center gap-1 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isRtl ? "معتمد" : "Accepted"}
            </span>
            <p className="text-lg font-bold">{quotes.acceptedCount}</p>
            <p className="text-[11px] opacity-80">{formatEgp(quotes.acceptedValue)}</p>
          </div>

          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 dark:bg-rose-950/30 dark:border-rose-800 space-y-1 text-rose-900 dark:text-rose-100">
            <span className="text-[11px] font-medium uppercase flex items-center justify-center gap-1 text-rose-700 dark:text-rose-300">
              <XCircle className="h-3.5 w-3.5" />
              {isRtl ? "مرفوض" : "Rejected"}
            </span>
            <p className="text-lg font-bold">{quotes.rejectedCount}</p>
            <p className="text-[11px] opacity-80">{formatEgp(quotes.rejectedValue)}</p>
          </div>
        </div>

        {/* Visual Acceptance Ratio */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between text-xs font-medium text-muted-foreground">
            <span>{isRtl ? "معدل قبول العروض المرسلة" : "Acceptance Rate of Sent Quotes"}</span>
            <span className="font-bold text-foreground">{quotes.acceptanceRateOfSent}%</span>
          </div>
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden flex">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(quotes.acceptanceRateOfSent, 100)}%` }}
            />
          </div>
        </div>

        {/* Origin Breakdown: Standalone vs Opportunity Quotes */}
        <div className="pt-2 border-t grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-2.5 rounded-xl border bg-muted/20 space-y-1">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-medium">
              <FileText className="h-3.5 w-3.5 text-primary" />
              <span>{isRtl ? "مقايسات تجارية مباشرة:" : "Direct Customer Quotes:"}</span>
            </span>
            <div className="flex items-baseline justify-between">
              <span className="font-bold text-sm">{quotes.standaloneCount || 0}</span>
              <span className="font-mono text-muted-foreground">{formatEgp(quotes.standaloneValue || 0)}</span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl border bg-muted/20 space-y-1">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>{isRtl ? "مقايسات مرتبطة بفرص CRM:" : "CRM Opportunity Quotes:"}</span>
            </span>
            <div className="flex items-baseline justify-between">
              <span className="font-bold text-sm">{quotes.opportunityCount || 0}</span>
              <span className="font-mono text-muted-foreground">{formatEgp(quotes.opportunityValue || 0)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
