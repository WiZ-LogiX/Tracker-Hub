import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getCustomer360 } from "@/lib/customers.functions";
import { generatePdf } from "@/lib/pdf.functions";
import type { Customer360Data, CustomerProjectItem } from "@/lib/customer-types";
import type { InvoiceItem } from "@/lib/invoice-types";
import { formatEGP } from "@/lib/pricing";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { RecordPaymentModal } from "@/components/invoices/RecordPaymentModal";
import { TaskForm } from "@/components/tasks/TaskForm";
import { OpportunityFormModal } from "@/components/crm/OpportunityFormModal";
import { CreateRemakeModal } from "@/components/remakes/CreateRemakeModal";
import { CreateServiceCaseModal } from "@/components/after-sales/CreateServiceCaseModal";
import { ServiceCaseDetailDrawer } from "@/components/after-sales/ServiceCaseDetailDrawer";
import {
  UserCircle,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Receipt,
  Package,
  FileText,
  CheckSquare,
  Activity,
  Plus,
  ExternalLink,
  MessageCircle,
  Download,
  AlertCircle,
  Clock,
  Sparkles,
  DollarSign,
  Wallet,
  ShieldAlert,
  ShieldCheck,
  Headphones,
  TrendingUp,
  Truck,
  Wrench,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Layers,
  HelpCircle,
  Building2,
  CalendarDays,
  CreditCard,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { STAGE_LABEL_AR } from "@/lib/stages";

interface Customer360DrawerProps {
  customerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefreshList?: () => void;
  userRole?: string;
}

export function Customer360Drawer({
  customerId,
  open,
  onOpenChange,
  onRefreshList,
  userRole,
}: Customer360DrawerProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const nav = useNavigate();
  const getCustomer360Fn = useServerFn(getCustomer360);
  const pdfFn = useServerFn(generatePdf);

  const [data, setData] = useState<Customer360Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // Expanded project cards tracking
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  // Sub-modals
  const [paymentInvoice, setPaymentInvoice] = useState<InvoiceItem | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isOpportunityModalOpen, setIsOpportunityModalOpen] = useState(false);
  const [isRemakeModalOpen, setIsRemakeModalOpen] = useState(false);
  const [isServiceCaseModalOpen, setIsServiceCaseModalOpen] = useState(false);
  const [selectedServiceCaseId, setSelectedServiceCaseId] = useState<string | null>(null);
  const [isServiceCaseDrawerOpen, setIsServiceCaseDrawerOpen] = useState(false);

  const isWorker = userRole === "worker";
  const isViewer = userRole === "viewer";

  const loadData = async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const res = await getCustomer360Fn({ data: { customerId } });
      setData(res);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load customer 360 data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && customerId) {
      loadData();
    }
  }, [open, customerId]);

  if (!customerId) return null;

  const c = data?.customer;
  const financials = data?.financials;
  const projects = data?.projects || [];
  const opportunities = data?.opportunities || [];
  const quotes = data?.quotes || [];
  const orders = data?.orders || [];
  const workOrders = data?.workOrders || [];
  const deliveries = data?.deliveries || [];
  const tasks = data?.tasks || [];
  const remakes = data?.remakes || [];
  const activities = data?.activities || [];
  const afterSales = data?.afterSales;
  const hasCompletedProjects = data?.hasCompletedProjects;

  const toggleProjectExpand = (projId: string) => {
    setExpandedProjects((prev) => ({ ...prev, [projId]: !prev[projId] }));
  };

  const handleWhatsApp = () => {
    if (!c?.phone) return;
    const cleanPhone = c.phone.replace(/[^0-9]/g, "");
    const intlPhone = cleanPhone.startsWith("0") ? `2${cleanPhone}` : cleanPhone;
    window.open(`https://wa.me/${intlPhone}`, "_blank", "noopener,noreferrer");
  };

  const handleDownloadInvoicePdf = async (invoiceId: string) => {
    if (!invoiceId) {
      toast.error(isRtl ? "بيانات الفاتورة غير متوفرة" : "Invoice ID missing");
      return;
    }
    try {
      const { downloadUrl } = await pdfFn({
        data: { entityType: "invoice", entityId: invoiceId },
      });
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error(err?.message || "Failed to download invoice");
    }
  };

  const handleDownloadQuotePdf = async (quoteId: string) => {
    if (!quoteId) {
      toast.error(isRtl ? "بيانات عرض السعر غير متوفرة" : "Quote ID missing");
      return;
    }
    try {
      const { downloadUrl } = await pdfFn({
        data: { entityType: "quote", entityId: quoteId },
      });
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error(err?.message || "Failed to download quotation PDF");
    }
  };

  const openRecordPayment = (inv?: InvoiceItem) => {
    if (inv) {
      setPaymentInvoice(inv);
      setIsPaymentModalOpen(true);
      return;
    }
    const openInvs = financials?.openInvoices || [];
    if (openInvs.length > 0) {
      setPaymentInvoice(openInvs[0]);
      setIsPaymentModalOpen(true);
    } else {
      toast.info(
        isRtl
          ? "لا توجد فواتير مفتوحة تستحق السداد حالياً"
          : "No open invoices due for payment",
      );
    }
  };

  // 10 Diagnostic Questions Computations
  // 1. Who is the customer? -> c
  // 2. What projects do they have?
  const projectCount = projects.length;
  // 3. What are they buying?
  const projectTypes = Array.from(new Set(projects.map((p) => p.projectType))).filter(Boolean);
  // 4. What was quoted?
  const totalQuotedAmount = quotes.reduce((s, q) => s + q.total, 0);
  // 5. What was accepted?
  const acceptedQuotes = quotes.filter((q) => q.status === "accepted" || q.orderId);
  const totalAcceptedAmount = acceptedQuotes.reduce((s, q) => s + q.total, 0);
  // 6. What has been paid?
  const totalInvoiced = financials?.totalInvoiced || 0;
  const totalPaid = financials?.totalCollected || 0;
  const outstandingBalance = financials?.outstandingBalance || 0;
  const collectionRate = totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 0;
  // 7. What is in production?
  const activeOrders = orders.filter((o) => o.currentStage !== "completed" && o.currentStage !== "cancelled");
  const inProgressWorkOrders = workOrders.filter((w) => w.status !== "completed" && w.status !== "cancelled");
  // 8. What has been delivered?
  const completedDeliveries = deliveries.filter((d) => d.status === "completed" || d.status === "installed");
  // 9. What problems exist?
  const openRemakes = remakes.filter((r) => r.status !== "resolved" && r.status !== "rejected" && r.status !== "cancelled");
  const overdueTasks = tasks.filter((t) => t.isOverdue);
  const totalProblems = openRemakes.length + overdueTasks.length;
  // 10. What should happen next?
  const nextActionItem = projects.find((p) => p.nextAction) || opportunities.find((o) => o.nextAction);
  const earliestOpenTask = tasks
    .filter((t) => t.status !== "completed" && t.status !== "cancelled" && t.dueDate)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())[0];

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={isRtl ? "left" : "right"}
          className="sm:max-w-4xl lg:max-w-5xl w-full overflow-y-auto p-0 flex flex-col bg-background"
        >
          {/* Top Header Banner */}
          <div className="p-6 border-b bg-card space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold text-2xl font-serif shadow-sm">
                  {c?.name?.[0] || "C"}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold font-serif text-foreground">
                      {c?.name || (loading ? "..." : "—")}
                    </h2>
                    <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
                      {isRtl ? "عميل معتمد" : "Verified Client"}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                    {c?.phone && (
                      <span className="flex items-center gap-1 font-mono">
                        <Phone className="h-3.5 w-3.5 text-primary" />
                        <span dir="ltr">{c.phone}</span>
                      </span>
                    )}
                    {c?.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5 text-primary" />
                        <span>{c.email}</span>
                      </span>
                    )}
                    {c?.governorate && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-secondary" />
                        <span>{c.governorate}</span>
                      </span>
                    )}
                    {c?.createdAt && (
                      <span className="flex items-center gap-1 text-[11px]">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>
                          {isRtl ? "منذ:" : "Since:"}{" "}
                          {new Date(c.createdAt).toLocaleDateString(isRtl ? "ar-EG" : "en-US", {
                            year: "numeric",
                            month: "short",
                          })}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Actions Toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                {c?.phone && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleWhatsApp}
                    className="h-8 gap-1.5 border-emerald-500/40 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 text-xs font-semibold"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    <span>WhatsApp</span>
                  </Button>
                )}

                {!isViewer && (
                  <>
                    {hasCompletedProjects && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => setIsOpportunityModalOpen(true)}
                        className="h-8 gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>{isRtl ? "+ فرصة جديدة (عميل متكرر)" : "+ Repeat Deal"}</span>
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsOpportunityModalOpen(true)}
                      className="h-8 gap-1.5 text-xs font-medium"
                    >
                      <Plus className="h-3.5 w-3.5 text-primary" />
                      <span>{isRtl ? "+ مشروع / صفقة" : "+ Project"}</span>
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsServiceCaseModalOpen(true)}
                      className="h-8 gap-1.5 text-xs font-medium text-purple-600 border-purple-500/30"
                    >
                      <Headphones className="h-3.5 w-3.5" />
                      <span>{isRtl ? "+ بلاغ بعد البيع" : "+ Service Case"}</span>
                    </Button>

                    <Link to="/admin/quotes/new" search={{ customerId: customerId || undefined }}>
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs font-medium">
                        <Plus className="h-3.5 w-3.5 text-amber-500" />
                        <span>{isRtl ? "+ عرض سعر" : "+ Quote"}</span>
                      </Button>
                    </Link>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsTaskModalOpen(true)}
                      className="h-8 gap-1.5 text-xs font-medium"
                    >
                      <CheckSquare className="h-3.5 w-3.5 text-blue-500" />
                      <span>{isRtl ? "+ مهمة" : "+ Task"}</span>
                    </Button>

                    {!isWorker && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openRecordPayment()}
                        className="h-8 gap-1.5 text-xs font-medium text-emerald-600 border-emerald-500/30"
                      >
                        <CreditCard className="h-3.5 w-3.5" />
                        <span>{isRtl ? "+ سداد" : "+ Payment"}</span>
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsRemakeModalOpen(true)}
                      className="h-8 gap-1.5 text-xs font-medium text-rose-600 border-rose-500/30"
                    >
                      <ShieldAlert className="h-3.5 w-3.5" />
                      <span>{isRtl ? "+ جودة / ضمان" : "+ Defect"}</span>
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Top Operational & Financial KPI Strip */}
            {c && (
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 pt-1 text-xs">
                <div className="p-3 bg-muted/40 rounded-xl border">
                  <div className="text-[11px] text-muted-foreground">{isRtl ? "المشاريع والفرص" : "Projects"}</div>
                  <div className="font-bold text-base text-foreground mt-0.5 font-mono">{projects.length}</div>
                </div>

                <div className="p-3 bg-muted/40 rounded-xl border">
                  <div className="text-[11px] text-muted-foreground">{isRtl ? "عروض الأسعار" : "Quotes"}</div>
                  <div className="font-bold text-base text-foreground mt-0.5 font-mono">{quotes.length}</div>
                </div>

                <div className="p-3 bg-muted/40 rounded-xl border">
                  <div className="text-[11px] text-muted-foreground">{isRtl ? "أوامر التشغيل" : "Active Orders"}</div>
                  <div className="font-bold text-base text-foreground mt-0.5 font-mono">{activeOrders.length}</div>
                </div>

                <div className="p-3 bg-muted/40 rounded-xl border">
                  <div className="text-[11px] text-muted-foreground">{isRtl ? "إجمالي الفواتير" : "Invoiced"}</div>
                  <div className="font-bold text-sm text-foreground mt-0.5 font-mono">
                    {isWorker ? "—" : formatEGP(totalInvoiced)}
                  </div>
                </div>

                <div className="p-3 bg-emerald-500/10 border-emerald-500/20 rounded-xl border">
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-400">{isRtl ? "المسدد" : "Collected"}</div>
                  <div className="font-bold text-sm text-emerald-700 dark:text-emerald-400 mt-0.5 font-mono">
                    {isWorker ? "—" : formatEGP(totalPaid)}
                  </div>
                </div>

                <div className="p-3 bg-primary/10 border-primary/20 rounded-xl border col-span-2 sm:col-span-1">
                  <div className="text-[11px] text-primary">{isRtl ? "المتبقي" : "Balance Due"}</div>
                  <div className="font-bold text-sm text-primary mt-0.5 font-mono">
                    {isWorker ? "—" : formatEGP(outstandingBalance)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Navigation Tabs (11 Distinct Sections) */}
          <div className="p-6 flex-1 overflow-y-auto space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="overflow-x-auto pb-1">
                <TabsList className="w-full justify-start h-9 bg-muted/60 p-1 min-w-max">
                  <TabsTrigger value="overview" className="text-xs gap-1.5">
                    <Activity className="h-3.5 w-3.5" />
                    <span>{isRtl ? "نظرة عامة 360" : "Overview"}</span>
                  </TabsTrigger>
                  <TabsTrigger value="projects" className="text-xs gap-1.5">
                    <Layers className="h-3.5 w-3.5" />
                    <span>{isRtl ? "المشاريع" : "Projects"} ({projects.length})</span>
                  </TabsTrigger>
                  <TabsTrigger value="opportunities" className="text-xs gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" />
                    <span>{isRtl ? "الفرص البيعية" : "Opportunities"} ({opportunities.length})</span>
                  </TabsTrigger>
                  <TabsTrigger value="quotes" className="text-xs gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    <span>{isRtl ? "عروض الأسعار" : "Quotes"} ({quotes.length})</span>
                  </TabsTrigger>
                  <TabsTrigger value="orders" className="text-xs gap-1.5">
                    <Package className="h-3.5 w-3.5" />
                    <span>{isRtl ? "أوامر الإنتاج" : "Orders"} ({orders.length})</span>
                  </TabsTrigger>
                  <TabsTrigger value="financials" className="text-xs gap-1.5">
                    <Receipt className="h-3.5 w-3.5" />
                    <span>{isRtl ? "المالية والتحصيل" : "Financials"}</span>
                  </TabsTrigger>
                  <TabsTrigger value="tasks" className="text-xs gap-1.5">
                    <CheckSquare className="h-3.5 w-3.5" />
                    <span>{isRtl ? "المهام" : "Tasks"} ({tasks.length})</span>
                  </TabsTrigger>
                  <TabsTrigger value="production" className="text-xs gap-1.5">
                    <Wrench className="h-3.5 w-3.5" />
                    <span>{isRtl ? "تشغيل الورشة" : "Production"} ({workOrders.length})</span>
                  </TabsTrigger>
                  <TabsTrigger value="deliveries" className="text-xs gap-1.5">
                    <Truck className="h-3.5 w-3.5" />
                    <span>{isRtl ? "التسليم والتركيب" : "Deliveries"} ({deliveries.length})</span>
                  </TabsTrigger>
                  <TabsTrigger value="quality" className="text-xs gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>{isRtl ? "الجودة والضمان" : "Quality & Warranty"} ({remakes.length + (afterSales?.cases?.length || 0)})</span>
                  </TabsTrigger>
                  <TabsTrigger value="timeline" className="text-xs gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{isRtl ? "سجل الأحداث" : "Timeline"} ({activities.length})</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* 1. OVERVIEW TAB (10-Question Executive Diagnostic) */}
              <TabsContent value="overview" className="space-y-4 pt-3">
                {/* Repeat Business Opportunity Alert (When customer has completed historical projects) */}
                {hasCompletedProjects && (
                  <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <div>
                        <div className="font-bold text-emerald-900 dark:text-emerald-200">
                          {isRtl ? "عميل مؤهل لتكرار التعامل (Repeat Business)" : "Repeat Business Opportunity"}
                        </div>
                        <p className="text-emerald-800 dark:text-emerald-300 text-[11px]">
                          {isRtl
                            ? "العميل أنجز مشاريع سابقة بنجاح. يمكنك إنشاء فرصة بيعية جديدة دون المساس بالسجلات التاريخية."
                            : "Customer has completed historical projects. You can create a new opportunity without modifying historical records."}
                        </p>
                      </div>
                    </div>
                    {!isViewer && (
                      <Button
                        size="sm"
                        onClick={() => setIsOpportunityModalOpen(true)}
                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 font-semibold"
                      >
                        {isRtl ? "+ فتح صفقة جديدة" : "+ New Opportunity"}
                      </Button>
                    )}
                  </div>
                )}

                {/* After-Sales, Warranty & Handover Strip */}
                {afterSales && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div className="p-3 rounded-xl border bg-card space-y-1">
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <Headphones className="h-3.5 w-3.5 text-primary" />
                        <span>{isRtl ? "بلاغات بعد البيع" : "After-Sales Cases"}</span>
                      </div>
                      <div className="font-bold font-mono text-foreground text-sm">
                        {afterSales.openCasesCount} {isRtl ? "مفتوح" : "open"} / {afterSales.cases.length} {isRtl ? "إجمالي" : "total"}
                      </div>
                      <span className="text-[10px] text-muted-foreground block">
                        {afterSales.complaintsCount} {isRtl ? "شكاوى مسجلة" : "complaints"}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl border bg-card space-y-1">
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                        <span>{isRtl ? "حالة الضمان" : "Warranty Status"}</span>
                      </div>
                      <div className="font-semibold text-foreground text-xs truncate">
                        {afterSales.warranties.length > 0
                          ? isRtl
                            ? afterSales.warranties[0].warrantyStatusLabelAr
                            : afterSales.warranties[0].warrantyStatusLabel
                          : isRtl
                          ? "فترة الضمان غير محددة"
                          : "Warranty Period Unknown"}
                      </div>
                      <span className="text-[10px] text-muted-foreground block truncate">
                        {afterSales.warranties.length > 0 && afterSales.warranties[0].isReliable
                          ? `${isRtl ? "ينتهي:" : "Expires:"} ${afterSales.warranties[0].warrantyExpirationDate}`
                          : isRtl
                          ? "لم تسجل مدة تعاقدية"
                          : "No terms specified"}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl border bg-card space-y-1">
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <Truck className="h-3.5 w-3.5 text-blue-600" />
                        <span>{isRtl ? "أحدث تسليم" : "Recent Delivery"}</span>
                      </div>
                      <div className="font-bold font-mono text-foreground text-xs truncate">
                        {afterSales.recentDelivery ? afterSales.recentDelivery.deliveryNumber : "—"}
                      </div>
                      <span className="text-[10px] text-muted-foreground block">
                        {afterSales.recentDelivery?.deliveredAt
                          ? new Date(afterSales.recentDelivery.deliveredAt).toLocaleDateString()
                          : isRtl
                          ? "لا توجد تسليمات"
                          : "None"}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl border bg-card space-y-1">
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span>{isRtl ? "أحدث محضر استلام" : "Recent Handover"}</span>
                      </div>
                      <div className="font-bold font-mono text-foreground text-xs truncate">
                        {afterSales.recentHandover ? afterSales.recentHandover.deliveryNumber : "—"}
                      </div>
                      <span className="text-[10px] text-muted-foreground block">
                        {afterSales.recentHandover?.handedOverAt
                          ? new Date(afterSales.recentHandover.handedOverAt).toLocaleDateString()
                          : isRtl
                          ? "لم يوقع استلام نهائي"
                          : "No handover signoff"}
                      </span>
                    </div>
                  </div>
                )}

                {/* Immediate Next Action Alert Banner */}
                {(nextActionItem?.nextAction || earliestOpenTask) && (
                  <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-start gap-3 text-xs">
                    <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5 flex-1">
                      <div className="font-bold text-amber-800 dark:text-amber-300">
                        {isRtl ? "الخطوة القادمة المطلوبة للعميل:" : "Next Action Required:"}
                      </div>
                      <p className="text-amber-900 dark:text-amber-200">
                        {nextActionItem?.nextAction || earliestOpenTask?.title}
                        {nextActionItem?.nextActionDate && (
                          <span className="font-semibold mx-1">
                            ({isRtl ? "الموعد المستهدف:" : "Target:"} {new Date(nextActionItem.nextActionDate).toLocaleDateString()})
                          </span>
                        )}
                        {!nextActionItem?.nextAction && earliestOpenTask?.dueDate && (
                          <span className="font-semibold mx-1">
                            ({isRtl ? "تاريخ المهمة:" : "Due:"} {new Date(earliestOpenTask.dueDate).toLocaleDateString()})
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {/* Problems Warning Banner (If any) */}
                {totalProblems > 0 && (
                  <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 flex items-start gap-3 text-xs">
                    <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5 flex-1">
                      <div className="font-bold text-rose-800 dark:text-rose-300">
                        {isRtl ? "تنبيه مشاكل معلقة تتطلب التدخل:" : "Attention: Unresolved operational issues:"}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-rose-900 dark:text-rose-200 mt-1">
                        {openRemakes.length > 0 && (
                          <span>
                            • {openRemakes.length} {isRtl ? "حالات إعادة تصنيع / جودة مفتوحة" : "open remake cases"}
                          </span>
                        )}
                        {overdueTasks.length > 0 && (
                          <span>
                            • {overdueTasks.length} {isRtl ? "مهام تشغيلية متأخرة عن الموعد" : "overdue tasks"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 10-Question Diagnostic Cards Grid */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <HelpCircle className="h-3.5 w-3.5 text-primary" />
                    <span>{isRtl ? "التشخيص التنفيذي الشامل (10 أسئلة أساسية)" : "Executive 360 Diagnostic (10 Core Questions)"}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* Q1: Who is the customer? */}
                    <div className="p-3.5 rounded-xl border bg-card space-y-1.5">
                      <div className="text-muted-foreground font-semibold text-[11px] flex items-center gap-1.5">
                        <UserCircle className="h-3.5 w-3.5 text-primary" />
                        <span>1. {isRtl ? "من هو العميل؟" : "Who is the customer?"}</span>
                      </div>
                      <div className="font-bold text-foreground text-sm">{c?.name}</div>
                      <p className="text-muted-foreground text-[11px]">
                        {c?.governorate ? `${c.governorate} • ` : ""}
                        {c?.address || (isRtl ? "العنوان غير محدد" : "No address")}
                        {c?.phone ? ` • ${c.phone}` : ""}
                      </p>
                    </div>

                    {/* Q2: What projects do they have? */}
                    <div className="p-3.5 rounded-xl border bg-card space-y-1.5">
                      <div className="text-muted-foreground font-semibold text-[11px] flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-blue-500" />
                        <span>2. {isRtl ? "ما هي مشاريعه وصفقاته؟" : "What projects do they have?"}</span>
                      </div>
                      <div className="font-bold text-foreground">
                        {projectCount > 0
                          ? isRtl
                            ? `${projectCount} مشاريع / صفقات مسجلة`
                            : `${projectCount} projects / deals`
                          : isRtl
                          ? "لا توجد مشاريع مسجلة بعد"
                          : "No projects recorded"}
                      </div>
                      <p className="text-muted-foreground text-[11px] truncate">
                        {projects.map((p) => p.title).join(" • ") || "—"}
                      </p>
                    </div>

                    {/* Q3: What are they buying? */}
                    <div className="p-3.5 rounded-xl border bg-card space-y-1.5">
                      <div className="text-muted-foreground font-semibold text-[11px] flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5 text-purple-500" />
                        <span>3. {isRtl ? "ماذا يشتري؟" : "What are they buying?"}</span>
                      </div>
                      <div className="font-bold text-foreground">
                        {projectTypes.length > 0
                          ? projectTypes.join(" • ")
                          : isRtl
                          ? "لم يحدد نطاق بعد"
                          : "No scopes defined"}
                      </div>
                      <p className="text-muted-foreground text-[11px]">
                        {orders.length} {isRtl ? "أوامر إنتاج وتصنيع" : "production orders"} • {quotes.length} {isRtl ? "مقايسات معتمدة ومقدمة" : "quotes"}
                      </p>
                    </div>

                    {/* Q4: What was quoted? */}
                    <div className="p-3.5 rounded-xl border bg-card space-y-1.5">
                      <div className="text-muted-foreground font-semibold text-[11px] flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-amber-500" />
                        <span>4. {isRtl ? "ماذا تم تسعيره وعرضه؟" : "What was quoted?"}</span>
                      </div>
                      <div className="font-bold text-foreground font-mono">
                        {isWorker ? "—" : formatEGP(totalQuotedAmount)}
                      </div>
                      <p className="text-muted-foreground text-[11px]">
                        {quotes.length} {isRtl ? "عروض أسعار مسجلة" : "quotes generated"}
                      </p>
                    </div>

                    {/* Q5: What was accepted? */}
                    <div className="p-3.5 rounded-xl border bg-card space-y-1.5">
                      <div className="text-muted-foreground font-semibold text-[11px] flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span>5. {isRtl ? "ماذا تم قبوله واعتماده؟" : "What was accepted?"}</span>
                      </div>
                      <div className="font-bold text-foreground font-mono">
                        {isWorker ? "—" : formatEGP(totalAcceptedAmount)}
                      </div>
                      <p className="text-muted-foreground text-[11px]">
                        {acceptedQuotes.length} {isRtl ? "عروض مقبولة ومتحولة لأوامر" : "accepted quotes"}
                      </p>
                    </div>

                    {/* Q6: What has been paid? */}
                    <div className="p-3.5 rounded-xl border bg-card space-y-1.5">
                      <div className="text-muted-foreground font-semibold text-[11px] flex items-center gap-1.5">
                        <Wallet className="h-3.5 w-3.5 text-emerald-600" />
                        <span>6. {isRtl ? "ما الذي تم سداده والتحصيل؟" : "What has been paid?"}</span>
                      </div>
                      <div className="font-bold text-foreground font-mono">
                        {isWorker ? "—" : `${formatEGP(totalPaid)} (${collectionRate}%)`}
                      </div>
                      <p className="text-muted-foreground text-[11px]">
                        {isWorker
                          ? "محجوب للصلاحية"
                          : `${isRtl ? "المتبقي:" : "Balance due:"} ${formatEGP(outstandingBalance)}`}
                      </p>
                    </div>

                    {/* Q7: What is in production? */}
                    <div className="p-3.5 rounded-xl border bg-card space-y-1.5">
                      <div className="text-muted-foreground font-semibold text-[11px] flex items-center gap-1.5">
                        <Wrench className="h-3.5 w-3.5 text-orange-500" />
                        <span>7. {isRtl ? "ما هو جاري تصنيعه بالورشة؟" : "What is in production?"}</span>
                      </div>
                      <div className="font-bold text-foreground">
                        {activeOrders.length > 0
                          ? isRtl
                            ? `${activeOrders.length} أوامر قيد التصنيع`
                            : `${activeOrders.length} active manufacturing orders`
                          : isRtl
                          ? "لا توجد عمليات تصنيع جارية"
                          : "No active production"}
                      </div>
                      <p className="text-muted-foreground text-[11px]">
                        {inProgressWorkOrders.length} {isRtl ? "أوامر تشغيل ورش جارية" : "active work orders"}
                      </p>
                    </div>

                    {/* Q8: What has been delivered? */}
                    <div className="p-3.5 rounded-xl border bg-card space-y-1.5">
                      <div className="text-muted-foreground font-semibold text-[11px] flex items-center gap-1.5">
                        <Truck className="h-3.5 w-3.5 text-blue-600" />
                        <span>8. {isRtl ? "ما الذي تم تسليمه وتركيبه؟" : "What has been delivered?"}</span>
                      </div>
                      <div className="font-bold text-foreground">
                        {completedDeliveries.length > 0
                          ? isRtl
                            ? `تم تسليم ${completedDeliveries.length} شحنات بنجاح`
                            : `${completedDeliveries.length} completed handovers`
                          : isRtl
                          ? "لم تتم تسليمات نهائية بعد"
                          : "No completed handovers"}
                      </div>
                      <p className="text-muted-foreground text-[11px]">
                        {deliveries.length} {isRtl ? "إجمالي عمليات التوصيل والتركيب" : "total deliveries scheduled"}
                      </p>
                    </div>

                    {/* Q9: What problems exist? */}
                    <div className="p-3.5 rounded-xl border bg-card space-y-1.5">
                      <div className="text-muted-foreground font-semibold text-[11px] flex items-center gap-1.5">
                        <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
                        <span>9. {isRtl ? "ما هي المشاكل أو العيوب القائمة؟" : "What problems exist?"}</span>
                      </div>
                      <div
                        className={`font-bold ${
                          totalProblems > 0 ? "text-rose-600" : "text-emerald-600"
                        }`}
                      >
                        {totalProblems > 0
                          ? isRtl
                            ? `${totalProblems} ملاحظات وعيوب معلقة`
                            : `${totalProblems} open issues`
                          : isRtl
                          ? "لا توجد مشاكل معلقة (ممتاز)"
                          : "No open issues (healthy)"}
                      </div>
                      <p className="text-muted-foreground text-[11px]">
                        {remakes.length} {isRtl ? "بلاغات إعادة تصنيع" : "remake cases"} • {overdueTasks.length} {isRtl ? "مهام متأخرة" : "overdue tasks"}
                      </p>
                    </div>

                    {/* Q10: What should happen next? */}
                    <div className="p-3.5 rounded-xl border bg-card space-y-1.5">
                      <div className="text-muted-foreground font-semibold text-[11px] flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-indigo-500" />
                        <span>10. {isRtl ? "ما هو الإجراء القادم المطلوب؟" : "What should happen next?"}</span>
                      </div>
                      <div className="font-bold text-foreground truncate">
                        {nextActionItem?.nextAction || earliestOpenTask?.title || (isRtl ? "المتابعة الروتينية" : "Routine follow-up")}
                      </div>
                      <p className="text-muted-foreground text-[11px]">
                        {nextActionItem?.nextActionDate
                          ? `${isRtl ? "تاريخ:" : "Date:"} ${new Date(nextActionItem.nextActionDate).toLocaleDateString()}`
                          : earliestOpenTask?.dueDate
                          ? `${isRtl ? "استحقاق المهمة:" : "Due:"} ${new Date(earliestOpenTask.dueDate).toLocaleDateString()}`
                          : isRtl
                          ? "جاهز لخطوات التشغيل القادمة"
                          : "Ready for next operational step"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Active Projects Quick Summary */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {isRtl ? "ملخص المشاريع النشطة" : "Active Projects"}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTab("projects")}
                      className="h-6 text-xs text-primary gap-1"
                    >
                      <span>{isRtl ? "عرض الكل" : "View all"}</span>
                    </Button>
                  </div>

                  {projects.length === 0 ? (
                    <div className="text-xs text-muted-foreground p-4 bg-muted/20 rounded-xl border text-center">
                      {isRtl ? "لا توجد مشاريع مسجلة بعد" : "No projects recorded"}
                    </div>
                  ) : (
                    projects.slice(0, 2).map((p) => (
                      <div key={p.id} className="p-3 border rounded-xl bg-card space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-primary">{p.opportunityNumber || "PROJ"}</span>
                            <span className="font-semibold text-foreground">{p.title}</span>
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {p.stage.replace(/_/g, " ")}
                            </Badge>
                          </div>
                          <span className="font-bold text-foreground font-mono">
                            {isWorker ? "—" : formatEGP(p.value)}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-muted/30 p-2 rounded-lg text-[11px]">
                          <div>
                            <span className="text-muted-foreground">{isRtl ? "المقايسة:" : "Quote:"} </span>
                            <span className="font-medium capitalize">{p.quotationStatus || "—"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{isRtl ? "أمر التصنيع:" : "Order:"} </span>
                            <span className="font-medium">
                              {(p.orderStatus && (STAGE_LABEL_AR as Record<string, string>)[p.orderStatus]) || p.orderStatus || "—"}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{isRtl ? "التسليم:" : "Delivery:"} </span>
                            <span className="font-medium capitalize">{p.deliveryStatus || "—"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{isRtl ? "المتبقي:" : "Balance:"} </span>
                            <span className="font-bold text-primary font-mono">
                              {isWorker ? "—" : formatEGP(p.outstandingBalance)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Recent Activity Timeline Preview */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {isRtl ? "أحدث أنشطة العميل" : "Recent Activities"}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTab("timeline")}
                      className="h-6 text-xs text-primary gap-1"
                    >
                      <span>{isRtl ? "عرض السجل الكامل" : "View Full Timeline"}</span>
                    </Button>
                  </div>

                  {activities.length === 0 ? (
                    <div className="text-xs text-muted-foreground p-4 bg-muted/20 rounded-xl border text-center">
                      {isRtl ? "لا توجد أنشطة مسجلة" : "No activity recorded yet"}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activities.slice(0, 4).map((act) => (
                        <div key={act.id} className="p-2.5 border rounded-xl bg-card space-y-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground">{act.title}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(act.timestamp).toLocaleDateString(isRtl ? "ar-EG" : "en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          {act.description && (
                            <p className="text-[11px] text-muted-foreground">{act.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* 2. PROJECTS TAB (Project-Centric Structure) */}
              <TabsContent value="projects" className="space-y-4 pt-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    {isRtl ? "هيكلية المشاريع والصفقات (Customer → Projects → Quotes → Orders)" : "Project-Centric Hierarchy"}
                  </span>
                  {!isViewer && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsOpportunityModalOpen(true)}
                      className="h-7 text-xs gap-1 text-primary"
                    >
                      <Plus className="h-3 w-3" />
                      <span>{isRtl ? "مشروع جديد" : "New Project"}</span>
                    </Button>
                  )}
                </div>

                {projects.length === 0 ? (
                  <div className="text-center p-8 border-2 border-dashed rounded-xl text-xs text-muted-foreground">
                    {isRtl ? "لا توجد مشاريع مسجلة لهذا العميل" : "No projects found"}
                  </div>
                ) : (
                  projects.map((proj) => {
                    const isExpanded = !!expandedProjects[proj.id];
                    return (
                      <div
                        key={proj.id}
                        className="border rounded-xl bg-card overflow-hidden transition-all shadow-sm"
                      >
                        {/* Project Card Header */}
                        <div className="p-4 space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono font-bold text-primary text-sm">
                                  {proj.opportunityNumber || "PROJ"}
                                </span>
                                <span className="font-bold text-base text-foreground">{proj.title}</span>
                                <Badge variant="outline" className="text-[10px] capitalize">
                                  {proj.stage.replace(/_/g, " ")}
                                </Badge>
                                {proj.projectType && (
                                  <Badge variant="secondary" className="text-[10px] capitalize">
                                    {proj.projectType}
                                  </Badge>
                                )}
                              </div>
                              {proj.salesOwnerName && (
                                <div className="text-[11px] text-muted-foreground">
                                  {isRtl ? "المسؤول:" : "Sales Owner:"} {proj.salesOwnerName}
                                </div>
                              )}
                            </div>

                            <div className="text-right">
                              <div className="font-bold text-base text-foreground font-mono">
                                {isWorker ? "—" : formatEGP(proj.value)}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {isRtl ? "القيمة الإجمالية" : "Project Value"}
                              </div>
                            </div>
                          </div>

                          {/* Lifecycle Status Badges Strip */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-muted/40 p-2.5 rounded-xl text-xs">
                            <div>
                              <div className="text-[10px] text-muted-foreground">{isRtl ? "المقايسة" : "Quotation"}</div>
                              <Badge variant="outline" className="mt-0.5 text-[10px] capitalize">
                                {proj.quotationStatus || "—"}
                              </Badge>
                            </div>
                            <div>
                              <div className="text-[10px] text-muted-foreground">{isRtl ? "أمر التصنيع" : "Order"}</div>
                              <Badge variant="outline" className="mt-0.5 text-[10px]">
                                {(proj.orderStatus && (STAGE_LABEL_AR as Record<string, string>)[proj.orderStatus]) || proj.orderStatus || "—"}
                              </Badge>
                            </div>
                            <div>
                              <div className="text-[10px] text-muted-foreground">{isRtl ? "تشغيل الورشة" : "Production"}</div>
                              <Badge variant="outline" className="mt-0.5 text-[10px] capitalize">
                                {proj.productionStatus || "—"}
                              </Badge>
                            </div>
                            <div>
                              <div className="text-[10px] text-muted-foreground">{isRtl ? "الشحن والتسليم" : "Delivery"}</div>
                              <Badge variant="outline" className="mt-0.5 text-[10px] capitalize">
                                {proj.deliveryStatus || "—"}
                              </Badge>
                            </div>
                          </div>

                          {/* Metrics Strip & Next Action */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t text-xs">
                            <div className="flex items-center gap-4 text-muted-foreground text-[11px]">
                              <span>
                                {isRtl ? "المتبقي:" : "Balance:"}{" "}
                                <strong className="text-primary font-mono font-semibold">
                                  {isWorker ? "—" : formatEGP(proj.outstandingBalance)}
                                </strong>
                              </span>
                              <span>
                                {isRtl ? "المهام المفتوحة:" : "Open Tasks:"}{" "}
                                <strong className="text-foreground">{proj.openTasksCount}</strong>
                              </span>
                              <span>
                                {isRtl ? "ملاحظات الجودة:" : "Quality Cases:"}{" "}
                                <strong className={proj.qualityCasesCount > 0 ? "text-rose-600" : "text-foreground"}>
                                  {proj.qualityCasesCount}
                                </strong>
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 self-end sm:self-auto">
                              <Link to="/admin/projects/$id" params={{ id: proj.id }}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1 text-primary border-primary/30 hover:bg-primary/5"
                                >
                                  <span>{isRtl ? "مساحة عمل المشروع" : "Workspace"}</span>
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              </Link>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleProjectExpand(proj.id)}
                                className="h-7 text-xs gap-1 text-primary"
                              >
                                <span>{isExpanded ? (isRtl ? "إخفاء التفاصيل" : "Hide Details") : (isRtl ? "عرض عناصر المشروع" : "View Project Items")}</span>
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </div>

                          {proj.nextAction && (
                            <div className="text-[11px] bg-amber-500/10 text-amber-800 dark:text-amber-300 p-2 rounded-lg flex items-center gap-2">
                              <Clock className="h-3 w-3 shrink-0" />
                              <span>
                                <strong>{isRtl ? "الإجراء التالي:" : "Next Action:"}</strong> {proj.nextAction}
                                {proj.nextActionDate && ` (${new Date(proj.nextActionDate).toLocaleDateString()})`}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Expandable Project Details (Linked Quotes, Orders, Tasks, Remakes) */}
                        {isExpanded && (
                          <div className="p-4 bg-muted/20 border-t space-y-3 text-xs">
                            {/* Quotes */}
                            <div className="space-y-1.5">
                              <div className="font-semibold text-muted-foreground text-[11px]">
                                {isRtl ? "المقايسات المرتبطة" : "Linked Quotations"} ({proj.quotes.length})
                              </div>
                              {proj.quotes.length === 0 ? (
                                <div className="text-muted-foreground text-[11px]">{isRtl ? "لا توجد مقايسات" : "No quotes"}</div>
                              ) : (
                                proj.quotes.map((q) => (
                                  <div key={q.id} className="p-2 border rounded-lg bg-card flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-bold text-primary">{q.quoteNumber}</span>
                                      <Badge variant="outline" className="text-[9px]">{q.status}</Badge>
                                      <span className="font-mono text-muted-foreground">{isWorker ? "—" : formatEGP(q.total)}</span>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleDownloadQuotePdf(q.id)}
                                      className="h-6 w-6 p-0"
                                    >
                                      <Download className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))
                              )}
                            </div>

                            {/* Orders */}
                            <div className="space-y-1.5">
                              <div className="font-semibold text-muted-foreground text-[11px]">
                                {isRtl ? "أوامر الإنتاج المرتبطة" : "Linked Production Orders"} ({proj.orders.length})
                              </div>
                              {proj.orders.length === 0 ? (
                                <div className="text-muted-foreground text-[11px]">{isRtl ? "لا توجد أوامر إنتاج" : "No orders"}</div>
                              ) : (
                                proj.orders.map((o) => (
                                  <div key={o.id} className="p-2 border rounded-lg bg-card flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-bold text-primary">{o.orderNumber}</span>
                                      <Badge variant="outline" className="text-[9px]">
                                        {(STAGE_LABEL_AR as Record<string, string>)[o.currentStage] || o.currentStage}
                                      </Badge>
                                      <span className="font-mono text-muted-foreground">{isWorker ? "—" : formatEGP(o.total)}</span>
                                    </div>
                                    <Link to="/admin/orders">
                                      <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 text-primary">
                                        <span>{isRtl ? "فتح" : "View"}</span>
                                        <ExternalLink className="h-2.5 w-2.5" />
                                      </Button>
                                    </Link>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </TabsContent>

              {/* 3. OPPORTUNITIES TAB */}
              <TabsContent value="opportunities" className="space-y-3 pt-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    {isRtl ? "الفرص البيعية والمشاريع" : "Commercial Deals & Opportunities"}
                  </span>
                  <div className="flex items-center gap-2">
                    <Link to="/admin/crm">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                        <span>{isRtl ? "لوحة المبيعات (CRM)" : "CRM Board"}</span>
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </Link>
                    {!isViewer && (
                      <Button
                        size="sm"
                        onClick={() => setIsOpportunityModalOpen(true)}
                        className="h-7 text-xs gap-1 bg-primary text-primary-foreground font-semibold"
                      >
                        <Plus className="h-3 w-3" />
                        <span>{isRtl ? "إنشاء فرصة" : "New Deal"}</span>
                      </Button>
                    )}
                  </div>
                </div>

                {opportunities.length === 0 ? (
                  <div className="text-center p-8 border-2 border-dashed rounded-xl text-xs text-muted-foreground">
                    {isRtl ? "لا توجد فرص بيعية مسجلة لهذا العميل" : "No commercial opportunities recorded"}
                  </div>
                ) : (
                  opportunities.map((opp) => (
                    <div key={opp.id} className="p-3.5 border rounded-xl bg-card space-y-2 text-xs hover:bg-muted/20 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-primary">{opp.opportunityNumber}</span>
                          <span className="font-semibold text-foreground text-sm">{opp.title}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {opp.stage.replace(/_/g, " ")}
                          </Badge>
                          <span className="font-bold text-foreground font-mono">
                            {isWorker ? "—" : formatEGP(opp.value)}
                          </span>
                        </div>
                      </div>

                      {opp.nextAction && (
                        <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-md">
                          <Clock className="h-3 w-3" />
                          <span>{isRtl ? `الخطوة التالية: ${opp.nextAction}` : `Next action: ${opp.nextAction}`}</span>
                          {opp.nextActionDate && (
                            <span className="text-[10px] text-muted-foreground">
                              ({new Date(opp.nextActionDate).toLocaleDateString()})
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
                        <span>{isRtl ? `نوع المشروع: ${opp.projectType}` : `Type: ${opp.projectType}`}</span>
                        <span>{new Date(opp.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              {/* 4. QUOTES TAB */}
              <TabsContent value="quotes" className="space-y-3 pt-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    {isRtl ? "سجل عروض الأسعار والمقايسات" : "Quotations History"}
                  </span>
                  {!isViewer && (
                    <Link to="/admin/quotes/new" search={{ customerId: customerId || undefined }}>
                      <Button size="sm" className="h-7 text-xs gap-1 bg-primary text-primary-foreground font-semibold">
                        <Plus className="h-3 w-3" />
                        <span>{isRtl ? "إنشاء عرض سعر جديد" : "New Quote"}</span>
                      </Button>
                    </Link>
                  )}
                </div>

                {quotes.length === 0 ? (
                  <div className="text-center p-8 border-2 border-dashed rounded-xl text-xs text-muted-foreground">
                    {isRtl ? "لا توجد مقايسات مسجلة لهذا العميل" : "No quotes found"}
                  </div>
                ) : (
                  quotes.map((q) => (
                    <div key={q.id} className="p-3 border rounded-xl bg-card flex items-center justify-between text-xs hover:bg-muted/20 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-primary">{q.quoteNumber}</span>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {q.status}
                          </Badge>
                          {q.orderNumber && (
                            <Badge variant="secondary" className="text-[10px]">
                              {isRtl ? "متحولة لأمر:" : "Order:"} {q.orderNumber}
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(q.createdAt).toLocaleDateString(isRtl ? "ar-EG" : "en-US")} •{" "}
                          <span className="font-mono font-semibold">{isWorker ? "—" : formatEGP(q.total)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDownloadQuotePdf(q.id)}
                          className="h-7 w-7 p-0 text-muted-foreground"
                          title="Download PDF"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>

                        <Link to="/admin/quotes/$id" params={{ id: q.id }}>
                          <Button size="sm" variant="outline" className="h-7 text-xs">
                            {isRtl ? "عرض المقايسة" : "View"}
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              {/* 5. ORDERS TAB */}
              <TabsContent value="orders" className="space-y-3 pt-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    {isRtl ? "أوامر الإنتاج والتصنيع" : "Production Orders"}
                  </span>
                  <Link to="/admin/orders">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                      <span>{isRtl ? "لوحة الإنتاج العامة" : "All Orders"}</span>
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>

                {orders.length === 0 ? (
                  <div className="text-center p-8 border-2 border-dashed rounded-xl text-xs text-muted-foreground">
                    {isRtl ? "لا توجد أوامر إنتاج مسجلة لهذا العميل" : "No orders found"}
                  </div>
                ) : (
                  orders.map((o) => (
                    <div key={o.id} className="p-3.5 border rounded-xl bg-card space-y-2 text-xs hover:bg-muted/20 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-primary text-sm">{o.orderNumber}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {(STAGE_LABEL_AR as Record<string, string>)[o.currentStage] || o.currentStage}
                          </Badge>
                        </div>
                        <span className="font-bold text-sm text-foreground font-mono">
                          {isWorker ? "—" : formatEGP(o.total)}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 bg-muted/40 p-2 rounded-lg text-[11px]">
                        <div>
                          <span className="text-muted-foreground">{isRtl ? "المسدد:" : "Paid:"} </span>
                          <span className="font-semibold text-emerald-600 font-mono">
                            {isWorker ? "—" : formatEGP(o.paidAmount)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{isRtl ? "المتبقي:" : "Balance:"} </span>
                          <span className="font-semibold text-primary font-mono">
                            {isWorker ? "—" : formatEGP(o.balanceDue)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{isRtl ? "التسليم المتوقع:" : "Delivery:"} </span>
                          <span>{o.expectedDelivery ? new Date(o.expectedDelivery).toLocaleDateString() : "—"}</span>
                        </div>
                      </div>

                      <div className="flex justify-end pt-1">
                        <Link to="/admin/orders">
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                            <span>{isRtl ? "فتح أمر الإنتاج" : "View Order"}</span>
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              {/* 6. FINANCIALS TAB (Invoices & Payment Ledger) */}
              <TabsContent value="financials" className="space-y-4 pt-3">
                {isWorker ? (
                  <div className="p-8 border rounded-xl bg-muted/20 text-center text-xs text-muted-foreground">
                    <ShieldAlert className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p>{isRtl ? "البيانات المالية والفواتير محجوبة لصلاحيات حسابك" : "Financial data is restricted for worker roles"}</p>
                  </div>
                ) : (
                  <>
                    {/* Financial Summary KPIs */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                      <div className="p-3 bg-muted/40 rounded-xl border">
                        <div className="text-[11px] text-muted-foreground">{isRtl ? "إجمالي المطالبات والفواتير" : "Total Invoiced"}</div>
                        <div className="font-bold text-base font-mono mt-0.5">{formatEGP(totalInvoiced)}</div>
                      </div>
                      <div className="p-3 bg-emerald-500/10 border-emerald-500/20 rounded-xl border">
                        <div className="text-[11px] text-emerald-700 dark:text-emerald-400">{isRtl ? "المبالغ المحصلة" : "Total Collected"}</div>
                        <div className="font-bold text-base text-emerald-700 dark:text-emerald-400 font-mono mt-0.5">{formatEGP(totalPaid)}</div>
                      </div>
                      <div className="p-3 bg-primary/10 border-primary/20 rounded-xl border">
                        <div className="text-[11px] text-primary">{isRtl ? "المتبقي للاستحقاق" : "Outstanding Balance"}</div>
                        <div className="font-bold text-base text-primary font-mono mt-0.5">{formatEGP(outstandingBalance)}</div>
                      </div>
                      <div className="p-3 bg-muted/40 rounded-xl border">
                        <div className="text-[11px] text-muted-foreground">{isRtl ? "نسبة التحصيل" : "Collection Rate"}</div>
                        <div className="font-bold text-base font-mono mt-0.5">{collectionRate}%</div>
                      </div>
                    </div>

                    {/* Open Invoices */}
                    <div className="space-y-2 pt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold uppercase text-muted-foreground">
                          {isRtl ? "الفواتير والمطالبات المالية" : "Invoices"}
                        </span>
                        {!isViewer && (
                          <Button
                            size="sm"
                            onClick={() => openRecordPayment()}
                            className="h-7 text-xs gap-1 bg-primary text-primary-foreground font-semibold"
                          >
                            <CreditCard className="h-3 w-3" />
                            <span>{isRtl ? "تسجيل دفعة جديدة" : "Record Payment"}</span>
                          </Button>
                        )}
                      </div>

                      {(!data?.invoices || data.invoices.length === 0) ? (
                        <div className="text-center p-8 border-2 border-dashed rounded-xl text-xs text-muted-foreground">
                          {isRtl ? "لا توجد فواتير مسجلة لهذا العميل" : "No invoices found"}
                        </div>
                      ) : (
                        data.invoices.map((inv) => (
                          <div key={inv.id} className="p-3.5 border rounded-xl bg-card space-y-2 text-xs hover:bg-muted/20 transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-primary text-sm">{inv.invoiceNumber}</span>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] capitalize ${
                                    inv.status === "paid"
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : inv.status === "partially_paid"
                                      ? "bg-blue-50 text-blue-700 border-blue-200"
                                      : "bg-slate-50 text-slate-700 border-slate-200"
                                  }`}
                                >
                                  {inv.status}
                                </Badge>
                              </div>
                              <span className="font-bold text-sm font-mono">{formatEGP(inv.total)}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 bg-muted/40 p-2 rounded-lg text-[11px]">
                              <div>
                                <span className="text-muted-foreground">{isRtl ? "المسدد:" : "Paid:"} </span>
                                <span className="font-semibold text-emerald-600 font-mono">{formatEGP(inv.paidAmount)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">{isRtl ? "المتبقي:" : "Balance Due:"} </span>
                                <span className="font-bold text-primary font-mono">{formatEGP(inv.balanceDue)}</span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-1">
                              <span className="text-[10px] text-muted-foreground">
                                {inv.paymentCount} {isRtl ? "دفعات مسجلة" : "payments"}
                              </span>

                              <div className="flex items-center gap-1.5">
                                {inv.balanceDue > 0 && !isViewer && (
                                  <Button
                                    size="sm"
                                    onClick={() => openRecordPayment(inv)}
                                    className="h-7 text-xs bg-primary text-primary-foreground gap-1"
                                  >
                                    <Plus className="h-3 w-3" />
                                    <span>{isRtl ? "سداد" : "Pay"}</span>
                                  </Button>
                                )}

                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDownloadInvoicePdf(inv.id)}
                                  className="h-7 text-xs gap-1"
                                >
                                  <Download className="h-3 w-3" />
                                  <span>PDF</span>
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Recent Payments Ledger */}
                    <div className="space-y-2 pt-2">
                      <div className="text-xs font-semibold uppercase text-muted-foreground">
                        {isRtl ? "سجل التحصيلات والدفعات المالية (Payment Ledger)" : "Payment Receipts Ledger"}
                      </div>

                      {(!financials?.recentPayments || financials.recentPayments.length === 0) ? (
                        <div className="text-center p-6 border rounded-xl bg-muted/10 text-xs text-muted-foreground">
                          {isRtl ? "لا توجد إيصالات سداد مسجلة بعد" : "No payment receipts found"}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {financials.recentPayments.map((p) => (
                            <div key={p.id} className="p-2.5 border rounded-xl bg-card flex items-center justify-between text-xs">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-emerald-600">{p.paymentNumber}</span>
                                  <Badge variant="outline" className="text-[9px] uppercase font-mono">
                                    {p.paymentMethod}
                                  </Badge>
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {isRtl ? "فاتورة:" : "Invoice:"} {p.invoiceNumber}
                                  {p.referenceNumber && ` • ${isRtl ? "مرجع:" : "Ref:"} ${p.referenceNumber}`}
                                  {p.notes && ` • ${p.notes}`}
                                </div>
                              </div>

                              <div className="text-right">
                                <div className="font-bold text-sm text-foreground font-mono">
                                  {formatEGP(p.amount)}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {new Date(p.paidAt).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </TabsContent>

              {/* 7. TASKS TAB */}
              <TabsContent value="tasks" className="space-y-3 pt-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    {isRtl ? "المهام التشغيلية ومتابعات العميل" : "Operational & Client Tasks"}
                  </span>
                  <div className="flex items-center gap-2">
                    <Link to="/admin/tasks">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                        <span>{isRtl ? "لوحة المهام (Kanban)" : "Kanban"}</span>
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </Link>
                    {!isViewer && (
                      <Button
                        size="sm"
                        onClick={() => setIsTaskModalOpen(true)}
                        className="h-7 text-xs gap-1 bg-primary text-primary-foreground font-semibold"
                      >
                        <Plus className="h-3 w-3" />
                        <span>{isRtl ? "إضافة مهمة" : "New Task"}</span>
                      </Button>
                    )}
                  </div>
                </div>

                {tasks.length === 0 ? (
                  <div className="text-center p-8 border-2 border-dashed rounded-xl text-xs text-muted-foreground">
                    {isRtl ? "لا توجد مهام مرتبطة بهذا العميل" : "No tasks linked"}
                  </div>
                ) : (
                  tasks.map((t) => (
                    <div key={t.id} className="p-3 border rounded-xl bg-card space-y-1.5 text-xs hover:bg-muted/20 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-muted-foreground text-[11px]">{t.taskCode}</span>
                          <span className="font-semibold text-foreground text-sm">{t.title}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {t.status}
                          </Badge>
                          {t.priority && (
                            <Badge variant="secondary" className="text-[10px] capitalize">
                              {t.priority}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {t.description && (
                        <p className="text-[11px] text-muted-foreground">{t.description}</p>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
                        <div className="flex items-center gap-1">
                          {t.isOverdue ? (
                            <span className="flex items-center gap-1 text-rose-600 font-semibold">
                              <AlertCircle className="h-3 w-3" />
                              <span>{isRtl ? "متأخرة" : "Overdue"}</span>
                            </span>
                          ) : t.dueDate ? (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>{new Date(t.dueDate).toLocaleDateString()}</span>
                            </span>
                          ) : (
                            <span>{isRtl ? "بلا موعد استحقاق" : "No due date"}</span>
                          )}
                        </div>

                        {t.assignees && t.assignees.length > 0 && (
                          <div className="flex items-center gap-1 text-[10px]">
                            <UserCircle className="h-3 w-3 text-primary" />
                            <span>{t.assignees.length} {isRtl ? "فنيين" : "assigned"}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              {/* 8. PRODUCTION TAB */}
              <TabsContent value="production" className="space-y-3 pt-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    {isRtl ? "أوامر تشغيل ورشة الإنتاج" : "Workshop Work Orders"}
                  </span>
                  <Link to="/admin/work-orders">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-primary">
                      <span>{isRtl ? "لوحة أوامر التشغيل" : "Work Orders Board"}</span>
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>

                {workOrders.length === 0 ? (
                  <div className="text-center p-8 border-2 border-dashed rounded-xl text-xs text-muted-foreground">
                    {isRtl ? "لا توجد أوامر تشغيل ورشة لهذا العميل" : "No production work orders"}
                  </div>
                ) : (
                  workOrders.map((w) => (
                    <div key={w.id} className="p-3.5 border rounded-xl bg-card space-y-2 text-xs hover:bg-muted/20 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-primary">{w.workOrderNumber}</span>
                          <span className="text-muted-foreground">({isRtl ? "أمر:" : "Order:"} {w.orderNumber})</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {w.status}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] capitalize">
                            {w.priority}
                          </Badge>
                        </div>
                      </div>

                      {w.notes && (
                        <p className="text-[11px] text-muted-foreground bg-muted/30 p-2 rounded-lg">{w.notes}</p>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
                        <span>
                          {w.scheduledDate
                            ? `${isRtl ? "الموعد المجدول:" : "Scheduled:"} ${new Date(w.scheduledDate).toLocaleDateString()}`
                            : isRtl
                            ? "غير مجدول"
                            : "Not scheduled"}
                        </span>
                        <span>{new Date(w.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              {/* 9. DELIVERIES TAB */}
              <TabsContent value="deliveries" className="space-y-3 pt-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    {isRtl ? "سجل التسليمات ومحاضر الاستلام والتركيب" : "Deliveries & Installation Handovers"}
                  </span>
                  <Link to="/admin/deliveries">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-primary">
                      <span>{isRtl ? "لوحة التسليمات" : "Deliveries Board"}</span>
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>

                {deliveries.length === 0 ? (
                  <div className="text-center p-8 border-2 border-dashed rounded-xl text-xs text-muted-foreground">
                    {isRtl ? "لا توجد سجلات تسليم أو تركيب لهذا العميل" : "No deliveries found"}
                  </div>
                ) : (
                  deliveries.map((d) => (
                    <div key={d.id} className="p-3.5 border rounded-xl bg-card space-y-2 text-xs hover:bg-muted/20 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-primary">{d.deliveryNumber}</span>
                          <span className="text-muted-foreground">({isRtl ? "أمر:" : "Order:"} {d.orderNumber})</span>
                        </div>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {d.status}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-muted/30 p-2 rounded-lg text-[11px]">
                        <div>
                          <span className="text-muted-foreground">{isRtl ? "العنوان:" : "Address:"} </span>
                          <span>{d.deliveryAddress || (isRtl ? "موقع العميل" : "Client location")}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{isRtl ? "المستلم:" : "Recipient:"} </span>
                          <span>{d.recipientName || "—"}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
                        <div className="flex items-center gap-2">
                          {d.signatureDataUrl && (
                            <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">
                              {isRtl ? "موقع ومستلم رسمياً" : "Signed"}
                            </Badge>
                          )}
                          {d.installationRequired && (
                            <Badge variant="outline" className="text-[9px]">
                              {isRtl ? "يتطلب تركيب" : "Installation"}
                            </Badge>
                          )}
                        </div>
                        <span>
                          {d.deliveredAt
                            ? `${isRtl ? "تم التسليم:" : "Delivered:"} ${new Date(d.deliveredAt).toLocaleDateString()}`
                            : d.scheduledDate
                            ? `${isRtl ? "الموعد:" : "Target:"} ${new Date(d.scheduledDate).toLocaleDateString()}`
                            : "—"}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              {/* 10. QUALITY & WARRANTY TAB */}
              <TabsContent value="quality" className="space-y-4 pt-3">
                {/* 10.1 Customer Warranties Diagnostic */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                      <span>{isRtl ? "حالة الضمان التعاقدي للطلبات" : "Contractual Warranty Status"}</span>
                    </span>
                  </div>

                  {afterSales?.warranties && afterSales.warranties.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {afterSales.warranties.map((w, idx) => (
                        <div
                          key={w.orderId || idx}
                          className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                            w.isReliable && w.isWarrantyActive
                              ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500/30"
                              : w.isReliable && !w.isWarrantyActive
                              ? "bg-amber-50/50 dark:bg-amber-950/20 border-amber-500/30"
                              : "bg-muted/30 border-muted"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-foreground">
                              {w.orderNumber}
                            </span>
                            <Badge
                              variant={w.isReliable && w.isWarrantyActive ? "default" : "outline"}
                              className="text-[10px]"
                            >
                              {isRtl ? w.warrantyStatusLabelAr : w.warrantyStatusLabel}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {isRtl ? w.warrantyDetailsAr : w.warrantyDetails}
                          </p>
                          {w.isReliable && (
                            <div className="flex items-center justify-between pt-1 border-t text-[10px] text-muted-foreground font-mono">
                              <span>{isRtl ? "محضر الاستلام:" : "Handover:"} {w.handoverDate}</span>
                              <span className="font-semibold text-foreground">{isRtl ? "صالح حتى:" : "Expires:"} {w.warrantyExpirationDate}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 text-center border-2 border-dashed rounded-xl text-xs text-muted-foreground">
                      {isRtl ? "لا توجد أوامر تنفيذ مفعلة لفحص الضمان" : "No orders found for warranty evaluation"}
                    </div>
                  )}
                </div>

                {/* 10.2 Service & After-Sales Cases */}
                <div className="space-y-2 pt-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                      <Headphones className="h-3.5 w-3.5 text-primary" />
                      <span>{isRtl ? "بلاغات خدمة ما بعد البيع والشكاوى" : "Service & Complaint Cases"}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <Link to="/admin/crm/after-sales">
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                          <span>{isRtl ? "لوحة بعد البيع" : "After-Sales Board"}</span>
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </Link>
                      {!isViewer && (
                        <Button
                          size="sm"
                          onClick={() => setIsServiceCaseModalOpen(true)}
                          className="h-7 text-xs gap-1 font-semibold shadow-sm"
                        >
                          <Plus className="h-3 w-3" />
                          <span>{isRtl ? "+ فتح بلاغ" : "+ Service Case"}</span>
                        </Button>
                      )}
                    </div>
                  </div>

                  {afterSales?.cases && afterSales.cases.length > 0 ? (
                    <div className="space-y-2">
                      {afterSales.cases.map((sc) => (
                        <div
                          key={sc.id}
                          onClick={() => {
                            setSelectedServiceCaseId(sc.id);
                            setIsServiceCaseDrawerOpen(true);
                          }}
                          className="p-3.5 border rounded-xl bg-card space-y-1.5 text-xs hover:bg-muted/30 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-primary">{sc.caseNumber}</span>
                              <Badge variant="outline" className="text-[9px] uppercase font-mono">
                                {sc.type}
                              </Badge>
                              <span className="font-semibold text-foreground text-sm">{sc.title}</span>
                            </div>
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {sc.status.replace("_", " ")}
                            </Badge>
                          </div>
                          {sc.description && (
                            <p className="text-[11px] text-muted-foreground line-clamp-2">
                              {sc.description}
                            </p>
                          )}
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
                            <span>{sc.orderNumber ? (isRtl ? `طلب: ${sc.orderNumber}` : `Order: ${sc.orderNumber}`) : (isRtl ? "مباشر" : "Direct")}</span>
                            <span>{new Date(sc.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center p-6 border-2 border-dashed rounded-xl text-xs text-muted-foreground">
                      {isRtl ? "لا توجد بلاغات خدمة ما بعد البيع مسجلة" : "No after-sales cases recorded"}
                    </div>
                  )}
                </div>

                {/* 10.3 Workshop Remakes */}
                <div className="space-y-2 pt-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                      <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
                      <span>{isRtl ? "أوامر إعادة التصنيع بالورشة (Remakes)" : "Workshop Remakes"}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <Link to="/admin/remakes">
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                          <span>{isRtl ? "سجل الجودة العام" : "All Cases"}</span>
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </Link>
                      {!isViewer && (
                        <Button
                          size="sm"
                          onClick={() => setIsRemakeModalOpen(true)}
                          className="h-7 text-xs gap-1 bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                        >
                          <ShieldAlert className="h-3 w-3" />
                          <span>{isRtl ? "تسجيل عيب فني" : "Log Defect"}</span>
                        </Button>
                      )}
                    </div>
                  </div>

                  {remakes.length === 0 ? (
                    <div className="text-center p-6 border-2 border-dashed rounded-xl text-xs text-muted-foreground">
                      {isRtl ? "لا توجد بلاغات إعادة تصنيع بالورشة (سجل ممتاز)" : "No quality remakes recorded"}
                    </div>
                  ) : (
                    remakes.map((r) => (
                      <div key={r.id} className="p-3.5 border rounded-xl bg-card space-y-2 text-xs hover:bg-muted/20 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-primary">{r.remakeNumber}</span>
                            <span className="font-semibold text-foreground text-sm">{r.reason}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-[9px] uppercase">
                              {r.severity}
                            </Badge>
                            <Badge variant="outline" className="text-[9px] capitalize">
                              {r.status.replace("_", " ")}
                            </Badge>
                          </div>
                        </div>

                        {r.defectDescription && (
                          <p className="text-[11px] text-muted-foreground bg-muted/30 p-2 rounded-lg">
                            {r.defectDescription}
                          </p>
                        )}

                        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
                          <span>{isRtl ? `طلب: ${r.orderNumber}` : `Order: ${r.orderNumber}`}</span>
                          <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              {/* 11. TIMELINE TAB (Unified Chronological Activity Feed) */}
              <TabsContent value="timeline" className="space-y-3 pt-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    {isRtl ? "سجل الأحداث والنشاط الزمني المتكامل (Timeline)" : "Unified Chronological Timeline"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {activities.length} {isRtl ? "أحداث مسجلة" : "events recorded"}
                  </span>
                </div>

                {activities.length === 0 ? (
                  <div className="text-center p-8 border-2 border-dashed rounded-xl text-xs text-muted-foreground">
                    {isRtl ? "لا توجد أنشطة مسجلة بعد" : "No activities recorded"}
                  </div>
                ) : (
                  <div className="relative border-l-2 border-muted pl-4 ml-2 space-y-4 py-2">
                    {activities.map((act) => (
                      <div key={act.id} className="relative space-y-1 text-xs">
                        {/* Timeline node */}
                        <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background" />

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[9px] uppercase px-1.5 py-0 font-mono">
                              {act.entityType}
                            </Badge>
                            <span className="font-semibold text-foreground text-sm">{act.title}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                            {new Date(act.timestamp).toLocaleDateString(isRtl ? "ar-EG" : "en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>

                        {act.description && (
                          <p className="text-[11px] text-muted-foreground">{act.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>

      {/* Sub-Modals */}
      {/* 1. Opportunity Modal */}
      <OpportunityFormModal
        open={isOpportunityModalOpen}
        onOpenChange={setIsOpportunityModalOpen}
        defaultCustomerId={customerId}
        onSuccess={() => {
          loadData();
          onRefreshList?.();
        }}
      />

      {/* 2. Task Modal */}
      <TaskForm
        open={isTaskModalOpen}
        onOpenChange={setIsTaskModalOpen}
        defaultCustomerId={customerId}
        onTaskCreated={() => {
          loadData();
          onRefreshList?.();
        }}
      />

      {/* 3. Record Payment Modal */}
      <RecordPaymentModal
        open={isPaymentModalOpen}
        onOpenChange={setIsPaymentModalOpen}
        invoice={paymentInvoice}
        onPaymentRecorded={() => {
          loadData();
          onRefreshList?.();
        }}
      />

      {/* 4. Quality Issue / Remake Modal */}
      <CreateRemakeModal
        open={isRemakeModalOpen}
        onOpenChange={setIsRemakeModalOpen}
        customerId={customerId}
        ordersList={orders.map((o) => ({ id: o.id, orderNumber: o.orderNumber }))}
        onCreated={() => {
          loadData();
          onRefreshList?.();
        }}
      />

      {/* 5. Create Service Case Modal */}
      <CreateServiceCaseModal
        open={isServiceCaseModalOpen}
        onOpenChange={setIsServiceCaseModalOpen}
        defaultCustomerId={customerId}
        defaultCustomerName={c?.name}
        ordersList={orders.map((o) => ({ id: o.id, orderNumber: o.orderNumber }))}
        onSuccess={() => {
          loadData();
          onRefreshList?.();
        }}
      />

      {/* 6. Service Case Detail Drawer */}
      <ServiceCaseDetailDrawer
        caseId={selectedServiceCaseId}
        open={isServiceCaseDrawerOpen}
        onOpenChange={setIsServiceCaseDrawerOpen}
        onRefreshList={() => {
          loadData();
          onRefreshList?.();
        }}
        userRole={userRole}
      />
    </>
  );
}
