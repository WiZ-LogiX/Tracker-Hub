import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserCheck, RefreshCw, FolderCheck, Clock } from "lucide-react";
import type { CustomerIntelligenceMetric } from "@/lib/crm-analytics-types";

interface CustomerRepeatAnalysisCardProps {
  customers: CustomerIntelligenceMetric;
  isRtl?: boolean;
}

export function CustomerRepeatAnalysisCard({
  customers,
  isRtl,
}: CustomerRepeatAnalysisCardProps) {
  return (
    <Card className="border rounded-2xl shadow-xs">
      <CardHeader className="pb-3 border-b">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-teal-600" />
              <span>{isRtl ? "ولاء العملاء وتكرار الشراء (Customer Retention)" : "Customer Loyalty & Repeat Business"}</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              {isRtl
                ? "معدلات اكتساب العملاء الجدد ومعدل عودة العملاء لتنفيذ مشاريع إضافية"
                : "New client acquisition vs multi-project returning customer retention"}
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className="bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:border-teal-800 text-xs px-2.5 py-0.5 font-bold self-start"
          >
            {customers.repeatCustomerRate}% {isRtl ? "معدل العودة" : "Repeat Rate"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="p-3 rounded-xl bg-muted/40 border space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground uppercase flex items-center justify-center gap-1">
              <UserCheck className="h-3.5 w-3.5" />
              {isRtl ? "إجمالي الحسابات" : "Total Accounts"}
            </span>
            <p className="text-xl font-bold">{customers.totalCustomers}</p>
          </div>

          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800 space-y-1 text-blue-950 dark:text-blue-100">
            <span className="text-[11px] font-medium uppercase text-blue-700 dark:text-blue-300">
              {isRtl ? "عملاء جدد بالفترة" : "New in Period"}
            </span>
            <p className="text-xl font-bold">{customers.newCustomersCount}</p>
          </div>

          <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 dark:bg-teal-950/30 dark:border-teal-800 space-y-1 text-teal-950 dark:text-teal-100">
            <span className="text-[11px] font-medium uppercase text-teal-700 dark:text-teal-300">
              {isRtl ? "عملاء مكررون" : "Returning"}
            </span>
            <p className="text-xl font-bold">{customers.returningCustomersCount}</p>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 space-y-1 text-emerald-950 dark:text-emerald-100">
            <span className="text-[11px] font-medium uppercase text-emerald-700 dark:text-emerald-300 flex items-center justify-center gap-1">
              <FolderCheck className="h-3.5 w-3.5" />
              {isRtl ? "مشاريع مكتملة" : "Completed Projects"}
            </span>
            <p className="text-xl font-bold">{customers.completedProjectsCount}</p>
            <p className="text-[10px] opacity-75">
              {customers.activeProjectsCount} {isRtl ? "قيد التنفيذ" : "active"}
            </p>
          </div>
        </div>

        {/* Customer Base Distribution Bar */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between text-xs font-medium text-muted-foreground">
            <span>{isRtl ? "حصة العملاء الدائمين من قاعدة البيانات" : "Returning Customer Base Share"}</span>
            <span className="font-bold text-foreground">{customers.repeatCustomerRate}%</span>
          </div>
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden flex">
            <div
              className="h-full bg-teal-600 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(customers.repeatCustomerRate, 100)}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
