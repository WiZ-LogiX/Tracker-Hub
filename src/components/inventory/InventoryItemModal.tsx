import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { createInventoryItem, updateInventoryItem } from "@/lib/inventory.functions";
import type { StockItem, StockItemType } from "@/lib/inventory-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { Boxes, Loader2, Package, Layers, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

interface InventoryItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  item?: StockItem | null;
  defaultItemType?: StockItemType;
  initialCostPrice?: number;
  onSuccess?: () => void;
}

const COMMON_UNITS = [
  { code: "sheet", labelEn: "Sheet (لوح)", labelAr: "لوح" },
  { code: "pcs", labelEn: "Pieces (عدد)", labelAr: "عدد" },
  { code: "m", labelEn: "Linear Meter (متر طولي)", labelAr: "متر طولي" },
  { code: "m2", labelEn: "Square Meter (متر مربع)", labelAr: "متر مربع" },
  { code: "set", labelEn: "Set (طقم)", labelAr: "طقم" },
  { code: "pair", labelEn: "Pair (زوج)", labelAr: "زوج" },
];

export function InventoryItemModal({
  open,
  onOpenChange,
  mode,
  item,
  defaultItemType = "material",
  initialCostPrice = 0,
  onSuccess,
}: InventoryItemModalProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const createItemFn = useServerFn(createInventoryItem);
  const updateItemFn = useServerFn(updateInventoryItem);

  const [itemType, setItemType] = useState<StockItemType>(defaultItemType);
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState(defaultItemType === "hardware" ? "pcs" : "sheet");
  const [minReorderLevel, setMinReorderLevel] = useState(defaultItemType === "hardware" ? "20" : "5");
  const [initialStock, setInitialStock] = useState("0");
  const [costPrice, setCostPrice] = useState("0");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (mode === "edit" && item) {
        setItemType(item.itemType);
        setSku(item.sku);
        setName(item.name);
        setUnit(item.unit);
        setMinReorderLevel(String(item.minReorderLevel));
        setCostPrice(String(initialCostPrice || 0));
        setNotes("");
      } else {
        const initialType = defaultItemType || "material";
        setItemType(initialType);
        setSku("");
        setName("");
        setUnit(initialType === "hardware" ? "pcs" : "sheet");
        setMinReorderLevel(initialType === "hardware" ? "20" : "5");
        setInitialStock("0");
        setCostPrice("0");
        setNotes("");
      }
    }
  }, [open, mode, item, defaultItemType, initialCostPrice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!sku.trim()) {
      toast.error(isRtl ? "يرجى إدخال كود الصنف (SKU)" : "Please enter item SKU");
      return;
    }
    if (!name.trim()) {
      toast.error(isRtl ? "يرجى إدخال اسم الصنف" : "Please enter item name");
      return;
    }
    if (!unit.trim()) {
      toast.error(isRtl ? "يرجى تحديد وحدة القياس" : "Please select unit");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "create") {
        await createItemFn({
          data: {
            itemType,
            sku: sku.trim(),
            name: name.trim(),
            unit: unit.trim(),
            minReorderLevel: Math.max(0, Number(minReorderLevel) || 0),
            initialStock: Math.max(0, Number(initialStock) || 0),
            costPrice: Math.max(0, Number(costPrice) || 0),
            notes: notes.trim() || undefined,
          },
        });
        toast.success(
          isRtl ? "تمت إضافة الصنف بنجاح إلى المخزون" : "Inventory item created successfully",
        );
      } else if (mode === "edit" && item) {
        await updateItemFn({
          data: {
            stockItemId: item.id,
            sku: sku.trim(),
            name: name.trim(),
            unit: unit.trim(),
            minReorderLevel: Math.max(0, Number(minReorderLevel) || 0),
            costPrice: Math.max(0, Number(costPrice) || 0),
          },
        });
        toast.success(
          isRtl ? "تم تحديث بيانات الصنف بنجاح" : "Inventory item updated successfully",
        );
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err?.message || (isRtl ? "فشلت العملية" : "Operation failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "create" ? (
              <>
                <Plus className="h-5 w-5 text-primary" />
                <span>{isRtl ? "إضافة صنف جديد للمخزون" : "Add New Inventory Item"}</span>
              </>
            ) : (
              <>
                <Pencil className="h-5 w-5 text-primary" />
                <span>{isRtl ? `تعديل صنف: ${item?.sku}` : `Edit Item: ${item?.sku}`}</span>
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {mode === "create"
              ? isRtl
                ? "إضافة صنف جديد (خام أو إكسسوار) لكتالوج المخزون وتحديد الرصيد المبدئي وحد الطلب."
                : "Create a new inventory raw material or hardware item, initial stock, and reorder levels."
              : isRtl
              ? "تعديل بيانات الصنف الأساسية وكود الـ SKU ووحدة القياس وسعر التكلفة."
              : "Update item properties, SKU code, measurement unit, and cost price."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Item Type (Create only) */}
          {mode === "create" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{isRtl ? "نوع الصنف *" : "Item Type *"}</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setItemType("material");
                    if (unit === "pcs") setUnit("sheet");
                  }}
                  className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition ${
                    itemType === "material"
                      ? "border-primary bg-primary/10 text-primary font-bold shadow-2xs"
                      : "border-border/70 hover:bg-muted text-muted-foreground"
                  }`}
                >
                  <Layers className="h-4 w-4" />
                  <span>{isRtl ? "مادة خام / ألواح" : "Raw Material / Sheet"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setItemType("hardware");
                    if (unit === "sheet") setUnit("pcs");
                  }}
                  className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition ${
                    itemType === "hardware"
                      ? "border-primary bg-primary/10 text-primary font-bold shadow-2xs"
                      : "border-border/70 hover:bg-muted text-muted-foreground"
                  }`}
                >
                  <Package className="h-4 w-4" />
                  <span>{isRtl ? "إكسسوار / هاردوير" : "Hardware / Fitting"}</span>
                </button>
              </div>
            </div>
          )}

          {/* SKU & Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">{isRtl ? "كود الصنف (SKU) *" : "SKU Code *"}</Label>
              <Input
                value={sku}
                onChange={(e) => setSku(e.target.value.toUpperCase())}
                placeholder={itemType === "material" ? "e.g. MAT-PLY-18" : "e.g. HDW-HNG-01"}
                className="h-9 text-xs font-mono"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">{isRtl ? "وحدة القياس *" : "Unit *"}</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_UNITS.map((u) => (
                    <SelectItem key={u.code} value={u.code} className="text-xs">
                      {isRtl ? u.labelAr : u.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Item Name */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">{isRtl ? "اسم الصنف / الخامة *" : "Item / Material Name *"}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isRtl ? "مثال: كونتر جودوود إسباني 18 مم" : "e.g. Goodwood Plywood 18mm"}
              className="h-9 text-xs"
              required
            />
          </div>

          {/* Quantities & Pricing */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {mode === "create" ? (
              <div className="space-y-1">
                <Label className="text-xs font-semibold">{isRtl ? "الرصيد الافتتاحي" : "Initial Stock"}</Label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={initialStock}
                  onChange={(e) => setInitialStock(e.target.value)}
                  className="h-9 text-xs font-mono"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground">{isRtl ? "الرصيد الفعلي الحالي" : "Current Stock"}</Label>
                <div className="h-9 px-3 py-2 bg-muted/30 border rounded-md text-xs font-mono font-bold flex items-center">
                  {item?.physicalQuantity} {item?.unit}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs font-semibold">{isRtl ? "حد إعادة الطلب" : "Min Reorder Level"}</Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={minReorderLevel}
                onChange={(e) => setMinReorderLevel(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">{isRtl ? "سعر التكلفة (ج.م)" : "Cost Price (EGP)"}</Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>
          </div>

          {/* Notes (Create mode only) */}
          {mode === "create" && (
            <div className="space-y-1">
              <Label className="text-xs font-semibold">{isRtl ? "ملاحظات إضافية" : "Notes"}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={isRtl ? "ملاحظات عن المورد أو الاستخدام..." : "Supplier details or material notes..."}
                rows={2}
                className="text-xs"
              />
            </div>
          )}

          <DialogFooter className="gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="text-xs"
            >
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting}
              className="text-xs gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{isRtl ? "جاري الحفظ..." : "Saving..."}</span>
                </>
              ) : (
                <span>{mode === "create" ? (isRtl ? "إضافة الصنف" : "Add Item") : (isRtl ? "حفظ التعديلات" : "Save Changes")}</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}