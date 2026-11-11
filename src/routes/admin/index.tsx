import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getExecutiveDashboard } from "@/lib/dashboard.functions";
import type { ExecutiveDashboardData } from "@/lib/dashboard-types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  FileText,
  ClipboardList,
  TrendingUp,
  Sparkles,
  Plus,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FileSpreadsheet,
  Hammer,
  Truck,
  Boxes,
  RefreshCcw,
  CheckSquare,
  Receipt,
  ShieldAlert,
  Wrench,
  DollarSign,
  Activity,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { formatEGP } from "@/lib/pricing";
import { getStageLabelAr, ORDER_STAGES } from "@/lib/stages";

const DEFAULT_DASHBOARD: ExecutiveDashboardData = {
  financial: {
    totalInvoiced: 0,
    totalCollected: 0,
    outstandingBalance: 0,
    collectionRate: 0,
    unpaidInvoicesCount: 0,
  },
  commercial: {
    totalQuotes: 0,
    totalPipelineValue: 0,
    conversionRate: 0,
    byStatus: { draft: 0, sent: 0, accepted: 0, converted: 0, rejected: 0 },
    recentQuotes: [],
  },
  factory: {
    activeInProduction: 0,
    ordersByStage: {},
    bottleneckStage: null,
    workOrders: { total: 0, ready: 0, inProgress: 0, qcPending: 0, completed: 0 },
    activeOrders: [],
  },
  inventory: {
    totalStockItems: 0,
    lowStockItemsCount: 0,
    lowStockItems: [],
  },
  quality: {
    openRemakesCount: 0,
    criticalRemakesCount: 0,
    inProgressRemakesCount: 0,
    qcPendingCount: 0,
    failedQcCount: 0,
  },
  deliveries: {
    totalDeliveries: 0,
    readyForDispatch: 0,
    dispatched: 0,
    outForDelivery: 0,
    installationPending: 0,
    handoverPending: 0,
    completed: 0,
  },
  tasks: {
    totalTasks: 0,
    openTasks: 0,
    inProgressTasks: 0,
    waitingReviewTasks: 0,
    criticalTasks: 0,
    overdueTasks: 0,
  },
  customerCount: 0,
  attentionItems: [],
  recentActivities: [],
};

export const Route = createFileRoute("/admin/")({ component: DashboardPage });

function DashboardPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const getDashboardFn = useServerFn(getExecutiveDashboard);

  const { data = DEFAULT_DASHBOARD, isLoading } = useQuery<ExecutiveDashboardData>({
    queryKey: ["executive-dashboard"],
    queryFn: async () => {
      try {
        const res = await getDashboardFn({ data: {} });
        return res || DEFAULT_DASHBOARD;
      } catch (e) {
        return DEFAULT_DASHBOARD;
      }
    },
    initialData: DEFAULT_DASHBOARD,
    refetchInterval: 30000,
  });

  const {
    financial,
    commercial,
    factory,
    inventory,
    quality,
    deliveries,
    tasks: taskSummary,
    customerCount,
    attentionItems,
    recentActivities,
  } = data;

  return (
    <div className="space-y-8 pb-16">
      {/* ── Page Header & Quick Launch Strip ──────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <Activity className="h-7 w-7 text-primary" />
            <span>{isRtl ? "مركز القيادة والعمليات التنفيذية" : "Executive Operations Command Center"}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isRtl
              ? "متابعة شاملة للتدفقات المالية، خطوط الإنتاج، المخزون، الجودة، والتسليمات"
              : "Comprehensive visibility across financials, factory lines, inventory, QC, and deliveries"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/admin/quotes/new">
            <Button className="gap-2 bg-primary text-primary-foreground shadow-sm h-9 text-xs">
              <Plus className="h-3.5 w-3.5" />
              <span>{isRtl ? "عرض سعر جديد" : "New Quotation"}</span>
            </Button>
          </Link>
          <Link to="/admin/tasks">
            <Button variant="outline" className="gap-1.5 h-9 text-xs">
              <CheckSquare className="h-3.5 w-3.5" />
              <span>{isRtl ? "المهام" : "Tasks"}</span>
            </Button>
          </Link>
          <Link to="/admin/inventory">
            <Button variant="outline" className="gap-1.5 h-9 text-xs">
              <Boxes className="h-3.5 w-3.5" />
              <span>{isRtl ? "المخزون" : "Inventory"}</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Primary Executive KPI Cards ────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Financial KPI */}
        <Link to="/admin/invoices" className="block">
          <Card className="border shadow-xs hover:shadow-md transition-all hover:border-primary/40 h-full">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {isRtl ? "التحصيل والمستحقات" : "Financial & Collection"}
                  </p>
                  <p className="text-2xl font-serif font-bold tracking-tight text-foreground">
                    {formatEGP(financial.totalCollected)}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <Receipt className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{isRtl ? "معدل التحصيل:" : "Collection Rate:"}</span>
                  <span className="font-mono font-bold text-emerald-600">{financial.collectionRate.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-emerald-600 h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.min(100, financial.collectionRate)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                  <span>{isRtl ? "المتبقي:" : "Due:"} <strong className="text-amber-600 font-mono">{formatEGP(financial.outstandingBalance)}</strong></span>
                  <span>{financial.unpaidInvoicesCount} {isRtl ? "فواتير غير مسددة" : "unpaid"}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* 2. Commercial Pipeline */}
        <Link to="/admin/quotes" className="block">
          <Card className="border shadow-xs hover:shadow-md transition-all hover:border-primary/40 h-full">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {isRtl ? "القيمة التجارية للمقايسات" : "Commercial Pipeline"}
                  </p>
                  <p className="text-2xl font-serif font-bold tracking-tight text-foreground">
                    {formatEGP(commercial.totalPipelineValue)}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-gold/15 text-gold flex items-center justify-center">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <div>
                  <span className="font-bold text-foreground">{commercial.totalQuotes}</span>{" "}
                  <span>{isRtl ? "مقايسة" : "quotes"}</span>
                </div>
                <div className="flex items-center gap-1 text-emerald-600 font-semibold">
                  <span>{isRtl ? "نسبة الإغلاق:" : "Conversion:"}</span>
                  <span className="font-mono">{commercial.conversionRate.toFixed(1)}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* 3. Factory Throughput */}
        <Link to="/admin/orders" className="block">
          <Card className="border shadow-xs hover:shadow-md transition-all hover:border-primary/40 h-full">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {isRtl ? "الإنتاج النشط بالمصنع" : "Active Factory Orders"}
                  </p>
                  <p className="text-2xl font-serif font-bold tracking-tight text-foreground">
                    {factory.activeInProduction}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Hammer className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                {factory.bottleneckStage ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-amber-600 font-bold">{isRtl ? "عنق الزجاجة:" : "Bottleneck:"}</span>
                    <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-800 border-amber-300 font-medium">
                      {getStageLabelAr(factory.bottleneckStage.stage)} ({factory.bottleneckStage.count})
                    </Badge>
                  </div>
                ) : (
                  <span>{isRtl ? "خطوط الإنتاج متوازنة" : "Lines Balanced"}</span>
                )}
                <span className="font-mono text-[11px]">{factory.workOrders.total} {isRtl ? "أمر شغل" : "WO"}</span>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* 4. Deliveries & Handover */}
        <Link to="/admin/deliveries" className="block">
          <Card className="border shadow-xs hover:shadow-md transition-all hover:border-primary/40 h-full">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {isRtl ? "الشحنات والتسليمات" : "Deliveries & Handover"}
                  </p>
                  <p className="text-2xl font-serif font-bold tracking-tight text-foreground">
                    {deliveries.outForDelivery + deliveries.readyForDispatch + deliveries.installationPending}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
                  <Truck className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="text-blue-600 font-semibold">{deliveries.readyForDispatch} {isRtl ? "جاهز" : "ready"}</span> •
                  <span className="text-purple-600 font-semibold">{deliveries.installationPending} {isRtl ? "تركيب" : "install"}</span>
                </div>
                <div className="text-emerald-600 font-semibold font-mono">
                  {deliveries.completed} {isRtl ? "مكتمل" : "done"}
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* ── Management Attention Center ("Needs Attention") ────────────────── */}
      <Card className="border-2 border-amber-300/80 bg-amber-50/20 dark:bg-amber-950/10 rounded-2xl shadow-xs overflow-hidden">
        <CardHeader className="p-4 bg-amber-100/40 dark:bg-amber-900/20 border-b border-amber-200/60 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-700 dark:text-amber-400" />
            <CardTitle className="text-base font-bold text-amber-900 dark:text-amber-300">
              {isRtl ? "تنبيهات تتطلب إجراء الإدارة (Needs Attention)" : "Management Attention Center"}
            </CardTitle>
            <Badge variant="outline" className="bg-amber-200/60 text-amber-900 border-amber-400 text-xs font-bold">
              {attentionItems.length}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">
            {isRtl ? "استثناءات تشغيلية تتطلب تدخلاً فورياً" : "Operational exceptions requiring immediate action"}
          </span>
        </CardHeader>
        <CardContent className="p-4">
          {attentionItems.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-1.5">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              <span className="font-semibold text-foreground">
                {isRtl ? "لا توجد مشاكل حرجة حالياً — كافة العمليات تسير وفق المعدلات الطبيعية" : "No critical issues right now — all operations normal"}
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {attentionItems.map((item) => {
                const getSeverityStyle = (sev: string) => {
                  if (sev === "critical") return "border-rose-300 bg-rose-50/60 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200";
                  if (sev === "warning") return "border-amber-300 bg-amber-50/60 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200";
                  return "border-blue-300 bg-blue-50/60 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200";
                };

                return (
                  <Link key={item.id} to={item.link} className="block group">
                    <div className={`p-3 rounded-xl border transition-all group-hover:shadow-xs flex items-start justify-between gap-3 text-xs ${getSeverityStyle(item.severity)}`}>
                      <div className="space-y-1 min-w-0">
                        <div className="font-bold flex items-center gap-1.5">
                          {item.severity === "critical" && <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0" />}
                          <span className="truncate">{item.title}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-1">{item.description}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0 mt-1 rtl:rotate-180 transition-transform" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Operational Grid (2 Columns) ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Factory, Work Orders & Inventory */}
        <div className="space-y-6">
          {/* Factory Stages Queue */}
          <Card className="border rounded-2xl shadow-xs">
            <CardHeader className="p-4 bg-muted/20 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Hammer className="h-4 w-4 text-primary" />
                  <span>{isRtl ? "مراحل خط الإنتاج الفعلي" : "Factory Production Pipeline"}</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  {isRtl ? "توزيع الأوامر على مراحل التصنيع الثمانية" : "Order distribution across 8 stages"}
                </CardDescription>
              </div>
              <Link to="/admin/orders">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-primary gap-1">
                  <span>{isRtl ? "الأوامر" : "Orders"}</span>
                  <ArrowUpRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {ORDER_STAGES.map((st) => {
                  const count = factory.ordersByStage[st] || 0;
                  const isBottleneck = factory.bottleneckStage?.stage === st && count > 0;
                  return (
                    <div
                      key={st}
                      className={`p-2.5 rounded-xl border text-xs flex flex-col justify-between ${
                        isBottleneck
                          ? "bg-amber-50/80 border-amber-300 text-amber-900 font-bold"
                          : "bg-muted/10 border-border/60 text-muted-foreground"
                      }`}
                    >
                      <span className="text-[11px] truncate">{getStageLabelAr(st)}</span>
                      <span className={`text-base font-mono font-bold mt-1 ${isBottleneck ? "text-amber-700" : "text-foreground"}`}>
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Work Orders Strip */}
              <div className="p-3 bg-muted/20 border rounded-xl flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">{isRtl ? "أوامر الشغل بالمصنع:" : "Factory Work Packages:"}</span>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-blue-600">{factory.workOrders.ready} {isRtl ? "جاهز" : "ready"}</span>
                  <span className="text-amber-600">{factory.workOrders.inProgress} {isRtl ? "قيد التنفيذ" : "in-progress"}</span>
                  <span className="text-purple-600">{factory.workOrders.qcPending} {isRtl ? "بانتظار الفحص" : "QC"}</span>
                  <span className="text-emerald-600">{factory.workOrders.completed} {isRtl ? "مكتمل" : "done"}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Inventory Health & Stock Shortages */}
          <Card className="border rounded-2xl shadow-xs">
            <CardHeader className="p-4 bg-muted/20 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Boxes className="h-4 w-4 text-primary" />
                  <span>{isRtl ? "حالة المخزون وتخصيص الخامات" : "Inventory & Stock Health"}</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  {isRtl ? "مراقبة النواقص وحجز الخامات لأوامر الإنتاج" : "Stock shortages and reservations"}
                </CardDescription>
              </div>
              <Link to="/admin/inventory">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-primary gap-1">
                  <span>{isRtl ? "المخزن" : "Inventory"}</span>
                  <ArrowUpRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{isRtl ? "إجمالي أصناف المخزون المسجلة:" : "Total Registered Stock Items:"}</span>
                <span className="font-mono font-bold text-foreground">{inventory.totalStockItems}</span>
              </div>

              {inventory.lowStockItems.length === 0 ? (
                <div className="p-4 bg-emerald-50/40 border border-emerald-200/60 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>{isRtl ? "المخزون كافٍ ولا توجد نواقص حرجة حالياً" : "Stock is sufficient with no critical shortages"}</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase">{isRtl ? "أصناف منخفضة / تتطلب طلب شراء:" : "Low Stock Alerts:"}</span>
                  {inventory.lowStockItems.map((item) => (
                    <div key={item.id} className="p-2.5 bg-rose-50/40 border border-rose-200/60 rounded-xl flex items-center justify-between text-xs">
                      <div className="font-mono font-bold text-foreground">{item.materialCode}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {isRtl ? "المتاح:" : "Avail:"} <strong className="text-rose-600 font-bold">{item.availableQuantity}</strong> • {isRtl ? "محجوز:" : "Res:"} {item.reservedQuantity}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Quality, Deliveries & Tasks */}
        <div className="space-y-6">
          {/* Quality & Remakes */}
          <Card className="border rounded-2xl shadow-xs">
            <CardHeader className="p-4 bg-muted/20 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <RefreshCcw className="h-4 w-4 text-primary" />
                  <span>{isRtl ? "إدارة الجودة وإعادة التصنيع (Remakes)" : "Quality & Remakes"}</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  {isRtl ? "متابعة العيوب وفحوصات الجودة والضمان" : "Defect tracking, QC failures & warranties"}
                </CardDescription>
              </div>
              <Link to="/admin/remakes">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-primary gap-1">
                  <span>{isRtl ? "إعادات التصنيع" : "Remakes"}</span>
                  <ArrowUpRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 bg-muted/20 border rounded-xl text-xs">
                  <span className="text-muted-foreground block text-[10px]">{isRtl ? "إعادة تصنيع مفتوحة" : "Open Remakes"}</span>
                  <span className="text-xl font-mono font-bold text-foreground mt-0.5 block">{quality.openRemakesCount}</span>
                </div>
                <div className="p-3 bg-rose-50/40 border border-rose-200/60 rounded-xl text-xs">
                  <span className="text-rose-700 block text-[10px] font-semibold">{isRtl ? "حالات حرجة" : "Critical"}</span>
                  <span className="text-xl font-mono font-bold text-rose-700 mt-0.5 block">{quality.criticalRemakesCount}</span>
                </div>
                <div className="p-3 bg-amber-50/40 border border-amber-200/60 rounded-xl text-xs">
                  <span className="text-amber-700 block text-[10px] font-semibold">{isRtl ? "فحوصات QC مرفوضة" : "Failed QC"}</span>
                  <span className="text-xl font-mono font-bold text-amber-700 mt-0.5 block">{quality.failedQcCount}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Task Operations */}
          <Card className="border rounded-2xl shadow-xs">
            <CardHeader className="p-4 bg-muted/20 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-primary" />
                  <span>{isRtl ? "المهام التشغيلية (Task Management)" : "Task Operations"}</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  {isRtl ? "متابعة إنجاز مهام الفريق والمهام الحرجة" : "Team execution, overdue & critical tasks"}
                </CardDescription>
              </div>
              <Link to="/admin/tasks">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-primary gap-1">
                  <span>{isRtl ? "لوحة المهام" : "Kanban"}</span>
                  <ArrowUpRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 bg-muted/20 border rounded-xl text-xs">
                  <span className="text-muted-foreground block text-[10px]">{isRtl ? "مهام قيد العمل" : "In Progress"}</span>
                  <span className="text-xl font-mono font-bold text-blue-600 mt-0.5 block">{taskSummary.inProgressTasks}</span>
                </div>
                <div className="p-3 bg-amber-50/40 border border-amber-200/60 rounded-xl text-xs">
                  <span className="text-amber-700 block text-[10px] font-semibold">{isRtl ? "مهام متأخرة" : "Overdue"}</span>
                  <span className="text-xl font-mono font-bold text-amber-700 mt-0.5 block">{taskSummary.overdueTasks}</span>
                </div>
                <div className="p-3 bg-rose-50/40 border border-rose-200/60 rounded-xl text-xs">
                  <span className="text-rose-700 block text-[10px] font-semibold">{isRtl ? "مهام عاجلة" : "Urgent / High"}</span>
                  <span className="text-xl font-mono font-bold text-rose-700 mt-0.5 block">{taskSummary.criticalTasks}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Recent Operational Activity Feed & Latest Quotes ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Quotes */}
        <Card className="border rounded-2xl shadow-xs">
          <CardHeader className="p-4 bg-muted/20 border-b flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span>{isRtl ? "أحدث المقايسات التجارية" : "Recent Quotations"}</span>
            </CardTitle>
            <Link to="/admin/quotes">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-primary gap-1">
                <span>{isRtl ? "عرض الكل" : "View All"}</span>
                <ArrowUpRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {commercial.recentQuotes.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                {isRtl ? "لا توجد مقايسات مسجلة مؤخراً" : "No recent quotations found"}
              </div>
            ) : (
              <div className="divide-y text-xs">
                {commercial.recentQuotes.map((q) => (
                  <div key={q.id} className="p-3 flex items-center justify-between hover:bg-muted/20 transition-colors">
                    <div className="space-y-0.5">
                      <div className="font-mono font-bold text-foreground">{q.quoteNumber}</div>
                      <div className="text-[11px] text-muted-foreground">{q.customerName}</div>
                    </div>
                    <div className="text-right rtl:text-left space-y-0.5">
                      <div className="font-mono font-bold text-primary">{formatEGP(q.total)}</div>
                      <Badge variant="outline" className="text-[9px] capitalize">{q.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity Stream */}
        <Card className="border rounded-2xl shadow-xs">
          <CardHeader className="p-4 bg-muted/20 border-b flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <span>{isRtl ? "سجل النشاط والعمليات الأخير" : "Recent Activity Log"}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recentActivities.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                {isRtl ? "لا توجد أحداث مسجلة في السجل" : "No recent activity recorded"}
              </div>
            ) : (
              <div className="divide-y text-xs">
                {recentActivities.map((act) => (
                  <div key={act.id} className="p-3 flex items-start justify-between gap-3 hover:bg-muted/20 transition-colors">
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground">{act.description}</p>
                      <span className="text-[10px] text-muted-foreground uppercase font-mono">{act.entityType}</span>
                    </div>
                    {act.createdAt && (
                      <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                        {new Date(act.createdAt).toLocaleTimeString(isRtl ? "ar-EG" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}