import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { createRemake } from "@/lib/remakes.functions";
import type { RemakeType, RemakeSeverity } from "@/lib/remake-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { ShieldAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface CreateRemakeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId?: string | null;
  customerId?: string | null;
  ordersList?: Array<{ id: string; orderNumber: string }>;
  qcInspectionId?: string | null;
  onCreated?: () => void;
}

export function CreateRemakeModal({
  open,
  onOpenChange,
  orderId,
  customerId,
  ordersList,
  qcInspectionId,
  onCreated,
}: CreateRemakeModalProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const createRemakeFn = useServerFn(createRemake);

  const [selectedOrderId, setSelectedOrderId] = useState<string>(orderId || "");
  const [type, setType] = useState<RemakeType>("qc_failure");
  const [severity, setSeverity] = useState<RemakeSeverity>("medium");
  const [reason, setReason] = useState("");
  const [defectDescription, setDefectDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [createLinkedTask, setCreateLinkedTask] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Sync selectedOrderId when opened or props change
  useEffect(() => {
    if (orderId) {
      setSelectedOrderId(orderId);
    } else if (ordersList && ordersList.length > 0) {
      setSelectedOrderId((prev) => prev || ordersList[0].id);
    }
  }, [open, orderId, ordersList]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveOrderId = orderId || selectedOrderId;
    if (!effectiveOrderId) {
      toast.error(isRtl ? "رقم أمر الإنتاج مطلوب" : "Order is required");
      return;
    }
    if (!reason.trim()) {
      toast.error(isRtl ? "سبب الخلل/العيب مطلوب" : "Reason is required");
      return;
    }

    setSubmitting(true);
    try {
      const res = await createRemakeFn({
        data: {
          orderId: effectiveOrderId,
          customerId: customerId || null,
          qcInspectionId: qcInspectionId || null,
          type,
          severity,
          reason: reason.trim(),
          defectDescription: defectDescription.trim() || null,
          dueDate: dueDate || null,
          createLinkedTask,
        },
      });

      toast.success(
        isRtl
          ? `تم فتح حالة الجودة ${res.remakeNumber} بنجاح`
          : `Quality case ${res.remakeNumber} created`,
      );
      setReason("");
      setDefectDescription("");
      setDueDate("");
      onOpenChange(false);
      onCreated?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create remake case");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-serif font-bold flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            <span>{isRtl ? "تسجيل عيب فني / طلب إعادة تصنيع" : "Report Defect / Remake Case"}</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5 py-2">
          {!orderId && ordersList && ordersList.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{isRtl ? "أمر الإنتاج المرتبط *" : "Linked Order *"}</Label>
              <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={isRtl ? "اختر أمر الإنتاج..." : "Select Order..."} />
                </SelectTrigger>
                <SelectContent>
                  {ordersList.map((o) => (
                    <SelectItem key={o.id} value={o.id} className="text-xs">
                      {o.orderNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{isRtl ? "نوع الحالة" : "Case Type"}</Label>
              <Select value={type} onValueChange={(v) => setType(v as RemakeType)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="qc_failure">{isRtl ? "فشل فحص جودة (QC)" : "QC Failure"}</SelectItem>
                  <SelectItem value="manufacturing_defect">{isRtl ? "عيب تصنيع داخلي" : "Mfg Defect"}</SelectItem>
                  <SelectItem value="customer_complaint">{isRtl ? "شكوى عميل" : "Customer Complaint"}</SelectItem>
                  <SelectItem value="warranty">{isRtl ? "مطالبة ضمان" : "Warranty Claim"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{isRtl ? "درجة الخطورة" : "Severity"}</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as RemakeSeverity)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{isRtl ? "منخفضة (Low)" : "Low"}</SelectItem>
                  <SelectItem value="medium">{isRtl ? "متوسطة (Medium)" : "Medium"}</SelectItem>
                  <SelectItem value="high">{isRtl ? "عالية (High)" : "High"}</SelectItem>
                  <SelectItem value="critical">{isRtl ? "حرجة (Critical)" : "Critical"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="remake-reason" className="text-xs font-semibold">
              {isRtl ? "عنوان الخلل / العيب الفني *" : "Defect Summary / Reason *"}
            </Label>
            <Input
              id="remake-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isRtl ? "مثال: مقاس غير مطابق للوحدة السفلية" : "e.g. Dimensions mismatch on base unit"}
              required
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="remake-desc" className="text-xs font-semibold">
              {isRtl ? "الوصف الفني بالتفصيل" : "Detailed Technical Description"}
            </Label>
            <Textarea
              id="remake-desc"
              value={defectDescription}
              onChange={(e) => setDefectDescription(e.target.value)}
              placeholder={isRtl ? "تفاصيل القطعة، نوع الخشب، المقاس المطلوب تعديله..." : "Details of component, material, required modification..."}
              className="text-xs min-h-[80px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="remake-due" className="text-xs font-semibold">
              {isRtl ? "تاريخ الاستحقاق المطلوب" : "Target Due Date"}
            </Label>
            <Input
              id="remake-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-9 text-sm font-mono"
            />
          </div>

          <div className="flex items-center gap-2 pt-1 text-xs">
            <input
              type="checkbox"
              id="create-task"
              checked={createLinkedTask}
              onChange={(e) => setCreateLinkedTask(e.target.checked)}
              className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
            />
            <label htmlFor="create-task" className="text-muted-foreground font-medium cursor-pointer">
              {isRtl ? "إنشاء مهمة تشغيلية مرتبطة تلقائياً في إدارة المهام" : "Auto-create linked operational task in Tasks module"}
            </label>
          </div>

          <DialogFooter className="pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="text-xs h-9"
            >
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="text-xs h-9 bg-primary text-primary-foreground font-semibold"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5 rtl:mr-0 rtl:ml-1.5" />}
              <span>{isRtl ? "تسجيل الحالة" : "Create Case"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
