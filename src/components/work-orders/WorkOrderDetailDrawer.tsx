import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { TaskForm } from "@/components/tasks/TaskForm";
import {
  getWorkOrderById,
  updateWorkOrderStatus,
  exportCutListCsv,
} from "@/lib/work-orders.functions";
import type { WorkOrderDetailData, WorkOrderStatus } from "@/lib/work-order-types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Hammer,
  Scissors,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Download,
  Boxes,
  ClipboardList,
  CheckSquare,
  ShieldCheck,
  Calendar,
  Layers,
  Loader2,
  Play,
  Plus,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

interface WorkOrderDetailDrawerProps {
  workOrderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userRole?: string;
  onStatusChanged?: () => void;
}

export function WorkOrderDetailDrawer({
  workOrderId,
  open,
  onOpenChange,
  userRole,
  onStatusChanged,
}: WorkOrderDetailDrawerProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const getWorkOrderFn = useServerFn(getWorkOrderById);
  const updateStatusFn = useServerFn(updateWorkOrderStatus);
  const exportCutListFn = useServerFn(exportCutListCsv);

  const [updating, setUpdating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);

  const { data: detail, isLoading, refetch } = useQuery({
    queryKey: ["work-order-detail", workOrderId],
    queryFn: async () => {
      if (!workOrderId) return null;
      const res = await getWorkOrderFn({ data: { workOrderId } });
      return (res as unknown as WorkOrderDetailData) || null;
    },
    enabled: !!workOrderId && open,
  });

  const wo = detail?.workOrder;

  const handleStatusChange = async (newStatus: WorkOrderStatus) => {
    if (!workOrderId) return;
    setUpdating(true);
    try {
      await updateStatusFn({
        data: {
          workOrderId,
          status: newStatus,
        },
      });
      toast.success(
        isRtl ? "تم تحديث حالة أمر الشغل بنجاح" : "Work order status updated",
      );
      refetch();
      onStatusChanged?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update work order status");
    } finally {
      setUpdating(false);
    }
  };

  const handleExportCsv = async () => {
    if (!workOrderId) return;
    setExporting(true);
    try {
      const res = await exportCutListFn({ data: { workOrderId } });
      const blob = new Blob([res.csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", res.fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(isRtl ? "تم تصدير كشف التقطيع (CSV) بنجاح" : "Cut list CSV exported successfully");
    } catch (err: any) {
      toast.error(err?.message || "Failed to export cut list CSV");
    } finally {
      setExporting(false);
    }
  };

  const getStatusBadge = (status: WorkOrderStatus) => {
    switch (status) {
      case "ready":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "in_progress":
        return "bg-amber-50 text-amber-700 border-amber-300";
      case "qc_pending":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "completed":
        return "bg-emerald-50 text-emerald-700 border-emerald-300";
      case "cancelled":
        return "bg-rose-50 text-rose-700 border-rose-200";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const canMutate = userRole !== "viewer";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0 flex flex-col">
        {isLoading || !wo ? (
          <div className="flex-1 flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>{isRtl ? "جاري تحميل تفاصيل أمر الشغل..." : "Loading work order package..."}</span>
          </div>
        ) : (
          <>
            {/* Header */}
            <SheetHeader className="p-6 bg-muted/30 border-b space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xl font-bold text-primary">{wo.workOrderNumber}</span>
                    <Badge variant="outline" className={`text-xs capitalize ${getStatusBadge(wo.status)}`}>
                      {wo.status.replace("_", " ")}
                    </Badge>
                    {wo.remakeNumber && (
                      <Badge variant="outline" className="text-xs bg-rose-50 text-rose-700 border-rose-300">
                        {isRtl ? `إعادة تصنيع: ${wo.remakeNumber}` : `Remake: ${wo.remakeNumber}`}
                      </Badge>
                    )}
                  </div>
                  <SheetTitle className="text-sm font-medium text-muted-foreground mt-1">
                    {isRtl ? "أمر تصنيع وورشة" : "Factory Production Package"} • {wo.orderNumber}
                  </SheetTitle>
                </div>

                {/* Priority */}
                <Badge
                  variant="outline"
                  className={`text-[11px] uppercase font-mono ${
                    wo.priority === "critical"
                      ? "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-400"
                      : wo.priority === "high"
                        ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-400"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {wo.priority}
                </Badge>
              </div>

              {/* Context Summary Cards */}
              <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                <div className="p-2.5 bg-background rounded-xl border">
                  <span className="text-muted-foreground block text-[10px]">{isRtl ? "العميل" : "Customer"}</span>
                  <span className="font-semibold text-foreground truncate block">{wo.customerName}</span>
                </div>

                <div className="p-2.5 bg-background rounded-xl border">
                  <span className="text-muted-foreground block text-[10px]">{isRtl ? "المرحلة الحالية" : "Current Stage"}</span>
                  <span className="font-semibold text-foreground truncate block">{wo.currentStage}</span>
                </div>

                <div className="p-2.5 bg-background rounded-xl border">
                  <span className="text-muted-foreground block text-[10px]">{isRtl ? "جاهزية الخامات" : "Material Readiness"}</span>
                  <span className={`font-semibold ${wo.materialReadiness === "READY" ? "text-emerald-600" : "text-amber-600"}`}>
                    {wo.materialReadiness}
                  </span>
                </div>
              </div>
            </SheetHeader>

            {/* Content Tabs */}
            <div className="p-6 flex-1">
              <Tabs defaultValue="cutlist" className="space-y-4">
                <TabsList className="grid grid-cols-4 w-full h-9">
                  <TabsTrigger value="cutlist" className="text-xs gap-1.5">
                    <Scissors className="h-3.5 w-3.5" />
                    <span>{isRtl ? "كشف التقطيع" : "Cut List"}</span>
                  </TabsTrigger>
                  <TabsTrigger value="operations" className="text-xs gap-1.5">
                    <Hammer className="h-3.5 w-3.5" />
                    <span>{isRtl ? "العمليات" : "Operations"}</span>
                  </TabsTrigger>
                  <TabsTrigger value="materials" className="text-xs gap-1.5">
                    <Boxes className="h-3.5 w-3.5" />
                    <span>{isRtl ? "الخامات" : "Materials"}</span>
                  </TabsTrigger>
                  <TabsTrigger value="tasks" className="text-xs gap-1.5">
                    <CheckSquare className="h-3.5 w-3.5" />
                    <span>{isRtl ? "المهام" : "Tasks"}</span>
                  </TabsTrigger>
                </TabsList>

                {/* Tab 1: Cut List */}
                <TabsContent value="cutlist" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      {isRtl
                        ? `إجمالي القطع والألواح للتقطيع: ${detail.cutList.length}`
                        : `Total cutlist items: ${detail.cutList.length}`}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleExportCsv}
                      disabled={exporting || detail.cutList.length === 0}
                      className="h-8 text-xs font-semibold gap-1.5 text-primary"
                    >
                      {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      <span>{isRtl ? "تصدير كشف التقطيع (CSV)" : "Export Cut List (CSV)"}</span>
                    </Button>
                  </div>

                  <div className="border rounded-xl overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead className="text-[11px]">{isRtl ? "القطعة / الوحدة" : "Part / Unit"}</TableHead>
                          <TableHead className="text-[11px]">{isRtl ? "الخامة" : "Material"}</TableHead>
                          <TableHead className="text-[11px]">{isRtl ? "الأبعاد (ط × ع × س) مم" : "Dimensions (L×W×T) mm"}</TableHead>
                          <TableHead className="text-[11px]">{isRtl ? "الكمية" : "Qty"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.cutList.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-xs text-muted-foreground">
                              {isRtl ? "لا توجد قطع خشبية تتطلب تقطيع في المقايسة" : "No cutlist parts found in BOM"}
                            </TableCell>
                          </TableRow>
                        ) : (
                          detail.cutList.map((c) => (
                            <TableRow key={c.id} className="text-xs">
                              <TableCell>
                                <div className="font-semibold text-foreground">{c.componentName}</div>
                                <div className="text-[10px] text-muted-foreground">
                                  {c.productName} • {c.unitName}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="font-mono text-primary text-[11px]">{c.materialSku}</div>
                                <div className="text-[10px] text-muted-foreground">{c.materialName}</div>
                              </TableCell>
                              <TableCell className="font-mono text-[11px]">
                                {c.lengthMm} × {c.widthMm} × {c.thicknessMm}
                              </TableCell>
                              <TableCell className="font-mono font-bold text-foreground">
                                {c.quantity} {c.unitOfMeasure}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                {/* Tab 2: Operations */}
                <TabsContent value="operations" className="space-y-3">
                  <div className="border rounded-xl overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead className="text-[11px]">{isRtl ? "كود العملية" : "Op Code"}</TableHead>
                          <TableHead className="text-[11px]">{isRtl ? "العملية الصناعية" : "Operation Name"}</TableHead>
                          <TableHead className="text-[11px]">{isRtl ? "المرحلة" : "Stage"}</TableHead>
                          <TableHead className="text-[11px]">{isRtl ? "الكمية" : "Qty"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.operations.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-xs text-muted-foreground">
                              {isRtl ? "لا توجد عمليات صناعية مسجلة في المقايسة" : "No manufacturing operations found"}
                            </TableCell>
                          </TableRow>
                        ) : (
                          detail.operations.map((op) => (
                            <TableRow key={op.id} className="text-xs">
                              <TableCell className="font-mono text-primary text-[11px] font-bold">
                                {op.operationCode}
                              </TableCell>
                              <TableCell>
                                <div className="font-semibold text-foreground">{op.name}</div>
                                <div className="text-[10px] text-muted-foreground">{op.unitName}</div>
                              </TableCell>
                              <TableCell className="capitalize text-muted-foreground">
                                {op.stage}
                              </TableCell>
                              <TableCell className="font-mono font-bold">
                                {op.quantity} {op.unit}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                {/* Tab 3: Reserved Materials */}
                <TabsContent value="materials" className="space-y-3">
                  <div className="border rounded-xl overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead className="text-[11px]">{isRtl ? "كود الصنف" : "SKU"}</TableHead>
                          <TableHead className="text-[11px]">{isRtl ? "الخامة / الصنف" : "Material / Item"}</TableHead>
                          <TableHead className="text-[11px]">{isRtl ? "الكمية المحجوزة" : "Reserved Qty"}</TableHead>
                          <TableHead className="text-[11px]">{isRtl ? "الحالة" : "Status"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.reservedMaterials.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-xs text-muted-foreground">
                              {isRtl ? "لا توجد حجوزات خامات مسجلة لهذا الطلب" : "No stock reservations found"}
                            </TableCell>
                          </TableRow>
                        ) : (
                          detail.reservedMaterials.map((m, idx) => (
                            <TableRow key={idx} className="text-xs">
                              <TableCell className="font-mono text-primary text-[11px] font-bold">
                                {m.sku}
                              </TableCell>
                              <TableCell className="font-medium text-foreground">{m.name}</TableCell>
                              <TableCell className="font-mono font-bold text-emerald-600">
                                {m.reservedQuantity} {m.unit}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300">
                                  {m.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                {/* Tab 4: Tasks */}
                <TabsContent value="tasks" className="space-y-3">
                  <div className="flex items-center justify-between pb-1">
                    <div className="text-xs text-muted-foreground">
                      {isRtl
                        ? `المهام المرتبطة: ${detail.linkedTasks.length}`
                        : `Linked Tasks: ${detail.linkedTasks.length}`}
                    </div>
                    {canMutate && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsTaskFormOpen(true)}
                        className="h-7 text-xs font-semibold gap-1.5 text-primary border-primary/30 hover:bg-primary/5"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>{isRtl ? "إنشاء مهمة عمل" : "+ Create Task"}</span>
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {detail.linkedTasks.length === 0 ? (
                      <div className="text-center py-8 text-xs text-muted-foreground border rounded-xl">
                        {isRtl ? "لا توجد مهام تشغيلية مرتبطة بهذا الطلب" : "No operational tasks linked"}
                      </div>
                    ) : (
                      detail.linkedTasks.map((t) => (
                        <Link
                          key={t.id}
                          to="/admin/tasks"
                          search={{ taskId: t.id } as any}
                          className="p-3 bg-card hover:bg-muted/40 border rounded-xl flex items-center justify-between text-xs transition-colors cursor-pointer group"
                        >
                          <div className="space-y-0.5 min-w-0 pr-2 rtl:pr-0 rtl:pl-2">
                            <div className="flex items-center gap-1.5 font-medium text-foreground">
                              <span className="font-mono text-primary text-[11px] font-bold group-hover:underline">
                                {t.taskCode}
                              </span>
                              <span className="truncate">{t.title}</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">{t.description || "—"}</div>
                          </div>
                          <Badge variant="outline" className="text-[10px] capitalize shrink-0">
                            {t.status.replace("_", " ")}
                          </Badge>
                        </Link>
                      ))
                    )}
                  </div>

                  {/* Contextual Task Form */}
                  <TaskForm
                    open={isTaskFormOpen}
                    onOpenChange={setIsTaskFormOpen}
                    defaultWorkOrderId={wo.id}
                    defaultOrderId={wo.orderId || undefined}
                    defaultCustomerId={wo.customerId || undefined}
                    defaultCategory="production"
                    defaultTitle={`${wo.workOrderNumber} - `}
                    onTaskSaved={() => refetch()}
                  />
                </TabsContent>
              </Tabs>
            </div>

            {/* Actions Bar Footer */}
            {canMutate && (
              <div className="p-4 bg-muted/30 border-t flex items-center justify-between">
                <div className="text-xs text-muted-foreground font-mono">
                  {wo.scheduledDate ? `${isRtl ? "الموعد المجدول:" : "Scheduled:"} ${wo.scheduledDate}` : ""}
                </div>

                <div className="flex items-center gap-2">
                  {wo.status === "ready" && (
                    <Button
                      size="sm"
                      onClick={() => handleStatusChange("in_progress")}
                      disabled={updating}
                      className="text-xs bg-primary text-primary-foreground font-semibold gap-1.5"
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>{isRtl ? "بدء التشغيل بالورشة" : "Start Execution"}</span>
                    </Button>
                  )}

                  {wo.status === "in_progress" && (
                    <Button
                      size="sm"
                      onClick={() => handleStatusChange("qc_pending")}
                      disabled={updating}
                      className="text-xs bg-purple-600 text-white font-semibold gap-1.5"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>{isRtl ? "تسليم للفحص (QC)" : "Submit for QC"}</span>
                    </Button>
                  )}

                  {wo.status === "qc_pending" && (
                    <Button
                      size="sm"
                      onClick={() => handleStatusChange("completed")}
                      disabled={updating}
                      className="text-xs bg-emerald-600 text-white font-semibold gap-1.5"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>{isRtl ? "إتمام أمر الشغل" : "Complete Work Order"}</span>
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
