import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import {
  getRemakeById,
  changeRemakeStatus,
  approveRemake,
  resolveRemake,
} from "@/lib/remakes.functions";
import type { RemakeDetailData, RemakeStatus } from "@/lib/remake-types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Wrench,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  User,
  Phone,
  FileText,
  Calendar,
  Layers,
  ArrowRight,
  Loader2,
  Check,
  Play,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

interface RemakeDetailDrawerProps {
  remakeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
  userRole?: string;
}

export function RemakeDetailDrawer({
  remakeId,
  open,
  onOpenChange,
  onUpdated,
  userRole,
}: RemakeDetailDrawerProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const getRemakeFn = useServerFn(getRemakeById);
  const changeStatusFn = useServerFn(changeRemakeStatus);
  const approveRemakeFn = useServerFn(approveRemake);
  const resolveRemakeFn = useServerFn(resolveRemake);

  const [data, setData] = useState<RemakeDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);

  const [resolutionText, setResolutionText] = useState("");
  const [showResolveInput, setShowResolveInput] = useState(false);

  const loadData = () => {
    if (remakeId) {
      setLoading(true);
      getRemakeFn({ data: { remakeId } })
        .then((res) => {
          setData(res);
          if (res.resolution) setResolutionText(res.resolution);
        })
        .catch((err) => toast.error(err?.message || "Failed to load remake case"))
        .finally(() => setLoading(false));
    }
  };

  useEffect(() => {
    if (open && remakeId) {
      loadData();
    }
  }, [open, remakeId]);

  if (!remakeId) return null;

  const handleApprove = async () => {
    setActing(true);
    try {
      await approveRemakeFn({ data: { remakeId } });
      toast.success(isRtl ? "تمت الموافقة على إعادة التصنيع" : "Remake approved");
      loadData();
      onUpdated?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to approve");
    } finally {
      setActing(false);
    }
  };

  const handleStartRemake = async () => {
    setActing(true);
    try {
      await changeStatusFn({ data: { remakeId, targetStatus: "in_remake" } });
      toast.success(isRtl ? "بدء مرحلة إعادة التصنيع" : "Remake work started");
      loadData();
      onUpdated?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to change status");
    } finally {
      setActing(false);
    }
  };

  const handleSubmitQC = async () => {
    setActing(true);
    try {
      await changeStatusFn({ data: { remakeId, targetStatus: "qc_pending" } });
      toast.success(isRtl ? "تم التقديم للفحص والجودة" : "Submitted for QC inspection");
      loadData();
      onUpdated?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to change status");
    } finally {
      setActing(false);
    }
  };

  const handleResolve = async () => {
    if (!resolutionText.trim()) {
      toast.error(isRtl ? "يرجى كتابة تقرير الحل والإغلاق" : "Resolution description is required");
      return;
    }
    setActing(true);
    try {
      await resolveRemakeFn({ data: { remakeId, resolution: resolutionText.trim() } });
      toast.success(isRtl ? "تم إغلاق وحل الحالة بنجاح" : "Quality case resolved");
      setShowResolveInput(false);
      loadData();
      onUpdated?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to resolve");
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!confirm(isRtl ? "هل أنت متأكد من رفض طلب إعادة التصنيع؟" : "Reject this remake case?")) return;
    setActing(true);
    try {
      await changeStatusFn({ data: { remakeId, targetStatus: "rejected" } });
      toast.success(isRtl ? "تم رفض الطلب" : "Remake rejected");
      loadData();
      onUpdated?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to reject");
    } finally {
      setActing(false);
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case "critical":
        return "bg-rose-50 text-rose-700 border-rose-300 font-bold dark:bg-rose-950/40 dark:text-rose-400";
      case "high":
        return "bg-amber-50 text-amber-700 border-amber-300 font-bold dark:bg-amber-950/40 dark:text-amber-400";
      case "medium":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusBadge = (status: RemakeStatus) => {
    switch (status) {
      case "resolved":
        return "bg-emerald-50 text-emerald-700 border-emerald-300";
      case "approved":
      case "in_remake":
      case "qc_pending":
        return "bg-blue-50 text-blue-700 border-blue-300";
      case "under_review":
      case "reported":
        return "bg-amber-50 text-amber-700 border-amber-300";
      case "rejected":
      case "cancelled":
        return "bg-rose-50 text-rose-700 border-rose-300";
    }
  };

  const canApprove = userRole === "owner" || userRole === "admin";
  const canMutate = userRole !== "viewer";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isRtl ? "left" : "right"} className="sm:max-w-xl w-full overflow-y-auto p-0 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b bg-card space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-base font-bold text-primary bg-primary/10 px-3 py-1 rounded-md">
              {data?.remakeNumber || "..."}
            </span>

            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className={`text-[10px] uppercase ${data ? getSeverityBadge(data.severity) : ""}`}>
                {data?.severity || "..."}
              </Badge>
              <Badge variant="outline" className={`text-[10px] capitalize ${data ? getStatusBadge(data.status) : ""}`}>
                {data?.status || "..."}
              </Badge>
            </div>
          </div>

          <div>
            <SheetTitle className="text-xl font-bold font-serif flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" />
              <span>{data?.reason || (isRtl ? "تفاصيل حالة الجودة" : "Quality Case Details")}</span>
            </SheetTitle>
            <SheetDescription className="text-xs mt-0.5">
              <span>{isRtl ? `طلب الإنتاج: ${data?.orderNumber || "—"}` : `Order: ${data?.orderNumber || "—"}`}</span>
              {data?.customerName && <span> • {data.customerName}</span>}
            </SheetDescription>
          </div>

          {/* Action Bar based on state */}
          {data && canMutate && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60">
              {data.status === "reported" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => changeStatusFn({ data: { remakeId, targetStatus: "under_review" } }).then(() => { loadData(); onUpdated?.(); })}
                  disabled={acting}
                  className="h-8 text-xs font-semibold"
                >
                  {isRtl ? "بدء المراجعة الفنية" : "Move to Review"}
                </Button>
              )}

              {(data.status === "under_review" || data.status === "reported") && canApprove && (
                <>
                  <Button
                    size="sm"
                    onClick={handleApprove}
                    disabled={acting}
                    className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>{isRtl ? "الموافقة على إعادة التصنيع" : "Approve Remake"}</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleReject}
                    disabled={acting}
                    className="h-8 text-xs text-rose-600 hover:bg-rose-50"
                  >
                    {isRtl ? "رفض الطلب" : "Reject"}
                  </Button>
                </>
              )}

              {data.status === "approved" && (
                <Button
                  size="sm"
                  onClick={handleStartRemake}
                  disabled={acting}
                  className="h-8 text-xs bg-primary text-primary-foreground font-semibold gap-1.5"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>{isRtl ? "بدء شغل التصنيع البديل" : "Start Replacement Work"}</span>
                </Button>
              )}

              {data.status === "in_remake" && (
                <Button
                  size="sm"
                  onClick={handleSubmitQC}
                  disabled={acting}
                  className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1.5"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{isRtl ? "تقديم للفحص (QC)" : "Submit for QC"}</span>
                </Button>
              )}

              {data.status === "qc_pending" && (
                <Button
                  size="sm"
                  onClick={() => setShowResolveInput(!showResolveInput)}
                  className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{isRtl ? "إغلاق وحل الحالة" : "Resolve Case"}</span>
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6 text-sm">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span>{isRtl ? "جاري التحميل..." : "Loading details..."}</span>
            </div>
          ) : !data ? (
            <div className="text-center py-12 text-muted-foreground text-xs">
              {isRtl ? "لا توجد تفاصيل متاحة" : "No case details found"}
            </div>
          ) : (
            <>
              {/* Resolve Form if toggled */}
              {showResolveInput && (
                <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 rounded-2xl p-4 space-y-3">
                  <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    {isRtl ? "تسجيل تقرير الحل النهائي وإغلاق الحالة:" : "Final Resolution Report & Case Closure:"}
                  </div>
                  <Textarea
                    value={resolutionText}
                    onChange={(e) => setResolutionText(e.target.value)}
                    placeholder={isRtl ? "اكتب الإجراء الذي تم (استبدال لوح، تعديل مقاس، إعادة دهان...)" : "Describe resolution (replaced board, modified dimensions...)"}
                    className="text-xs min-h-[80px]"
                  />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setShowResolveInput(false)} className="h-8 text-xs">
                      {isRtl ? "إلغاء" : "Cancel"}
                    </Button>
                    <Button size="sm" onClick={handleResolve} disabled={acting} className="h-8 text-xs bg-emerald-600 text-white font-semibold">
                      {isRtl ? "تأكيد الإغلاق" : "Confirm Resolution"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Case Overview Grid */}
              <div className="grid grid-cols-2 gap-3 bg-card border rounded-2xl p-4 shadow-xs text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">{isRtl ? "نوع الحالة" : "Case Type"}</span>
                  <span className="font-semibold capitalize text-foreground">{data.type.replace("_", " ")}</span>
                </div>

                <div>
                  <span className="text-muted-foreground block text-[11px]">{isRtl ? "تاريخ التسجيل" : "Reported Date"}</span>
                  <span className="font-medium text-foreground">{new Date(data.createdAt).toLocaleDateString()}</span>
                </div>

                {data.dueDate && (
                  <div>
                    <span className="text-muted-foreground block text-[11px]">{isRtl ? "تاريخ الاستحقاق المطلوب" : "Due Date"}</span>
                    <span className="font-medium text-foreground">{new Date(data.dueDate).toLocaleDateString()}</span>
                  </div>
                )}

                {data.resolvedAt && (
                  <div>
                    <span className="text-muted-foreground block text-[11px]">{isRtl ? "تاريخ الإغلاق" : "Resolved At"}</span>
                    <span className="font-medium text-emerald-600 font-semibold">{new Date(data.resolvedAt).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              {/* Defect Description */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {isRtl ? "وصف العيب والخلل الفني" : "Defect Description"}
                </span>
                <div className="bg-muted/40 p-3.5 rounded-xl border text-xs leading-relaxed text-foreground">
                  {data.defectDescription || data.reason || (isRtl ? "لا يوجد وصف إضافي" : "No additional description")}
                </div>
              </div>

              {/* Resolution if present */}
              {data.resolution && (
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{isRtl ? "تقرير الحل المعتمد" : "Approved Resolution"}</span>
                  </span>
                  <div className="bg-emerald-50/40 dark:bg-emerald-950/20 p-3.5 rounded-xl border border-emerald-200/70 text-xs leading-relaxed text-foreground">
                    {data.resolution}
                  </div>
                </div>
              )}

              {/* Linked Tasks */}
              {data.linkedTasks && data.linkedTasks.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {isRtl ? "المهام التشغيلية المرتبطة" : "Linked Operational Tasks"}
                  </span>
                  <div className="space-y-1.5">
                    {data.linkedTasks.map((t) => (
                      <div key={t.id} className="p-2.5 bg-card border rounded-xl flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-primary">{t.taskCode}</span>
                          <span className="font-medium text-foreground">{t.title}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {t.status.replace("_", " ")}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
