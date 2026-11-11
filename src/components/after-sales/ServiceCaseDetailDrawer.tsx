import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { TaskForm } from "@/components/tasks/TaskForm";
import {
  getServiceCaseById,
  updateServiceCaseStatus,
  assignServiceCase,
  createRemakeForCase,
} from "@/lib/after-sales.functions";
import type {
  ServiceCaseDetailData,
  ServiceCaseStatus,
  ServiceCaseType,
} from "@/lib/after-sales-types";
import { CASE_STATUS_TRANSITIONS } from "@/lib/after-sales-types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { AttachmentUploader } from "@/components/attachment-uploader";
import { AttachmentList } from "@/components/attachment-list";
import { toast } from "sonner";
import {
  Headphones,
  ShieldCheck,
  ShieldAlert,
  Clock,
  User,
  Phone,
  MessageCircle,
  Package,
  Truck,
  CheckSquare,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Calendar,
  Layers,
  ArrowRight,
  Plus,
} from "lucide-react";

interface ServiceCaseDetailDrawerProps {
  caseId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefreshList?: () => void;
  userRole?: string;
}

export function ServiceCaseDetailDrawer({
  caseId,
  open,
  onOpenChange,
  onRefreshList,
  userRole,
}: ServiceCaseDetailDrawerProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const getCaseFn = useServerFn(getServiceCaseById);
  const updateStatusFn = useServerFn(updateServiceCaseStatus);
  const assignFn = useServerFn(assignServiceCase);
  const createRemakeFn = useServerFn(createRemakeForCase);

  const [caseData, setCaseData] = useState<ServiceCaseDetailData | null>(null);
  const [loading, setLoading] = useState(false);

  // Transition / Resolution Modal state
  const [targetStatus, setTargetStatus] = useState<ServiceCaseStatus | null>(null);
  const [resolutionText, setResolutionText] = useState("");
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);

  // Task creation sub-modal
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  // Remake creation sub-modal
  const [isRemakeModalOpen, setIsRemakeModalOpen] = useState(false);
  const [remakeReason, setRemakeReason] = useState("");
  const [remakeDefectDesc, setRemakeDefectDesc] = useState("");

  const isWorker = userRole === "worker";
  const isViewer = userRole === "viewer";

  const loadCase = async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const res = await getCaseFn({ data: { caseId } });
      setCaseData(res);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load case details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && caseId) {
      loadCase();
    }
  }, [open, caseId]);

  if (!caseId) return null;

  const handleWhatsApp = () => {
    if (!caseData?.customerPhone) return;
    const cleanPhone = caseData.customerPhone.replace(/[^0-9]/g, "");
    const intlPhone = cleanPhone.startsWith("0") ? `2${cleanPhone}` : cleanPhone;
    window.open(`https://wa.me/${intlPhone}`, "_blank", "noopener,noreferrer");
  };

  const executeStatusTransition = async (newStatus: ServiceCaseStatus, resNote?: string) => {
    if (newStatus === "resolved" && (!resNote || resNote.trim().length === 0)) {
      setTargetStatus("resolved");
      setIsResolveModalOpen(true);
      return;
    }

    try {
      await updateStatusFn({
        data: {
          caseId,
          status: newStatus,
          resolution: resNote || undefined,
        },
      });
      toast.success(
        isRtl
          ? `تم تحديث حالة البلاغ إلى: ${getStatusLabel(newStatus, isRtl)}`
          : `Status updated to: ${newStatus}`,
      );
      loadCase();
      onRefreshList?.();
      setIsResolveModalOpen(false);
      setResolutionText("");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update case status");
    }
  };


  const handleCreateRemake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remakeReason.trim()) return;

    try {
      await createRemakeFn({
        data: {
          caseId,
          reason: remakeReason.trim(),
          defectDescription: remakeDefectDesc.trim() || undefined,
          severity: caseData?.priority || "medium",
        },
      });
      toast.success(isRtl ? "تم إصدار أمر إعادة تصنيع للورشة بنجاح" : "Remake order issued");
      setIsRemakeModalOpen(false);
      setRemakeReason("");
      setRemakeDefectDesc("");
      loadCase();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create remake order");
    }
  };

  const validTransitions = caseData ? CASE_STATUS_TRANSITIONS[caseData.status] || [] : [];
  const warranty = caseData?.warranty;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={isRtl ? "left" : "right"}
          className="sm:max-w-2xl lg:max-w-3xl w-full overflow-y-auto p-0 flex flex-col bg-background"
        >
          {/* Header */}
          <div className="p-6 border-b bg-card space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-mono font-bold text-lg shadow-sm">
                  <Headphones className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-lg text-primary">
                      {caseData?.caseNumber || "CAS"}
                    </span>
                    <Badge variant="outline" className="text-[10px] uppercase font-mono">
                      {caseData?.type || "complaint"}
                    </Badge>
                    <Badge
                      className={`text-[10px] capitalize ${getStatusBadgeClass(caseData?.status)}`}
                    >
                      {getStatusLabel(caseData?.status, isRtl)}
                    </Badge>
                  </div>
                  <h3 className="text-base font-bold font-serif text-foreground mt-0.5">
                    {caseData?.title || "..."}
                  </h3>
                </div>
              </div>

              {caseData?.customerPhone && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleWhatsApp}
                  className="h-8 gap-1.5 border-emerald-500/40 text-emerald-600 hover:bg-emerald-50 text-xs font-semibold"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span>WhatsApp</span>
                </Button>
              )}
            </div>

            {/* Workflow Transition Action Bar */}
            {!isViewer && validTransitions.length > 0 && (
              <div className="p-2.5 bg-muted/40 rounded-xl border flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-muted-foreground mr-1">
                  {isRtl ? "الإجراء التالي:" : "Next Step:"}
                </span>

                {validTransitions.map((nextStatus) => (
                  <Button
                    key={nextStatus}
                    size="sm"
                    variant={nextStatus === "resolved" ? "default" : "outline"}
                    onClick={() => executeStatusTransition(nextStatus)}
                    className="h-7 text-xs gap-1 font-medium capitalize"
                  >
                    {nextStatus === "resolved" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                    <span>{getStatusActionLabel(nextStatus, isRtl)}</span>
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="p-6 flex-1 overflow-y-auto space-y-5 text-xs">
            {/* 1. Customer & Associated Entities Card */}
            <div className="p-4 rounded-xl border bg-card space-y-3">
              <div className="font-semibold text-xs text-muted-foreground uppercase flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-primary" />
                <span>{isRtl ? "بيانات العميل والسجلات المرتبطة" : "Customer & Linked Records"}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">{isRtl ? "العميل:" : "Customer:"} </span>
                  <span className="font-bold text-foreground">{caseData?.customerName}</span>
                </div>

                {caseData?.customerPhone && (
                  <div>
                    <span className="text-muted-foreground">{isRtl ? "الهاتف:" : "Phone:"} </span>
                    <span className="font-mono" dir="ltr">{caseData.customerPhone}</span>
                  </div>
                )}

                {caseData?.orderNumber && (
                  <div>
                    <span className="text-muted-foreground">{isRtl ? "أمر التنفيذ:" : "Order:"} </span>
                    <span className="font-mono font-semibold text-foreground">{caseData.orderNumber}</span>
                  </div>
                )}

                {caseData?.projectTitle && (
                  <div>
                    <span className="text-muted-foreground">{isRtl ? "المشروع / الصفقة:" : "Project:"} </span>
                    <span className="font-medium text-foreground">{caseData.projectTitle}</span>
                  </div>
                )}

                {caseData?.deliveryNumber && (
                  <div>
                    <span className="text-muted-foreground">{isRtl ? "محضر التسليم:" : "Delivery:"} </span>
                    <span className="font-mono font-semibold text-foreground">{caseData.deliveryNumber}</span>
                  </div>
                )}

                {caseData?.dueDate && (
                  <div>
                    <span className="text-muted-foreground">{isRtl ? "تاريخ الاستحقاق:" : "Due Date:"} </span>
                    <span className="font-mono font-semibold text-foreground">{caseData.dueDate}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Authoritative Warranty Diagnostic Card */}
            <div
              className={`p-4 rounded-xl border space-y-2 ${
                warranty?.isReliable && warranty.isWarrantyActive
                  ? "bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-500/30"
                  : warranty?.isReliable && !warranty.isWarrantyActive
                  ? "bg-amber-50/70 dark:bg-amber-950/20 border-amber-500/30"
                  : "bg-muted/40 border-muted-foreground/20"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck
                    className={`h-4 w-4 ${
                      warranty?.isReliable && warranty.isWarrantyActive
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground"
                    }`}
                  />
                  <span className="font-semibold text-xs text-foreground">
                    {isRtl ? "فحص حالة الضمان التعاقدي" : "Warranty Status"}
                  </span>
                </div>

                <Badge
                  variant={warranty?.isReliable && warranty.isWarrantyActive ? "default" : "outline"}
                  className="text-[10px]"
                >
                  {isRtl ? warranty?.warrantyStatusLabelAr : warranty?.warrantyStatusLabel}
                </Badge>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {isRtl ? warranty?.warrantyDetailsAr : warranty?.warrantyDetails}
              </p>

              {warranty?.isReliable && (
                <div className="grid grid-cols-2 gap-2 pt-1 border-t text-[11px]">
                  <div>
                    <span className="text-muted-foreground">{isRtl ? "تاريخ الاستلام:" : "Handover:"} </span>
                    <span className="font-mono font-medium">{warranty.handoverDate || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{isRtl ? "انتهاء الضمان:" : "Expires:"} </span>
                    <span className="font-mono font-bold text-foreground">
                      {warranty.warrantyExpirationDate || "—"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Description & Details */}
            {caseData?.description && (
              <div className="p-4 rounded-xl border bg-card space-y-1.5">
                <div className="font-semibold text-xs text-muted-foreground uppercase flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  <span>{isRtl ? "تفاصيل البلاغ والملاحظات" : "Case Description"}</span>
                </div>
                <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                  {caseData.description}
                </p>
              </div>
            )}

            {/* 4. Resolution Notes (If resolved or closed) */}
            {caseData?.resolution && (
              <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-1.5">
                <div className="font-semibold text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>{isRtl ? "الإجراء المتخذ والحل النهائي" : "Resolution Summary"}</span>
                </div>
                <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                  {caseData.resolution}
                </p>
                {caseData.resolvedAt && (
                  <span className="text-[10px] text-muted-foreground block pt-1">
                    {isRtl ? "تاريخ الحل:" : "Resolved at:"}{" "}
                    {new Date(caseData.resolvedAt).toLocaleString()}
                  </span>
                )}
              </div>
            )}

            {/* 5. Operational Tasks Integration */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-xs text-muted-foreground uppercase flex items-center gap-1.5">
                  <CheckSquare className="h-3.5 w-3.5 text-blue-500" />
                  <span>{isRtl ? "المهام الميدانية والفحص المرتبطة" : "Linked Operational Tasks"}</span>
                </div>
                {!isViewer && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsTaskModalOpen(true)}
                    className="h-7 text-xs gap-1 text-primary"
                  >
                    <Plus className="h-3 w-3" />
                    <span>{isRtl ? "+ مهمة عمل" : "+ Task"}</span>
                  </Button>
                )}
              </div>

              {caseData?.linkedTasks && caseData.linkedTasks.length > 0 ? (
                <div className="space-y-2">
                  {caseData.linkedTasks.map((t) => (
                    <Link
                      key={t.id}
                      to="/admin/tasks"
                      search={{ taskId: t.id } as any}
                      className="p-3 border rounded-xl bg-card hover:bg-muted/40 transition-colors space-y-1 text-xs block cursor-pointer group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-primary group-hover:underline">{t.taskCode}</span>
                          <span className="font-semibold text-foreground">{t.title}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {t.status}
                        </Badge>
                      </div>
                      {t.description && (
                        <p className="text-[11px] text-muted-foreground">{t.description}</p>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center p-4 border-2 border-dashed rounded-xl text-muted-foreground text-xs">
                  {isRtl ? "لا توجد مهام عمل مرتبطة مسجلة لهذا البلاغ" : "No operational tasks linked yet"}
                </div>
              )}
            </div>

            {/* 6. Workshop Remake Integration */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-xs text-muted-foreground uppercase flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5 text-orange-500" />
                  <span>{isRtl ? "أمر تصنيع بديل / ورشة (Remake)" : "Workshop Remake"}</span>
                </div>
                {!isViewer && !caseData?.linkedRemake && caseData?.orderId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsRemakeModalOpen(true)}
                    className="h-7 text-xs gap-1 text-rose-600 border-rose-500/30"
                  >
                    <Plus className="h-3 w-3" />
                    <span>{isRtl ? "إصدار أمر إعادة تصنيع" : "Issue Remake"}</span>
                  </Button>
                )}
              </div>

              {caseData?.linkedRemake ? (
                <div className="p-3.5 border rounded-xl bg-card space-y-2 text-xs border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-rose-600">
                        {caseData.linkedRemake.remakeNumber}
                      </span>
                      <span className="font-semibold text-foreground">
                        {caseData.linkedRemake.reason}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {caseData.linkedRemake.status.replace("_", " ")}
                    </Badge>
                  </div>
                  {caseData.linkedRemake.defectDescription && (
                    <p className="text-[11px] text-muted-foreground">
                      {caseData.linkedRemake.defectDescription}
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center p-4 border-2 border-dashed rounded-xl text-muted-foreground text-xs">
                  {isRtl
                    ? "لا يتطلب إعادة تصنيع بالورشة (صيانة وتعديل في الموقع)"
                    : "No workshop remake required"}
                </div>
              )}
            </div>

            {/* 7. Private R2 Attachments & Signed Photos */}
            <div className="space-y-2 pt-1">
              <div className="font-semibold text-xs text-muted-foreground uppercase flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span>{isRtl ? "الصور الميدانية ومستندات الفحص (R2)" : "Attachments & Evidence"}</span>
              </div>

              {!isViewer && (
                <AttachmentUploader
                  entityType="service_case"
                  entityId={caseId}
                  onUploaded={() => loadCase()}
                />
              )}

              <AttachmentList
                entityType="service_case"
                entityId={caseId}
                canDelete={!isViewer && !isWorker}
                onChanged={() => loadCase()}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Resolution Note Modal */}
      <Dialog open={isResolveModalOpen} onOpenChange={setIsResolveModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold font-serif">
              {isRtl ? "تسجيل حل البلاغ وإغلاقه" : "Resolve Service Case"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-3 text-xs">
            <Label className="text-xs font-semibold">
              {isRtl ? "ملاحظات الحل والإجراء المتخذ *" : "Resolution Notes *"}
            </Label>
            <Textarea
              value={resolutionText}
              onChange={(e) => setResolutionText(e.target.value)}
              placeholder={isRtl ? "اكتب تفاصيل الصيانة أو التعديل الذي تم والتأكيد مع العميل..." : "Describe the resolution..."}
              className="text-xs min-h-[90px]"
              required
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsResolveModalOpen(false)}
              className="text-xs"
            >
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              size="sm"
              disabled={!resolutionText.trim()}
              onClick={() => executeStatusTransition("resolved", resolutionText.trim())}
              className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isRtl ? "اعتماد الحل" : "Confirm Resolution"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Canonical Task Form */}
      <TaskForm
        open={isTaskModalOpen}
        onOpenChange={setIsTaskModalOpen}
        defaultCaseId={caseData?.id}
        defaultOrderId={caseData?.orderId || undefined}
        defaultCustomerId={caseData?.customerId}
        defaultCategory="after_sales_service"
        defaultTitle={caseData ? `Follow up: ${caseData.caseNumber} - ${caseData.title}` : ""}
        onTaskSaved={loadCase}
      />

      {/* Quick Remake Modal */}
      <Dialog open={isRemakeModalOpen} onOpenChange={setIsRemakeModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateRemake}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold font-serif">
                {isRtl ? "إصدار أمر إعادة تصنيع بالورشة" : "Issue Workshop Remake"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-3 text-xs">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">{isRtl ? "سبب إعادة التصنيع *" : "Reason *"}</Label>
                <Input
                  value={remakeReason}
                  onChange={(e) => setRemakeReason(e.target.value)}
                  placeholder={isRtl ? "مثال: دلفة مكسورة أثناء النقل" : "e.g. Damaged door during transport"}
                  className="h-8 text-xs"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">{isRtl ? "وصف العيب الفني" : "Defect Details"}</Label>
                <Textarea
                  value={remakeDefectDesc}
                  onChange={(e) => setRemakeDefectDesc(e.target.value)}
                  placeholder={isRtl ? "أبعاد القطعة والمواصفات المطلوب تصنيعها..." : "Dimensions & specs..."}
                  className="text-xs min-h-[70px]"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsRemakeModalOpen(false)}
                className="text-xs"
              >
                {isRtl ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="submit"
                size="sm"
                className="text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white"
              >
                {isRtl ? "إصدار أمر الورشة" : "Issue Remake"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function getStatusBadgeClass(status?: ServiceCaseStatus): string {
  switch (status) {
    case "new":
      return "bg-blue-500/10 text-blue-600 border-blue-500/30";
    case "under_review":
      return "bg-amber-500/10 text-amber-600 border-amber-500/30";
    case "assigned":
      return "bg-purple-500/10 text-purple-600 border-purple-500/30";
    case "in_progress":
      return "bg-orange-500/10 text-orange-600 border-orange-500/30";
    case "waiting_customer":
      return "bg-indigo-500/10 text-indigo-600 border-indigo-500/30";
    case "resolved":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
    case "closed":
      return "bg-muted text-muted-foreground border-muted";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getStatusLabel(status?: ServiceCaseStatus, isRtl?: boolean): string {
  switch (status) {
    case "new":
      return isRtl ? "جديد" : "New";
    case "under_review":
      return isRtl ? "قيد المراجعة" : "Under Review";
    case "assigned":
      return isRtl ? "تم التعيين" : "Assigned";
    case "in_progress":
      return isRtl ? "جاري المتابعة" : "In Progress";
    case "waiting_customer":
      return isRtl ? "بانتظار العميل" : "Waiting Customer";
    case "resolved":
      return isRtl ? "تم الحل" : "Resolved";
    case "closed":
      return isRtl ? "مغلق" : "Closed";
    default:
      return status || "—";
  }
}

function getStatusActionLabel(status: ServiceCaseStatus, isRtl?: boolean): string {
  switch (status) {
    case "under_review":
      return isRtl ? "بدء المراجعة" : "Review";
    case "assigned":
      return isRtl ? "تعيين مسؤول" : "Assign";
    case "in_progress":
      return isRtl ? "بدء الإجراءات" : "Start Progress";
    case "waiting_customer":
      return isRtl ? "بانتظار رد العميل" : "Wait on Customer";
    case "resolved":
      return isRtl ? "تسجيل الحل" : "Resolve Case";
    case "closed":
      return isRtl ? "إغلاق البلاغ" : "Close Case";
    default:
      return status;
  }
}
