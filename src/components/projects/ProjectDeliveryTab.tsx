import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Truck,
  ExternalLink,
  MapPin,
  Calendar,
  CheckCircle2,
  Clock,
  User,
  Wrench,
} from "lucide-react";
import type { ProjectWorkspaceData } from "@/lib/project-types";
import type { DeliveryHandover } from "@/lib/delivery-types";

interface ProjectDeliveryTabProps {
  delivery: ProjectWorkspaceData["delivery"];
}

export function ProjectDeliveryTab({ delivery }: ProjectDeliveryTabProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");

  const getStatusBadge = (status: DeliveryHandover["status"]) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">{isAr ? "تم التسليم بنجاح" : "Completed"}</Badge>;
      case "delivered":
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">{isAr ? "وصل للموقع" : "Delivered"}</Badge>;
      case "installed":
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">{isAr ? "تم التركيب" : "Installed"}</Badge>;
      case "installation_pending":
        return <Badge className="bg-purple-600 hover:bg-purple-700 text-white">{isAr ? "قيد التركيب" : "Installation Pending"}</Badge>;
      case "out_for_delivery":
        return <Badge className="bg-blue-600 hover:bg-blue-700 text-white">{isAr ? "في الطريق" : "Out for Delivery"}</Badge>;
      case "dispatched":
        return <Badge className="bg-blue-600 hover:bg-blue-700 text-white">{isAr ? "خرج من المصنع" : "Dispatched"}</Badge>;
      case "ready_for_dispatch":
        return <Badge className="bg-amber-600 hover:bg-amber-700 text-white">{isAr ? "جاهز للشحن" : "Ready for Dispatch"}</Badge>;
      case "delivery_failed":
      case "cancelled":
        return <Badge variant="destructive">{isAr ? "فشل / ملغي" : "Failed"}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-xs">
        <CardHeader className="p-4 pb-3 border-b flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            <CardTitle className="text-base font-bold">
              {isAr ? "شحنات التوريد والتركيبات الموقعية" : "Delivery Handovers & Site Installations"}
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {delivery.handovers.length}
            </Badge>
          </div>
          <Link to="/admin/deliveries">
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs">
              <span>{isAr ? "إدارة التوصيل والتسليم" : "Deliveries Workspace"}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {delivery.handovers.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground space-y-2">
              <Truck className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-medium">
                {isAr ? "لا توجد شحنات توريد مسجلة لهذا المشروع بعد" : "No delivery handovers recorded for this project yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="px-4 py-3">{isAr ? "رقم الشحنة" : "Delivery #"}</th>
                    <th className="px-4 py-3">{isAr ? "أمر التنفيذ" : "Order #"}</th>
                    <th className="px-4 py-3">{isAr ? "الحالة" : "Status"}</th>
                    <th className="px-4 py-3">{isAr ? "عنوان الموقع والمستلم" : "Site & Recipient"}</th>
                    <th className="px-4 py-3">{isAr ? "تاريخ الجدولة" : "Scheduled Date"}</th>
                    <th className="px-4 py-3">{isAr ? "التركيب" : "Installation"}</th>
                    <th className="px-4 py-3 text-right rtl:text-left">{isAr ? "تاريخ الإنشاء" : "Created"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {delivery.handovers.map((d) => (
                    <tr key={d.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-foreground">
                        {d.deliveryNumber}
                      </td>
                      <td className="px-4 py-3 font-medium text-muted-foreground">
                        {d.orderNumber}
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(d.status)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 font-medium text-foreground">
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate max-w-[200px]">{d.deliveryAddress}</span>
                        </div>
                        {d.recipientName && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {d.recipientName} {d.recipientPhone && `(${d.recipientPhone})`}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground" dir="ltr">
                        {d.scheduledDate || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {d.installationRequired ? (
                          <Badge variant="outline" className="text-xs gap-1 border-primary text-primary">
                            <Wrench className="w-3 h-3" />
                            <span>{isAr ? "مطلوب تركيب" : "Required"}</span>
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">{isAr ? "توريد فقط" : "Delivery only"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground text-right rtl:text-left" dir="ltr">
                        {typeof d.createdAt === "string" ? d.createdAt.slice(0, 10) : new Date(d.createdAt).toISOString().slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
