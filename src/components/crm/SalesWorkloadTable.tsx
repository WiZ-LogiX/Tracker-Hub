import { useTranslation } from "react-i18next";
import type { SalespersonWorkload } from "@/lib/crm-types";
import { formatEGP } from "@/lib/pricing";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Users,
  AlertCircle,
  Clock,
  Briefcase,
  TrendingUp,
  UserCheck,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";

interface SalesWorkloadTableProps {
  workloads: SalespersonWorkload[];
  onSelectRep: (userId: string) => void;
  selectedRepId?: string | null;
}

export function SalesWorkloadTable({
  workloads,
  onSelectRep,
  selectedRepId,
}: SalesWorkloadTableProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const getWorkloadBadge = (level: SalespersonWorkload["workloadLevel"]) => {
    switch (level) {
      case "overloaded":
        return (
          <Badge variant="destructive" className="text-[10px] uppercase font-bold">
            {isRtl ? "ضغط مرتفع جداً" : "Overloaded"}
          </Badge>
        );
      case "heavy":
        return (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px] uppercase font-semibold">
            {isRtl ? "حمولة مرتفعة" : "Heavy"}
          </Badge>
        );
      case "balanced":
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] uppercase font-semibold">
            {isRtl ? "متوازن ومثالي" : "Balanced"}
          </Badge>
        );
      case "low":
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground text-[10px] uppercase font-medium">
            {isRtl ? "متاح لصفقات" : "Low / Available"}
          </Badge>
        );
    }
  };

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span>{isRtl ? "مصفوفة حمولة فريق المبيعات" : "Sales Team Workload & Capacity"}</span>
            </CardTitle>
            <CardDescription className="text-xs">
              {isRtl
                ? "متابعة توزيع الفرص، المقايسات، المتأخرات، ومعدل الطاقة الاستيعابية لكل مسؤول مبيعات"
                : "Real-time overview of deal distribution, pending follow-ups, and capacity across sales representatives"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 text-xs">
              <TableHead className="font-semibold">{isRtl ? "المسؤول التجاري" : "Sales Representative"}</TableHead>
              <TableHead className="text-center font-semibold">{isRtl ? "عملاء محتملون" : "Leads"}</TableHead>
              <TableHead className="text-center font-semibold">{isRtl ? "صفقات نشطة" : "Active Deals"}</TableHead>
              <TableHead className="text-left rtl:text-right font-semibold">{isRtl ? "قيمة المسار" : "Pipeline Value"}</TableHead>
              <TableHead className="text-center font-semibold">{isRtl ? "المقايسات" : "Quotes"}</TableHead>
              <TableHead className="text-center font-semibold text-destructive">{isRtl ? "متأخرات" : "Overdue"}</TableHead>
              <TableHead className="text-center font-semibold text-amber-600">{isRtl ? "اليوم" : "Today"}</TableHead>
              <TableHead className="text-center font-semibold text-rose-600">{isRtl ? "بدون إجراء" : "No Action"}</TableHead>
              <TableHead className="text-center font-semibold text-emerald-600">{isRtl ? "رابحة" : "Won"}</TableHead>
              <TableHead className="text-center font-semibold">{isRtl ? "مستوى الحمولة" : "Workload"}</TableHead>
              <TableHead className="text-center font-semibold">{isRtl ? "إجراء" : "Action"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workloads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="h-24 text-center text-xs text-muted-foreground">
                  {isRtl ? "لا يوجد بيانات للمسؤولين التجاريين" : "No sales representatives found"}
                </TableCell>
              </TableRow>
            ) : (
              workloads.map((w) => {
                const isSelected = selectedRepId === w.userId;
                const isUnassigned = w.userId === "unassigned";

                return (
                  <TableRow
                    key={w.userId}
                    className={`text-xs hover:bg-muted/40 transition-colors ${
                      isSelected ? "bg-primary/5 font-medium" : ""
                    } ${isUnassigned ? "bg-amber-500/5" : ""}`}
                  >
                    {/* Salesperson Identity */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-7 w-7 rounded-full flex items-center justify-center font-bold text-xs uppercase ${
                            isUnassigned
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
                          {isUnassigned ? "?" : w.displayName.charAt(0)}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground flex items-center gap-1.5">
                            <span>{w.displayName}</span>
                            {isUnassigned && (
                              <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">
                                {isRtl ? "يحتاج توزيع" : "Needs Assignment"}
                              </Badge>
                            )}
                          </div>
                          {!isUnassigned && (
                            <div className="text-[10px] text-muted-foreground uppercase font-mono">
                              {w.role}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Leads Count */}
                    <TableCell className="text-center font-mono font-medium">
                      {w.activeLeadsCount}
                    </TableCell>

                    {/* Open Opportunities */}
                    <TableCell className="text-center font-mono font-bold text-foreground">
                      {w.openOpportunitiesCount}
                    </TableCell>

                    {/* Pipeline Value */}
                    <TableCell className="font-mono font-bold text-foreground whitespace-nowrap">
                      {formatEGP(w.pipelineValue)}
                    </TableCell>

                    {/* Quotes Count & Value */}
                    <TableCell className="text-center font-mono text-muted-foreground">
                      {w.quotesCount}
                    </TableCell>

                    {/* Overdue Follow-ups */}
                    <TableCell className="text-center">
                      {w.overdueFollowUpsCount > 0 ? (
                        <Badge variant="destructive" className="font-mono text-[10px] px-1.5 py-0">
                          {w.overdueFollowUpsCount}
                        </Badge>
                      ) : (
                        <span className="font-mono text-muted-foreground/60">0</span>
                      )}
                    </TableCell>

                    {/* Due Today */}
                    <TableCell className="text-center">
                      {w.dueTodayCount > 0 ? (
                        <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30 font-mono text-[10px] px-1.5 py-0">
                          {w.dueTodayCount}
                        </Badge>
                      ) : (
                        <span className="font-mono text-muted-foreground/60">0</span>
                      )}
                    </TableCell>

                    {/* No Next Action */}
                    <TableCell className="text-center">
                      {w.noNextActionCount > 0 ? (
                        <Badge className="bg-rose-500/20 text-rose-700 dark:text-rose-400 border-rose-500/30 font-mono text-[10px] px-1.5 py-0">
                          {w.noNextActionCount}
                        </Badge>
                      ) : (
                        <span className="font-mono text-muted-foreground/60">0</span>
                      )}
                    </TableCell>

                    {/* Won Deals */}
                    <TableCell className="text-center font-mono font-semibold text-emerald-600">
                      {w.wonCount}
                    </TableCell>

                    {/* Workload Status */}
                    <TableCell className="text-center">
                      {getWorkloadBadge(w.workloadLevel)}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        variant={isSelected ? "default" : "ghost"}
                        onClick={() => onSelectRep(w.userId)}
                        className="h-7 text-xs px-2 gap-1"
                      >
                        <span>{isRtl ? "عرض الصفقات" : "View Deals"}</span>
                        {isRtl ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
