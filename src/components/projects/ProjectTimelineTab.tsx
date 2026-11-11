import React from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  History,
  FileText,
  Package,
  Wrench,
  ShieldAlert,
  Truck,
  DollarSign,
  CheckSquare,
  Briefcase,
  Clock,
} from "lucide-react";
import type { CustomerActivityItem } from "@/lib/customer-types";

interface ProjectTimelineTabProps {
  timeline: CustomerActivityItem[];
}

export function ProjectTimelineTab({ timeline }: ProjectTimelineTabProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");

  const getEntityIcon = (entityType: CustomerActivityItem["entityType"]) => {
    switch (entityType) {
      case "opportunity":
      case "lead":
        return <Briefcase className="w-4 h-4 text-blue-600" />;
      case "quote":
        return <FileText className="w-4 h-4 text-purple-600" />;
      case "order":
        return <Package className="w-4 h-4 text-amber-600" />;
      case "payment":
      case "invoice":
        return <DollarSign className="w-4 h-4 text-emerald-600" />;
      case "delivery":
      case "handover":
        return <Truck className="w-4 h-4 text-indigo-600" />;
      case "remake":
      case "qc":
      case "warranty":
        return <ShieldAlert className="w-4 h-4 text-rose-600" />;
      case "task":
      default:
        return <CheckSquare className="w-4 h-4 text-teal-600" />;
    }
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-xs">
        <CardHeader className="p-4 pb-3 border-b flex flex-row items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          <CardTitle className="text-base font-bold">
            {isAr ? "الجدول الزمني الموحد لأنشطة المشروع" : "Unified Project Activity Timeline"}
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {timeline.length} {isAr ? "حدث" : "Events"}
          </Badge>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {timeline.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground space-y-2">
              <History className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-medium">
                {isAr ? "لا توجد أنشطة مسجلة في هذا المشروع بعد" : "No timeline events recorded yet."}
              </p>
            </div>
          ) : (
            <div className="relative pl-6 rtl:pl-0 rtl:pr-6 space-y-6 before:absolute before:inset-y-0 before:left-2.5 rtl:before:left-auto rtl:before:right-2.5 before:w-0.5 before:bg-border">
              {timeline.map((item) => (
                <div key={item.id} className="relative group">
                  {/* Icon Node */}
                  <div className="absolute -left-6 rtl:-left-auto rtl:-right-6 top-0.5 w-5 h-5 rounded-full bg-background border flex items-center justify-center shadow-xs">
                    {getEntityIcon(item.entityType)}
                  </div>

                  {/* Event Content */}
                  <div className="rounded-lg border bg-card/60 p-3.5 space-y-1 group-hover:bg-muted/30 transition-colors">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-foreground">
                        {item.title}
                      </p>
                      <span className="text-xs text-muted-foreground" dir="ltr">
                        {typeof item.timestamp === "string"
                          ? item.timestamp.replace("T", " ").slice(0, 16)
                          : new Date(item.timestamp).toISOString().replace("T", " ").slice(0, 16)}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>

                    {item.actorName && (
                      <div className="text-[11px] text-muted-foreground pt-1 flex items-center gap-1">
                        <span>{isAr ? "بواسطة:" : "By:"}</span>
                        <span className="font-medium text-foreground">{item.actorName}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
