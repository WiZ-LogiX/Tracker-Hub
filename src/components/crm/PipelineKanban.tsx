import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PIPELINE_STAGES,
  LOST_REASONS,
  type OpportunityItem,
  type PipelineStage,
} from "@/lib/crm-types";
import { formatEGP } from "@/lib/pricing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Clock,
  AlertTriangle,
  User,
  ArrowRight,
  ArrowLeft,
  MoreVertical,
  CheckCircle,
  XCircle,
  DollarSign,
  FileText,
} from "lucide-react";

interface PipelineKanbanProps {
  opportunities: OpportunityItem[];
  onSelectOpportunity: (opp: OpportunityItem) => void;
  onStageChange: (oppId: string, newStage: PipelineStage, lostReason?: string) => void;
  isLoading?: boolean;
}

export function PipelineKanban({
  opportunities,
  onSelectOpportunity,
  onStageChange,
  isLoading,
}: PipelineKanbanProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  // Lost Reason Modal State
  const [lostTargetOppId, setLostTargetOppId] = useState<string | null>(null);
  const [selectedLostReason, setSelectedLostReason] = useState<string>("price");
  const [customLostNote, setCustomLostNote] = useState("");

  const handleStageSelect = (oppId: string, newStage: PipelineStage) => {
    if (newStage === "lost") {
      setLostTargetOppId(oppId);
      setSelectedLostReason("price");
      setCustomLostNote("");
      return;
    }
    onStageChange(oppId, newStage);
  };

  const handleConfirmLost = () => {
    if (!lostTargetOppId) return;
    const finalReason = selectedLostReason === "other"
      ? (customLostNote.trim() || "other")
      : (customLostNote.trim() ? `${selectedLostReason}: ${customLostNote.trim()}` : selectedLostReason);

    onStageChange(lostTargetOppId, "lost", finalReason);
    setLostTargetOppId(null);
    setSelectedLostReason("price");
    setCustomLostNote("");
  };

  // Group opportunities by stage
  const stageGroups: Record<PipelineStage, OpportunityItem[]> = {
    new_lead: [],
    contacted: [],
    qualified: [],
    site_visit: [],
    design_measurement: [],
    quotation: [],
    negotiation: [],
    won: [],
    lost: [],
  };

  for (const opp of opportunities) {
    if (stageGroups[opp.stage]) {
      stageGroups[opp.stage].push(opp);
    } else {
      stageGroups.new_lead.push(opp);
    }
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 pt-1 min-h-[600px] scrollbar-thin">
      {PIPELINE_STAGES.map((stageInfo, stageIdx) => {
        const stageOpps = stageGroups[stageInfo.id] || [];
        const totalStageValue = stageOpps.reduce((sum, opp) => sum + opp.value, 0);

        const isWon = stageInfo.id === "won";
        const isLost = stageInfo.id === "lost";

        return (
          <div
            key={stageInfo.id}
            className={`flex-shrink-0 w-80 rounded-2xl flex flex-col border transition-all ${
              isWon
                ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-300/60 dark:border-emerald-800/50"
                : isLost
                ? "bg-rose-50/30 dark:bg-rose-950/20 border-rose-200/60 dark:border-rose-900/40"
                : "bg-muted/30 border-border/80"
            }`}
          >
            {/* Column Header */}
            <div className="p-3.5 border-b border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                  {isWon && <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />}
                  {isLost && <XCircle className="h-3.5 w-3.5 text-rose-600" />}
                  <span>{isRtl ? (stageInfo.nameAr ?? stageInfo.name) : stageInfo.name}</span>
                </span>
                <Badge
                  variant="secondary"
                  className="text-[11px] font-mono h-5 px-1.5 min-w-5 justify-center"
                >
                  {stageOpps.length}
                </Badge>
              </div>

              <span className="font-bold text-xs text-muted-foreground font-mono">
                {formatEGP(totalStageValue)}
              </span>
            </div>

            {/* Opportunities Cards Column */}
            <div className="p-2.5 flex-1 space-y-2.5 overflow-y-auto max-h-[calc(100vh-280px)]">
              {stageOpps.length === 0 ? (
                <div className="h-32 flex items-center justify-center border border-dashed rounded-xl border-border/60 text-xs text-muted-foreground/60 select-none">
                  {isRtl ? "لا توجد صفقات بهذه المرحلة" : "No deals in this stage"}
                </div>
              ) : (
                stageOpps.map((opp) => {
                  const hasNextAction = Boolean(opp.nextAction && opp.nextAction.trim());
                  const isOverdue =
                    opp.nextActionDate && new Date(opp.nextActionDate).getTime() < Date.now();

                  return (
                    <div
                      key={opp.id}
                      onClick={() => onSelectOpportunity(opp)}
                      className="group p-3.5 rounded-xl border border-border/80 bg-card hover:bg-muted/30 hover:border-primary/50 shadow-xs hover:shadow-md transition-all cursor-pointer space-y-2.5"
                    >
                      {/* Top row: OPP #, Project Type & Actions */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-primary text-[11px]">
                            {opp.opportunityNumber}
                          </span>
                          <Badge variant="outline" className="text-[10px] uppercase py-0 px-1 font-medium">
                            {opp.projectType}
                          </Badge>
                        </div>

                        {/* Quick stage transition menu */}
                        <div onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-muted-foreground hover:text-foreground opacity-70 group-hover:opacity-100"
                              >
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 text-xs">
                              {PIPELINE_STAGES.map((targetStage) => (
                                <DropdownMenuItem
                                  key={targetStage.id}
                                  disabled={targetStage.id === opp.stage}
                                  onClick={() => handleStageSelect(opp.id, targetStage.id)}
                                  className="text-xs flex items-center justify-between"
                                >
                                  <span>{targetStage.name}</span>
                                  {targetStage.id === opp.stage && (
                                    <CheckCircle className="h-3.5 w-3.5 text-primary" />
                                  )}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {/* Title & Customer Name */}
                      <div>
                        <h4 className="font-semibold text-xs text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                          {opp.title}
                        </h4>
                        <div className="text-[11px] text-muted-foreground line-clamp-1 flex items-center gap-1 mt-0.5">
                          <User className="h-3 w-3 flex-shrink-0" />
                          <span>{opp.customerName || isRtl ? "عميل غير مسمى" : "Unnamed customer"}</span>
                        </div>
                      </div>

                      {/* Deal Value & Sales Owner */}
                      <div className="flex items-center justify-between pt-1 border-t border-border/40 text-xs">
                        <span className="font-bold text-foreground font-mono">
                          {formatEGP(opp.value)}
                        </span>
                        {opp.salesOwnerName && (
                          <span className="text-[10px] text-muted-foreground truncate max-w-[110px]">
                            {opp.salesOwnerName}
                          </span>
                        )}
                      </div>

                      {/* Next Action Callout (CRITICAL ARCHITECTURE REQUIREMENT) */}
                      {!hasNextAction ? (
                        <div className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2 py-1 rounded-md border border-amber-500/20 font-medium">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                          <span className="truncate">
                            {isRtl ? "⚠️ لا توجد خطوة تالية مسجلة!" : "⚠️ No next action scheduled!"}
                          </span>
                        </div>
                      ) : (
                        <div
                          className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border ${
                            isOverdue
                              ? "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20 font-medium"
                              : "bg-muted text-muted-foreground border-border/50"
                          }`}
                        >
                          <Clock className={`h-3 w-3 flex-shrink-0 ${isOverdue ? "text-rose-600" : ""}`} />
                          <span className="truncate">{opp.nextAction}</span>
                          {opp.nextActionDate && (
                            <span className="text-[9px] opacity-75 font-mono">
                              ({new Date(opp.nextActionDate).toLocaleDateString()})
                            </span>
                          )}
                        </div>
                      )}

                      {/* Linked Stats badges: Quotes & Tasks */}
                      {((opp.quotesCount || 0) > 0 || (opp.tasksCount || 0) > 0) && (
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-0.5">
                          {(opp.quotesCount || 0) > 0 && (
                            <span className="flex items-center gap-0.5">
                              <FileText className="h-2.5 w-2.5 text-primary" />
                              <span>{opp.quotesCount} {isRtl ? "عروض" : "quotes"}</span>
                            </span>
                          )}
                          {(opp.tasksCount || 0) > 0 && (
                            <span>
                              {opp.openTasksCount || 0}/{opp.tasksCount} {isRtl ? "مهام" : "tasks"}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}

      {/* Lost Reason Dialog */}
      <Dialog open={lostTargetOppId !== null} onOpenChange={(open) => !open && setLostTargetOppId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span>{isRtl ? "تسجيل سبب خسارة الصفقة" : "Record Lost Deal Reason"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {isRtl
                ? "يجب تحديد سبب الخسارة بدقة لتحسين التسعير وتحليل الفاقد البيعي."
                : "Please specify why this deal was lost for sales analytics and pricing intelligence."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {isRtl ? "سبب الخسارة الرئيسي *" : "Primary Reason *"}
              </Label>
              <Select
                value={selectedLostReason}
                onValueChange={(val) => setSelectedLostReason(val)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOST_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value} className="text-xs">
                      {isRtl ? r.labelAr : r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {isRtl ? "ملاحظات إضافية / تفاصيل" : "Additional Notes / Details"}
              </Label>
              <Textarea
                value={customLostNote}
                onChange={(e) => setCustomLostNote(e.target.value)}
                placeholder={isRtl ? "أسباب تفصيلية، اسم المنافس أو ملاحظات العميل..." : "Details, competitor name, or customer remarks..."}
                rows={3}
                className="text-xs resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLostTargetOppId(null)}
              className="h-8 text-xs"
            >
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleConfirmLost}
              className="h-8 text-xs font-semibold"
            >
              {isRtl ? "تأكيد كصفقة خاسرة" : "Confirm as Lost"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
