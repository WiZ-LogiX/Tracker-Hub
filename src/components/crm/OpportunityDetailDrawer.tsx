import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  getOpportunityById,
  changeOpportunityStage,
  createOpportunityTask,
  updateOpportunity,
} from "@/lib/crm.functions";
import type { OpportunityDetail, PipelineStage } from "@/lib/crm-types";
import { PIPELINE_STAGES, LOST_REASONS } from "@/lib/crm-types";
import { formatEGP } from "@/lib/pricing";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  User,
  Phone,
  Mail,
  MapPin,
  Clock,
  CheckSquare,
  FileText,
  Package,
  Activity,
  Plus,
  Sparkles,
  ExternalLink,
  MessageCircle,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

interface OpportunityDetailDrawerProps {
  opportunityId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh?: () => void;
  userRole?: string;
}

export function OpportunityDetailDrawer({
  opportunityId,
  open,
  onOpenChange,
  onRefresh,
  userRole,
}: OpportunityDetailDrawerProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const getOpportunityByIdFn = useServerFn(getOpportunityById);
  const changeOpportunityStageFn = useServerFn(changeOpportunityStage);
  const createOpportunityTaskFn = useServerFn(createOpportunityTask);

  const [opp, setOpp] = useState<OpportunityDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("quotes");

  // Add Task Modal State
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskPriority, setTaskPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  // Lost Reason Modal State
  const [isLostModalOpen, setIsLostModalOpen] = useState(false);
  const [selectedLostReason, setSelectedLostReason] = useState<string>("price");
  const [customLostNote, setCustomLostNote] = useState("");
  const [isSubmittingLost, setIsSubmittingLost] = useState(false);

  const loadData = async () => {
    if (!opportunityId) return;
    setLoading(true);
    try {
      const data = await getOpportunityByIdFn({ data: { opportunityId } });
      setOpp(data);
    } catch (err: any) {
      toast.error(err?.message || (isRtl ? "فشل تحميل تفاصيل الصفقة" : "Failed to load deal details"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && opportunityId) {
      loadData();
    } else {
      setOpp(null);
    }
  }, [open, opportunityId]);

  const handleStageChange = async (newStage: PipelineStage) => {
    if (!opp) return;
    if (newStage === "lost") {
      setIsLostModalOpen(true);
      return;
    }
    try {
      await changeOpportunityStageFn({
        data: {
          opportunityId: opp.id,
          stage: newStage,
        },
      });
      toast.success(isRtl ? "تم تحديث مرحلة الصفقة" : "Stage updated");
      loadData();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast.error(err?.message || (isRtl ? "فشل تحديث المرحلة" : "Failed to update stage"));
    }
  };

  const handleConfirmLost = async () => {
    if (!opp) return;
    setIsSubmittingLost(true);
    const finalReason = selectedLostReason === "other"
      ? (customLostNote.trim() || "other")
      : (customLostNote.trim() ? `${selectedLostReason}: ${customLostNote.trim()}` : selectedLostReason);

    try {
      await changeOpportunityStageFn({
        data: {
          opportunityId: opp.id,
          stage: "lost",
          lostReason: finalReason,
        },
      });
      toast.success(isRtl ? "تم تسجيل الصفقة كخاسرة مع السبب" : "Deal marked as lost with reason");
      setIsLostModalOpen(false);
      setSelectedLostReason("price");
      setCustomLostNote("");
      loadData();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast.error(err?.message || (isRtl ? "فشل تحديث المرحلة" : "Failed to update stage"));
    } finally {
      setIsSubmittingLost(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opp || !taskTitle.trim()) return;

    setIsSubmittingTask(true);
    try {
      await createOpportunityTaskFn({
        data: {
          opportunityId: opp.id,
          title: taskTitle.trim(),
          description: taskDescription.trim() || null,
          priority: taskPriority,
          dueDate: taskDueDate || null,
        },
      });

      toast.success(isRtl ? "تمت إضافة المهمة التشغيلية بنجاح" : "Task added successfully");
      setIsTaskModalOpen(false);
      setTaskTitle("");
      setTaskDescription("");
      setTaskDueDate("");
      loadData();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast.error(err?.message || (isRtl ? "فشل إضافة المهمة" : "Failed to create task"));
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const handleWhatsApp = () => {
    if (!opp?.customerPhone) return;
    const phoneDigits = opp.customerPhone.replace(/\D/g, "");
    window.open(`https://wa.me/${phoneDigits}`, "_blank");
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={isRtl ? "left" : "right"}
          className="w-full sm:max-w-2xl p-0 flex flex-col h-full bg-background border-border overflow-hidden"
        >
          {/* Header */}
          <SheetHeader className="p-6 border-b border-border/80 bg-muted/20">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded-md bg-primary/10">
                    {opp?.opportunityNumber || "—"}
                  </span>
                  <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                    {opp?.projectType}
                  </Badge>
                </div>
                <SheetTitle className="text-xl font-bold font-serif text-foreground">
                  {opp?.title || (isRtl ? "تفاصيل الفرصة البيعية" : "Opportunity Details")}
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground flex items-center gap-2">
                  <User className="h-3 w-3" />
                  <span>{opp?.customerName || isRtl ? "عميل غير مسجل" : "Customer"}</span>
                  {opp?.customerPhone && <span className="font-mono">({opp.customerPhone})</span>}
                </SheetDescription>
              </div>

              {/* Deal Value & Stage Selector */}
              <div className="text-end space-y-2">
                <div className="text-xl font-bold font-mono text-foreground">
                  {formatEGP(opp?.value || 0)}
                </div>

                {opp && (
                  <Select
                    value={opp.stage}
                    onValueChange={(val) => handleStageChange(val as PipelineStage)}
                  >
                    <SelectTrigger className="h-7 text-xs w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PIPELINE_STAGES.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Next Action Callout Banner */}
            {opp && (
              <div
                className={`mt-4 p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                  !opp.nextAction
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300"
                    : "bg-primary/5 border-primary/20 text-foreground"
                }`}
              >
                <div className="flex items-center gap-2">
                  {!opp.nextAction ? (
                    <>
                      <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                      <span className="font-medium">
                        {isRtl ? "⚠️ لا يوجد إجراء قادم مجدول لهذه الصفقة!" : "⚠️ No next action scheduled!"}
                      </span>
                    </>
                  ) : (
                    <>
                      <Clock className="h-4 w-4 text-primary flex-shrink-0" />
                      <div>
                        <span className="font-semibold">{opp.nextAction}</span>
                        {opp.nextActionDate && (
                          <span className="text-muted-foreground ml-2 rtl:mr-2 text-[11px] font-mono">
                            ({new Date(opp.nextActionDate).toLocaleDateString()})
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsTaskModalOpen(true)}
                  className="h-7 text-xs gap-1 font-semibold"
                >
                  <Plus className="h-3 w-3" />
                  <span>{isRtl ? "إضافة خطوة / مهمة" : "Schedule Action"}</span>
                </Button>
              </div>
            )}
          </SheetHeader>

          {/* Body with Tabs */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Customer & Actions Card */}
            {opp?.customer && (
              <div className="p-4 rounded-xl border border-border/70 bg-card flex items-center justify-between gap-4 text-xs">
                <div className="space-y-1">
                  <div className="font-bold text-foreground flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-primary" />
                    <span>{opp.customer.name}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-[11px]">
                    {opp.customer.phone && (
                      <span className="flex items-center gap-1 font-mono">
                        <Phone className="h-3 w-3" />
                        <span>{opp.customer.phone}</span>
                      </span>
                    )}
                    {opp.customer.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        <span>{opp.customer.email}</span>
                      </span>
                    )}
                    {opp.customer.address && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <span>{opp.customer.address}</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {opp.customer.phone && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleWhatsApp}
                      className="h-8 gap-1 border-emerald-500/40 text-emerald-600 hover:bg-emerald-50 text-xs font-semibold"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      <span>WhatsApp</span>
                    </Button>
                  )}

                  {/* Direct Link to Commercial Quotation Builder with Customer & Opportunity pre-filled! */}
                  <Link
                    to="/admin/quotes/new"
                    search={{ customerId: opp.customerId, opportunityId: opp.id }}
                  >
                    <Button size="sm" className="h-8 gap-1.5 text-xs font-semibold bg-primary text-primary-foreground">
                      <Plus className="h-3 w-3" />
                      <span>{isRtl ? "إنشاء عرض سعر" : "New Quote"}</span>
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {/* Navigation Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full justify-start h-9 bg-muted/60 p-1">
                <TabsTrigger value="quotes" className="text-xs gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  <span>{isRtl ? "عروض الأسعار" : "Quotes"} ({opp?.quotes?.length || 0})</span>
                </TabsTrigger>
                <TabsTrigger value="tasks" className="text-xs gap-1.5">
                  <CheckSquare className="h-3.5 w-3.5" />
                  <span>{isRtl ? "المهام والمتابعات" : "Tasks"} ({opp?.tasks?.length || 0})</span>
                </TabsTrigger>
                <TabsTrigger value="orders" className="text-xs gap-1.5">
                  <Package className="h-3.5 w-3.5" />
                  <span>{isRtl ? "أوامر الإنتاج" : "Orders"} ({opp?.orders?.length || 0})</span>
                </TabsTrigger>
                <TabsTrigger value="timeline" className="text-xs gap-1.5">
                  <Activity className="h-3.5 w-3.5" />
                  <span>{isRtl ? "سجل الأحداث" : "Timeline"}</span>
                </TabsTrigger>
              </TabsList>

              {/* QUOTES TAB */}
              <TabsContent value="quotes" className="space-y-3 pt-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    {isRtl ? "عروض الأسعار المرتبطة بهذه الفرصة" : "Linked Quotations"}
                  </span>
                  {opp && (
                    <Link
                      to="/admin/quotes/new"
                      search={{ customerId: opp.customerId, opportunityId: opp.id }}
                    >
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-primary">
                        <Plus className="h-3 w-3" />
                        <span>{isRtl ? "عرض سعر جديد" : "Create Quote"}</span>
                      </Button>
                    </Link>
                  )}
                </div>

                {(!opp?.quotes || opp.quotes.length === 0) ? (
                  <div className="text-center p-8 border-2 border-dashed rounded-xl text-xs text-muted-foreground">
                    {isRtl ? "لا توجد عروض أسعار محررة لهذه الصفقة حتى الآن" : "No quotes generated for this deal yet."}
                  </div>
                ) : (
                  opp.quotes.map((q) => (
                    <div
                      key={q.id}
                      className="p-3 border rounded-xl bg-card flex items-center justify-between text-xs hover:bg-muted/20 transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-primary">{q.quoteNumber}</span>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {q.status}
                          </Badge>
                        </div>
                        <div className="text-muted-foreground text-[11px]">
                          {new Date(q.createdAt).toLocaleDateString()}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-foreground">
                          {formatEGP(q.totalAmount)}
                        </span>
                        <Link to="/admin/quotes/$id" params={{ id: q.id }}>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              {/* TASKS TAB */}
              <TabsContent value="tasks" className="space-y-3 pt-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    {isRtl ? "المهام التشغيلية ومواعيد المتابعة" : "Operational Tasks & Follow-ups"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsTaskModalOpen(true)}
                    className="h-7 text-xs gap-1 text-primary"
                  >
                    <Plus className="h-3 w-3" />
                    <span>{isRtl ? "إضافة مهمة" : "New Task"}</span>
                  </Button>
                </div>

                {(!opp?.tasks || opp.tasks.length === 0) ? (
                  <div className="text-center p-8 border-2 border-dashed rounded-xl text-xs text-muted-foreground">
                    {isRtl ? "لا توجد مهام متابعة مسجلة" : "No tasks recorded."}
                  </div>
                ) : (
                  opp.tasks.map((t) => (
                    <div
                      key={t.id}
                      className="p-3 border rounded-xl bg-card flex items-center justify-between text-xs hover:bg-muted/20 transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-primary">{t.taskCode}</span>
                          <span className="font-medium text-foreground">{t.title}</span>
                        </div>
                        {t.dueDate && (
                          <div className="text-muted-foreground text-[11px] flex items-center gap-1 font-mono">
                            <Clock className="h-3 w-3" />
                            <span>{new Date(t.dueDate).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {t.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              {/* ORDERS TAB */}
              <TabsContent value="orders" className="space-y-3 pt-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    {isRtl ? "أوامر الإنتاج المرتبطة بالعميل" : "Customer Production Orders"}
                  </span>
                </div>

                {(!opp?.orders || opp.orders.length === 0) ? (
                  <div className="text-center p-8 border-2 border-dashed rounded-xl text-xs text-muted-foreground">
                    {isRtl ? "لا توجد أوامر إنتاج بعد" : "No production orders yet."}
                  </div>
                ) : (
                  opp.orders.map((o) => (
                    <div
                      key={o.id}
                      className="p-3 border rounded-xl bg-card flex items-center justify-between text-xs hover:bg-muted/20 transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="font-mono font-bold text-primary">{o.orderNumber}</div>
                        <div className="text-muted-foreground text-[11px]">
                          {new Date(o.createdAt).toLocaleDateString()}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-[10px]">
                          {o.status}
                        </Badge>
                        <span className="font-mono font-bold text-foreground">
                          {formatEGP(o.totalAmount)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              {/* TIMELINE TAB */}
              <TabsContent value="timeline" className="space-y-3 pt-3">
                <span className="text-xs font-semibold uppercase text-muted-foreground block mb-2">
                  {isRtl ? "سجل النشاط التجاري والعمليات" : "Activity & Audit History"}
                </span>

                {(!opp?.timeline || opp.timeline.length === 0) ? (
                  <div className="text-center p-8 border-2 border-dashed rounded-xl text-xs text-muted-foreground">
                    {isRtl ? "لا توجد أنشطة مسجلة" : "No activity recorded."}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {opp.timeline.map((evt) => (
                      <div
                        key={evt.id}
                        className="p-3 rounded-xl border border-border/70 bg-card text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">{evt.title}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {new Date(evt.timestamp).toLocaleString()}
                          </span>
                        </div>
                        {evt.description && (
                          <div className="text-muted-foreground text-[11px]">{evt.description}</div>
                        )}
                        {evt.actorName && (
                          <div className="text-[10px] text-primary font-medium">
                            {isRtl ? `بواسطة: ${evt.actorName}` : `By: ${evt.actorName}`}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>

      {/* Quick Add Task Modal */}
      <Dialog open={isTaskModalOpen} onOpenChange={setIsTaskModalOpen}>
        <DialogContent className="sm:max-w-md text-xs">
          <form onSubmit={handleCreateTask}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold">
                {isRtl ? "إضافة مهمة تشغيلية / خطوة قادمة" : "Schedule Next Action / Task"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-3">
              <div className="space-y-1">
                <Label className="text-xs">{isRtl ? "عنوان المهمة *" : "Task Title *"}</Label>
                <Input
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder={isRtl ? "مثال: معاينة الموقع، إرسال عرض معدل..." : "e.g. Site inspection, follow-up call..."}
                  className="h-8 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{isRtl ? "تاريخ الاستحقاق" : "Due Date"}</Label>
                  <Input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">{isRtl ? "الأولوية" : "Priority"}</Label>
                  <Select value={taskPriority} onValueChange={(v: any) => setTaskPriority(v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">{isRtl ? "منخفضة" : "Low"}</SelectItem>
                      <SelectItem value="medium">{isRtl ? "متوسطة" : "Medium"}</SelectItem>
                      <SelectItem value="high">{isRtl ? "عالية" : "High"}</SelectItem>
                      <SelectItem value="critical">{isRtl ? "عاجلة جداً" : "Critical"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{isRtl ? "ملاحظات وتفاصيل" : "Description / Notes"}</Label>
                <Textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder={isRtl ? "أية تفاصيل إضافية..." : "Additional instructions or notes..."}
                  rows={2}
                  className="text-xs resize-none"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsTaskModalOpen(false)}
                className="h-8 text-xs"
              >
                {isRtl ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmittingTask || !taskTitle.trim()}
                className="h-8 text-xs font-semibold"
              >
                {isSubmittingTask
                  ? isRtl
                    ? "جارٍ الحفظ..."
                    : "Saving..."
                  : isRtl
                  ? "حفظ المهمة"
                  : "Save Task"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Lost Reason Dialog */}
      <Dialog open={isLostModalOpen} onOpenChange={setIsLostModalOpen}>
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
              onClick={() => setIsLostModalOpen(false)}
              className="h-8 text-xs"
            >
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isSubmittingLost}
              onClick={handleConfirmLost}
              className="h-8 text-xs font-semibold"
            >
              {isSubmittingLost
                ? isRtl
                  ? "جارٍ التسجيل..."
                  : "Saving..."
                : isRtl
                ? "تأكيد كصفقة خاسرة"
                : "Confirm as Lost"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
