import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { getStockItem } from "@/lib/inventory.functions";
import type { StockItem } from "@/lib/inventory-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
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
  Boxes,
  History,
  Lock,
  ArrowRight,
  Loader2,
  Package,
  Layers,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { formatEGP } from "@/lib/pricing";

interface StockItemDetailModalProps {
  item: StockItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdjustClick?: (item: StockItem) => void;
}

const REASON_LABELS: Record<string, { ar: string; en: string }> = {
  goods_received: { ar: "استلام بضاعة من مورد", en: "Goods Received from Supplier" },
  initial_setup: { ar: "رصيد افتتاحي للمخزن", en: "Initial Stock Setup" },
  damaged: { ar: "تلف أو هالك أثناء التصنيع", en: "Damaged / Production Scrap" },
  return: { ar: "مرتجع من تشغيل أو عميل", en: "Returned from Production/Job" },
  cycle_count: { ar: "تسوية جرد دوري", en: "Cycle Count Reconciliation" },
  adjustment: { ar: "تعديل رصيد يدوي", en: "Manual Adjustment" },
};

export function StockItemDetailModal({
  item,
  open,
  onOpenChange,
  onAdjustClick,
}: StockItemDetailModalProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const getStockItemFn = useServerFn(getStockItem);

  const { data, isLoading } = useQuery({
    queryKey: ["stock-item-detail", item?.id],
    queryFn: async () => {
      if (!item?.id) return null;
      return await getStockItemFn({ data: { stockItemId: item.id } });
    },
    enabled: open && !!item?.id,
  });

  if (!item) return null;

  const currentItem = data?.item || item;
  const costPrice = data?.costPrice;
  const adjustments = data?.adjustments || [];
  const reservations = data?.reservations || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 border-b pb-3">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs font-bold text-primary">
                  {currentItem.sku}
                </Badge>
                {currentItem.itemType === "material" ? (
                  <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-700">
                    {isRtl ? "مادة خام" : "Material"}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] bg-purple-50 text-purple-700">
                    {isRtl ? "هاردوير" : "Hardware"}
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-lg font-bold mt-1">
                {currentItem.name}
              </DialogTitle>
            </div>

            {onAdjustClick && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  onAdjustClick(currentItem);
                }}
                className="text-xs gap-1 text-primary border-primary/30"
              >
                <Boxes className="h-3.5 w-3.5" />
                <span>{isRtl ? "تعديل الرصيد" : "Adjust Stock"}</span>
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* Stock Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 py-1">
          <Card className="p-3 shadow-2xs">
            <div className="text-[11px] text-muted-foreground">{isRtl ? "الرصيد الفعلي بالمخزن" : "Physical Stock"}</div>
            <div className="text-xl font-bold font-mono mt-0.5 text-foreground">
              {currentItem.physicalQuantity} <span className="text-xs font-normal text-muted-foreground">{currentItem.unit}</span>
            </div>
          </Card>

          <Card className="p-3 shadow-2xs bg-primary/5 border-primary/20">
            <div className="text-[11px] text-primary font-medium">{isRtl ? "المحجوز للطلبات" : "Reserved Stock"}</div>
            <div className="text-xl font-bold font-mono mt-0.5 text-primary">
              {currentItem.reservedQuantity} <span className="text-xs font-normal text-primary/70">{currentItem.unit}</span>
            </div>
          </Card>

          <Card className="p-3 shadow-2xs bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/60">
            <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">{isRtl ? "المتاح الحر" : "Free Stock"}</div>
            <div className="text-xl font-bold font-mono mt-0.5 text-emerald-700 dark:text-emerald-400">
              {currentItem.freeQuantity} <span className="text-xs font-normal text-emerald-600/70">{currentItem.unit}</span>
            </div>
          </Card>

          <Card className="p-3 shadow-2xs">
            <div className="text-[11px] text-muted-foreground">{isRtl ? "حد إعادة الطلب" : "Reorder Level"}</div>
            <div className="text-xl font-bold font-mono mt-0.5 text-foreground">
              {currentItem.minReorderLevel} <span className="text-xs font-normal text-muted-foreground">{currentItem.unit}</span>
            </div>
          </Card>
        </div>

        {costPrice !== undefined && costPrice > 0 && (
          <div className="p-2.5 bg-muted/30 rounded-lg text-xs flex items-center justify-between">
            <span className="text-muted-foreground">{isRtl ? "سعر التكلفة المسجل بالكتالوج:" : "Catalog Cost Price:"}</span>
            <span className="font-mono font-bold text-foreground">{formatEGP(costPrice)} / {currentItem.unit}</span>
          </div>
        )}

        {/* Tabs: Adjustment Log & Reservations */}
        <Tabs defaultValue="adjustments" className="w-full mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="adjustments" className="text-xs gap-1.5">
              <History className="h-3.5 w-3.5" />
              <span>{isRtl ? `سجل التعديلات (${adjustments.length})` : `Adjustments Log (${adjustments.length})`}</span>
            </TabsTrigger>
            <TabsTrigger value="reservations" className="text-xs gap-1.5">
              <Lock className="h-3.5 w-3.5" />
              <span>{isRtl ? `الحجوزات النشطة (${reservations.length})` : `Active Allocations (${reservations.length})`}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="adjustments" className="pt-2">
            {isLoading ? (
              <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>{isRtl ? "جاري تحميل السجل..." : "Loading history..."}</span>
              </div>
            ) : adjustments.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {isRtl ? "لا توجد تعديلات سابقة مسجلة على هذا الصنف." : "No adjustment history recorded for this item."}
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="text-xs">{isRtl ? "التاريخ" : "Date"}</TableHead>
                      <TableHead className="text-xs">{isRtl ? "التغيير" : "Delta"}</TableHead>
                      <TableHead className="text-xs">{isRtl ? "الرصيد" : "Prev → New"}</TableHead>
                      <TableHead className="text-xs">{isRtl ? "السبب" : "Reason"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adjustments.map((adj) => {
                      const isPositive = adj.quantityDelta > 0;
                      const dateStr = new Date(adj.createdAt).toLocaleDateString(
                        isRtl ? "ar-EG" : "en-US",
                        { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
                      );
                      const rLabel = REASON_LABELS[adj.reason] || { ar: adj.reason, en: adj.reason };

                      return (
                        <TableRow key={adj.id} className="text-xs">
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {dateStr}
                          </TableCell>
                          <TableCell className="font-mono font-bold">
                            <span className={isPositive ? "text-emerald-600" : "text-destructive"}>
                              {isPositive ? `+${adj.quantityDelta}` : adj.quantityDelta}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground text-[11px]">
                            {adj.previousQuantity} → <span className="font-bold text-foreground">{adj.newQuantity}</span>
                          </TableCell>
                          <TableCell>
                            <div>{isRtl ? rLabel.ar : rLabel.en}</div>
                            {adj.notes && (
                              <div className="text-[10px] text-muted-foreground italic truncate max-w-xs">
                                {adj.notes}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="reservations" className="pt-2">
            {isLoading ? (
              <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>{isRtl ? "جاري تحميل الحجوزات..." : "Loading allocations..."}</span>
              </div>
            ) : reservations.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {isRtl ? "لا توجد حجوزات نشطة حالياً لأوامر التشغيل." : "No active order reservations for this item."}
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="text-xs">{isRtl ? "أمر التشغيل" : "Order #"}</TableHead>
                      <TableHead className="text-xs">{isRtl ? "الكمية المحجوزة" : "Reserved Qty"}</TableHead>
                      <TableHead className="text-xs">{isRtl ? "الحالة" : "Status"}</TableHead>
                      <TableHead className="text-xs">{isRtl ? "تاريخ الحجز" : "Reserved Date"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reservations.map((res) => {
                      const dateStr = new Date(res.createdAt).toLocaleDateString(
                        isRtl ? "ar-EG" : "en-US",
                        { month: "short", day: "numeric" },
                      );
                      return (
                        <TableRow key={res.id} className="text-xs">
                          <TableCell className="font-mono font-bold text-primary">
                            {res.orderNumber}
                          </TableCell>
                          <TableCell className="font-mono font-bold">
                            {res.quantity} {res.unit}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                              {res.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {dateStr}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}