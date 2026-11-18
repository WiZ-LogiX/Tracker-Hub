import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
  Package,
  Wrench,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Plus,
  Loader2,
  AlertTriangle,
  Check,
  History,
} from "lucide-react";
import { toast } from "sonner";
import {
  ORDER_STAGES,
  STAGE_LABEL_AR,
  OrderStage,
  nextStage,
  stageIndex,
} from "@/lib/stages";
import { updateOrderStage, recordQCInspection } from "@/lib/tracking.functions";
import { listActiveWorkers } from "@/lib/order.functions";
import { CreateWorkOrderModal } from "@/components/work-orders/CreateWorkOrderModal";
import type { ProjectWorkspaceData } from "@/lib/project-types";
import type { WorkOrderStatus, WorkOrderPriority } from "@/lib/work-order-types";

const STAGE_LABELS: Record<string, { en: string; ar: string; fr: string }> = {
  deposit_received: { en: "Deposit Received", ar: "استلام العربون", fr: "Acompte reçu" },
  design_approved: { en: "Design Approved", ar: "اعتماد التصميم", fr: "Design approuvé" },
  cutting: { en: "Cutting", ar: "قص الخامات", fr: "Découpe" },
  assembly: { en: "Assembly", ar: "التجميع", fr: "Assemblage" },
  finishing: { en: "Finishing", ar: "التشطيب والدهان", fr: "Finition" },
  quality_check: { en: "Quality Check", ar: "فحص الجودة", fr: "Contrôle qualité" },
  ready_for_pickup: { en: "Ready for Pickup", ar: "جاهز للاستلام", fr: "Prêt pour enlèvement" },
  delivered: { en: "Delivered", ar: "تم التسليم", fr: "Livré" },
  completed: { en: "Completed", ar: "مكتمل", fr: "Terminé" },
};

interface ProjectProductionTabProps {
  production: ProjectWorkspaceData["production"];
  orders: ProjectWorkspaceData["orders"];
  onRefresh?: () => void;
  currentUserRole?: string;
}

export function ProjectProductionTab({
  production,
  orders,
  onRefresh,
  currentUserRole,
}: ProjectProductionTabProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");
  const isFr = i18n.language.startsWith("fr");

  const updateStageFn = useServerFn(updateOrderStage);
  const recordQCFn = useServerFn(recordQCInspection);
  const listWorkersFn = useServerFn(listActiveWorkers);

  // Active Order Selection
  const [selectedOrderId, setSelectedOrderId] = useState<string>(
    orders && orders.length > 0 ? orders[0].id : "",
  );

  useEffect(() => {
    if (orders && orders.length > 0) {
      if (!selectedOrderId || !orders.some((o) => o.id === selectedOrderId)) {
        setSelectedOrderId(orders[0].id);
      }
    }
  }, [orders, selectedOrderId]);

  const activeOrder = orders?.find((o) => o.id === selectedOrderId) || orders?.[0];

  const currentStage = (activeOrder?.currentStage ||
    production?.activeStage ||
    "deposit_received") as OrderStage;

  const currentIdx = stageIndex(currentStage);
  const next = nextStage(currentStage);

  // QC Gate Check
  const isAtQualityCheck = currentStage === "quality_check";
  const hasPassedQC =
    Boolean(production?.hasPassedQC) ||
    Boolean(
      production?.qcInspections?.some(
        (q) => q.orderId === activeOrder?.id && q.stage === "quality_check" && q.passed,
      ),
    );
  const isGateBlocked = isAtQualityCheck && !hasPassedQC;

  // Actions State
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [isCreateWoOpen, setIsCreateWoOpen] = useState(false);
  const [isQcModalOpen, setIsQcModalOpen] = useState(false);

  // QC Form State
  const [qcStage, setQcStage] = useState<string>(currentStage || "quality_check");
  const [qcPassed, setQcPassed] = useState<boolean>(true);
  const [qcNotes, setQcNotes] = useState<string>("");
  const [qcAssigneeId, setQcAssigneeId] = useState<string>("");
  const [isSubmittingQc, setIsSubmittingQc] = useState(false);
  const [workersList, setWorkersList] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (isQcModalOpen) {
      setQcStage(currentStage || "quality_check");
      listWorkersFn()
        .then((data: any) => {
          if (Array.isArray(data)) {
            setWorkersList(data.map((w: any) => ({ id: w.id, name: w.name })));
          }
        })
        .catch(() => {});
    }
  }, [isQcModalOpen, currentStage, listWorkersFn]);

  const getStageLabel = (st: string) => {
    const s = STAGE_LABELS[st];
    if (!s) return st;
    if (isAr) return s.ar;
    if (isFr) return s.fr;
    return s.en;
  };

  const handleAdvanceStage = async () => {
    if (!activeOrder || !next) return;
    if (isGateBlocked) {
      toast.error(t("productionWorkflow.advanceGateBlocked"));
      return;
    }
    setIsAdvancing(true);
    try {
      await updateStageFn({
        data: {
          orderId: activeOrder.id,
          nextStage: next,
          markDelivered: next === "delivered",
        },
      });
      toast.success(t("productionWorkflow.stageAdvanced"));
      onRefresh?.();
    } catch (err: any) {
      toast.error(err?.message || (isAr ? "فشل تحديث المرحلة" : "Failed to advance stage"));
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleSubmitQc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrder) return;
    setIsSubmittingQc(true);
    try {
      await recordQCFn({
        data: {
          orderId: activeOrder.id,
          stage: qcStage,
          passed: qcPassed,
          notes: qcNotes.trim() || null,
          assignedTo: qcAssigneeId ? qcAssigneeId : null,
        },
      });
      if (qcPassed) {
        toast.success(t("productionWorkflow.qcPassedSuccess"));
      } else {
        toast.warning(t("productionWorkflow.qcFailedRemakeCreated"));
      }
      setIsQcModalOpen(false);
      setQcNotes("");
      setQcAssigneeId("");
      onRefresh?.();
    } catch (err: any) {
      toast.error(err?.message || (isAr ? "فشل تسجيل الفحص" : "Failed to record QC inspection"));
    } finally {
      setIsSubmittingQc(false);
    }
  };

  const getStatusBadge = (status: WorkOrderStatus) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">{isAr ? "مكتمل" : "Completed"}</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-600 hover:bg-blue-700 text-white">{isAr ? "قيد التشغيل" : "In Progress"}</Badge>;
      case "qc_pending":
        return <Badge className="bg-purple-600 hover:bg-purple-700 text-white">{isAr ? "بانتظار الفحص" : "QC Pending"}</Badge>;
      case "ready":
        return <Badge className="bg-amber-600 hover:bg-amber-700 text-white">{isAr ? "جاهز للبدء" : "Ready"}</Badge>;
      case "cancelled":
        return <Badge variant="destructive">{isAr ? "ملغي" : "Cancelled"}</Badge>;
      case "draft":
      default:
        return <Badge variant="outline">{isAr ? "مسودة" : "Draft"}</Badge>;
    }
  };

  const getPriorityBadge = (priority: WorkOrderPriority) => {
    switch (priority) {
      case "critical":
        return <Badge variant="destructive" className="text-[10px]">{isAr ? "حرج" : "Critical"}</Badge>;
      case "high":
        return <Badge className="bg-amber-600 text-white text-[10px]">{isAr ? "عالي" : "High"}</Badge>;
      case "low":
        return <Badge variant="secondary" className="text-[10px]">{isAr ? "منخفض" : "Low"}</Badge>;
      case "medium":
      default:
        return <Badge variant="outline" className="text-[10px]">{isAr ? "متوسط" : "Medium"}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Production Progress Header & Stage Stepper */}
      <Card className="shadow-xs border-border/80">
        <CardHeader className="p-4 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              <CardTitle className="text-base font-bold">
                {t("productionWorkflow.title")}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {orders && orders.length > 1 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{t("productionWorkflow.orderSelector")}:</span>
                  <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
                    <SelectTrigger className="h-7 text-xs w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {orders.map((o) => (
                        <SelectItem key={o.id} value={o.id} className="text-xs">
                          {o.orderNumber}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <span className="text-sm font-bold text-foreground">
                {production.completionPercentage}% {isAr ? "مكتمل" : "Completed"}
              </span>
            </div>
          </div>
          <Progress value={production.completionPercentage} className="h-2 mt-3" />
        </CardHeader>

        {/* 9-Stage Visual Pipeline Stepper */}
        <div className="px-4 py-3 border-y bg-muted/20">
          <div className="overflow-x-auto pb-1">
            <div className="flex items-center min-w-[760px] justify-between gap-1">
              {ORDER_STAGES.map((stageName, idx) => {
                const isCompleted = currentIdx > idx;
                const isCurrent = currentIdx === idx;
                const isUpcoming = currentIdx < idx;

                return (
                  <div key={stageName} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center gap-1.5 flex-1 min-w-[70px]">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                          isCompleted
                            ? "bg-emerald-600 text-white"
                            : isCurrent
                              ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                              : "bg-muted text-muted-foreground border border-border"
                        }`}
                      >
                        {isCompleted ? (
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        ) : (
                          <span>{idx + 1}</span>
                        )}
                      </div>
                      <span
                        className={`text-[11px] text-center leading-tight truncate max-w-[80px] ${
                          isCurrent
                            ? "font-bold text-primary"
                            : isCompleted
                              ? "font-medium text-foreground"
                              : "text-muted-foreground"
                        }`}
                      >
                        {getStageLabel(stageName)}
                      </span>
                    </div>
                    {idx < ORDER_STAGES.length - 1 && (
                      <div
                        className={`h-0.5 w-full mx-1 transition-colors ${
                          currentIdx > idx ? "bg-emerald-600" : "bg-border"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Shop-Floor Action Controls */}
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <div>
                <span>{isAr ? "المرحلة الحالية:" : "Active Stage:"} </span>
                <Badge variant="outline" className="font-semibold text-foreground capitalize ml-1 rtl:mr-1">
                  {getStageLabel(currentStage)}
                </Badge>
              </div>
              {activeOrder && (
                <div>
                  <span>{isAr ? "أمر التنفيذ:" : "Order:"} </span>
                  <span className="font-mono font-medium text-foreground ml-1 rtl:mr-1">
                    {activeOrder.orderNumber}
                  </span>
                </div>
              )}
              <div>
                <span>{isAr ? "أوامر التشغيل:" : "Work Orders:"} </span>
                <span className="font-semibold text-foreground ml-1 rtl:mr-1">
                  {production.workOrders.length}
                </span>
              </div>
            </div>

            {/* Shop Floor Action Buttons */}
            {activeOrder && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsQcModalOpen(true)}
                  className="gap-1.5 h-8 text-xs border-dashed"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                  <span>{t("productionWorkflow.logQC")}</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsCreateWoOpen(true)}
                  className="gap-1.5 h-8 text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t("productionWorkflow.createWorkOrder")}</span>
                </Button>

                {next ? (
                  <Button
                    size="sm"
                    disabled={isAdvancing || isGateBlocked}
                    onClick={handleAdvanceStage}
                    className="gap-1.5 h-8 text-xs"
                  >
                    {isAdvancing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isGateBlocked ? (
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-300" />
                    ) : (
                      <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                    )}
                    <span>
                      {isAdvancing
                        ? t("productionWorkflow.advancing")
                        : `${t("productionWorkflow.advanceStage")}: ${getStageLabel(next)}`}
                    </span>
                  </Button>
                ) : (
                  <Badge className="bg-emerald-600 text-white h-8 px-3 text-xs">
                    {isAr ? "المشروع مكتمل" : "Order Completed"}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Quality Control Gate Alert Banner */}
          {isGateBlocked && (
            <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-800 dark:text-amber-300 text-xs leading-relaxed">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold block">
                  {t("productionWorkflow.advanceGateBlocked")}
                </span>
                <span className="text-muted-foreground block">
                  {isAr
                    ? "يتطلب نظام الجودة تسجيل فحص مطابق للمواصفات أولاً عبر زر 'تسجيل فحص الجودة' أعلاه قبل فك القفل عن مرحلة الاستلام والتسليم."
                    : "The quality assurance system requires a passing inspection via 'Log QC Check' above before unlocking the pickup and delivery stages."}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* QC Inspections History (if any) */}
      {production.qcInspections && production.qcInspections.length > 0 && (
        <Card className="shadow-xs border-border/80">
          <CardHeader className="p-4 pb-2 border-b flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm font-bold">
                {t("productionWorkflow.qcHistory")}
              </CardTitle>
            </div>
            <Badge variant="outline" className="text-xs">
              {production.qcInspections.length} {isAr ? "فحوصات" : "checks"}
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left rtl:text-right">
                <thead className="bg-muted/40 font-semibold text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="px-4 py-2">{t("productionWorkflow.stage")}</th>
                    <th className="px-4 py-2">{t("productionWorkflow.result")}</th>
                    <th className="px-4 py-2">{t("productionWorkflow.qcNotes")}</th>
                    <th className="px-4 py-2 text-right rtl:text-left">{isAr ? "التاريخ" : "Date"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {production.qcInspections.map((qc) => (
                    <tr key={qc.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5 font-medium text-foreground capitalize">
                        {getStageLabel(qc.stage)}
                      </td>
                      <td className="px-4 py-2.5">
                        {qc.passed ? (
                          <Badge className="bg-emerald-600 text-white text-[10px] gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{t("productionWorkflow.passedBadge")}</span>
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px] gap-1">
                            <AlertCircle className="w-3 h-3" />
                            <span>{t("productionWorkflow.failedBadge")}</span>
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground max-w-[260px] truncate">
                        {qc.notes || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-right rtl:text-left font-mono" dir="ltr">
                        {typeof qc.createdAt === "string" ? qc.createdAt.slice(0, 16).replace("T", " ") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Work Orders Table */}
      <Card className="shadow-xs">
        <CardHeader className="p-4 pb-3 border-b flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            <CardTitle className="text-base font-bold">
              {isAr ? "أوامر تشغيل الورشة (Work Orders)" : "Shop-Floor Work Orders"}
            </CardTitle>
          </div>
          <Link to="/admin/work-orders">
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs">
              <span>{isAr ? "إدارة أوامر التشغيل" : "Manage Work Orders"}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {production.workOrders.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground space-y-3">
              <Package className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-medium">
                {isAr ? "لا توجد أوامر تشغيل صادرة لهذا المشروع بعد" : "No work orders issued for this project yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="px-4 py-3">{isAr ? "رقم أمر التشغيل" : "WO #"}</th>
                    <th className="px-4 py-3">{isAr ? "أمر البيع" : "Order #"}</th>
                    <th className="px-4 py-3">{isAr ? "الحالة" : "Status"}</th>
                    <th className="px-4 py-3">{isAr ? "الأولوية" : "Priority"}</th>
                    <th className="px-4 py-3">{isAr ? "تاريخ الجدولة" : "Scheduled Date"}</th>
                    <th className="px-4 py-3">{isAr ? "ملاحظات" : "Notes"}</th>
                    <th className="px-4 py-3 text-right rtl:text-left">{isAr ? "تاريخ الإنشاء" : "Created"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {production.workOrders.map((w) => (
                    <tr key={w.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-foreground">
                        {w.workOrderNumber}
                      </td>
                      <td className="px-4 py-3 font-medium text-muted-foreground">
                        {w.orderNumber}
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(w.status)}</td>
                      <td className="px-4 py-3">{getPriorityBadge(w.priority)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground" dir="ltr">
                        {w.scheduledDate || "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">
                        {w.notes || "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground text-right rtl:text-left" dir="ltr">
                        {typeof w.createdAt === "string" ? w.createdAt.slice(0, 10) : new Date(w.createdAt).toISOString().slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Work Order Modal */}
      {activeOrder && (
        <CreateWorkOrderModal
          orderId={activeOrder.id}
          orderNumber={activeOrder.orderNumber}
          open={isCreateWoOpen}
          onOpenChange={setIsCreateWoOpen}
          onCreated={() => {
            setIsCreateWoOpen(false);
            onRefresh?.();
          }}
        />
      )}

      {/* Log QC Check Dialog */}
      <Dialog open={isQcModalOpen} onOpenChange={setIsQcModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleSubmitQc}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-purple-600" />
                <span>{t("productionWorkflow.logQC")}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                {t("productionWorkflow.logQCDescription")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Pass / Fail Toggle */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{t("productionWorkflow.result")}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={qcPassed ? "default" : "outline"}
                    className={`h-9 text-xs gap-1.5 ${
                      qcPassed ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
                    }`}
                    onClick={() => setQcPassed(true)}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{t("productionWorkflow.pass")}</span>
                  </Button>
                  <Button
                    type="button"
                    variant={!qcPassed ? "destructive" : "outline"}
                    className="h-9 text-xs gap-1.5"
                    onClick={() => setQcPassed(false)}
                  >
                    <AlertCircle className="w-4 h-4" />
                    <span>{t("productionWorkflow.fail")}</span>
                  </Button>
                </div>
              </div>

              {/* Stage Selection */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{t("productionWorkflow.stage")}</Label>
                <Select value={qcStage} onValueChange={setQcStage}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_STAGES.map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">
                        {getStageLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Technician / Assignee (Optional) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{t("productionWorkflow.inspector")}</Label>
                <Select value={qcAssigneeId} onValueChange={setQcAssigneeId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={t("productionWorkflow.inspectorPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {workersList.map((w) => (
                      <SelectItem key={w.id} value={w.id} className="text-xs">
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notes / Defect Details */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{t("productionWorkflow.qcNotes")}</Label>
                <Textarea
                  value={qcNotes}
                  onChange={(e) => setQcNotes(e.target.value)}
                  placeholder={t("productionWorkflow.qcNotesPlaceholder")}
                  className="text-xs min-h-[80px]"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsQcModalOpen(false)}
                disabled={isSubmittingQc}
                className="text-xs"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmittingQc}
                className="gap-1.5 text-xs"
              >
                {isSubmittingQc && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isSubmittingQc ? t("productionWorkflow.submittingQC") : t("productionWorkflow.submitQC")}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
