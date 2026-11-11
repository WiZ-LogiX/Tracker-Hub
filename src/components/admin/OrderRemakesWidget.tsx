import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listRemakes } from "@/lib/remakes.functions";
import type { RemakeListItem, PaginatedRemakesResult } from "@/lib/remake-types";
import { CreateRemakeModal } from "@/components/remakes/CreateRemakeModal";
import { RemakeDetailDrawer } from "@/components/remakes/RemakeDetailDrawer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldAlert,
  Plus,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2,
} from "lucide-react";

interface OrderRemakesWidgetProps {
  orderId: string;
  customerId?: string | null;
  userRole?: string;
}

export function OrderRemakesWidget({
  orderId,
  customerId,
  userRole,
}: OrderRemakesWidgetProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const listRemakesFn = useServerFn(listRemakes);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedRemakeId, setSelectedRemakeId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const { data: result, isLoading, refetch } = useQuery({
    queryKey: ["order-remakes", orderId],
    queryFn: async () => {
      const res = await listRemakesFn({ data: { orderId, pageSize: 50 } });
      return (res as unknown as PaginatedRemakesResult) || null;
    },
  });

  const cases = result?.rows || [];
  const activeCases = cases.filter((c) => c.status !== "resolved" && c.status !== "cancelled" && c.status !== "rejected");

  const handleOpenDetail = (remakeId: string) => {
    setSelectedRemakeId(remakeId);
    setIsDetailOpen(true);
  };

  const canReport = userRole !== "viewer";

  const getSeverityClass = (sev: string) => {
    switch (sev) {
      case "critical":
        return "bg-rose-50 text-rose-700 border-rose-300 font-bold dark:bg-rose-950/40 dark:text-rose-400";
      case "high":
        return "bg-amber-50 text-amber-700 border-amber-300 font-bold dark:bg-amber-950/40 dark:text-amber-400";
      case "medium":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Card className="border rounded-2xl shadow-xs overflow-hidden">
      <CardHeader className="p-4 bg-muted/30 border-b flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-bold font-serif">
            {isRtl ? "حالات الجودة وإعادة التصنيع" : "Quality & Remakes"}
          </CardTitle>
          {cases.length > 0 && (
            <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0">
              {cases.length}
            </Badge>
          )}
          {activeCases.length > 0 && (
            <Badge variant="destructive" className="font-mono text-[10px] px-1.5 py-0">
              {activeCases.length} {isRtl ? "نشط" : "active"}
            </Badge>
          )}
        </div>

        {canReport && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsCreateOpen(true)}
            className="h-7 text-xs gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{isRtl ? "تسجيل عيب" : "Report Defect"}</span>
          </Button>
        )}
      </CardHeader>

      <CardContent className="p-4 space-y-2.5">
        {isLoading ? (
          <div className="flex items-center justify-center py-4 text-xs text-muted-foreground gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span>{isRtl ? "جاري تحميل سجل الجودة..." : "Loading quality cases..."}</span>
          </div>
        ) : cases.length === 0 ? (
          <div className="text-center py-4 text-xs text-muted-foreground">
            {isRtl ? "لا توجد عيوب أو طلبات إعادة تصنيع مسجلة لهذا الطلب" : "No defects or remakes recorded for this order"}
          </div>
        ) : (
          cases.map((c) => (
            <div
              key={c.id}
              onClick={() => handleOpenDetail(c.id)}
              className="p-3 bg-muted/20 hover:bg-muted/40 border rounded-xl flex items-center justify-between cursor-pointer transition-colors text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-primary">{c.remakeNumber}</span>
                  <Badge variant="outline" className={`text-[9px] uppercase px-1 py-0 ${getSeverityClass(c.severity)}`}>
                    {c.severity}
                  </Badge>
                  <Badge variant="outline" className="text-[9px] capitalize px-1 py-0">
                    {c.status.replace("_", " ")}
                  </Badge>
                </div>
                <div className="font-medium text-foreground">{c.reason}</div>
              </div>

              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => { e.stopPropagation(); handleOpenDetail(c.id); }}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))
        )}
      </CardContent>

      <CreateRemakeModal
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        orderId={orderId}
        customerId={customerId}
        onCreated={() => refetch()}
      />

      <RemakeDetailDrawer
        remakeId={selectedRemakeId}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onUpdated={() => refetch()}
        userRole={userRole}
      />
    </Card>
  );
}
