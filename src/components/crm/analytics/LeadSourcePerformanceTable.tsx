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
import {
  Share2,
  MessageCircle,
  Globe,
  Users2,
  DoorOpen,
  Building,
  UserCheck,
  HelpCircle,
} from "lucide-react";
import type { LeadSourcePerformanceMetric } from "@/lib/crm-analytics-types";

interface LeadSourcePerformanceTableProps {
  sources: LeadSourcePerformanceMetric[];
  isRtl?: boolean;
}

function getSourceIcon(sourceKey: string) {
  switch (sourceKey) {
    case "whatsapp":
      return <MessageCircle className="h-4 w-4 text-emerald-600" />;
    case "facebook":
    case "instagram":
      return <Share2 className="h-4 w-4 text-blue-600" />;
    case "website":
      return <Globe className="h-4 w-4 text-indigo-600" />;
    case "referral":
      return <Users2 className="h-4 w-4 text-amber-600" />;
    case "walk_in":
      return <DoorOpen className="h-4 w-4 text-teal-600" />;
    case "exhibition":
      return <Building className="h-4 w-4 text-purple-600" />;
    case "existing_customer":
      return <UserCheck className="h-4 w-4 text-emerald-600" />;
    default:
      return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
  }
}

export function LeadSourcePerformanceTable({
  sources,
  isRtl,
}: LeadSourcePerformanceTableProps) {
  // Filter out completely inactive sources to keep table clean while allowing user to inspect
  const sortedSources = [...sources].sort((a, b) => b.leadsCount - a.leadsCount);

  return (
    <Card className="border rounded-2xl shadow-xs">
      <CardHeader className="pb-3 border-b">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Share2 className="h-5 w-5 text-primary" />
              <span>{isRtl ? "أداء قنوات الاستقطاب (Lead Sources)" : "Lead Acquisition Channels"}</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              {isRtl
                ? "مقارنة كفاءة القنوات الإعلانية والمباشرة من استلام العميل حتى الإغلاق"
                : "Objective lead volume, qualified prospects, deals won, and conversion rate per channel"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40 text-xs">
              <TableRow>
                <TableHead>{isRtl ? "القناة الإعلانية / المصدر" : "Acquisition Channel"}</TableHead>
                <TableHead className="text-center">{isRtl ? "العملاء المحتملون" : "Leads"}</TableHead>
                <TableHead className="text-center">{isRtl ? "المؤهلون" : "Qualified"}</TableHead>
                <TableHead className="text-center">{isRtl ? "الفرص التجارية" : "Opportunities"}</TableHead>
                <TableHead className="text-center">{isRtl ? "الصفقات الرابحة" : "Won"}</TableHead>
                <TableHead className="text-center">{isRtl ? "الصفقات الخاسرة" : "Lost"}</TableHead>
                <TableHead className="text-end">{isRtl ? "معدل التحويل النهائي" : "Conversion Rate"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-xs divide-y">
              {sortedSources.map((s) => {
                const hasActivity = s.leadsCount > 0 || s.opportunitiesCount > 0;
                return (
                  <TableRow key={s.source} className={!hasActivity ? "opacity-50" : ""}>
                    <TableCell className="font-medium flex items-center gap-2 py-3">
                      {getSourceIcon(s.source)}
                      <span>{isRtl ? s.sourceLabelAr : s.sourceLabel}</span>
                    </TableCell>
                    <TableCell className="text-center font-semibold">{s.leadsCount}</TableCell>
                    <TableCell className="text-center">{s.qualifiedCount}</TableCell>
                    <TableCell className="text-center">{s.opportunitiesCount}</TableCell>
                    <TableCell className="text-center text-emerald-600 font-bold">{s.wonCount}</TableCell>
                    <TableCell className="text-center text-rose-500">{s.lostCount}</TableCell>
                    <TableCell className="text-end">
                      <Badge
                        variant="secondary"
                        className={
                          s.conversionRate >= 20
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : s.conversionRate > 0
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-muted text-muted-foreground"
                        }
                      >
                        {s.conversionRate}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
