import { useState, useEffect } from "react";
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
import {
  Boxes,
  Loader2,
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Minus,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

interface StockAdjustmentModalProps {
  item: StockItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDirection?: "in" | "out";
  onAdjusted?: () => void;
}

const QUICK_ADD_AMOUNTS = [1, 5, 10, 25, 50];

export function StockAdjustmentModal({
  item,
  open,
  onOpenChange,
  initialDirection = "in",
  onAdjusted,
}: StockAdjustmentModalProps) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const adjustStockFn = useServerFn(adjustStock);

  const [direction, setDirection] = useState<"in" | "out">(initialDirection);
  const [quantity, setQuantity] = useState<string>("");
  const [reason, setReason] = useState<string>("goods_received");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setDirection(initialDirection);
      setQuantity("");
      setReason(initialDirection === "in" ? "goods_received" : "workshop_issued");
      setNotes("");
    }
  }, [open, initialDirection]);

  if (!item) return null;

  const handleDirectionChange = (newDir: "in" | "out") => {
    setDirection(newDir);
    setReason(newDir === "in" ? "goods_received" : "workshop_issued");
  };

  const handleQuickAdd = (amt: number) => {
    const current = Number(quantity) || 0;
    setQuantity(String(current + amt));
  };

  const qtyNum = Math.abs(Number(quantity) || 0);
  const deltaNum = direction === "in" ? qtyNum : -qtyNum;
  const newPhysical = item.physicalQuantity + deltaNum;
  const newFree = newPhysical - item.reservedQuantity;

  // Validation
  const isZero = qtyNum <= 0;
  const isNegativeStock = direction === "out" && newPhysical < 0;
  const isBreachingReserved = direction === "out" && newPhysical < item.reservedQuantity;
  const isInvalid = isZero || isNegativeStock || isBreachingReserved;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isZero) {
      toast.error(isRtl ? "يرجى إدخال كمية صالحة أكبر من الصفر" : "Please enter a valid quantity greater than zero");
      return;
    }
    if (isNegativeStock) {
      toast.error(isRtl ? "الرصيد الفعلي لا يمكن أن يكون سالباً" : "Physical stock cannot be negative");
      return;
    }
    if (isBreachingReserved) {
      toast.error(
        isRtl
          ? `لا يمكن صرف كمية تتجاوز الرصيد المتاح الحر (${item.freeQuantity} ${item.unit} متاح، و ${item.reservedQuantity} محجوز)`
          : `Cannot dispense beyond free stock (${item.freeQuantity} ${item.unit} free, ${item.reservedQuantity} reserved)`,
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

      const actionText = direction === "in"
        ? (isRtl ? "إضافة وتوريد" : "Stock-In")
        : (isRtl ? "صرف وخصم" : "Stock-Out");

      toast.success(
        isRtl
          ? `تم ${actionText} ${qtyNum} ${item.unit} لصنف [${item.sku}] — الرصيد الحالي: ${newPhysical}`
          : `${actionText} ${qtyNum} ${item.unit} for [${item.sku}] — New Balance: ${newPhysical}`,
      );
      setQuantity("");
      setNotes("");
      onOpenChange(false);
      onAdjusted?.();
    } catch (err: any) {
      toast.error(err?.message || (isRtl ? "فشل تعديل الرصيد" : "Failed to adjust stock"));
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
            <span>{isRtl ? "إجراء حركة مخزن" : "Inventory Stock Movement"}</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Item Overview Banner */}
          <div className="bg-muted/40 p-3 rounded-xl border space-y-1 text-xs">
            <div className="font-bold text-foreground flex items-center justify-between">
              <span>{item.name}</span>
              <span className="font-mono text-primary">{item.sku}</span>
            </div>
            <div className="text-muted-foreground flex items-center justify-between pt-1 border-t border-border/50 text-[11px]">
              <span>
                {isRtl ? "الرصيد الفعلي:" : "Physical Stock:"}{" "}
                <strong className="text-foreground">{item.physicalQuantity} {item.unit}</strong>
              </span>
              <span>
                {isRtl ? "المحجوز للطلبات:" : "Reserved:"}{" "}
                <strong className="text-primary">{item.reservedQuantity} {item.unit}</strong>
              </span>
              <span>
                {isRtl ? "المتاح الحر:" : "Free Stock:"}{" "}
                <strong className="text-emerald-600">{item.freeQuantity} {item.unit}</strong>
              </span>
            </div>
          </div>

          {/* Mode Selector Tabs: Stock In (+) vs Stock Out (-) */}
          <div className="grid grid-cols-2 gap-2 bg-muted/60 p-1 rounded-xl border">
            <button
              type="button"
              onClick={() => handleDirectionChange("in")}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                direction === "in"
                  ? "bg-emerald-600 text-white shadow-xs font-bold"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              }`}
            >
              <ArrowDownLeft className="h-4 w-4" />
              <span>{isRtl ? "توريد وإضافة (+)" : "Stock In (+)"}</span>
            </button>

            <button
              type="button"
              onClick={() => handleDirectionChange("out")}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                direction === "out"
                  ? "bg-destructive text-destructive-foreground shadow-xs font-bold"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              }`}
            >
              <ArrowUpRight className="h-4 w-4" />
              <span>{isRtl ? "صرف وخصم (-)" : "Stock Out (-)"}</span>
            </button>
          </div>

          {/* Quantity Input with Quick Add Chips */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="qty-input" className="text-xs font-semibold">
                {direction === "in"
                  ? (isRtl ? "كمية التوريد والإضافة *" : "Stock-In Quantity *")
                  : (isRtl ? "كمية الصرف والخصم *" : "Stock-Out Quantity *")}
              </Label>
              <span className="text-[11px] font-mono text-muted-foreground">
                {item.unit}
              </span>
            </div>

            <div className="relative">
              <Input
                id="qty-input"
                type="number"
                step="any"
                min="0.001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder={direction === "in" ? "e.g. 20" : "e.g. 5"}
                required
                className="h-10 text-sm font-mono pr-8 rtl:pr-3 rtl:pl-8"
              />
              <div className="absolute right-2.5 rtl:right-auto rtl:left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-xs">
                {direction === "in" ? "+" : "-"}
              </div>
            </div>

            {/* Quick Add Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] text-muted-foreground mr-1 rtl:mr-0 rtl:ml-1">
                {isRtl ? "إضافة سريعة:" : "Quick add:"}
              </span>
              {QUICK_ADD_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleQuickAdd(amt)}
                  className="px-2 py-0.5 rounded-md bg-muted hover:bg-primary/10 hover:text-primary text-[11px] font-mono font-medium transition-colors border"
                >
                  +{amt}
                </button>
              ))}
              {quantity && (
                <button
                  type="button"
                  onClick={() => setQuantity("")}
                  className="px-2 py-0.5 rounded-md text-[10px] text-muted-foreground hover:text-destructive underline ml-auto rtl:ml-0 rtl:mr-auto"
                >
                  {isRtl ? "تفريغ" : "Clear"}
                </button>
              )}
            </div>
          </div>

          {/* Reason Select (Scoped by Direction) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              {direction === "in"
                ? (isRtl ? "سبب التوريد والإضافة *" : "Inward Reason *")
                : (isRtl ? "سبب الصرف والخصم *" : "Outward Reason *")}
            </Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {direction === "in" ? (
                  <>
                    <SelectItem value="goods_received">
                      {isRtl ? "استلام بضاعة وتوريد جديد من مورد" : "Goods Received / Supplier Inward"}
                    </SelectItem>
                    <SelectItem value="initial_stock">
                      {isRtl ? "رصيد افتتاحي للمخزن" : "Initial Stock Setup"}
                    </SelectItem>
                    <SelectItem value="count_correction">
                      {isRtl ? "تسوية جرد دوري (فائض ومطابقة)" : "Inventory Count Correction (Surplus)"}
                    </SelectItem>
                    <SelectItem value="return">
                      {isRtl ? "مرتجع من ورشة أو موقع عميل" : "Return from Production / Job"}
                    </SelectItem>
                    <SelectItem value="other">
                      {isRtl ? "توريد إداري آخر" : "Other Inward Reason"}
                    </SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="workshop_issued">
                      {isRtl ? "صرف للورشة والتصنيع الفعلي" : "Workshop Issue / Production Dispense"}
                    </SelectItem>
                    <SelectItem value="damaged">
                      {isRtl ? "تالف / هالك أثناء التصنيع والنقل" : "Damaged / Production Scrap"}
                    </SelectItem>
                    <SelectItem value="count_correction">
                      {isRtl ? "تسوية جرد دوري (عجز ومطابقة)" : "Inventory Count Correction (Deficit)"}
                    </SelectItem>
                    <SelectItem value="waste">
                      {isRtl ? "هالك تشغيل وقص" : "Cutting & Process Waste"}
                    </SelectItem>
                    <SelectItem value="other">
                      {isRtl ? "صرف إداري آخر" : "Other Outward Reason"}
                    </SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Optional Reference / Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="adj-notes" className="text-xs font-semibold">
              {isRtl ? "رقم الإذن / ملاحظات مرجعية" : "Reference / Document Notes (Optional)"}
            </Label>
            <Textarea
              id="adj-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                direction === "in"
                  ? (isRtl ? "مثال: إذن استلام رقم 1042 أو اسم المورد..." : "e.g. GRN-1042 or Supplier Invoice...")
                  : (isRtl ? "مثال: إذن صرف أمر تشغيل WO-1025..." : "e.g. Work Order Dispense WO-1025...")
              }
              className="text-xs min-h-[55px]"
            />
          </div>

          {/* Live Result Preview */}
          <div className="p-3 bg-muted/30 rounded-xl border flex items-center justify-between text-xs font-mono">
            <div>
              <span className="text-muted-foreground block text-[10px]">
                {isRtl ? "الرصيد الفعلي المتوقع" : "Projected Physical"}
              </span>
              <span className={`font-bold ${isNegativeStock ? "text-destructive" : "text-foreground"}`}>
                {newPhysical} {item.unit}
              </span>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
            <div>
              <span className="text-muted-foreground block text-[10px]">
                {isRtl ? "المتاح الحر الجديد" : "Projected Free"}
              </span>
              <span className={`font-bold ${newFree < 0 ? "text-destructive font-black" : "text-emerald-600"}`}>
                {newFree} {item.unit}
              </span>
            </div>
          </div>

          {/* Warning Banner if Breaching Reserved Stock */}
          {isBreachingReserved && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                {isRtl
                  ? `تنبيه: لا يمكن صرف هذه الكمية لأنها تتعدى الرصيد الحر المتاح (${item.freeQuantity} ${item.unit}) وتقتطع من الكميات المحجوزة لأوامر الإنتاج (${item.reservedQuantity} ${item.unit}).`
                  : `Warning: Cannot dispense this quantity. It exceeds available free stock (${item.freeQuantity} ${item.unit}) and breaches orders' reserved quantities (${item.reservedQuantity} ${item.unit}).`}
              </span>
            </div>
          )}

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
              disabled={submitting || isInvalid}
              className={`text-xs h-9 font-semibold text-white ${
                direction === "in"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-destructive hover:bg-destructive/90"
              }`}
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5 rtl:mr-0 rtl:ml-1.5" />}
              <span>
                {direction === "in"
                  ? (isRtl ? "تأكيد التوريد والإضافة" : "Confirm Stock In")
                  : (isRtl ? "تأكيد الصرف والخصم" : "Confirm Stock Out")}
              </span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
