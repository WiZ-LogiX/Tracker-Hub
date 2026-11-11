import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  getOrderMaterialRequirements,
  reserveOrderMaterials,
  releaseOrderReservation,
} from "@/lib/inventory.functions";
import type { OrderMaterialReadinessSummary, MaterialReadiness } from "@/lib/inventory-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Boxes,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Loader2,
  PackageCheck,
} from "lucide-react";
import { toast } from "sonner";

interface OrderMaterialAllocationWidgetProps {
  orderId: string;
  userRole?: string;
  onMaterialsUpdated?: () => void;
}

export function OrderMaterialAllocationWidget({
  orderId,
  userRole,
  onMaterialsUpdated,
}: OrderMaterialAllocationWidgetProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const getRequirementsFn = useServerFn(getOrderMaterialRequirements);
  const reserveFn = useServerFn(reserveOrderMaterials);
  const releaseFn = useServerFn(releaseOrderReservation);

  const [acting, setActing] = useState(false);

  const { data: summary, isLoading, refetch } = useQuery({
    queryKey: ["order-materials-allocation", orderId],
    queryFn: async () => {
      const res = await getRequirementsFn({ data: { orderId } });
      return (res as unknown as OrderMaterialReadinessSummary) || null;
    },
  });

  const handleReserve = async () => {
    setActing(true);
    try {
      await reserveFn({ data: { orderId } });
      toast.success(isRtl ? "تم حجز الخامات بنجاح" : "Materials reserved successfully");
      refetch();
      onMaterialsUpdated?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to reserve materials");
    } finally {
      setActing(false);
    }
  };

  const handleRelease = async () => {
    if (!confirm(isRtl ? "هل أنت متأكد من فك حجز الخامات لهذا الطلب؟" : "Release reserved materials for this order?")) return;
    setActing(true);
    try {
      await releaseFn({ data: { orderId } });
      toast.success(isRtl ? "تم فك حجز الخامات وإعادتها للرصيد المتاح" : "Materials reservation released");
      refetch();
      onMaterialsUpdated?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to release reservation");
    } finally {
      setActing(false);
    }
  };

  const getReadinessBadge = (readiness: MaterialReadiness) => {
    switch (readiness) {
      case "READY":
        return "bg-emerald-50 text-emerald-700 border-emerald-300 font-bold dark:bg-emerald-950/40 dark:text-emerald-400";
      case "PARTIAL":
        return "bg-amber-50 text-amber-700 border-amber-300 font-bold dark:bg-amber-950/40 dark:text-amber-400";
      case "BLOCKED":
        return "bg-rose-50 text-rose-700 border-rose-300 font-bold dark:bg-rose-950/40 dark:text-rose-400";
    }
  };

  const canMutate = userRole !== "viewer";

  return (
    <Card className="border rounded-2xl shadow-xs overflow-hidden">
      <CardHeader className="p-4 bg-muted/30 border-b flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-bold font-serif">
            {isRtl ? "تخصيص الخامات وجاهزية المخزن" : "Material Stock Allocation"}
          </CardTitle>
          {summary && (
            <Badge variant="outline" className={`text-[10px] uppercase px-2 py-0.5 ${getReadinessBadge(summary.readiness)}`}>
              {summary.readiness}
            </Badge>
          )}
        </div>

        <Link to="/admin/inventory">
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-primary">
            <span>{isRtl ? "المخزن" : "Inventory"}</span>
            <ExternalLink className="h-3 w-3" />
          </Button>
        </Link>
      </CardHeader>

      <CardContent className="p-4 space-y-3 text-xs">
        {isLoading ? (
          <div className="flex items-center justify-center py-4 text-muted-foreground gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span>{isRtl ? "جاري فحص الخامات في المخزن..." : "Checking material stock..."}</span>
          </div>
        ) : !summary || summary.requirements.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            {isRtl ? "لا توجد خامات فيزيائية مطلوبة في مقايسة هذا الطلب" : "No physical materials required in quote BOM"}
          </div>
        ) : (
          <>
            {/* Requirements Items List */}
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {summary.requirements.map((req, idx) => (
                <div
                  key={idx}
                  className="p-2.5 bg-muted/20 border rounded-xl flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <span className="font-mono text-primary text-[11px]">{req.sku}</span>
                      <span>{req.name}</span>
                    </div>
                    <div className="text-muted-foreground text-[11px] flex items-center gap-2">
                      <span>{isRtl ? "مطلوب:" : "Req:"} <strong>{req.requiredQuantity} {req.unit}</strong></span>
                      <span>•</span>
                      <span>{isRtl ? "متاح حر:" : "Free:"} {req.freeQuantity} {req.unit}</span>
                      {req.reservedForThisOrder > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-600 font-semibold">
                            {isRtl ? `محجوز: ${req.reservedForThisOrder}` : `Reserved: ${req.reservedForThisOrder}`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    {req.status === "reserved" ? (
                      <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-300">
                        {isRtl ? "محجوز بالكامل" : "Reserved"}
                      </Badge>
                    ) : req.status === "shortage" ? (
                      <Badge variant="outline" className="text-[9px] bg-rose-50 text-rose-700 border-rose-300 font-bold">
                        {isRtl ? `عجز: ${req.shortage} ${req.unit}` : `Short: ${req.shortage}`}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700 border-blue-200">
                        {isRtl ? "جاهز للحجز" : "Available"}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions Bar */}
            {canMutate && (
              <div className="flex items-center justify-between pt-2 border-t border-border/60">
                <div className="text-[11px] text-muted-foreground">
                  {summary.reservedItems === summary.totalRequiredItems ? (
                    <span className="text-emerald-600 font-semibold flex items-center gap-1">
                      <PackageCheck className="h-3.5 w-3.5" />
                      <span>{isRtl ? "تم تأمين كافة خامات أمر التصنيع" : "All materials secured for production"}</span>
                    </span>
                  ) : (
                    <span>{isRtl ? `${summary.reservedItems} من ${summary.totalRequiredItems} محجوز` : `${summary.reservedItems} of ${summary.totalRequiredItems} reserved`}</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {summary.reservedItems > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRelease}
                      disabled={acting}
                      className="h-7 text-xs text-rose-600 hover:bg-rose-50 gap-1"
                    >
                      <Unlock className="h-3 w-3" />
                      <span>{isRtl ? "فك الحجز" : "Release"}</span>
                    </Button>
                  )}

                  {summary.reservedItems < summary.totalRequiredItems && (
                    <Button
                      size="sm"
                      onClick={handleReserve}
                      disabled={acting || summary.shortageItems > 0}
                      className="h-7 text-xs bg-primary text-primary-foreground font-semibold gap-1"
                    >
                      {acting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Lock className="h-3 w-3" />
                      )}
                      <span>{isRtl ? "حجز الخامات" : "Reserve Stock"}</span>
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
