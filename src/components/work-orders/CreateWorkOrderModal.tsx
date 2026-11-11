import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { createWorkOrder } from "@/lib/work-orders.functions";
import type { WorkOrderPriority } from "@/lib/work-order-types";
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
import { Hammer, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface CreateWorkOrderModalProps {
  orderId: string;
  orderNumber?: string;
  remakeId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (workOrderId: string) => void;
}

export function CreateWorkOrderModal({
  orderId,
  orderNumber,
  remakeId,
  open,
  onOpenChange,
  onCreated,
}: CreateWorkOrderModalProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const createWorkOrderFn = useServerFn(createWorkOrder);

  const [priority, setPriority] = useState<WorkOrderPriority>("medium");
  const [scheduledDate, setScheduledDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await createWorkOrderFn({
        data: {
          orderId,
          remakeId: remakeId || null,
          priority,
          scheduledDate: scheduledDate || null,
          notes: notes.trim() || null,
        },
      });

      toast.success(
        isRtl
          ? `تم إنشاء أمر الشغل بنجاح (${res.workOrderNumber})`
          : `Work order created successfully (${res.workOrderNumber})`,
      );
      setNotes("");
      setScheduledDate("");
      onOpenChange(false);
      onCreated?.(res.workOrderId);
    } catch (err: any) {
      toast.error(err?.message || "Failed to create work order");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-serif font-bold flex items-center gap-2">
            <Hammer className="h-5 w-5 text-primary" />
            <span>{isRtl ? "إنشاء أمر شغل وتصنيع بالورشة" : "Create Production Work Order"}</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {orderNumber && (
            <div className="p-3 bg-muted/40 rounded-xl border text-xs flex items-center justify-between">
              <span className="text-muted-foreground">{isRtl ? "أمر البيع المرتبط:" : "Linked Order:"}</span>
              <span className="font-mono font-bold text-foreground">{orderNumber}</span>
            </div>
          )}

          {/* Priority */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">{isRtl ? "درجة الأولوية بالورشة *" : "Production Priority *"}</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as WorkOrderPriority)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">{isRtl ? "منخفضة (Low)" : "Low"}</SelectItem>
                <SelectItem value="medium">{isRtl ? "متوسطة (Medium)" : "Medium"}</SelectItem>
                <SelectItem value="high">{isRtl ? "عالية (High)" : "High"}</SelectItem>
                <SelectItem value="critical">{isRtl ? "عاجلة جداً (Critical)" : "Critical"}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Scheduled Date */}
          <div className="space-y-1.5">
            <Label htmlFor="sched-date" className="text-xs font-semibold">
              {isRtl ? "تاريخ بدء التشغيل المجدول" : "Scheduled Start Date"}
            </Label>
            <Input
              id="sched-date"
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          {/* Notes / Instructions */}
          <div className="space-y-1.5">
            <Label htmlFor="wo-notes" className="text-xs font-semibold">
              {isRtl ? "تعليمات خاصة لفنيي الورشة" : "Factory Notes & Instructions"}
            </Label>
            <Textarea
              id="wo-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isRtl ? "تعليمات التقطيع، التجميع، أو التشطيب..." : "Cutting, edge banding, or assembly notes..."}
              className="text-xs min-h-[70px]"
            />
          </div>

          <DialogFooter className="pt-2">
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
              <span>{isRtl ? "إنشاء أمر الشغل" : "Create Work Order"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
