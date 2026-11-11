import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Plus,
  ExternalLink,
  Calendar,
  User,
  Tag,
  DollarSign,
  CheckCircle2,
  Clock,
  Briefcase,
  AlertCircle,
} from "lucide-react";
import type { ProjectWorkspaceData, ProjectCommercialQuote } from "@/lib/project-types";

interface ProjectCommercialTabProps {
  commercial: ProjectWorkspaceData["commercial"];
  customerId: string;
  projectId: string;
}

export function ProjectCommercialTab({
  commercial,
  customerId,
  projectId,
}: ProjectCommercialTabProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");

  const getQuoteStatusBadge = (status: ProjectCommercialQuote["status"]) => {
    switch (status) {
      case "accepted":
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">{isAr ? "معتمد" : "Accepted"}</Badge>;
      case "sent":
        return <Badge className="bg-blue-600 hover:bg-blue-700 text-white">{isAr ? "تم الإرسال" : "Sent"}</Badge>;
      case "rejected":
        return <Badge variant="destructive">{isAr ? "مرفوض" : "Rejected"}</Badge>;
      case "expired":
        return <Badge variant="secondary">{isAr ? "منتهي" : "Expired"}</Badge>;
      case "draft":
      default:
        return <Badge variant="outline">{isAr ? "مسودة" : "Draft"}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Commercial Deal Context */}
      <Card className="shadow-xs">
        <CardHeader className="p-4 pb-3 border-b flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-primary" />
            <CardTitle className="text-base font-bold">
              {isAr ? "بيانات الصفقة التجارية والفرصة البيعية" : "Opportunity & Commercial Pipeline Details"}
            </CardTitle>
          </div>
          <Link
            to="/admin/quotes/new"
            search={{ opportunityId: projectId, customerId }}
          >
            <Button size="sm" className="gap-1.5 h-8">
              <Plus className="w-3.5 h-3.5" />
              <span>{isAr ? "إنشاء عرض سعر جديد" : "Create New Quote"}</span>
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
          <div>
            <span className="text-xs text-muted-foreground">{isAr ? "رقم الفرصة" : "Opportunity #"}</span>
            <p className="font-mono font-semibold text-foreground">{commercial.opportunityNumber}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">{isAr ? "عنوان الفرصة" : "Title"}</span>
            <p className="font-medium text-foreground truncate">{commercial.title}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">{isAr ? "المرحلة التجارية" : "Stage"}</span>
            <div className="mt-0.5">
              <Badge variant="outline" className="capitalize text-xs font-semibold">
                {commercial.stage}
              </Badge>
            </div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">{isAr ? "الحالة" : "Status"}</span>
            <p className="font-semibold capitalize text-foreground">{commercial.status}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">{isAr ? "القيمة المتوقعة" : "Estimated Value"}</span>
            <p className="font-bold text-foreground">
              {commercial.value.toLocaleString()} <span className="text-xs text-muted-foreground">{isAr ? "ج.م." : "EGP"}</span>
            </p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">{isAr ? "الإجراء القادم" : "Next Action"}</span>
            <p className="text-xs font-medium text-foreground truncate">
              {commercial.nextAction || (isAr ? "لا يوجد إجراء محدد" : "None")}
            </p>
            {commercial.nextActionDate && (
              <p className="text-[10px] text-muted-foreground" dir="ltr">
                {commercial.nextActionDate}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quotations Table */}
      <Card className="shadow-xs">
        <CardHeader className="p-4 pb-3 border-b flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <CardTitle className="text-base font-bold">
              {isAr ? "عروض الأسعار المرتبطة بالمشروع" : "Linked Quotations"}
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {commercial.quotes.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {commercial.quotes.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground space-y-3">
              <FileText className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-medium">
                {isAr ? "لم يتم إصدار عروض أسعار لهذا المشروع بعد" : "No quotations issued for this project yet."}
              </p>
              <Link
                to="/admin/quotes/new"
                search={{ opportunityId: projectId, customerId }}
              >
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAr ? "إصدار أول عرض سعر" : "Generate First Quote"}</span>
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="px-4 py-3">{isAr ? "رقم العرض" : "Quote #"}</th>
                    <th className="px-4 py-3">{isAr ? "تاريخ الإصدار" : "Date"}</th>
                    <th className="px-4 py-3">{isAr ? "المبلغ الأساسي" : "Subtotal"}</th>
                    <th className="px-4 py-3">{isAr ? "الإجمالي" : "Total"}</th>
                    <th className="px-4 py-3">{isAr ? "الحالة" : "Status"}</th>
                    <th className="px-4 py-3 text-right rtl:text-left">{isAr ? "الإجراءات" : "Actions"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {commercial.quotes.map((q) => (
                    <tr key={q.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium">
                        <div className="flex items-center gap-2">
                          <Link
                            to="/admin/quotes/$id"
                            params={{ id: q.id }}
                            className="text-primary hover:underline font-bold flex items-center gap-1"
                          >
                            <span>{q.quoteNumber}</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                          {q.isMainQuote && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1 border-primary text-primary">
                              {isAr ? "رئيسي" : "Main"}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground" dir="ltr">
                        {q.createdAt.slice(0, 10)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-medium">
                        {q.subtotal.toLocaleString()} {isAr ? "ج.م." : "EGP"}
                      </td>
                      <td className="px-4 py-3 font-bold text-foreground">
                        {q.total.toLocaleString()} {isAr ? "ج.م." : "EGP"}
                      </td>
                      <td className="px-4 py-3">
                        {getQuoteStatusBadge(q.status)}
                      </td>
                      <td className="px-4 py-3 text-right rtl:text-left">
                        <Link to="/admin/quotes/$id" params={{ id: q.id }}>
                          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs">
                            <span>{isAr ? "فتح التفاصيل" : "View"}</span>
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        </Link>
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
