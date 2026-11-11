import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AttentionItem, AttentionReason } from "@/lib/crm-types";
import { formatEGP } from "@/lib/pricing";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  AlertTriangle,
  Clock,
  CheckCircle,
  FileText,
  UserCheck,
  PhoneCall,
  Calendar,
  Filter,
} from "lucide-react";
import { LogActivityModal } from "@/components/crm/LogActivityModal";
import { ReassignModal } from "@/components/crm/ReassignModal";

interface SalesAttentionBoardProps {
  attentionItems: AttentionItem[];
  onRefresh?: () => void;
}

export function SalesAttentionBoard({
  attentionItems,
  onRefresh,
}: SalesAttentionBoardProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [activeFilter, setActiveFilter] = useState<AttentionReason | "all">("all");
  const [selectedActivityItem, setSelectedActivityItem] = useState<AttentionItem | null>(null);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [selectedReassignItem, setSelectedReassignItem] = useState<AttentionItem | null>(null);
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);

  const filteredItems = attentionItems.filter((item) => {
    if (activeFilter === "all") return true;
    return item.reason === activeFilter;
  });

  const getReasonBadge = (reason: AttentionReason) => {
    switch (reason) {
      case "overdue":
        return (
          <Badge variant="destructive" className="text-[10px] gap-1 font-semibold">
            <Clock className="h-3 w-3" />
            <span>{isRtl ? "متابعة متأخرة" : "Overdue"}</span>
          </Badge>
        );
      case "due_today":
        return (
          <Badge className="bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/30 text-[10px] gap-1 font-semibold">
            <Calendar className="h-3 w-3" />
            <span>{isRtl ? "موعد اليوم" : "Due Today"}</span>
          </Badge>
        );
      case "no_next_action":
        return (
          <Badge className="bg-rose-500/20 text-rose-800 dark:text-rose-300 border-rose-500/30 text-[10px] gap-1 font-semibold">
            <AlertTriangle className="h-3 w-3" />
            <span>{isRtl ? "بدون إجراء تالٍ" : "No Next Action"}</span>
          </Badge>
        );
      case "quote_without_followup":
        return (
          <Badge className="bg-blue-500/20 text-blue-800 dark:text-blue-300 border-blue-500/30 text-[10px] gap-1 font-semibold">
            <FileText className="h-3 w-3" />
            <span>{isRtl ? "عرض سعر معلق" : "Quote Pending"}</span>
          </Badge>
        );
      case "negotiation_without_next_action":
        return (
          <Badge className="bg-orange-500/20 text-orange-800 dark:text-orange-300 border-orange-500/30 text-[10px] gap-1 font-semibold">
            <AlertTriangle className="h-3 w-3" />
            <span>{isRtl ? "تفاوض بدون موعد" : "Negotiation Awaiting Action"}</span>
          </Badge>
        );
      default:
        return null;
    }
  };

  const handleOpenActivity = (item: AttentionItem) => {
    setSelectedActivityItem(item);
    setIsActivityModalOpen(true);
  };

  const handleOpenReassign = (item: AttentionItem) => {
    setSelectedReassignItem(item);
    setIsReassignModalOpen(true);
  };

  const overdueCount = attentionItems.filter((i) => i.reason === "overdue").length;
  const dueTodayCount = attentionItems.filter((i) => i.reason === "due_today").length;
  const noActionCount = attentionItems.filter((i) => i.reason === "no_next_action").length;
  const quotePendingCount = attentionItems.filter((i) => i.reason === "quote_without_followup").length;
  const negPendingCount = attentionItems.filter((i) => i.reason === "negotiation_without_next_action").length;

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span>{isRtl ? "لوحة التحكم بالمتابعات وحالات التنبيه التجاري" : "Follow-Up Control & Attention Items"}</span>
            </CardTitle>
            <CardDescription className="text-xs">
              {isRtl
                ? "متابعة دقيقة لكل فرصة بيعية تتطلب تدخلاً فورياً لمنع تسرب العملاء أو تجميد الصفقات"
                : "Active commercial deals requiring immediate touchpoint to accelerate deal velocity"}
            </CardDescription>
          </div>

          {/* Quick Filter Buttons */}
          <div className="flex items-center flex-wrap gap-1.5 text-xs">
            <Button
              size="sm"
              variant={activeFilter === "all" ? "default" : "outline"}
              onClick={() => setActiveFilter("all")}
              className="h-7 text-xs px-2.5"
            >
              <span>{isRtl ? "الكل" : "All"}</span>
              <span className="font-mono ml-1 text-[11px]">({attentionItems.length})</span>
            </Button>

            <Button
              size="sm"
              variant={activeFilter === "overdue" ? "default" : "outline"}
              onClick={() => setActiveFilter("overdue")}
              className={`h-7 text-xs px-2.5 ${overdueCount > 0 ? "text-destructive" : ""}`}
            >
              <span>{isRtl ? "متأخرات" : "Overdue"}</span>
              <span className="font-mono ml-1 text-[11px]">({overdueCount})</span>
            </Button>

            <Button
              size="sm"
              variant={activeFilter === "due_today" ? "default" : "outline"}
              onClick={() => setActiveFilter("due_today")}
              className="h-7 text-xs px-2.5 text-amber-700 dark:text-amber-400"
            >
              <span>{isRtl ? "اليوم" : "Due Today"}</span>
              <span className="font-mono ml-1 text-[11px]">({dueTodayCount})</span>
            </Button>

            <Button
              size="sm"
              variant={activeFilter === "no_next_action" ? "default" : "outline"}
              onClick={() => setActiveFilter("no_next_action")}
              className="h-7 text-xs px-2.5 text-rose-700 dark:text-rose-400"
            >
              <span>{isRtl ? "بدون إجراء" : "No Action"}</span>
              <span className="font-mono ml-1 text-[11px]">({noActionCount})</span>
            </Button>

            <Button
              size="sm"
              variant={activeFilter === "quote_without_followup" ? "default" : "outline"}
              onClick={() => setActiveFilter("quote_without_followup")}
              className="h-7 text-xs px-2.5"
            >
              <span>{isRtl ? "مقايسات معلقة" : "Pending Quotes"}</span>
              <span className="font-mono ml-1 text-[11px]">({quotePendingCount})</span>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 text-xs">
              <TableHead className="font-semibold">{isRtl ? "الصفقة / المشروع" : "Deal / Project"}</TableHead>
              <TableHead className="font-semibold">{isRtl ? "العميل" : "Customer"}</TableHead>
              <TableHead className="font-semibold">{isRtl ? "المسؤول" : "Sales Owner"}</TableHead>
              <TableHead className="font-semibold">{isRtl ? "حالة التنبيه" : "Reason"}</TableHead>
              <TableHead className="font-semibold">{isRtl ? "الإجراء التالي المطلوب" : "Next Action"}</TableHead>
              <TableHead className="font-semibold">{isRtl ? "موعد المتابعة" : "Action Date"}</TableHead>
              <TableHead className="text-center font-semibold">{isRtl ? "إجراءات فورية" : "Actions"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-28 text-center text-xs text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-1.5">
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                    <span>{isRtl ? "ممتاز! لا توجد صفقات متأخرة أو تتطلب تنبيهاً ضمن هذا الفلتر." : "All follow-ups are up to date under this filter."}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => {
                const isOverdue =
                  item.nextActionDate && new Date(item.nextActionDate).getTime() < Date.now();

                return (
                  <TableRow key={`${item.entityType}-${item.id}`} className="text-xs hover:bg-muted/40">
                    {/* Deal Code & Title */}
                    <TableCell>
                      <div>
                        <span className="font-mono font-bold text-foreground text-xs">{item.code}</span>
                        <div className="text-muted-foreground text-[11px] truncate max-w-[180px] font-medium">
                          {item.title}
                        </div>
                        {item.value ? (
                          <div className="text-[10px] font-mono text-primary font-semibold mt-0.5">
                            {formatEGP(item.value)}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>

                    {/* Customer Info */}
                    <TableCell>
                      <div>
                        <div className="font-medium text-foreground">{item.customerName || "—"}</div>
                        {item.customerPhone && (
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {item.customerPhone}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Sales Owner */}
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{item.salesOwnerName || "—"}</span>
                      </div>
                    </TableCell>

                    {/* Attention Reason */}
                    <TableCell>
                      {getReasonBadge(item.reason)}
                    </TableCell>

                    {/* Next Action */}
                    <TableCell className="max-w-[220px]">
                      {item.nextAction ? (
                        <span className="text-foreground truncate block font-medium">
                          {item.nextAction}
                        </span>
                      ) : (
                        <span className="text-destructive font-semibold italic text-[11px]">
                          {isRtl ? "⚠️ لم يتم تحديد إجراء" : "⚠️ None scheduled"}
                        </span>
                      )}
                    </TableCell>

                    {/* Action Date */}
                    <TableCell>
                      {item.nextActionDate ? (
                        <div className="font-mono text-[11px]">
                          <span className={isOverdue ? "text-destructive font-bold" : "text-muted-foreground"}>
                            {new Date(item.nextActionDate).toLocaleDateString(isRtl ? "ar-EG" : "en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Log Activity Button */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenActivity(item)}
                          className="h-7 text-xs px-2 gap-1 border-primary/30 text-primary hover:bg-primary/10"
                          title={isRtl ? "تسجيل نشاط / متابعة" : "Log Activity"}
                        >
                          <PhoneCall className="h-3 w-3" />
                          <span>{isRtl ? "متابعة" : "Log"}</span>
                        </Button>

                        {/* Reassign Button */}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenReassign(item)}
                          className="h-7 text-xs px-2 gap-1 text-muted-foreground hover:text-foreground"
                          title={isRtl ? "إعادة إسناد" : "Reassign"}
                        >
                          <UserCheck className="h-3 w-3" />
                          <span>{isRtl ? "إسناد" : "Assign"}</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>

      {/* Activity Logging Modal */}
      {selectedActivityItem && (
        <LogActivityModal
          open={isActivityModalOpen}
          onOpenChange={setIsActivityModalOpen}
          entityType={selectedActivityItem.entityType}
          entityId={selectedActivityItem.id}
          entityCode={selectedActivityItem.code}
          entityTitle={selectedActivityItem.title}
          defaultNextAction={selectedActivityItem.nextAction || undefined}
          onSuccess={onRefresh}
        />
      )}

      {/* Reassign Modal */}
      {selectedReassignItem && (
        <ReassignModal
          open={isReassignModalOpen}
          onOpenChange={setIsReassignModalOpen}
          entityType={selectedReassignItem.entityType}
          entityId={selectedReassignItem.id}
          entityCode={selectedReassignItem.code}
          entityTitle={selectedReassignItem.title}
          currentSalesOwnerId={selectedReassignItem.salesOwnerId}
          onSuccess={onRefresh}
        />
      )}
    </Card>
  );
}
