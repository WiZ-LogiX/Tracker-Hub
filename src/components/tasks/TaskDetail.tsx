import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/useAuth";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Clock,
  AlertCircle,
  CheckCircle2,
  PlayCircle,
  PauseCircle,
  ClipboardCheck,
  User,
  Package,
  FileText,
  UserCircle,
  ExternalLink,
  Undo2,
  Paperclip,
  MessageSquare,
  History,
  Pencil,
  Hammer,
  RotateCcw,
  Truck,
  Check,
  Calendar,
  Headphones,
  FolderKanban,
} from "lucide-react";
import type { TaskItem, TaskStatus } from "@/lib/task-types";
import { InternalNotes } from "@/components/admin/InternalNotes";
import { AttachmentList } from "@/components/attachment-list";
import { AttachmentUploader } from "@/components/attachment-uploader";
import { getTaskAuditHistory, acknowledgeTaskCompletion } from "@/lib/tasks.functions";
import { toast } from "sonner";

interface TaskDetailProps {
  task: TaskItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus, reviewNotes?: string) => Promise<void>;
  onEditTask?: (task: TaskItem) => void;
  onTaskUpdated?: () => void;
  userRole?: string;
}

export function TaskDetail({
  task,
  open,
  onOpenChange,
  onStatusChange,
  onEditTask,
  onTaskUpdated,
  userRole,
}: TaskDetailProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const { currentRole } = useAuth();
  const effectiveRole = userRole || currentRole;
  const isWorker = effectiveRole === "worker";
  const getAuditHistoryFn = useServerFn(getTaskAuditHistory);

  const [activeTab, setActiveTab] = useState("overview");
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [completionNotes, setCompletionNotes] = useState("");
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [isAcknowledged, setIsAcknowledged] = useState(task?.isAcknowledged || false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [attachmentsRefreshKey, setAttachmentsRefreshKey] = useState(0);

  const canManage = !isWorker && effectiveRole !== "viewer";

  const acknowledgeFn = useServerFn(acknowledgeTaskCompletion);

  useEffect(() => {
    setIsAcknowledged(task?.isAcknowledged || false);
  }, [task?.isAcknowledged]);

  useEffect(() => {
    if (open && task?.id) {
      getAuditHistoryFn({ data: { taskId: task.id } })
        .then((res: any) => {
          if (Array.isArray(res)) {
            setAuditLogs(res);
          }
        })
        .catch((err) => {
          console.error("Failed to load task audit history", err);
        });
    }
  }, [open, task?.id, task?.status]);

  if (!task) return null;

  const handleReturnSubmit = async () => {
    if (!returnReason.trim()) {
      toast.error(isRtl ? "يرجى كتابة سبب الإرجاع" : "Please provide return feedback");
      return;
    }
    await onStatusChange(task.id, "in_progress", returnReason.trim());
    setReturnDialogOpen(false);
    setReturnReason("");
  };

  const handleCompleteSubmit = async () => {
    await onStatusChange(task.id, "completed", completionNotes.trim() || undefined);
    setCompleteDialogOpen(false);
    setCompletionNotes("");
  };

  const handleReopenSubmit = async () => {
    if (!reopenReason.trim()) {
      toast.error(isRtl ? "يرجى كتابة سبب إعادة فتح المهمة" : "Please provide reopen feedback");
      return;
    }
    await onStatusChange(task.id, "in_progress", reopenReason.trim());
    setReopenDialogOpen(false);
    setReopenReason("");
    setIsAcknowledged(false);
  };

  const handleAcknowledge = async () => {
    setAcknowledging(true);
    try {
      await acknowledgeFn({ data: { taskId: task.id } });
      setIsAcknowledged(true);
      toast.success(isRtl ? "تم اعتماد واكتمال المهمة" : "Task completion acknowledged");
      onTaskUpdated?.();
    } catch (e: any) {
      toast.error(e?.message || (isRtl ? "فشل الاعتماد" : "Failed to acknowledge"));
    } finally {
      setAcknowledging(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={isRtl ? "left" : "right"}
          className="sm:max-w-xl w-full overflow-y-auto p-0 flex flex-col"
        >
          {/* Top Sheet Header */}
          <div className="p-5 border-b space-y-3 bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-md">
                  {task.taskCode}
                </span>
                <Badge
                  variant="outline"
                  className={`text-[11px] font-semibold capitalize ${
                    task.priority === "critical"
                      ? "bg-rose-50 text-rose-700 border-rose-200 animate-pulse font-bold"
                      : task.priority === "high"
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-blue-50 text-blue-700 border-blue-200"
                  }`}
                >
                  {task.priority}
                </Badge>
              </div>

              {canManage && onEditTask && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onEditTask(task);
                  }}
                  className="h-8 text-xs gap-1.5 rounded-lg"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>{isRtl ? "تعديل" : "Edit"}</span>
                </Button>
              )}
            </div>

            <SheetTitle className="text-xl font-bold font-serif leading-snug text-foreground text-start">
              {task.title}
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground flex items-center gap-2 text-start">
              <span className="font-semibold text-foreground/80">{task.category}</span>
              <span>•</span>
              <span>
                {isRtl ? "أُنشئت في: " : "Created: "}
                {new Date(task.createdAt).toLocaleDateString(isRtl ? "ar-EG" : "en-US")}
              </span>
            </SheetDescription>
          </div>

          {/* Overdue Alert Banner */}
          {task.isOverdue && (
            <div className="mx-5 mt-4 flex items-center gap-2 p-3 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl text-xs font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{isRtl ? "هذه المهمة متأخرة عن موعد استحقاقها!" : "This task is overdue!"}</span>
            </div>
          )}

          {/* Returned by Manager Feedback Box */}
          {task.reviewNotes && task.status === "in_progress" && (
            <div className="mx-5 mt-3 p-3 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-amber-900">
                <Undo2 className="h-3.5 w-3.5 text-amber-700" />
                <span>{isRtl ? "ملاحظات المشرف عند الإرجاع:" : "Supervisor Return Notes:"}</span>
              </div>
              <p className="text-xs leading-relaxed whitespace-pre-wrap">{task.reviewNotes}</p>
            </div>
          )}

          {/* Quick Status Transition Actions */}
          <div className="mx-5 mt-4 p-3 bg-card border rounded-xl space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {isRtl ? "إجراءات الحالة والتشغيل" : "Operational Actions"}
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Worker: Start */}
              {task.status === "not_started" && (
                <Button
                  size="sm"
                  onClick={() => onStatusChange(task.id, "in_progress")}
                  className="h-8 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                >
                  <PlayCircle className="h-3.5 w-3.5" />
                  <span>{isRtl ? "بدء التنفيذ" : "Start Work"}</span>
                </Button>
              )}

              {/* Worker: In Progress Actions (Complete or Submit for Review) */}
              {task.status === "in_progress" && (
                <>
                  <Button
                    size="sm"
                    onClick={() => setCompleteDialogOpen(true)}
                    className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{isRtl ? "إتمام المهمة" : "Complete Task"}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onStatusChange(task.id, "waiting_review")}
                    className="h-8 text-xs gap-1.5 bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 rounded-lg"
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    <span>{isRtl ? "إرسال للمراجعة" : "Submit for Review"}</span>
                  </Button>
                </>
              )}

              {/* Manager: Approve / Complete */}
              {task.status === "waiting_review" && canManage && (
                <>
                  <Button
                    size="sm"
                    onClick={() => onStatusChange(task.id, "completed")}
                    className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{isRtl ? "اعتماد واكتمال" : "Approve & Complete"}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setReturnDialogOpen(true)}
                    className="h-8 text-xs gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50 rounded-lg"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    <span>{isRtl ? "إرجاع للتعديل" : "Return for Changes"}</span>
                  </Button>
                </>
              )}

              {/* Manager: Cancel */}
              {task.status !== "completed" && task.status !== "cancelled" && canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onStatusChange(task.id, "cancelled")}
                  className="h-8 text-xs text-muted-foreground hover:text-destructive rounded-lg"
                >
                  <span>{isRtl ? "إلغاء المهمة" : "Cancel Task"}</span>
                </Button>
              )}

              {/* Completed Status Actions (Acknowledgment & Reopen) */}
              {task.status === "completed" && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{isRtl ? "تم إنجاز المهمة" : "Task Completed"}</span>
                  </div>

                  {isAcknowledged ? (
                    <Badge variant="outline" className="text-[11px] bg-emerald-50 text-emerald-800 border-emerald-300 gap-1 py-0.5 font-medium">
                      <Check className="h-3 w-3 text-emerald-600" />
                      <span>{isRtl ? "تم اعتماد الاكتمال من الإدارة" : "Completion Acknowledged"}</span>
                    </Badge>
                  ) : canManage ? (
                    <Button
                      size="sm"
                      onClick={handleAcknowledge}
                      disabled={acknowledging}
                      className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground rounded-lg"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>{isRtl ? "تأكيد واعتماد الإنجاز" : "Acknowledge Completion"}</span>
                    </Button>
                  ) : null}

                  {canManage && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setReopenDialogOpen(true)}
                      className="h-8 text-xs gap-1.5 text-amber-800 border-amber-300 hover:bg-amber-50 rounded-lg"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      <span>{isRtl ? "إعادة فتح المهمة" : "Reopen Task"}</span>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex-1 px-5 mt-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid grid-cols-4 w-full h-9 rounded-xl bg-muted/50 p-1">
                <TabsTrigger value="overview" className="text-xs gap-1 rounded-lg">
                  <FileText className="h-3.5 w-3.5" />
                  <span>{isRtl ? "التفاصيل" : "Overview"}</span>
                </TabsTrigger>
                <TabsTrigger value="comments" className="text-xs gap-1 rounded-lg">
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>{isRtl ? "المحادثة" : "Chat"}</span>
                </TabsTrigger>
                <TabsTrigger value="attachments" className="text-xs gap-1 rounded-lg">
                  <Paperclip className="h-3.5 w-3.5" />
                  <span>{isRtl ? "الإثباتات" : "Evidence"}</span>
                </TabsTrigger>
                <TabsTrigger value="audit" className="text-xs gap-1 rounded-lg">
                  <History className="h-3.5 w-3.5" />
                  <span>{isRtl ? "السجل" : "History"}</span>
                </TabsTrigger>
              </TabsList>

              {/* Tab 1: Overview */}
              <TabsContent value="overview" className="space-y-4 pt-3 pb-8 text-sm">
                {/* Description */}
                {task.description ? (
                  <div className="space-y-1.5">
                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {isRtl ? "الوصف والتعليمات" : "Description & Instructions"}
                    </div>
                    <p className="text-xs text-foreground/90 whitespace-pre-wrap bg-muted/30 p-3 rounded-xl border">
                      {task.description}
                    </p>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground/60 italic py-1">
                    {isRtl ? "لا يوجد وصف إضافي لهذه المهمة" : "No additional description provided"}
                  </div>
                )}

                {/* Assigned Workers (Smart workforce presentation) */}
                <div className="space-y-2 bg-card border rounded-xl p-3.5 shadow-xs">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                    <span>{isRtl ? "الفنيون المكلفون" : "Assigned Workers"}</span>
                    <span className="font-mono text-primary font-bold">
                      {task.assignees?.length || 0}
                    </span>
                  </div>

                  {task.assignees && task.assignees.length > 0 ? (
                    <div className="space-y-1.5">
                      {task.assignees.map((a, idx) => (
                        <div
                          key={a.userId || idx}
                          className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-primary/20 text-primary font-bold text-[10px] flex items-center justify-center uppercase">
                              {(a.userName || a.userEmail || "U").slice(0, 2)}
                            </div>
                            <div>
                              <div className="font-semibold text-foreground">
                                {a.userName || a.userEmail || a.userId.slice(0, 8)}
                              </div>
                              <div className="text-[10px] text-muted-foreground capitalize">
                                {a.memberRole || "worker"}
                              </div>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {new Date(a.assignedAt).toLocaleDateString(isRtl ? "ar-EG" : "en-US")}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground/60 italic p-2">
                      {isRtl ? "لم يتم تكليف أي فني بعد" : "No workers assigned yet"}
                    </div>
                  )}
                </div>

                {/* Context Linking (Phase 10 & 11) */}
                <div className="space-y-2.5 bg-card border rounded-xl p-3.5 shadow-xs">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {isRtl ? "الارتباطات التشغيلية والتصنيعية" : "Operational Context"}
                  </div>

                  <div className="space-y-2 text-xs">
                    {task.orderNumber && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Package className="h-3.5 w-3.5 text-primary" />
                          {isRtl ? "أمر الإنتاج:" : "Production Order:"}
                        </span>
                        {isWorker ? (
                          <span className="font-mono font-bold text-primary">{task.orderNumber}</span>
                        ) : (
                          <Link
                            to="/admin/orders"
                            className="font-mono font-bold text-primary hover:underline flex items-center gap-1"
                          >
                            <span>{task.orderNumber}</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    )}

                    {task.workOrderNumber && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Hammer className="h-3.5 w-3.5 text-amber-600" />
                          {isRtl ? "أمر التشغيل:" : "Work Order:"}
                        </span>
                        {isWorker ? (
                          <span className="font-mono font-bold text-amber-700">{task.workOrderNumber}</span>
                        ) : (
                          <Link
                            to="/admin/work-orders"
                            className="font-mono font-bold text-amber-700 hover:underline flex items-center gap-1"
                          >
                            <span>{task.workOrderNumber}</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    )}

                    {task.remakeNumber && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <RotateCcw className="h-3.5 w-3.5 text-destructive" />
                          {isRtl ? "إعادة التصنيع:" : "Remake Ticket:"}
                        </span>
                        {isWorker ? (
                          <span className="font-mono font-bold text-destructive">{task.remakeNumber}</span>
                        ) : (
                          <Link
                            to="/admin/remakes"
                            className="font-mono font-bold text-destructive hover:underline flex items-center gap-1"
                          >
                            <span>{task.remakeNumber}</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    )}

                    {task.deliveryNumber && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Truck className="h-3.5 w-3.5 text-blue-600" />
                          {isRtl ? "أمر الشحن / التركيب:" : "Delivery Handover:"}
                        </span>
                        {isWorker ? (
                          <span className="font-mono font-bold text-blue-700">{task.deliveryNumber}</span>
                        ) : (
                          <Link
                            to="/admin/deliveries"
                            className="font-mono font-bold text-blue-700 hover:underline flex items-center gap-1"
                          >
                            <span>{task.deliveryNumber}</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    )}

                    {task.caseNumber && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Headphones className="h-3.5 w-3.5 text-purple-600" />
                          {isRtl ? "بلاغ الخدمة (ما بعد البيع):" : "Service Case:"}
                        </span>
                        {isWorker ? (
                          <span className="font-mono font-bold text-purple-700">{task.caseNumber}</span>
                        ) : (
                          <Link
                            to="/admin/crm/after-sales"
                            className="font-mono font-bold text-purple-700 hover:underline flex items-center gap-1"
                          >
                            <span>{task.caseNumber}</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    )}

                    {task.opportunityId && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <FolderKanban className="h-3.5 w-3.5 text-primary" />
                          {isRtl ? "مساحة عمل المشروع:" : "Project Workspace:"}
                        </span>
                        {!isWorker ? (
                          <Link
                            to="/admin/projects/$id"
                            params={{ id: task.opportunityId }}
                            className="font-mono font-bold text-primary hover:underline flex items-center gap-1"
                          >
                            <span>{isRtl ? "عرض المشروع" : "View Project"}</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : (
                          <span className="font-mono font-medium">{isRtl ? "مشروع مرتبط" : "Linked Project"}</span>
                        )}
                      </div>
                    )}

                    {task.quoteNumber && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5 text-secondary" />
                          {isRtl ? "المقايسة:" : "Quotation:"}
                        </span>
                        {!isWorker && task.quoteId ? (
                          <Link
                            to="/admin/quotes/$id"
                            params={{ id: task.quoteId }}
                            className="font-mono font-bold text-primary hover:underline flex items-center gap-1"
                          >
                            <span>{task.quoteNumber}</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : (
                          <span className="font-mono font-medium">{task.quoteNumber}</span>
                        )}
                      </div>
                    )}

                    {task.customerName && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <UserCircle className="h-3.5 w-3.5" />
                          {isRtl ? "العميل:" : "Customer:"}
                        </span>
                        <span className="font-medium">{task.customerName}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Dates summary */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 border rounded-xl bg-card space-y-1">
                    <div className="text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{isRtl ? "تاريخ الاستحقاق" : "Due Date"}</span>
                    </div>
                    <div className="font-semibold">
                      {task.dueDate
                        ? new Date(task.dueDate).toLocaleDateString(isRtl ? "ar-EG" : "en-US")
                        : "—"}
                    </div>
                  </div>

                  <div className="p-3 border rounded-xl bg-card space-y-1">
                    <div className="text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{isRtl ? "تاريخ الاكتمال" : "Completed At"}</span>
                    </div>
                    <div className="font-semibold">
                      {task.completedAt
                        ? new Date(task.completedAt).toLocaleDateString(isRtl ? "ar-EG" : "en-US")
                        : "—"}
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Tab 2: Comments & Chat (Phase 13) */}
              <TabsContent value="comments" className="pt-3 pb-8">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    {isRtl
                      ? "التواصل بين الفني والمشرف حول تنفيذ المهمة وإرسال الملاحظات"
                      : "Direct execution communication between worker and supervisor"}
                  </div>
                  <InternalNotes entityType="task" entityId={task.id} />
                </div>
              </TabsContent>

              {/* Tab 3: Evidence & Attachments (Phase 14) */}
              <TabsContent value="attachments" className="pt-3 pb-8 space-y-4">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-foreground">
                    {isRtl ? "صور وإثباتات التنفيذ الميداني" : "Field Execution Evidence & Photos"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {isRtl
                      ? "ارفع صور تقطيع الأخشاب، تجميع الوحدات، أو إثباتات التركيب والجودة عبر R2"
                      : "Upload photos of cutting, assembly, QC, or delivery proofs via private R2"}
                  </div>
                </div>

                <AttachmentUploader
                  entityType="task"
                  entityId={task.id}
                  onUploaded={() => setAttachmentsRefreshKey((k) => k + 1)}
                />

                <AttachmentList
                  entityType="task"
                  entityId={task.id}
                  refreshKey={attachmentsRefreshKey}
                  canDelete={canManage}
                />
              </TabsContent>

              {/* Tab 4: Audit Trail (Phase 22) */}
              <TabsContent value="audit" className="pt-3 pb-8 space-y-3">
                <div className="text-xs text-muted-foreground">
                  {isRtl
                    ? "سجل غير قابل للتعديل يوثق جميع التغييرات والإسنادات وحالات المراجعة"
                    : "Immutable audit trail of all task status transitions, assignments, and reviews"}
                </div>

                {auditLogs.length === 0 ? (
                  <div className="text-xs text-muted-foreground/60 italic p-4 text-center border border-dashed rounded-xl">
                    {isRtl ? "لا توجد سجلات بعد" : "No audit records found"}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="p-2.5 rounded-lg border bg-muted/20 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">
                            {log.action === "task_created"
                              ? isRtl ? "إنشاء المهمة" : "Task Created"
                              : log.action === "status_changed"
                              ? isRtl ? "تغيير الحالة" : "Status Changed"
                              : log.action === "task_submitted_review"
                              ? isRtl ? "إرسال للمراجعة" : "Submitted for Review"
                              : log.action === "task_approved"
                              ? isRtl ? "اعتماد واكتمال" : "Approved & Completed"
                              : log.action === "task_returned"
                              ? isRtl ? "إرجاع للتعديل" : "Returned for Changes"
                              : log.action === "task_reassigned"
                              ? isRtl ? "إعادة إسناد" : "Reassigned"
                              : log.action}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {new Date(log.createdAt).toLocaleString(isRtl ? "ar-EG" : "en-US")}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {isRtl ? "بواسطة: " : "By: "}
                          <span className="font-medium text-foreground">
                            {log.actorName || log.actorUsername || log.actorId}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>

      {/* Return for Changes Reason Dialog (Phase 15) */}
      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-amber-700">
              <Undo2 className="h-5 w-5" />
              <span>{isRtl ? "إرجاع المهمة للفني للتعديل" : "Return Task to Worker"}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label className="text-xs font-semibold">
              {isRtl ? "سبب الإرجاع والتعليمات التصحيحية *" : "Return Reason & Corrective Instructions *"}
            </Label>
            <Input
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder={isRtl ? "مثال: المقاس يحتاج ضبط إضافي 2 مم أو صورة المفصلات غير واضحة" : "e.g., Adjust dimension by 2mm..."}
              required
              className="text-xs"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setReturnDialogOpen(false)}>
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button size="sm" onClick={handleReturnSubmit} className="bg-amber-600 hover:bg-amber-700 text-white">
              {isRtl ? "تأكيد الإرجاع" : "Confirm Return"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Task Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              <span>{isRtl ? "تأكيد اكتمال المهمة" : "Complete Task"}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <p className="text-muted-foreground">
              {isRtl
                ? "هل قمت بإنهاء كافة الأعمال والتعليمات المطلوبة في هذه المهمة؟ يمكنك إضافة ملاحظات الإنجاز أدناه (اختياري)."
                : "Have you completed all required work for this task? You can provide optional completion notes below."}
            </p>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">
                {isRtl ? "ملاحظات الإنجاز (اختياري)" : "Completion Notes (Optional)"}
              </Label>
              <Input
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                placeholder={isRtl ? "مثال: تم التقطيع والتجميع حسب المقاسات..." : "e.g., Panels cut and verified..."}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setCompleteDialogOpen(false)}>
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              size="sm"
              onClick={handleCompleteSubmit}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {isRtl ? "تأكيد الاكتمال" : "Confirm Completion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen Task Dialog */}
      <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-amber-700">
              <Undo2 className="h-5 w-5" />
              <span>{isRtl ? "إعادة فتح المهمة للفنيين" : "Reopen Task for Workers"}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <p className="text-muted-foreground">
              {isRtl
                ? "سيتم إعادة المهمة إلى حالة 'قيد التنفيذ' وإشعار الموظفين المكلفين بملاحظاتك."
                : "The task will be set back to 'In Progress' and assigned workers will be notified with your feedback."}
            </p>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">
                {isRtl ? "سبب إعادة الفتح وملاحظات التعديل *" : "Reopen Reason & Notes *"}
              </Label>
              <Input
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder={isRtl ? "مثال: يرجى إعادة فحص المقاسات والتثبيت..." : "e.g., Please re-check measurements..."}
                className="text-xs"
                required
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setReopenDialogOpen(false)}>
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              size="sm"
              onClick={handleReopenSubmit}
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
            >
              {isRtl ? "إعادة فتح المهمة" : "Reopen Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
