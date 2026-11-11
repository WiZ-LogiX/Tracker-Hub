import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { adjustStock } from "@/lib/inventory.functions";
import type { StockItem } from "@/lib/inventory-types";
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
import { Boxes, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface StockAdjustmentModalProps {
  item: StockItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdjusted?: () => void;
}

export function StockAdjustmentModal({
  item,
  open,
  onOpenChange,
  onAdjusted,
}: StockAdjustmentModalProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const adjustStockFn = useServerFn(adjustStock);

  const [delta, setDelta] = useState<string>("");
  const [reason, setReason] = useState<string>("goods_received");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  if (!item) return null;

  const deltaNum = Number(delta) || 0;
  const newPhysical = item.physicalQuantity + deltaNum;
  const newFree = newPhysical - item.reservedQuantity;
  const isInvalid = newPhysical < 0 || newPhysical < item.reservedQuantity;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deltaNum === 0) {
      toast.error(isRtl ? "يرجى إدخال كمية التعديل" : "Please enter adjustment quantity");
      return;
    }
    if (isInvalid) {
      toast.error(
        isRtl
          ? "لا يمكن تقليل الرصيد الفعلي عن الكميات المحجوزة للطلبات"
          : "Physical stock cannot be lower than reserved quantity",
      );
      return;
    }

    setSubmitting(true);
    try {
      await adjustStockFn({
        data: {
          stockItemId: item.id,
          quantityDelta: deltaNum,
          reason,
          notes: notes.trim() || null,
        },
      });

      toast.success(
        isRtl
          ? `تم تعديل رصيد ${item.name} إلى ${newPhysical} ${item.unit}`
          : `Stock adjusted for ${item.name} to ${newPhysical} ${item.unit}`,
      );
      setDelta("");
      setNotes("");
      onOpenChange(false);
      onAdjusted?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to adjust stock");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-serif font-bold flex items-center gap-2">
            <Boxes className="h-5 w-5 text-primary" />
            <span>{isRtl ? "تعديل رصيد المخزن" : "Adjust Inventory Stock"}</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Item Overview */}
          <div className="bg-muted/40 p-3.5 rounded-xl border space-y-1 text-xs">
            <div className="font-bold text-foreground flex items-center justify-between">
              <span>{item.name}</span>
              <span className="font-mono text-primary">{item.sku}</span>
            </div>
            <div className="text-muted-foreground flex items-center justify-between pt-1 border-t border-border/50 text-[11px]">
              <span>{isRtl ? "الرصيد الفعلي الحالي:" : "Current Physical:"} <strong>{item.physicalQuantity} {item.unit}</strong></span>
              <span>{isRtl ? "المحجوز:" : "Reserved:"} <strong>{item.reservedQuantity} {item.unit}</strong></span>
            </div>
          </div>

          {/* Quantity Delta Input */}
          <div className="space-y-1.5">
            <Label htmlFor="qty-delta" className="text-xs font-semibold">
              {isRtl ? "كمية التعديل (موجب للإضافة / سالب للخصم) *" : "Adjustment Delta (+ to add / - to deduct) *"}
            </Label>
            <Input
              id="qty-delta"
              type="number"
              step="any"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder={isRtl ? "مثال: 50 أو -10" : "e.g. 50 or -10"}
              required
              className="h-9 text-sm font-mono"
            />
          </div>

          {/* Reason Select */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">{isRtl ? "سبب التعديل *" : "Adjustment Reason *"}</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="goods_received">{isRtl ? "استلام بضاعة وتوريد جديد" : "Goods Received / Inward Supply"}</SelectItem>
                <SelectItem value="initial_stock">{isRtl ? "رصيد افتتاحي" : "Initial Stock Setup"}</SelectItem>
                <SelectItem value="count_correction">{isRtl ? "تسوية جرد دوري" : "Inventory Count Correction"}</SelectItem>
                <SelectItem value="damaged">{isRtl ? "تالف / هالك تصنيع" : "Damaged / Production Scrap"}</SelectItem>
                <SelectItem value="manual_adjustment">{isRtl ? "تعديل إداري آخر" : "Other Manual Adjustment"}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Optional Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="adj-notes" className="text-xs font-semibold">
              {isRtl ? "ملاحظات إضافية (رقم إذن توريد / محضر...)" : "Notes (Optional)"}
            </Label>
            <Textarea
              id="adj-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isRtl ? "تفاصيل إضافية عن سبب التعديل..." : "Reference or extra details..."}
              className="text-xs min-h-[60px]"
            />
          </div>

          {/* Result Preview */}
          <div className="p-3 bg-muted/30 rounded-xl border flex items-center justify-between text-xs font-mono">
            <div>
              <span className="text-muted-foreground block text-[10px]">{isRtl ? "الرصيد بعد التعديل" : "New Physical"}</span>
              <span className={`font-bold ${isInvalid ? "text-destructive" : "text-foreground"}`}>
                {newPhysical} {item.unit}
              </span>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <div>
              <span className="text-muted-foreground block text-[10px]">{isRtl ? "المتاح الحر للطلبات" : "New Free Stock"}</span>
              <span className={`font-bold ${newFree < 0 ? "text-destructive" : "text-emerald-600"}`}>
                {newFree} {item.unit}
              </span>
            </div>
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
              disabled={submitting || deltaNum === 0 || isInvalid}
              className="text-xs h-9 bg-primary text-primary-foreground font-semibold"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5 rtl:mr-0 rtl:ml-1.5" />}
              <span>{isRtl ? "تأكيد التعديل" : "Confirm Adjustment"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
