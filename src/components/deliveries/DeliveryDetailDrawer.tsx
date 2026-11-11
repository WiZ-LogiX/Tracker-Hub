import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  getDeliveryById,
  updateDeliveryStatus,
} from "@/lib/delivery.functions";
import { listTasks } from "@/lib/tasks.functions";
import type { DeliveryStatus, DeliveryHandover } from "@/lib/delivery-types";
import { CustomerSignaturePad } from "@/components/deliveries/CustomerSignaturePad";
import { TaskForm } from "@/components/tasks/TaskForm";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Truck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  MapPin,
  UserCheck,
  Wrench,
  PenTool,
  Phone,
  Calendar,
  DollarSign,
  Loader2,
  PackageCheck,
  Check,
  CheckSquare,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { formatEGP } from "@/lib/pricing";

interface DeliveryDetailDrawerProps {
  deliveryId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userRole?: string;
  onStatusChanged?: () => void;
}

export function DeliveryDetailDrawer({
  deliveryId,
  open,
  onOpenChange,
  userRole,
  onStatusChanged,
}: DeliveryDetailDrawerProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const getDeliveryFn = useServerFn(getDeliveryById);
  const updateStatusFn = useServerFn(updateDeliveryStatus);
  const listTasksFn = useServerFn(listTasks);

  const [updating, setUpdating] = useState(false);
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);

  // Form inputs for transitions
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [installerName, setInstallerName] = useState("");
  const [installerNotes, setInstallerNotes] = useState("");
  const [signerName, setSignerName] = useState("");
  const [handoverNotes, setHandoverNotes] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState("");

  const { data: detail, isLoading, refetch } = useQuery({
    queryKey: ["delivery-detail", deliveryId],
    queryFn: async () => {
      if (!deliveryId) return null;
      const res = await getDeliveryFn({ data: { deliveryId } });
      return res || null;
    },
    enabled: !!deliveryId && open,
  });

  const { data: deliveryTasks = [], refetch: refetchTasks } = useQuery({
    queryKey: ["delivery-tasks", deliveryId],
    queryFn: async () => {
      if (!deliveryId) return [];
      const res = await listTasksFn({
        data: {
          deliveryId,
          includeArchived: true,
        },
      });
      return (res as any[]) || [];
    },
    enabled: !!deliveryId && open,
  });

  const del = detail?.delivery;
  const fin = detail?.financialSummary;

  const handleStatusTransition = async (targetStatus: DeliveryStatus) => {
    if (!deliveryId) return;
    setUpdating(true);
    try {
      await updateStatusFn({
        data: {
          deliveryId,
          status: targetStatus,
          recipientName: recipientName.trim() || undefined,
          recipientPhone: recipientPhone.trim() || undefined,
          installerName: installerName.trim() || undefined,
          installerNotes: installerNotes.trim() || undefined,
          signerName: signerName.trim() || undefined,
          handoverNotes: handoverNotes.trim() || undefined,
          signatureDataUrl: signatureDataUrl || undefined,
        },
      });

      toast.success(
        isRtl
          ? "تم تحديث حالة التسليم والتسليم بنجاح"
          : "Delivery & handover status updated successfully",
      );
      refetch();
      onStatusChanged?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  const getStatusBadge = (status: DeliveryStatus) => {
    switch (status) {
      case "ready_for_dispatch":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "dispatched":
        return "bg-amber-50 text-amber-700 border-amber-300";
      case "out_for_delivery":
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case "delivered":
        return "bg-teal-50 text-teal-700 border-teal-300";
      case "installation_pending":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "installed":
        return "bg-emerald-50 text-emerald-700 border-emerald-300";
      case "handover_pending":
        return "bg-amber-50 text-amber-800 border-amber-300";
      case "completed":
        return "bg-emerald-100 text-emerald-800 border-emerald-400 font-bold";
      case "delivery_failed":
        return "bg-rose-50 text-rose-700 border-rose-300 font-bold";
      case "cancelled":
        return "bg-muted text-muted-foreground";
    }
  };

  const canMutate = userRole !== "viewer";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0 flex flex-col">
        {isLoading || !del ? (
          <div className="flex-1 flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>{isRtl ? "جاري تحميل تفاصيل الشحن والتسليم..." : "Loading delivery package..."}</span>
          </div>
        ) : (
          <>
            {/* Header */}
            <SheetHeader className="p-6 bg-muted/30 border-b space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xl font-bold text-primary">{del.deliveryNumber}</span>
                    <Badge variant="outline" className={`text-xs capitalize ${getStatusBadge(del.status)}`}>
                      {del.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <SheetTitle className="text-sm font-medium text-muted-foreground mt-1">
                    {isRtl ? "شحنة وأمر تسليم" : "Delivery & Handover Record"} • {del.orderNumber}
                  </SheetTitle>
                </div>

                {del.installationRequired && (
                  <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200 gap-1">
                    <Wrench className="h-3 w-3" />
                    <span>{isRtl ? "يتطلب تركيب" : "Installation Required"}</span>
                  </Badge>
                )}
              </div>

              {/* Financial Balance Summary */}
              {fin && (
                <div className="p-3 bg-background rounded-xl border flex items-center justify-between text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[10px]">{isRtl ? "إجمالي الأمر" : "Order Total"}</span>
                    <span className="font-mono font-bold">{formatEGP(fin.orderTotal)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">{isRtl ? "المسدد" : "Paid"}</span>
                    <span className="font-mono text-emerald-600 font-semibold">{formatEGP(fin.paidAmount)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">{isRtl ? "المتبقي للتحصيل" : "Balance Due"}</span>
                    <span className={`font-mono font-bold ${fin.balanceDue > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                      {formatEGP(fin.balanceDue)}
                    </span>
                  </div>
                </div>
              )}
            </SheetHeader>

            {/* Body */}
            <div className="p-6 flex-1 space-y-6">
              {/* Address & Customer */}
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {isRtl ? "بيانات العميل وعنوان التوصيل" : "Delivery Location & Contact"}
                </div>
                <div className="p-3.5 bg-muted/20 border rounded-2xl space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-foreground font-medium">
                    <UserCheck className="h-4 w-4 text-primary" />
                    <span>{del.customerName}</span>
                    <span className="font-mono text-muted-foreground text-[11px]">• {del.customerPhone}</span>
                  </div>

                  <div className="flex items-start gap-2 text-muted-foreground pt-1 border-t border-border/50">
                    <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span className="text-foreground">{del.deliveryAddress}</span>
                  </div>

                  {del.scheduledDate && (
                    <div className="flex items-center gap-2 text-muted-foreground pt-1 text-[11px] font-mono">
                      <Calendar className="h-3.5 w-3.5 text-primary" />
                      <span>{isRtl ? "الموعد المجدول:" : "Scheduled Date:"} {del.scheduledDate}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Operational Tasks Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {isRtl ? "مهام التوصيل والتركيب" : "Delivery & Installation Tasks"}
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono font-bold px-1.5 py-0">
                      {deliveryTasks.length}
                    </Badge>
                  </div>

                  {canMutate && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsTaskFormOpen(true)}
                      className="h-7 text-xs font-semibold gap-1.5 text-primary border-primary/30 hover:bg-primary/5"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{isRtl ? "إضافة مهمة" : "+ Create Task"}</span>
                    </Button>
                  )}
                </div>

                <div className="space-y-1.5">
                  {deliveryTasks.length === 0 ? (
                    <div className="text-xs text-muted-foreground bg-muted/20 p-3 rounded-xl border text-center">
                      {isRtl
                        ? "لا توجد مهام تشغيلية مرتبطة بإذن التسليم هذا"
                        : "No tasks linked to this delivery yet"}
                    </div>
                  ) : (
                    deliveryTasks.map((task: any) => (
                      <Link
                        key={task.id}
                        to="/admin/tasks"
                        search={{ taskId: task.id } as any}
                        className="flex items-center justify-between p-2.5 rounded-xl border text-xs bg-card hover:bg-muted/40 transition-colors cursor-pointer group"
                      >
                        <div className="space-y-0.5 min-w-0 pr-2 rtl:pr-0 rtl:pl-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-[11px] text-primary group-hover:underline">
                              {task.taskCode}
                            </span>
                            <span className="font-medium truncate">{task.title}</span>
                          </div>
                          {task.dueDate && (
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>{new Date(task.dueDate).toLocaleDateString(isRtl ? "ar-EG" : "en-US")}</span>
                            </div>
                          )}
                        </div>

                        <Badge
                          variant="outline"
                          className={`text-[10px] capitalize shrink-0 ${
                            task.status === "completed"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : task.status === "in_progress"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : task.status === "waiting_review"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : ""
                          }`}
                        >
                          {task.status.replace("_", " ")}
                        </Badge>
                      </Link>
                    ))
                  )}
                </div>

                {/* Contextual Task Form */}
                <TaskForm
                  open={isTaskFormOpen}
                  onOpenChange={setIsTaskFormOpen}
                  defaultDeliveryId={del.id}
                  defaultOrderId={del.orderId || undefined}
                  defaultCustomerId={del.customerId || undefined}
                  defaultCategory="delivery"
                  defaultTitle={`${del.deliveryNumber} - `}
                  onTaskSaved={() => refetchTasks()}
                />
              </div>

              {/* Status Specific Input / Timeline */}
              {del.status === "ready_for_dispatch" && canMutate && (
                <div className="p-4 bg-blue-50/40 dark:bg-blue-950/20 border border-blue-200/60 rounded-2xl space-y-3 text-xs">
                  <div className="font-semibold text-blue-800 dark:text-blue-400 flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    <span>{isRtl ? "الشحنة جاهزة لخروجها من المصنع" : "Shipment is ready for dispatch from factory"}</span>
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    {isRtl
                      ? "تم فحص الجودة وتغليف المنتجات، اضغط على زر خروج الشحنة لتسجيل بدء النقل."
                      : "QC inspection passed and products packaged. Click Dispatch to record departure."}
                  </p>
                  <Button
                    size="sm"
                    onClick={() => handleStatusTransition("dispatched")}
                    disabled={updating}
                    className="w-full bg-primary text-primary-foreground font-semibold text-xs"
                  >
                    {updating && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                    <span>{isRtl ? "تأكيد خروج الشحنة (Dispatch)" : "Dispatch Shipment"}</span>
                  </Button>
                </div>
              )}

              {del.status === "dispatched" && canMutate && (
                <div className="p-4 bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/60 rounded-2xl space-y-3 text-xs">
                  <div className="font-semibold text-amber-800 dark:text-amber-400 flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    <span>{isRtl ? "الشحنة في الطريق للتسليم" : "Shipment in transit"}</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleStatusTransition("out_for_delivery")}
                    disabled={updating}
                    className="w-full bg-indigo-600 text-white font-semibold text-xs"
                  >
                    {updating && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                    <span>{isRtl ? "تحديث: جاري التسليم للعميل (Out for Delivery)" : "Mark Out for Delivery"}</span>
                  </Button>
                </div>
              )}

              {del.status === "out_for_delivery" && canMutate && (
                <div className="p-4 bg-teal-50/40 dark:bg-teal-950/20 border border-teal-200/60 rounded-2xl space-y-3 text-xs">
                  <div className="font-semibold text-teal-800 dark:text-teal-400 flex items-center gap-2">
                    <PackageCheck className="h-4 w-4" />
                    <span>{isRtl ? "تأكيد وصول الشحنة لموقع العميل" : "Confirm Delivery Arrival"}</span>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">{isRtl ? "اسم المستلم بموقع التسليم" : "Recipient Name"}</Label>
                    <Input
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder={del.customerName}
                      className="h-8 text-xs"
                    />
                  </div>

                  <Button
                    size="sm"
                    onClick={() => handleStatusTransition("delivered")}
                    disabled={updating}
                    className="w-full bg-teal-600 text-white font-semibold text-xs"
                  >
                    {updating && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                    <span>{isRtl ? "تأكيد إتمام التوصيل (Delivered)" : "Confirm Delivered"}</span>
                  </Button>
                </div>
              )}

              {del.status === "delivered" && del.installationRequired && canMutate && (
                <div className="p-4 bg-purple-50/40 dark:bg-purple-950/20 border border-purple-200/60 rounded-2xl space-y-3 text-xs">
                  <div className="font-semibold text-purple-800 dark:text-purple-400 flex items-center gap-2">
                    <Wrench className="h-4 w-4" />
                    <span>{isRtl ? "بدء أعمال التركيب بموقع العميل" : "Begin Installation Work"}</span>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">{isRtl ? "اسم الفني / فريق التركيب" : "Installer / Team Name"}</Label>
                    <Input
                      value={installerName}
                      onChange={(e) => setInstallerName(e.target.value)}
                      placeholder={isRtl ? "فريق التركيبات 1" : "Installation Team"}
                      className="h-8 text-xs"
                    />
                  </div>

                  <Button
                    size="sm"
                    onClick={() => handleStatusTransition("installation_pending")}
                    disabled={updating}
                    className="w-full bg-purple-600 text-white font-semibold text-xs"
                  >
                    {updating && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                    <span>{isRtl ? "تسجيل بدء التركيب (Start Installation)" : "Start Installation"}</span>
                  </Button>
                </div>
              )}

              {del.status === "installation_pending" && canMutate && (
                <div className="p-4 bg-purple-50/40 dark:bg-purple-950/20 border border-purple-200/60 rounded-2xl space-y-3 text-xs">
                  <div className="font-semibold text-purple-800 dark:text-purple-400 flex items-center gap-2">
                    <Wrench className="h-4 w-4" />
                    <span>{isRtl ? "إنهاء أعمال التركيب وتجهيز محضر الاستلام" : "Finish Installation"}</span>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">{isRtl ? "ملاحظات الفني على التركيب" : "Installer Notes"}</Label>
                    <Textarea
                      value={installerNotes}
                      onChange={(e) => setInstallerNotes(e.target.value)}
                      placeholder={isRtl ? "تم تركيب وتثبيت كافة الوحدات بنجاح..." : "All units installed successfully..."}
                      className="text-xs min-h-[60px]"
                    />
                  </div>

                  <Button
                    size="sm"
                    onClick={() => handleStatusTransition("installed")}
                    disabled={updating}
                    className="w-full bg-emerald-600 text-white font-semibold text-xs"
                  >
                    {updating && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                    <span>{isRtl ? "تأكيد إتمام التركيب (Installed)" : "Confirm Installed"}</span>
                  </Button>
                </div>
              )}

              {(del.status === "installed" || (del.status === "delivered" && !del.installationRequired)) && canMutate && (
                <div className="p-4 bg-muted/30 border rounded-2xl space-y-4 text-xs">
                  <div className="font-bold text-foreground flex items-center gap-2">
                    <PenTool className="h-4 w-4 text-primary" />
                    <span>{isRtl ? "محضر التسليم وتوقيع العميل النهائي" : "Customer Handover & Sign-Off"}</span>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">{isRtl ? "اسم الموقع / المستلم *" : "Signer / Recipient Name *"}</Label>
                    <Input
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      placeholder={del.customerName}
                      className="h-8 text-xs font-semibold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">{isRtl ? "توقيع العميل (إلكتروني) *" : "Customer Signature *"}</Label>
                    <CustomerSignaturePad
                      onSaveSignature={setSignatureDataUrl}
                      initialSignature={del.signatureDataUrl}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">{isRtl ? "ملاحظات الاستلام النهائي" : "Handover Notes"}</Label>
                    <Textarea
                      value={handoverNotes}
                      onChange={(e) => setHandoverNotes(e.target.value)}
                      placeholder={isRtl ? "استلمت المنتجات بحالة ممتازة وبالمواصفات المطلوبة..." : "Received products in excellent condition..."}
                      className="text-xs min-h-[60px]"
                    />
                  </div>

                  <Button
                    size="sm"
                    onClick={() => handleStatusTransition("completed")}
                    disabled={updating || !signerName.trim() || !signatureDataUrl}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9"
                  >
                    {updating && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                    <span>{isRtl ? "إتمام الاستلام النهائي للطلب (Complete Handover)" : "Complete Customer Handover"}</span>
                  </Button>
                </div>
              )}

              {/* Completed Handover Summary */}
              {del.status === "completed" && (
                <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-300 rounded-2xl space-y-3 text-xs">
                  <div className="font-bold text-emerald-800 dark:text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{isRtl ? "تم إتمام التسليم وتوقيع العميل رسمياً" : "Customer Handover Fully Completed"}</span>
                  </div>

                  <div className="text-[11px] text-muted-foreground space-y-1">
                    <div>{isRtl ? "الموقع:" : "Signer:"} <strong>{del.signerName || del.customerName}</strong></div>
                    {del.handedOverAt && (
                      <div>{isRtl ? "تاريخ التوقيع:" : "Signed At:"} {new Date(del.handedOverAt).toLocaleString(isRtl ? "ar-EG" : "en-US")}</div>
                    )}
                  </div>

                  {del.signatureDataUrl && (
                    <div className="pt-2 border-t border-emerald-200">
                      <span className="text-[10px] text-muted-foreground block mb-1">{isRtl ? "التوقيع المحفوظ كدليل تسليم:" : "Handover Signature Evidence:"}</span>
                      <img
                        src={del.signatureDataUrl}
                        alt="Customer Signature"
                        className="h-20 bg-background border rounded-lg p-1 object-contain"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
