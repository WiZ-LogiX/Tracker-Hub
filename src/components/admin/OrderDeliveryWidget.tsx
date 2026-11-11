import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { listDeliveries } from "@/lib/delivery.functions";
import type { DeliveryHandover, DeliveryStatus } from "@/lib/delivery-types";
import { PrepareDeliveryModal } from "@/components/deliveries/PrepareDeliveryModal";
import { DeliveryDetailDrawer } from "@/components/deliveries/DeliveryDetailDrawer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Truck,
  Plus,
  ExternalLink,
  Loader2,
  Calendar,
  CheckCircle2,
  MapPin,
  Wrench,
  PenTool,
} from "lucide-react";

interface OrderDeliveryWidgetProps {
  orderId: string;
  orderNumber?: string;
  customerName?: string;
  customerPhone?: string;
  userRole?: string;
}

export function OrderDeliveryWidget({
  orderId,
  orderNumber,
  customerName,
  customerPhone,
  userRole,
}: OrderDeliveryWidgetProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const listDeliveriesFn = useServerFn(listDeliveries);

  const [isPrepareModalOpen, setIsPrepareModalOpen] = useState(false);
  const [selectedDelId, setSelectedDelId] = useState<string | null>(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);

  const { data: result, isLoading, refetch } = useQuery({
    queryKey: ["order-deliveries", orderId],
    queryFn: async () => {
      const res = await listDeliveriesFn({
        data: {
          orderId,
          page: 1,
          pageSize: 10,
        },
      });
      return res?.rows || [];
    },
  });

  const deliveries = result || [];
  const canMutate = userRole !== "viewer";

  const handleOpenDetail = (delId: string) => {
    setSelectedDelId(delId);
    setIsDetailDrawerOpen(true);
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
        return "bg-rose-50 text-rose-700 border-rose-300";
      case "cancelled":
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Card className="border rounded-2xl shadow-xs overflow-hidden">
      <CardHeader className="p-4 bg-muted/30 border-b flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-bold font-serif">
            {isRtl ? "الشحن، التوصيل، والتسليم (Delivery & Handover)" : "Delivery & Handover"}
          </CardTitle>
          <Badge variant="outline" className="text-[10px] font-mono px-2 py-0.5">
            {deliveries.length}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/admin/deliveries">
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-primary">
              <span>{isRtl ? "الشحنات" : "Deliveries"}</span>
              <ExternalLink className="h-3 w-3" />
            </Button>
          </Link>

          {canMutate && deliveries.length === 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsPrepareModalOpen(true)}
              className="h-7 text-xs gap-1 font-semibold text-primary"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{isRtl ? "تجهيز التوصيل" : "Prepare"}</span>
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-2 text-xs">
        {isLoading ? (
          <div className="flex items-center justify-center py-4 text-muted-foreground gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span>{isRtl ? "جاري تحميل تفاصيل التسليم..." : "Loading deliveries..."}</span>
          </div>
        ) : deliveries.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            {isRtl ? "لم يتم تجهيز إذن توصيل بعد لهذا الطلب" : "No delivery prepared yet"}
          </div>
        ) : (
          deliveries.map((del) => (
            <div
              key={del.id}
              onClick={() => handleOpenDetail(del.id)}
              className="p-3 bg-muted/20 hover:bg-muted/40 border rounded-xl flex items-center justify-between cursor-pointer transition-colors text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-medium">
                  <span className="font-mono text-primary font-bold">{del.deliveryNumber}</span>
                  <Badge variant="outline" className={`text-[10px] capitalize ${getStatusBadge(del.status)}`}>
                    {del.status.replace(/_/g, " ")}
                  </Badge>
                  {del.installationRequired && (
                    <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                      {isRtl ? "تركيب" : "Installation"}
                    </Badge>
                  )}
                  {del.signatureDataUrl && (
                    <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300 gap-1">
                      <PenTool className="h-2.5 w-2.5" />
                      <span>{isRtl ? "موقع" : "Signed"}</span>
                    </Badge>
                  )}
                </div>

                <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                  <MapPin className="h-3 w-3 shrink-0 text-primary" />
                  <span className="truncate max-w-xs">{del.deliveryAddress}</span>
                  {del.scheduledDate && (
                    <>
                      <span>•</span>
                      <span className="font-mono">{del.scheduledDate}</span>
                    </>
                  )}
                </div>
              </div>

              <Button size="sm" variant="ghost" className="h-7 text-xs text-primary">
                {isRtl ? "متابعة التسليم" : "View"}
              </Button>
            </div>
          ))
        )}
      </CardContent>

      <PrepareDeliveryModal
        orderId={orderId}
        orderNumber={orderNumber}
        customerName={customerName}
        customerPhone={customerPhone}
        open={isPrepareModalOpen}
        onOpenChange={setIsPrepareModalOpen}
        onCreated={() => refetch()}
      />

      <DeliveryDetailDrawer
        deliveryId={selectedDelId}
        open={isDetailDrawerOpen}
        onOpenChange={setIsDetailDrawerOpen}
        userRole={userRole}
        onStatusChanged={() => refetch()}
      />
    </Card>
  );
}
