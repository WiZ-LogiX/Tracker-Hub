import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { listServiceCases } from "@/lib/after-sales.functions";
import type {
  ServiceCaseItem,
  AfterSalesKpiMetrics,
  ServiceCaseType,
  ServiceCaseStatus,
  ServiceCasePriority,
} from "@/lib/after-sales-types";
import { CreateServiceCaseModal } from "@/components/after-sales/CreateServiceCaseModal";
import { ServiceCaseDetailDrawer } from "@/components/after-sales/ServiceCaseDetailDrawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Headphones,
  ShieldCheck,
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  RefreshCcw,
  Search,
  MessageCircle,
  Wrench,
  HelpCircle,
  Layers,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

const afterSalesSearchSchema = z.object({
  tab: z.string().optional().default("all"),
  type: z.string().optional(),
  status: z.string().optional(),
  search: z.string().optional(),
  page: z.number().optional().default(1),
});

type AfterSalesSearchParams = z.infer<typeof afterSalesSearchSchema>;

export const Route = createFileRoute("/admin/crm/after-sales")({
  validateSearch: afterSalesSearchSchema,
  component: AfterSalesWorkspacePage,
});

function AfterSalesWorkspacePage() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const searchParams = (Route.useSearch?.() || {}) as AfterSalesSearchParams;

  const listCasesFn = useServerFn(listServiceCases);

  const [loading, setLoading] = useState(false);
  const [cases, setCases] = useState<ServiceCaseItem[]>([]);
  const [metrics, setMetrics] = useState<AfterSalesKpiMetrics | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  // Filters
  const [activeTab, setActiveTab] = useState(searchParams?.tab || "all");
  const [searchTerm, setSearchTerm] = useState(searchParams?.search || "");
  const [selectedType, setSelectedType] = useState(searchParams?.type || "all");
  const [selectedStatus, setSelectedStatus] = useState(searchParams?.status || "all");
  const [selectedPriority, setSelectedPriority] = useState("all");
  const [page, setPage] = useState<number>(searchParams?.page || 1);

  // Drawer / Modals
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setSchemaError(null);
    try {
      let typeFilter = selectedType;
      if (activeTab === "complaint") typeFilter = "complaint";
      else if (activeTab === "warranty") typeFilter = "warranty";
      else if (activeTab === "service") typeFilter = "service";

      let statusFilter = selectedStatus;
      if (activeTab === "open") statusFilter = "new";

      const res = await listCasesFn({
        data: {
          searchTerm: searchTerm.trim() || undefined,
          type: typeFilter !== "all" ? typeFilter : undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
          priority: selectedPriority !== "all" ? selectedPriority : undefined,
          page,
          pageSize: 25,
        },
      });

      setCases(res.rows);
      setMetrics(res.metrics);
      setTotalCount(res.totalCount);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      const msg = err?.message || "Failed to load after-sales cases";
      if (
        msg.includes("schema is not initialized") ||
        msg.includes("migration") ||
        msg.includes("does not exist") ||
        msg.includes("42P01") ||
        msg.includes("42703")
      ) {
        setSchemaError(msg);
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab, selectedType, selectedStatus, selectedPriority, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadData();
  };

  const handleOpenCase = (id: string) => {
    setSelectedCaseId(id);
    setIsDrawerOpen(true);
  };

  const handleWhatsApp = (phone?: string | null) => {
    if (!phone) return;
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    const intlPhone = cleanPhone.startsWith("0") ? `2${cleanPhone}` : cleanPhone;
    window.open(`https://wa.me/${intlPhone}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xl shadow-sm">
            <Headphones className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold font-serif text-foreground">
                {isRtl ? "خدمة ما بعد البيع والضمان" : "After-Sales & Warranty CRM"}
              </h1>
              <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider">
                PeleCanon Support
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isRtl
                ? "إدارة الشكاوى، بلاغات الصيانة، مطالبات الضمان، وربطها بالورشة والمهام الميدانية"
                : "Manage customer complaints, maintenance requests, warranty claims, and linked operational tasks"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={loadData}
            disabled={loading}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>{isRtl ? "تحديث" : "Refresh"}</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
            className="h-8 gap-1.5 text-xs font-semibold shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{isRtl ? "+ فتح بلاغ بعد البيع" : "+ New Service Case"}</span>
          </Button>
        </div>
      </div>

      {/* Schema Pending Alert */}
      {schemaError && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200 flex items-start gap-3 shadow-sm">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="space-y-1 text-xs">
            <div className="font-semibold text-sm">
              {isRtl ? "تنبيه قاعدة البيانات: يلزم تطبيق الترحيل (Migration Pending)" : "Database Notice: Migration Pending"}
            </div>
            <p className="font-mono text-[11px] opacity-90">{schemaError}</p>
            <p className="text-muted-foreground text-[11px]">
              {isRtl
                ? "جداول خدمة ما بعد البيع (service_cases) غير مهيأة في قاعدة البيانات الحالية. يلزم تطبيق حزمة الترحيل المجمعة لتفعيل التخزين الدائم."
                : "The Service Cases database tables are not provisioned yet. The consolidated schema migration must be applied to activate persistent storage."}
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* 1. Open Cases */}
        <Card className="shadow-none border bg-card">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
              <span>{isRtl ? "البلاغات المفتوحة" : "Open Cases"}</span>
              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold font-mono text-foreground">
              {metrics?.openCases ?? "—"}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {isRtl ? "تتطلب متابعة" : "Require attention"}
            </span>
          </CardContent>
        </Card>

        {/* 2. Complaints */}
        <Card className="shadow-none border bg-card">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
              <span>{isRtl ? "الشكاوى" : "Complaints"}</span>
              <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold font-mono text-rose-600">
              {metrics?.complaintsCount ?? "—"}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {isRtl ? "بلاغات عيوب وشكاوى" : "Reported issues"}
            </span>
          </CardContent>
        </Card>

        {/* 3. Warranty */}
        <Card className="shadow-none border bg-card">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
              <span>{isRtl ? "مطالبات الضمان" : "Warranty"}</span>
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold font-mono text-emerald-600">
              {metrics?.warrantyCasesCount ?? "—"}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {isRtl ? "خدمة تحت الضمان" : "Under warranty"}
            </span>
          </CardContent>
        </Card>

        {/* 4. In Progress */}
        <Card className="shadow-none border bg-card">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
              <span>{isRtl ? "قيد التنفيذ" : "In Progress"}</span>
              <Wrench className="h-3.5 w-3.5 text-orange-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold font-mono text-orange-600">
              {metrics?.inProgressCount ?? "—"}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {isRtl ? "جاري التعامل معها" : "Active workshop/site"}
            </span>
          </CardContent>
        </Card>

        {/* 5. Resolved */}
        <Card className="shadow-none border bg-card">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
              <span>{isRtl ? "تم حلها وإغلاقها" : "Resolved"}</span>
              <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold font-mono text-foreground">
              {metrics?.resolvedCount ?? "—"}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {isRtl ? "حالات مكتملة" : "Completed cases"}
            </span>
          </CardContent>
        </Card>

        {/* 6. Repeat Opportunities */}
        <Card className="shadow-none border bg-card border-primary/20 bg-primary/5">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[11px] font-medium text-primary flex items-center justify-between">
              <span>{isRtl ? "تكرار التعامل" : "Repeat Deals"}</span>
              <Layers className="h-3.5 w-3.5 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold font-mono text-primary">
              {metrics?.repeatOpportunityCount ?? "—"}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {isRtl ? "فرص عملاء سابقين" : "Customer retention"}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Tabs & Search Filter Controls */}
      <div className="space-y-3">
        <Tabs value={activeTab} onValueChange={(t) => { setActiveTab(t); setPage(1); }}>
          <TabsList className="h-9 bg-muted/60 p-1">
            <TabsTrigger value="all" className="text-xs">
              {isRtl ? "كافة البلاغات" : "All Cases"}
            </TabsTrigger>
            <TabsTrigger value="complaint" className="text-xs">
              {isRtl ? "الشكاوى" : "Complaints"}
            </TabsTrigger>
            <TabsTrigger value="warranty" className="text-xs">
              {isRtl ? "الضمان" : "Warranty"}
            </TabsTrigger>
            <TabsTrigger value="service" className="text-xs">
              {isRtl ? "الصيانة والخدمة" : "Service & Maintenance"}
            </TabsTrigger>
            <TabsTrigger value="open" className="text-xs">
              {isRtl ? "المفتوحة والجديدة" : "Open / New"}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-3 rounded-xl border">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-2.5 rtl:left-auto rtl:right-3" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={
                  isRtl
                    ? "بحث برقم البلاغ، اسم العميل، رقم الطلب..."
                    : "Search by case #, customer, order #..."
                }
                className="h-8 text-xs pl-8 rtl:pl-3 rtl:pr-8 bg-background"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary" className="h-8 text-xs">
              {isRtl ? "بحث" : "Search"}
            </Button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedStatus} onValueChange={(v) => { setSelectedStatus(v); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs w-32">
                <SelectValue placeholder={isRtl ? "الحالة..." : "Status..."} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">{isRtl ? "كل الحالات" : "All Status"}</SelectItem>
                <SelectItem value="new" className="text-xs">{isRtl ? "جديد" : "New"}</SelectItem>
                <SelectItem value="under_review" className="text-xs">{isRtl ? "قيد المراجعة" : "Under Review"}</SelectItem>
                <SelectItem value="assigned" className="text-xs">{isRtl ? "تم التعيين" : "Assigned"}</SelectItem>
                <SelectItem value="in_progress" className="text-xs">{isRtl ? "جاري المتابعة" : "In Progress"}</SelectItem>
                <SelectItem value="waiting_customer" className="text-xs">{isRtl ? "بانتظار العميل" : "Waiting Customer"}</SelectItem>
                <SelectItem value="resolved" className="text-xs">{isRtl ? "تم الحل" : "Resolved"}</SelectItem>
                <SelectItem value="closed" className="text-xs">{isRtl ? "مغلق" : "Closed"}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedPriority} onValueChange={(v) => { setSelectedPriority(v); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs w-28">
                <SelectValue placeholder={isRtl ? "الأهمية..." : "Priority..."} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">{isRtl ? "كل الأولويات" : "All Priorities"}</SelectItem>
                <SelectItem value="low" className="text-xs">{isRtl ? "منخفضة" : "Low"}</SelectItem>
                <SelectItem value="medium" className="text-xs">{isRtl ? "متوسطة" : "Medium"}</SelectItem>
                <SelectItem value="high" className="text-xs">{isRtl ? "عالية" : "High"}</SelectItem>
                <SelectItem value="critical" className="text-xs">{isRtl ? "حرجة" : "Critical"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Main Cases Table */}
      <div className="border rounded-xl bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="text-xs font-semibold">{isRtl ? "رقم البلاغ" : "Case #"}</TableHead>
              <TableHead className="text-xs font-semibold">{isRtl ? "العميل" : "Customer"}</TableHead>
              <TableHead className="text-xs font-semibold">{isRtl ? "الموضوع" : "Title"}</TableHead>
              <TableHead className="text-xs font-semibold">{isRtl ? "النوع" : "Type"}</TableHead>
              <TableHead className="text-xs font-semibold">{isRtl ? "الأولوية" : "Priority"}</TableHead>
              <TableHead className="text-xs font-semibold">{isRtl ? "الحالة" : "Status"}</TableHead>
              <TableHead className="text-xs font-semibold">{isRtl ? "الطلب المرتبط" : "Order"}</TableHead>
              <TableHead className="text-xs font-semibold">{isRtl ? "التاريخ" : "Date"}</TableHead>
              <TableHead className="text-xs font-semibold text-right rtl:text-left">{isRtl ? "إجراءات" : "Actions"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-xs text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCcw className="h-4 w-4 animate-spin text-primary" />
                    <span>{isRtl ? "جاري تحميل البلاغات..." : "Loading cases..."}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : schemaError ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-xs text-amber-600 dark:text-amber-400 font-medium">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
                  <div className="font-semibold text-sm mb-1">
                    {isRtl ? "جداول قاعدة البيانات غير مهيأة" : "Database Schema Not Initialized"}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono max-w-md mx-auto">
                    {schemaError}
                  </div>
                </TableCell>
              </TableRow>
            ) : cases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-xs text-muted-foreground">
                  {isRtl ? "لا توجد بلاغات مسجلة تطابق معايير البحث" : "No service cases found"}
                </TableCell>
              </TableRow>
            ) : (
              cases.map((c) => (
                <TableRow
                  key={c.id}
                  onClick={() => handleOpenCase(c.id)}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <TableCell className="font-mono font-bold text-xs text-primary">
                    {c.caseNumber}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      <div className="font-semibold text-xs text-foreground">{c.customerName}</div>
                      {c.customerPhone && (
                        <div className="text-[11px] text-muted-foreground font-mono" dir="ltr">
                          {c.customerPhone}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs font-medium text-foreground">
                    {c.title}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] uppercase font-mono">
                      {c.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[10px] capitalize ${
                        c.priority === "critical"
                          ? "border-rose-500 text-rose-600 bg-rose-50"
                          : c.priority === "high"
                          ? "border-amber-500 text-amber-600 bg-amber-50"
                          : ""
                      }`}
                    >
                      {c.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] capitalize ${getStatusBadgeClass(c.status)}`}>
                      {getStatusLabel(c.status, isRtl)}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {c.orderNumber || "—"}
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground font-mono">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right rtl:text-left" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end rtl:justify-start gap-1">
                      {c.customerPhone && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleWhatsApp(c.customerPhone)}
                          className="h-7 w-7 text-emerald-600 hover:bg-emerald-50"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenCase(c.id)}
                        className="h-7 text-xs text-primary"
                      >
                        {isRtl ? "تفاصيل" : "View"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div className="p-3 border-t flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {isRtl ? `إجمالي: ${totalCount} بلاغ` : `Total: ${totalCount} cases`}
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p: number) => Math.max(1, p - 1))}
                className="h-7 text-xs"
              >
                {isRtl ? "السابق" : "Previous"}
              </Button>
              <span className="px-2 font-mono text-foreground">
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))}
                className="h-7 text-xs"
              >
                {isRtl ? "التالي" : "Next"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Case Details Drawer */}
      <ServiceCaseDetailDrawer
        caseId={selectedCaseId}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onRefreshList={loadData}
      />

      {/* Create Case Modal */}
      <CreateServiceCaseModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onSuccess={() => {
          loadData();
        }}
      />
    </div>
  );
}

function getStatusBadgeClass(status: ServiceCaseStatus): string {
  switch (status) {
    case "new":
      return "bg-blue-500/10 text-blue-600 border-blue-500/30";
    case "under_review":
      return "bg-amber-500/10 text-amber-600 border-amber-500/30";
    case "assigned":
      return "bg-purple-500/10 text-purple-600 border-purple-500/30";
    case "in_progress":
      return "bg-orange-500/10 text-orange-600 border-orange-500/30";
    case "waiting_customer":
      return "bg-indigo-500/10 text-indigo-600 border-indigo-500/30";
    case "resolved":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
    case "closed":
      return "bg-muted text-muted-foreground border-muted";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getStatusLabel(status: ServiceCaseStatus, isRtl?: boolean): string {
  switch (status) {
    case "new":
      return isRtl ? "جديد" : "New";
    case "under_review":
      return isRtl ? "قيد المراجعة" : "Under Review";
    case "assigned":
      return isRtl ? "تم التعيين" : "Assigned";
    case "in_progress":
      return isRtl ? "جاري المتابعة" : "In Progress";
    case "waiting_customer":
      return isRtl ? "بانتظار العميل" : "Waiting Customer";
    case "resolved":
      return isRtl ? "تم الحل" : "Resolved";
    case "closed":
      return isRtl ? "مغلق" : "Closed";
    default:
      return status;
  }
}
