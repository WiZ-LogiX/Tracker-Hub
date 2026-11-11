import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Boxes, ExternalLink, CheckCircle2, AlertTriangle, AlertCircle, Clock } from "lucide-react";
import type { ProjectWorkspaceData, ProjectInventoryAllocation } from "@/lib/project-types";

interface ProjectInventoryTabProps {
  inventory: ProjectWorkspaceData["inventory"];
}

export function ProjectInventoryTab({ inventory }: ProjectInventoryTabProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");

  const getReadinessBanner = () => {
    switch (inventory.readiness) {
      case "READY":
        return {
          bg: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300",
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
          title: isAr ? "جميع الخامات والمواد محجوزة وجاهزة للإنتاج" : "All Materials Allocated & Ready for Production",
          desc: isAr ? "لا توجد نواقص في المخزون تعيق أوامر التشغيل." : "No stock shortages blocking shop-floor work orders.",
        };
      case "PARTIAL":
        return {
          bg: "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300",
          icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
          title: isAr ? "جاهزية جزئية للخامات — توجد عناصر قيد التوريد" : "Partial Material Readiness — Pending Supply",
          desc: isAr ? "تم حجز جزء من الخامات وجاري استكمال باقي بنود أمر التشغيل." : "Partially allocated; waiting for remaining items.",
        };
      case "BLOCKED":
        return {
          bg: "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300",
          icon: <AlertCircle className="w-5 h-5 text-rose-600" />,
          title: isAr ? "عجز في المخزون يعطل خط الإنتاج" : "Stock Shortage Blocking Production",
          desc: isAr ? "الكميات المطلوبة غير متوفرة في المستودع ويجب طلب توريد عاجل." : "Required quantities unavailable. Requisition needed.",
        };
      case "NOT_RESERVED":
      default:
        return {
          bg: "bg-muted/40 border-border text-foreground",
          icon: <Clock className="w-5 h-5 text-muted-foreground" />,
          title: isAr ? "لم يتم تخصيص أو حجز خامات لهذا المشروع بعد" : "No Materials Allocated Yet",
          desc: isAr ? "يتم حجز الخامات تلقائياً عند إصدار أوامر التشغيل واعتماد التصميم." : "Materials will be reserved upon work order generation.",
        };
    }
  };

  const banner = getReadinessBanner();

  return (
    <div className="space-y-6">
      {/* Material Readiness Banner */}
      <div className={`p-4 rounded-xl border flex items-start gap-3.5 shadow-xs ${banner.bg}`}>
        <div className="mt-0.5 shrink-0">{banner.icon}</div>
        <div className="space-y-1 flex-1">
          <p className="text-sm font-bold">{banner.title}</p>
          <p className="text-xs opacity-90">{banner.desc}</p>
        </div>
        <Link to="/admin/inventory">
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs shrink-0">
            <span>{isAr ? "مستودع الخامات" : "Inventory"}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </div>

      {/* Stock Allocations Table */}
      <Card className="shadow-xs">
        <CardHeader className="p-4 pb-3 border-b flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Boxes className="w-5 h-5 text-primary" />
            <CardTitle className="text-base font-bold">
              {isAr ? "الخامات والمواد المحجوزة للمشروع" : "Allocated Stock Items & Quantities"}
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {inventory.allocations.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {inventory.allocations.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground space-y-2">
              <Boxes className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-medium">
                {isAr ? "لا توجد حجوزات مخزنية مسجلة حالياً" : "No stock reservations recorded currently."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="px-4 py-3">{isAr ? "كود الصنف" : "SKU"}</th>
                    <th className="px-4 py-3">{isAr ? "اسم الخامة / المنتج" : "Item Name"}</th>
                    <th className="px-4 py-3">{isAr ? "الكمية المحجوزة" : "Reserved Qty"}</th>
                    <th className="px-4 py-3">{isAr ? "الوحدة" : "Unit"}</th>
                    <th className="px-4 py-3">{isAr ? "حالة التخصيص" : "Status"}</th>
                    <th className="px-4 py-3 text-right rtl:text-left">{isAr ? "تاريخ الحجز" : "Reserved At"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {inventory.allocations.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-foreground">
                        {a.sku}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {a.name}
                      </td>
                      <td className="px-4 py-3 font-bold text-foreground">
                        {a.reservedQuantity.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {a.unit}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`capitalize text-xs font-semibold ${
                            a.status === "consumed"
                              ? "bg-muted text-muted-foreground"
                              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200"
                          }`}
                        >
                          {a.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground text-right rtl:text-left" dir="ltr">
                        {a.createdAt.slice(0, 10)}
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
