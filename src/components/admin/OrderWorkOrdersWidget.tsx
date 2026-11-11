import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { listWorkOrders } from "@/lib/work-orders.functions";
import type { ProductionWorkOrder } from "@/lib/work-order-types";
import { CreateWorkOrderModal } from "@/components/work-orders/CreateWorkOrderModal";
import { WorkOrderDetailDrawer } from "@/components/work-orders/WorkOrderDetailDrawer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Hammer,
  Plus,
  ExternalLink,
  Loader2,
  Calendar,
  CheckCircle2,
  Clock,
} from "lucide-react";

interface OrderWorkOrdersWidgetProps {
  orderId: string;
  orderNumber?: string;
  userRole?: string;
}

export function OrderWorkOrdersWidget({
  orderId,
  orderNumber,
  userRole,
}: OrderWorkOrdersWidgetProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const listWorkOrdersFn = useServerFn(listWorkOrders);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedWoId, setSelectedWoId] = useState<string | null>(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);

  const { data: result, isLoading, refetch } = useQuery({
    queryKey: ["order-work-orders", orderId],
    queryFn: async () => {
      const res = await listWorkOrdersFn({
        data: {
          orderId,
          page: 1,
          pageSize: 20,
        },
      });
      return res?.rows || [];
    },
  });

  const workOrders = result || [];
  const canMutate = userRole !== "viewer";

  const handleOpenDetail = (woId: string) => {
    setSelectedWoId(woId);
    setIsDetailDrawerOpen(true);
  };

  const getStatusBadge = (status: string) => {
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

  return (
    <Card className="border rounded-2xl shadow-xs overflow-hidden">
      <CardHeader className="p-4 bg-muted/30 border-b flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Hammer className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-bold font-serif">
            {isRtl ? "أوامر الشغل والتصنيع (Work Orders)" : "Production Work Orders"}
          </CardTitle>
          <Badge variant="outline" className="text-[10px] font-mono px-2 py-0.5">
            {workOrders.length}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/admin/work-orders">
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-primary">
              <span>{isRtl ? "الورشة" : "Workshop"}</span>
              <ExternalLink className="h-3 w-3" />
            </Button>
          </Link>

          {canMutate && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsCreateModalOpen(true)}
              className="h-7 text-xs gap-1 font-semibold"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{isRtl ? "أمر شغل" : "New WO"}</span>
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-2 text-xs">
        {isLoading ? (
          <div className="flex items-center justify-center py-4 text-muted-foreground gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span>{isRtl ? "جاري تحميل أوامر الشغل..." : "Loading work orders..."}</span>
          </div>
        ) : workOrders.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            {isRtl ? "لم يتم إنشاء أمر شغل بعد لهذا الطلب" : "No work orders created for this order yet"}
          </div>
        ) : (
          workOrders.map((wo) => (
            <div
              key={wo.id}
              onClick={() => handleOpenDetail(wo.id)}
              className="p-3 bg-muted/20 hover:bg-muted/40 border rounded-xl flex items-center justify-between cursor-pointer transition-colors text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-medium">
                  <span className="font-mono text-primary font-bold">{wo.workOrderNumber}</span>
                  <Badge variant="outline" className={`text-[10px] capitalize ${getStatusBadge(wo.status)}`}>
                    {wo.status.replace("_", " ")}
                  </Badge>
                  {wo.remakeNumber && (
                    <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-300">
                      {wo.remakeNumber}
                    </Badge>
                  )}
                </div>

                <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                  <span>{isRtl ? "الأولوية:" : "Priority:"} <strong>{wo.priority}</strong></span>
                  {wo.scheduledDate && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-mono">
                        <Calendar className="h-3 w-3" />
                        <span>{wo.scheduledDate}</span>
                      </span>
                    </>
                  )}
                </div>
              </div>

              <Button size="sm" variant="ghost" className="h-7 text-xs text-primary">
                {isRtl ? "عرض الكشف" : "View"}
              </Button>
            </div>
          ))
        )}
      </CardContent>

      <CreateWorkOrderModal
        orderId={orderId}
        orderNumber={orderNumber}
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onCreated={() => refetch()}
      />

      <WorkOrderDetailDrawer
        workOrderId={selectedWoId}
        open={isDetailDrawerOpen}
        onOpenChange={setIsDetailDrawerOpen}
        userRole={userRole}
        onStatusChanged={() => refetch()}
      />
    </Card>
  );
}
