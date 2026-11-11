import { useTranslation } from "react-i18next";
import { formatEGP } from "@/lib/pricing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OpportunityItem, PipelineStage } from "@/lib/crm-types";
import { PIPELINE_STAGES } from "@/lib/crm-types";
import {
  Search,
  User,
  Clock,
  AlertTriangle,
  FileText,
  CheckSquare,
  MoreVertical,
  Plus,
  ArrowRight,
  Sparkles,
} from "lucide-react";

interface OpportunitiesTableProps {
  opportunities: OpportunityItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  search: string;
  onSearchChange: (search: string) => void;
  stageFilter: string;
  onStageFilterChange: (stage: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  sort: string;
  onSortChange: (sort: string) => void;
  onPageChange: (page: number) => void;
  onSelectOpportunity: (opp: OpportunityItem) => void;
  onNewOpportunity: () => void;
  onStageChange: (oppId: string, newStage: PipelineStage) => void;
  isLoading?: boolean;
}

export function OpportunitiesTable({
  opportunities,
  totalCount,
  page,
  pageSize,
  search,
  onSearchChange,
  stageFilter,
  onStageFilterChange,
  statusFilter,
  onStatusFilterChange,
  sort,
  onSortChange,
  onPageChange,
  onSelectOpportunity,
  onNewOpportunity,
  onStageChange,
  isLoading,
}: OpportunitiesTableProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const getStageBadge = (stage: PipelineStage) => {
    const stageObj = PIPELINE_STAGES.find((s) => s.id === stage);
    const label = stageObj ? stageObj.name : stage;

    if (stage === "won") {
      return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300">{label}</Badge>;
    }
    if (stage === "lost") {
      return <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-300">{label}</Badge>;
    }
    return <Badge variant="outline" className="text-[11px] font-medium">{label}</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 w-full sm:w-auto flex-1 max-w-2xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 rtl:right-3 rtl:left-auto top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={isRtl ? "بحث بعنوان الصفقة، العميل، الكود..." : "Search title, customer, code..."}
              className="pl-9 rtl:pr-9 rtl:pl-3 h-9 text-xs"
            />
          </div>

          <Select value={stageFilter} onValueChange={onStageFilterChange}>
            <SelectTrigger className="w-40 h-9 text-xs">
              <SelectValue placeholder={isRtl ? "المرحلة" : "Stage"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isRtl ? "كل المراحل" : "All Stages"}</SelectItem>
              {PIPELINE_STAGES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger className="w-32 h-9 text-xs">
              <SelectValue placeholder={isRtl ? "الحالة" : "Status"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isRtl ? "كل الحالات" : "All Status"}</SelectItem>
              <SelectItem value="open">{isRtl ? "نشط" : "Open"}</SelectItem>
              <SelectItem value="won">{isRtl ? "رابحة" : "Won"}</SelectItem>
              <SelectItem value="lost">{isRtl ? "مفقودة" : "Lost"}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={onSortChange}>
            <SelectTrigger className="w-36 h-9 text-xs">
              <SelectValue placeholder={isRtl ? "الترتيب" : "Sort"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">{isRtl ? "الأحدث" : "Newest"}</SelectItem>
              <SelectItem value="oldest">{isRtl ? "الأقدم" : "Oldest"}</SelectItem>
              <SelectItem value="value_desc">{isRtl ? "القيمة: الأعلى" : "Value: High to Low"}</SelectItem>
              <SelectItem value="value_asc">{isRtl ? "القيمة: الأقل" : "Value: Low to High"}</SelectItem>
              <SelectItem value="next_action_asc">{isRtl ? "تاريخ المتابعة" : "Next Action Date"}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button onClick={onNewOpportunity} size="sm" className="h-9 gap-1.5 text-xs font-semibold">
          <Plus className="h-3.5 w-3.5" />
          <span>{isRtl ? "صفقة / فرصة جديدة" : "New Opportunity"}</span>
        </Button>
      </div>

      {/* Opportunities Table */}
      <div className="rounded-xl border border-border/80 bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 text-xs">
              <TableHead className="font-semibold">{isRtl ? "الرمز" : "Deal #"}</TableHead>
              <TableHead className="font-semibold">{isRtl ? "العنوان والعميل" : "Title & Customer"}</TableHead>
              <TableHead className="font-semibold">{isRtl ? "النوع" : "Type"}</TableHead>
              <TableHead className="font-semibold">{isRtl ? "القيمة" : "Value"}</TableHead>
              <TableHead className="font-semibold">{isRtl ? "المرحلة" : "Stage"}</TableHead>
              <TableHead className="font-semibold">{isRtl ? "الخطوة القادمة" : "Next Action"}</TableHead>
              <TableHead className="font-semibold">{isRtl ? "المسؤول" : "Owner"}</TableHead>
              <TableHead className="text-end font-semibold">{isRtl ? "الإجراءات" : "Actions"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {opportunities.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-40 text-center text-xs text-muted-foreground">
                  {isRtl ? "لا توجد صفقات تجارية مسجلة" : "No commercial deals found."}
                </TableCell>
              </TableRow>
            ) : (
              opportunities.map((opp) => {
                const hasNextAction = Boolean(opp.nextAction && opp.nextAction.trim());
                const isOverdue =
                  opp.nextActionDate && new Date(opp.nextActionDate).getTime() < Date.now();

                return (
                  <TableRow
                    key={opp.id}
                    onClick={() => onSelectOpportunity(opp)}
                    className="text-xs hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    {/* Code */}
                    <TableCell className="font-mono font-bold text-primary">
                      {opp.opportunityNumber}
                    </TableCell>

                    {/* Title & Customer */}
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="font-semibold text-foreground">{opp.title}</div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span>{opp.customerName || isRtl ? "عميل غير مسمى" : "Unnamed customer"}</span>
                          {opp.customerPhone && (
                            <span className="font-mono text-[10px]">({opp.customerPhone})</span>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Project Type */}
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] capitalize font-medium">
                        {opp.projectType}
                      </Badge>
                    </TableCell>

                    {/* Value */}
                    <TableCell className="font-bold text-foreground font-mono">
                      {formatEGP(opp.value)}
                    </TableCell>

                    {/* Stage */}
                    <TableCell>{getStageBadge(opp.stage)}</TableCell>

                    {/* Next Action */}
                    <TableCell>
                      {!hasNextAction ? (
                        <span className="text-amber-600 dark:text-amber-400 text-[11px] flex items-center gap-1 font-medium">
                          <AlertTriangle className="h-3 w-3 text-amber-600 flex-shrink-0" />
                          <span>{isRtl ? "⚠️ لا يوجد إجراء!" : "⚠️ No action!"}</span>
                        </span>
                      ) : (
                        <div className="space-y-0.5 text-[11px]">
                          <span className={`font-medium ${isOverdue ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>
                            {opp.nextAction}
                          </span>
                          {opp.nextActionDate && (
                            <div className="text-muted-foreground flex items-center gap-1 font-mono text-[10px]">
                              <Clock className="h-3 w-3" />
                              <span>{new Date(opp.nextActionDate).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </TableCell>

                    {/* Sales Owner */}
                    <TableCell className="text-muted-foreground text-[11px]">
                      {opp.salesOwnerName || "—"}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-end" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7">
                              <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 text-xs">
                            <DropdownMenuItem onClick={() => onSelectOpportunity(opp)}>
                              {isRtl ? "عرض ملف الصفقة" : "View Deal Detail"}
                            </DropdownMenuItem>
                            {PIPELINE_STAGES.map((st) => (
                              <DropdownMenuItem
                                key={st.id}
                                disabled={st.id === opp.stage}
                                onClick={() => onStageChange(opp.id, st.id)}
                              >
                                {isRtl ? `نقل إلى: ${st.name}` : `Move to: ${st.name}`}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <span>
            {isRtl
              ? `عرض صفحة ${page} من إجمالي ${totalPages} (${totalCount} صفقة)`
              : `Page ${page} of ${totalPages} (${totalCount} total deals)`}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="h-7 text-xs"
            >
              {isRtl ? "السابق" : "Previous"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="h-7 text-xs"
            >
              {isRtl ? "التالي" : "Next"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
