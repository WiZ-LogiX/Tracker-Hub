import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listStockMovements } from "@/lib/inventory.functions";
import type { StockMovementItem, StockItemType } from "@/lib/inventory-types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  History,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  X,
  Loader2,
  Layers,
  Wrench,
  ChevronLeft,
  ChevronRight,
  User,
  Filter,
} from "lucide-react";

interface StockMovementsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const REASON_LABELS: Record<string, { en: string; ar: string; fr: string }> = {
  goods_received: { en: "Goods Received", ar: "استلام وتوريد بضاعة", fr: "Réception marchandise" },
  initial_stock: { en: "Initial Stock", ar: "رصيد افتتاحي", fr: "Stock initial" },
  initial_setup: { en: "Initial Setup", ar: "رصيد افتتاحي", fr: "Initialisation" },
  workshop_issued: { en: "Workshop Issue", ar: "صرف للورشة", fr: "Sortie atelier" },
  damaged: { en: "Damaged / Scrap", ar: "تالف وهالك", fr: "Endommagé / Rebut" },
  count_correction: { en: "Inventory Count", ar: "تسوية جرد", fr: "Régularisation inventaire" },
  waste: { en: "Process Waste", ar: "هالك تشغيل", fr: "Perte matière" },
  return: { en: "Return to Stock", ar: "مرتجع للمخزن", fr: "Retour en stock" },
  cycle_count: { en: "Cycle Count", ar: "جرد دوري", fr: "Inventaire tournant" },
  other: { en: "Other", ar: "حركة أخرى", fr: "Autre" },
};

export function StockMovementsDrawer({
  open,
  onOpenChange,
}: StockMovementsDrawerProps) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const isFr = i18n.language === "fr";
  const listMovementsFn = useServerFn(listStockMovements);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [direction, setDirection] = useState<"all" | "in" | "out">("all");
  const [itemType, setItemType] = useState<"all" | "material" | "hardware">("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(val.trim());
      setPage(1);
    }, 250);
  };

  const handleClearSearch = () => {
    setSearch("");
    setDebouncedSearch("");
    setPage(1);
  };

  // Reset page when filters change
  const handleDirectionChange = (val: "all" | "in" | "out") => {
    setDirection(val);
    setPage(1);
  };

  const handleItemTypeChange = (val: "all" | "material" | "hardware") => {
    setItemType(val);
    setPage(1);
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["stock-movements-ledger", debouncedSearch, direction, itemType, page, pageSize],
    queryFn: async () => {
      const res = await listMovementsFn({
        data: {
          search: debouncedSearch || undefined,
          direction,
          itemType,
          page,
          pageSize,
        },
      });
      return res;
    },
    enabled: open,
    staleTime: 15_000,
  });

  const movements = data?.items || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  const getReasonLabel = (reasonKey: string) => {
    const r = REASON_LABELS[reasonKey];
    if (!r) return reasonKey;
    if (isRtl) return r.ar;
    if (isFr) return r.fr;
    return r.en;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isRtl ? "left" : "right"}
        className="w-full sm:max-w-3xl sm:w-[85vw] p-0 flex flex-col gap-0 border-border"
      >
        {/* Header */}
        <SheetHeader className="p-4 sm:p-5 border-b space-y-1 bg-muted/20">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="text-lg font-bold flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              <span>{isRtl ? "سجل حركات المخزن والمستودع" : "Stock Movement Audit Ledger"}</span>
            </SheetTitle>
            <Badge variant="outline" className="font-mono text-xs">
              {total} {isRtl ? "حركة مسجلة" : "movements"}
            </Badge>
          </div>
          <SheetDescription className="text-xs text-muted-foreground">
            {isRtl
              ? "سجل رقابي وتدقيقي لكافة حركات التوريد والإضافة (+) والصرف والخصم (-) عبر المستودع."
              : "Complete chronological audit trail of all stock-in (goods received) and stock-out (workshop issues, scrap) transactions."}
          </SheetDescription>
        </SheetHeader>

        {/* Filter Controls Bar */}
        <div className="p-4 border-b bg-card space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute right-3 rtl:right-3 rtl:left-auto left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={isRtl ? "بحث بكود الصنف، اسم الخامة، أو الملاحظات..." : "Search by SKU, item name, notes..."}
                className="pr-9 rtl:pr-9 rtl:pl-8 pl-9 h-8 text-xs rounded-lg"
              />
              {search && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute left-2.5 rtl:left-2.5 rtl:right-auto right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Direction Filter */}
            <Select value={direction} onValueChange={handleDirectionChange as any}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isRtl ? "كافة الحركات" : "All Movements"}</SelectItem>
                <SelectItem value="in">{isRtl ? "توريد وإضافة (+)" : "Stock In (+)"}</SelectItem>
                <SelectItem value="out">{isRtl ? "صرف وخصم (-)" : "Stock Out (-)"}</SelectItem>
              </SelectContent>
            </Select>

            {/* Item Type Filter */}
            <Select value={itemType} onValueChange={handleItemTypeChange as any}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isRtl ? "كافة الأصناف" : "All Items"}</SelectItem>
                <SelectItem value="material">{isRtl ? "الخامات فقط" : "Materials Only"}</SelectItem>
                <SelectItem value="hardware">{isRtl ? "الهاردوير فقط" : "Hardware Only"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Movements Table / Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="py-20 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span>{isRtl ? "جاري تحميل سجل الحركات..." : "Loading movements ledger..."}</span>
            </div>
          ) : movements.length === 0 ? (
            <div className="py-20 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
              <History className="h-8 w-8 text-muted-foreground/40" />
              <span className="font-semibold">{isRtl ? "لا توجد حركات مطابقة للفلاتر الحالية" : "No stock movements match current filters"}</span>
              <span className="text-[11px] text-muted-foreground/80">
                {isRtl ? "جرب تغيير مصطلح البحث أو إزالة فلتر الاتجاه" : "Try clearing search or changing direction filter"}
              </span>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/40 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-32 text-xs">{isRtl ? "التاريخ / الوقت" : "Date & Time"}</TableHead>
                  <TableHead className="text-xs">{isRtl ? "الصنف / الكود" : "Item & SKU"}</TableHead>
                  <TableHead className="w-24 text-xs">{isRtl ? "النوع" : "Type"}</TableHead>
                  <TableHead className="w-24 text-center text-xs">{isRtl ? "الحركة" : "Delta"}</TableHead>
                  <TableHead className="w-28 text-end text-xs">{isRtl ? "الرصيد" : "Shift"}</TableHead>
                  <TableHead className="text-xs">{isRtl ? "السبب / الملاحظات" : "Reason & Notes"}</TableHead>
                  <TableHead className="w-28 text-xs">{isRtl ? "المسؤول" : "Operator"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => {
                  const isIn = m.quantityDelta > 0;
                  const dateStr = new Date(m.createdAt).toLocaleDateString(
                    isRtl ? "ar-EG" : "en-US",
                    { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
                  );

                  return (
                    <TableRow key={m.id} className="hover:bg-muted/30 text-xs">
                      {/* Date */}
                      <TableCell className="text-muted-foreground whitespace-nowrap font-mono text-[11px]">
                        {dateStr}
                      </TableCell>

                      {/* Item Info */}
                      <TableCell>
                        <div className="space-y-0.5">
                          <span className="font-mono font-bold text-primary block">{m.sku}</span>
                          <span className="text-foreground text-[11px] block truncate max-w-[180px]">{m.name}</span>
                        </div>
                      </TableCell>

                      {/* Type Badge */}
                      <TableCell>
                        {m.itemType === "material" ? (
                          <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300/50">
                            {isRtl ? "خام" : "Material"}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-300/50">
                            {isRtl ? "هاردوير" : "Hardware"}
                          </Badge>
                        )}
                      </TableCell>

                      {/* Delta Badge */}
                      <TableCell className="text-center">
                        <Badge
                          className={`font-mono font-bold text-[11px] gap-1 ${
                            isIn
                              ? "bg-emerald-600 text-white"
                              : "bg-destructive text-destructive-foreground"
                          }`}
                        >
                          {isIn ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                          <span>{isIn ? `+${m.quantityDelta}` : m.quantityDelta}</span>
                        </Badge>
                      </TableCell>

                      {/* Balance Shift */}
                      <TableCell className="text-end font-mono text-[11px]">
                        <span className="text-muted-foreground">{m.previousQuantity}</span>
                        <span className="mx-1 text-muted-foreground/60">➔</span>
                        <span className="font-bold text-foreground">{m.newQuantity}</span>
                        <span className="text-[10px] text-muted-foreground ml-1 rtl:mr-1">{m.unit}</span>
                      </TableCell>

                      {/* Reason & Notes */}
                      <TableCell>
                        <div className="space-y-0.5">
                          <span className="font-semibold text-foreground text-[11px] block">
                            {getReasonLabel(m.reason)}
                          </span>
                          {m.notes && (
                            <span className="text-[10px] text-muted-foreground italic block truncate max-w-[200px]" title={m.notes}>
                              {m.notes}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Operator */}
                      <TableCell className="text-muted-foreground text-[11px]">
                        <div className="flex items-center gap-1.5 truncate max-w-[120px]">
                          <User className="h-3 w-3 text-muted-foreground/70 shrink-0" />
                          <span className="truncate">{m.operatorName || (isRtl ? "إداري" : "Admin")}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination Bar */}
        <div className="p-3 bg-muted/20 border-t flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {isRtl
              ? `صفحة ${page} من ${totalPages} (${total} حركة)`
              : `Page ${page} of ${totalPages} (${total} movements)`}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-7 text-xs px-2"
            >
              <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />
              <span>{isRtl ? "السابق" : "Prev"}</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-7 text-xs px-2"
            >
              <span>{isRtl ? "التالي" : "Next"}</span>
              <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
