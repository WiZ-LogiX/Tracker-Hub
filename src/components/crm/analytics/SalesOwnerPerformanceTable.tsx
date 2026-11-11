import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { User, Briefcase } from "lucide-react";
import type { SalesOwnerPerformanceMetric } from "@/lib/crm-analytics-types";

interface SalesOwnerPerformanceTableProps {
  salesOwners: SalesOwnerPerformanceMetric[];
  isRtl?: boolean;
}

function formatEgp(val: number): string {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(val || 0);
}

export function SalesOwnerPerformanceTable({
  salesOwners,
  isRtl,
}: SalesOwnerPerformanceTableProps) {
  return (
    <Card className="border rounded-2xl shadow-xs">
      <CardHeader className="pb-3 border-b">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              <span>{isRtl ? "مؤشرات أداء فريق المبيعات (Sales Activity)" : "Sales Team Commercial Activity"}</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              {isRtl
                ? "مؤشرات عددية ومادية موضوعية لكل مسؤول مبيعات دون تصنيفات تقديرية"
                : "Objective workload, pipeline volume, closed deals, and win rates without subjective ranking"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40 text-xs">
              <TableRow>
                <TableHead>{isRtl ? "مسؤول المبيعات" : "Sales Representative"}</TableHead>
                <TableHead className="text-center">{isRtl ? "العملاء المحتملون" : "Leads"}</TableHead>
                <TableHead className="text-center">{isRtl ? "إجمالي الفرص" : "Total Opps"}</TableHead>
                <TableHead className="text-center">{isRtl ? "فرص مفتوحة" : "Active Deals"}</TableHead>
                <TableHead className="text-end">{isRtl ? "قيمة الخط المفتوح" : "Active Pipeline"}</TableHead>
                <TableHead className="text-center">{isRtl ? "رابحة" : "Won"}</TableHead>
                <TableHead className="text-end">{isRtl ? "قيمة المبيعات الرابحة" : "Won Value"}</TableHead>
                <TableHead className="text-center">{isRtl ? "خاسرة" : "Lost"}</TableHead>
                <TableHead className="text-center">{isRtl ? "عروض أسعار" : "Quotes"}</TableHead>
                <TableHead className="text-end">{isRtl ? "نسبة الفوز" : "Win Rate"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-xs divide-y">
              {salesOwners.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-6 text-muted-foreground">
                    {isRtl ? "لا توجد بيانات مبيعات في هذه الفترة." : "No sales activity recorded in this period."}
                  </TableCell>
                </TableRow>
              ) : (
                salesOwners.map((owner) => (
                  <TableRow key={owner.ownerId}>
                    <TableCell className="font-semibold flex items-center gap-2 py-3 text-foreground">
                      <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                        {owner.ownerName.charAt(0).toUpperCase()}
                      </div>
                      <span>{owner.ownerName}</span>
                    </TableCell>
                    <TableCell className="text-center">{owner.leadsCount}</TableCell>
                    <TableCell className="text-center">{owner.opportunitiesCount}</TableCell>
                    <TableCell className="text-center font-medium">{owner.openOpportunitiesCount}</TableCell>
                    <TableCell className="text-end font-semibold text-foreground">
                      {formatEgp(owner.openPipelineValue)}
                    </TableCell>
                    <TableCell className="text-center font-bold text-emerald-600">{owner.wonCount}</TableCell>
                    <TableCell className="text-end font-bold text-emerald-600">
                      {formatEgp(owner.wonValue)}
                    </TableCell>
                    <TableCell className="text-center text-rose-500">{owner.lostCount}</TableCell>
                    <TableCell className="text-center">{owner.quotesCount}</TableCell>
                    <TableCell className="text-end">
                      <Badge
                        variant="secondary"
                        className={
                          owner.winRate >= 50
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : owner.winRate > 0
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-muted text-muted-foreground"
                        }
                      >
                        {owner.winRate}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
