import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import type { LeadItem, OpportunityItem, AttentionItem } from "@/lib/crm-types";
import { formatEGP } from "@/lib/pricing";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  Briefcase,
  Users,
  CheckSquare,
  FileText,
  AlertTriangle,
  PhoneCall,
  DollarSign,
  TrendingUp,
  ExternalLink,
} from "lucide-react";
import { LogActivityModal } from "@/components/crm/LogActivityModal";

interface MySalesData {
  repId: string;
  repName: string;
  leads: LeadItem[];
  opportunities: OpportunityItem[];
  quotes: Array<{
    id: string;
    quoteNumber: string;
    opportunityId: string | null;
    total: number;
    status: string;
    createdAt: string;
  }>;
  tasks: Array<{
    id: string;
    taskCode: string;
    title: string;
    status: string;
    priority: string;
    dueDate: string | null;
    opportunityId: string | null;
  }>;
  overdueActions: AttentionItem[];
}

interface MySalesViewProps {
  mySales: MySalesData;
  onRefresh?: () => void;
}

export function MySalesView({ mySales, onRefresh }: MySalesViewProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [activeTab, setActiveTab] = useState<string>("opportunities");
  const [selectedActivityItem, setSelectedActivityItem] = useState<{
    type: "opportunity" | "lead";
    id: string;
    code?: string;
    title?: string;
    nextAction?: string;
  } | null>(null);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);

  const openOpps = mySales.opportunities.filter((o) => o.status === "open");
  const totalPipelineVal = openOpps.reduce((sum, o) => sum + Number(o.value || 0), 0);
  const activeLeads = mySales.leads.filter((l) => !["converted", "lost"].includes(l.status));

  const handleOpenActivity = (
    type: "opportunity" | "lead",
    id: string,
    code?: string,
    title?: string,
    nextAction?: string,
  ) => {
    setSelectedActivityItem({ type, id, code, title, nextAction });
    setIsActivityModalOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Salesperson Personal KPI Header */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="border shadow-xs">
          <CardContent className="p-3.5">
            <span className="text-[11px] text-muted-foreground font-medium block">
              {isRtl ? "صفقاتي النشطة" : "My Open Deals"}
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xl font-bold font-mono text-foreground">
                {openOpps.length}
              </span>
              <Briefcase className="h-4 w-4 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-xs">
          <CardContent className="p-3.5">
            <span className="text-[11px] text-muted-foreground font-medium block">
              {isRtl ? "قيمة مساري التجاري" : "My Pipeline Value"}
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-sm sm:text-base font-bold font-mono text-foreground truncate">
                {formatEGP(totalPipelineVal)}
              </span>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-xs">
          <CardContent className="p-3.5">
            <span className="text-[11px] text-muted-foreground font-medium block">
              {isRtl ? "عملاء محتملون نشطون" : "My Active Leads"}
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xl font-bold font-mono text-foreground">
                {activeLeads.length}
              </span>
              <Users className="h-4 w-4 text-sky-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-xs">
          <CardContent className="p-3.5">
            <span className="text-[11px] text-muted-foreground font-medium block">
              {isRtl ? "مقايسات مرسلة" : "My Quotes"}
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xl font-bold font-mono text-foreground">
                {mySales.quotes.length}
              </span>
              <FileText className="h-4 w-4 text-indigo-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-xs">
          <CardContent className="p-3.5">
            <span className="text-[11px] text-muted-foreground font-medium block">
              {isRtl ? "متابعات متأخرة" : "My Overdue Actions"}
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xl font-bold font-mono text-destructive">
                {mySales.overdueActions.length}
              </span>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
        <TabsList className="grid grid-cols-2 sm:grid-cols-5 w-full h-auto p-1 bg-muted/60">
          <TabsTrigger value="opportunities" className="text-xs py-1.5 gap-1.5">
            <Briefcase className="h-3.5 w-3.5" />
            <span>{isRtl ? "صفقاتي" : "My Deals"}</span>
            <Badge variant="secondary" className="text-[10px] px-1 py-0 font-mono ml-1">
              {mySales.opportunities.length}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="leads" className="text-xs py-1.5 gap-1.5">
            <Users className="h-3.5 w-3.5" />
            <span>{isRtl ? "عملائي المحتملون" : "My Leads"}</span>
            <Badge variant="secondary" className="text-[10px] px-1 py-0 font-mono ml-1">
              {mySales.leads.length}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="follow_ups" className="text-xs py-1.5 gap-1.5">
            <CheckSquare className="h-3.5 w-3.5" />
            <span>{isRtl ? "مهام المتابعة" : "Follow-Ups"}</span>
            <Badge variant="secondary" className="text-[10px] px-1 py-0 font-mono ml-1">
              {mySales.tasks.length}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="quotes" className="text-xs py-1.5 gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            <span>{isRtl ? "مقايساتي" : "My Quotes"}</span>
            <Badge variant="secondary" className="text-[10px] px-1 py-0 font-mono ml-1">
              {mySales.quotes.length}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="overdue" className="text-xs py-1.5 gap-1.5 text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{isRtl ? "متأخراتي" : "My Overdue"}</span>
            {mySales.overdueActions.length > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1 py-0 font-mono ml-1">
                {mySales.overdueActions.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* 1. My Opportunities Tab */}
        <TabsContent value="opportunities">
          <Card className="border shadow-sm">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 text-xs">
                    <TableHead className="font-semibold">{isRtl ? "رقم ومسمى الصفقة" : "Deal Code & Title"}</TableHead>
                    <TableHead className="font-semibold">{isRtl ? "العميل" : "Customer"}</TableHead>
                    <TableHead className="text-center font-semibold">{isRtl ? "المرحلة" : "Stage"}</TableHead>
                    <TableHead className="text-left rtl:text-right font-semibold">{isRtl ? "القيمة" : "Value"}</TableHead>
                    <TableHead className="font-semibold">{isRtl ? "الإجراء التالي وموعده" : "Next Action & Date"}</TableHead>
                    <TableHead className="text-center font-semibold">{isRtl ? "إجراء" : "Action"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mySales.opportunities.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-xs text-muted-foreground">
                        {isRtl ? "لا توجد صفقات مسندة إليك حالياً" : "No opportunities assigned to you"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    mySales.opportunities.map((opp) => (
                      <TableRow key={opp.id} className="text-xs hover:bg-muted/40">
                        <TableCell>
                          <div className="font-mono font-bold text-foreground">{opp.opportunityNumber}</div>
                          <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                            {opp.title}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-foreground">{opp.customerName || "—"}</div>
                          {opp.customerPhone && (
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {opp.customerPhone}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {opp.stage}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono font-bold text-foreground">
                          {formatEGP(opp.value)}
                        </TableCell>
                        <TableCell>
                          {opp.nextAction ? (
                            <div>
                              <div className="font-medium text-foreground truncate max-w-[220px]">
                                {opp.nextAction}
                              </div>
                              {opp.nextActionDate && (
                                <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                                  {new Date(opp.nextActionDate).toLocaleDateString(isRtl ? "ar-EG" : "en-US", {
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-destructive font-medium italic text-[11px]">
                              {isRtl ? "⚠️ بدون إجراء" : "⚠️ None set"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                handleOpenActivity("opportunity", opp.id, opp.opportunityNumber, opp.title, opp.nextAction || "")
                              }
                              className="h-7 text-xs px-2 gap-1 border-primary/30 text-primary hover:bg-primary/10"
                            >
                              <PhoneCall className="h-3 w-3" />
                              <span>{isRtl ? "متابعة" : "Log"}</span>
                            </Button>
                            <Link to="/admin/quotes/new" search={{ opportunityId: opp.id, customerId: opp.customerId }}>
                              <Button size="sm" variant="ghost" className="h-7 text-xs px-2 gap-1 text-muted-foreground hover:text-foreground">
                                <ExternalLink className="h-3 w-3" />
                                <span>{isRtl ? "عرض سعر" : "Quote"}</span>
                              </Button>
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. My Leads Tab */}
        <TabsContent value="leads">
          <Card className="border shadow-sm">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 text-xs">
                    <TableHead className="font-semibold">{isRtl ? "رقم واسم العميل المحتمل" : "Lead Code & Name"}</TableHead>
                    <TableHead className="font-semibold">{isRtl ? "الهاتف" : "Phone"}</TableHead>
                    <TableHead className="text-center font-semibold">{isRtl ? "المصدر" : "Source"}</TableHead>
                    <TableHead className="text-center font-semibold">{isRtl ? "الحالة" : "Status"}</TableHead>
                    <TableHead className="text-left rtl:text-right font-semibold">{isRtl ? "الميزانية المتوقعة" : "Budget"}</TableHead>
                    <TableHead className="font-semibold">{isRtl ? "الإجراء التالي" : "Next Action"}</TableHead>
                    <TableHead className="text-center font-semibold">{isRtl ? "إجراء" : "Action"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mySales.leads.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-xs text-muted-foreground">
                        {isRtl ? "لا يوجد عملاء محتملون مسندون إليك" : "No leads assigned to you"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    mySales.leads.map((lead) => (
                      <TableRow key={lead.id} className="text-xs hover:bg-muted/40">
                        <TableCell>
                          <div className="font-mono font-bold text-foreground">{lead.leadNumber}</div>
                          <div className="font-medium text-foreground">{lead.name}</div>
                        </TableCell>
                        <TableCell className="font-mono">{lead.phone || "—"}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {lead.source}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="text-[10px] capitalize">
                            {lead.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono">
                          {lead.estimatedBudget ? formatEGP(lead.estimatedBudget) : "—"}
                        </TableCell>
                        <TableCell>
                          {lead.nextAction ? (
                            <span className="text-foreground truncate max-w-[200px] block">
                              {lead.nextAction}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60 italic">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleOpenActivity("lead", lead.id, lead.leadNumber, lead.name, lead.nextAction || "")
                            }
                            className="h-7 text-xs px-2 gap-1 border-primary/30 text-primary hover:bg-primary/10"
                          >
                            <PhoneCall className="h-3 w-3" />
                            <span>{isRtl ? "متابعة" : "Log"}</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. My Follow-Up Tasks Tab */}
        <TabsContent value="follow_ups">
          <Card className="border shadow-sm">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 text-xs">
                    <TableHead className="font-semibold">{isRtl ? "رمز ومسمى المهمة" : "Task Code & Title"}</TableHead>
                    <TableHead className="text-center font-semibold">{isRtl ? "الأولوية" : "Priority"}</TableHead>
                    <TableHead className="text-center font-semibold">{isRtl ? "الحالة" : "Status"}</TableHead>
                    <TableHead className="font-semibold">{isRtl ? "تاريخ الاستحقاق" : "Due Date"}</TableHead>
                    <TableHead className="text-center font-semibold">{isRtl ? "إجراء" : "Action"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mySales.tasks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-xs text-muted-foreground">
                        {isRtl ? "لا توجد مهام متابعة مفتوحة" : "No open follow-up tasks"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    mySales.tasks.map((task) => {
                      const isOverdue =
                        task.dueDate && new Date(task.dueDate).getTime() < Date.now();

                      return (
                        <TableRow key={task.id} className="text-xs hover:bg-muted/40">
                          <TableCell>
                            <div className="font-mono font-bold text-foreground">{task.taskCode}</div>
                            <div className="text-[11px] text-muted-foreground">{task.title}</div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {task.priority}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary" className="text-[10px] capitalize">
                              {task.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {task.dueDate ? (
                              <span className={isOverdue ? "text-destructive font-bold font-mono" : "text-muted-foreground font-mono"}>
                                {new Date(task.dueDate).toLocaleDateString(isRtl ? "ar-EG" : "en-US", {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/60">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {task.opportunityId ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleOpenActivity("opportunity", task.opportunityId!, task.taskCode, task.title, "")
                                }
                                className="h-7 text-xs px-2 gap-1 text-primary"
                              >
                                <PhoneCall className="h-3 w-3" />
                                <span>{isRtl ? "تسجيل وإغلاق" : "Complete"}</span>
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. My Quotes Tab */}
        <TabsContent value="quotes">
          <Card className="border shadow-sm">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 text-xs">
                    <TableHead className="font-semibold">{isRtl ? "رقم المقايسة" : "Quote Number"}</TableHead>
                    <TableHead className="text-center font-semibold">{isRtl ? "الحالة" : "Status"}</TableHead>
                    <TableHead className="text-left rtl:text-right font-semibold">{isRtl ? "الإجمالي" : "Total"}</TableHead>
                    <TableHead className="font-semibold">{isRtl ? "تاريخ الإنشاء" : "Created At"}</TableHead>
                    <TableHead className="text-center font-semibold">{isRtl ? "عرض" : "View"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mySales.quotes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-xs text-muted-foreground">
                        {isRtl ? "لا توجد مقايسات منسوبة لصفقاتك" : "No quotes generated for your deals"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    mySales.quotes.map((quote) => (
                      <TableRow key={quote.id} className="text-xs hover:bg-muted/40">
                        <TableCell className="font-mono font-bold text-foreground">
                          {quote.quoteNumber}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {quote.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono font-bold text-foreground">
                          {formatEGP(quote.total)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(quote.createdAt).toLocaleDateString(isRtl ? "ar-EG" : "en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </TableCell>
                        <TableCell className="text-center">
                          <Link to="/admin/quotes/$id" params={{ id: quote.id }}>
                            <Button size="sm" variant="ghost" className="h-7 text-xs px-2">
                              <span>{isRtl ? "عرض" : "View"}</span>
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 5. My Overdue Tab */}
        <TabsContent value="overdue">
          <Card className="border shadow-sm">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 text-xs">
                    <TableHead className="font-semibold">{isRtl ? "الصفقة" : "Deal"}</TableHead>
                    <TableHead className="font-semibold">{isRtl ? "العميل" : "Customer"}</TableHead>
                    <TableHead className="font-semibold text-destructive">{isRtl ? "سبب التنبيه" : "Reason"}</TableHead>
                    <TableHead className="font-semibold">{isRtl ? "الإجراء المطلوب" : "Next Action"}</TableHead>
                    <TableHead className="font-semibold">{isRtl ? "الموعد المنقضي" : "Overdue Date"}</TableHead>
                    <TableHead className="text-center font-semibold">{isRtl ? "معالجة فورية" : "Action"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mySales.overdueActions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-xs text-muted-foreground">
                        {isRtl ? "رائع! لا توجد أي متابعات متأخرة لديك." : "Great! You have zero overdue follow-ups."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    mySales.overdueActions.map((item) => (
                      <TableRow key={item.id} className="text-xs hover:bg-muted/40">
                        <TableCell>
                          <div className="font-mono font-bold text-foreground">{item.code}</div>
                          <div className="text-[11px] text-muted-foreground truncate max-w-[180px]">{item.title}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-foreground">{item.customerName || "—"}</div>
                          {item.customerPhone && (
                            <div className="font-mono text-[11px] text-muted-foreground">{item.customerPhone}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="destructive" className="text-[10px]">
                            {item.reasonLabelAr || item.reasonLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {item.nextAction || (
                            <span className="text-destructive italic text-[11px]">
                              {isRtl ? "⚠️ بدون إجراء" : "⚠️ None set"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-destructive font-bold">
                          {item.nextActionDate ? (
                            new Date(item.nextActionDate).toLocaleDateString(isRtl ? "ar-EG" : "en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          ) : (
                            <span>—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleOpenActivity("opportunity", item.id, item.code, item.title, item.nextAction || "")
                            }
                            className="h-7 text-xs px-2 gap-1 border-primary/30 text-primary hover:bg-primary/10"
                          >
                            <PhoneCall className="h-3 w-3" />
                            <span>{isRtl ? "متابعة الآن" : "Resolve"}</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Activity Logging Modal */}
      {selectedActivityItem && (
        <LogActivityModal
          open={isActivityModalOpen}
          onOpenChange={setIsActivityModalOpen}
          entityType={selectedActivityItem.type}
          entityId={selectedActivityItem.id}
          entityCode={selectedActivityItem.code}
          entityTitle={selectedActivityItem.title}
          defaultNextAction={selectedActivityItem.nextAction}
          onSuccess={onRefresh}
        />
      )}
    </div>
  );
}
