import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/useAuth";
import { listRemakes } from "@/lib/remakes.functions";
import type {
  RemakeListItem,
  RemakeType,
  RemakeSeverity,
  RemakeStatus,
  PaginatedRemakesResult,
} from "@/lib/remake-types";
import { RemakeDetailDrawer } from "@/components/remakes/RemakeDetailDrawer";
import { CreateRemakeModal } from "@/components/remakes/CreateRemakeModal";
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
  ShieldAlert,
  Plus,
  Search,
  SlidersHorizontal,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Wrench,
  Package,
} from "lucide-react";

export const Route = createFileRoute("/admin/remakes")({
  component: RemakesPage,
});

function RemakesPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const { currentRole } = useAuth();
  const listRemakesFn = useServerFn(listRemakes);

  // Search, Filter, Sort, Pagination state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "severity_desc" | "remake_number">("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modals & Drawers
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedRemakeId, setSelectedRemakeId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // TanStack Query for paginated remakes
  const { data: result, isLoading, refetch } = useQuery({
    queryKey: [
      "remakes-list",
      searchTerm,
      statusFilter,
      severityFilter,
      typeFilter,
      sort,
      page,
      pageSize,
    ],
    queryFn: async () => {
      const res = await listRemakesFn({
        data: {
          search: searchTerm || undefined,
          status: statusFilter,
          severity: severityFilter,
          type: typeFilter,
          sort,
          page,
          pageSize,
        },
      });
      return (res as unknown as PaginatedRemakesResult) || {
        rows: [],
        totalCount: 0,
        page: 1,
        pageSize: 25,
        totalPages: 1,
        kpis: {
          totalCases: 0,
          openCases: 0,
          underReview: 0,
          inRemake: 0,
          qcPending: 0,
          resolved: 0,
          warrantyCases: 0,
        },
      };
    },
  });

  const remakesList = result?.rows || [];
  const totalCount = result?.totalCount || 0;
  const totalPages = result?.totalPages || 1;
  const kpis = result?.kpis || {
    totalCases: 0,
    openCases: 0,
    underReview: 0,
    inRemake: 0,
    qcPending: 0,
    resolved: 0,
    warrantyCases: 0,
  };

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setPage(1);
  };

  const handleStatusFilterChange = (newStatus: string) => {
    setStatusFilter(newStatus);
    setPage(1);
  };

  const handleSeverityFilterChange = (newSev: string) => {
    setSeverityFilter(newSev);
    setPage(1);
  };

  const handleTypeFilterChange = (newType: string) => {
    setTypeFilter(newType);
    setPage(1);
  };

  const handleSortChange = (newSort: any) => {
    setSort(newSort);
    setPage(1);
  };

  const handlePageSizeChange = (newSizeStr: string) => {
    setPageSize(Number(newSizeStr));
    setPage(1);
  };

  const handleOpenDetail = (remakeId: string) => {
    setSelectedRemakeId(remakeId);
    setIsDetailOpen(true);
  };

  const getSeverityBadgeClass = (sev: string) => {
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

  const getStatusBadgeClass = (status: RemakeStatus) => {
    switch (status) {
      case "resolved":
        return "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400";
      case "approved":
      case "in_remake":
      case "qc_pending":
        return "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-400";
      case "under_review":
      case "reported":
        return "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400";
      case "rejected":
      case "cancelled":
        return "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-400";
    }
  };

  const statuses = [
    { key: "all", labelAr: "الكل", labelEn: "All" },
    { key: "reported", labelAr: "بلاغ جديد", labelEn: "Reported" },
    { key: "under_review", labelAr: "قيد المراجعة", labelEn: "Under Review" },
    { key: "approved", labelAr: "معتمد", labelEn: "Approved" },
    { key: "in_remake", labelAr: "قيد إعادة التصنيع", labelEn: "In Remake" },
    { key: "qc_pending", labelAr: "بانتظار الفحص", labelEn: "QC Pending" },
    { key: "resolved", labelAr: "تم الحل", labelEn: "Resolved" },
    { key: "rejected", labelAr: "مرفوض", labelEn: "Rejected" },
  ];

  const startRecord = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRecord = Math.min(page * pageSize, totalCount);

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2.5 text-foreground">
            <ShieldAlert className="h-7 w-7 text-primary" />
            <span>{isRtl ? "إدارة الجودة وإعادة التصنيع والضمان" : "Quality, Remakes & Warranty"}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isRtl
              ? "متابعة عيوب التصنيع، فشل الفحص الفني، طلبات الاستبدال، ومطالبات الضمان"
              : "Track manufacturing defects, QC check rejections, replacement orders, and warranty claims"}
          </p>
        </div>

        {currentRole !== "viewer" && (
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="gap-2 bg-primary text-primary-foreground font-semibold shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>{isRtl ? "تسجيل عيب فني" : "Report Defect / Case"}</span>
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <Card className="border rounded-2xl p-4 shadow-xs">
          <div className="text-xs text-muted-foreground">{isRtl ? "إجمالي الحالات" : "Total Cases"}</div>
          <div className="text-2xl font-bold font-mono mt-1 text-foreground">{kpis.totalCases}</div>
        </Card>

        <Card className="border rounded-2xl p-4 shadow-xs">
          <div className="text-xs text-amber-700 dark:text-amber-400 font-medium">{isRtl ? "بلاغات جديدة" : "Open Cases"}</div>
          <div className="text-2xl font-bold font-mono mt-1 text-amber-700 dark:text-amber-400">{kpis.openCases}</div>
        </Card>

        <Card className="border rounded-2xl p-4 shadow-xs">
          <div className="text-xs text-blue-700 dark:text-blue-400 font-medium">{isRtl ? "قيد المراجعة" : "Under Review"}</div>
          <div className="text-2xl font-bold font-mono mt-1 text-blue-700 dark:text-blue-400">{kpis.underReview}</div>
        </Card>

        <Card className="border rounded-2xl p-4 shadow-xs">
          <div className="text-xs text-purple-700 dark:text-purple-400 font-medium">{isRtl ? "إعادة تصنيع" : "In Remake"}</div>
          <div className="text-2xl font-bold font-mono mt-1 text-purple-700 dark:text-purple-400">{kpis.inRemake}</div>
        </Card>

        <Card className="border rounded-2xl p-4 shadow-xs">
          <div className="text-xs text-cyan-700 dark:text-cyan-400 font-medium">{isRtl ? "فحص الجودة" : "QC Pending"}</div>
          <div className="text-2xl font-bold font-mono mt-1 text-cyan-700 dark:text-cyan-400">{kpis.qcPending}</div>
        </Card>

        <Card className="border rounded-2xl p-4 shadow-xs bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/60">
          <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">{isRtl ? "تم الحل والإغلاق" : "Resolved"}</div>
          <div className="text-2xl font-bold font-mono mt-1 text-emerald-700 dark:text-emerald-400">{kpis.resolved}</div>
        </Card>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-card border rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 sm:max-w-md">
            <Search className="absolute right-3 rtl:right-3 rtl:left-auto left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={isRtl ? "بحث برقم الحالة، رقم الطلب، العميل، الهاتف..." : "Search case #, order #, customer, phone..."}
              className="pr-9 rtl:pr-9 rtl:pl-3 pl-9 h-9 text-sm rounded-lg"
            />
          </div>

          {/* Type & Severity Selects */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Severity Filter */}
            <Select value={severityFilter} onValueChange={handleSeverityFilterChange}>
              <SelectTrigger className="w-32 h-9 text-xs rounded-lg">
                <SelectValue placeholder={isRtl ? "الخطورة" : "Severity"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isRtl ? "كل درجات الخطورة" : "All Severities"}</SelectItem>
                <SelectItem value="low">{isRtl ? "منخفضة (Low)" : "Low"}</SelectItem>
                <SelectItem value="medium">{isRtl ? "متوسطة (Medium)" : "Medium"}</SelectItem>
                <SelectItem value="high">{isRtl ? "عالية (High)" : "High"}</SelectItem>
                <SelectItem value="critical">{isRtl ? "حرجة (Critical)" : "Critical"}</SelectItem>
              </SelectContent>
            </Select>

            {/* Type Filter */}
            <Select value={typeFilter} onValueChange={handleTypeFilterChange}>
              <SelectTrigger className="w-36 h-9 text-xs rounded-lg">
                <SelectValue placeholder={isRtl ? "نوع الحالة" : "Case Type"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isRtl ? "كل الأنواع" : "All Types"}</SelectItem>
                <SelectItem value="qc_failure">{isRtl ? "فشل فحص QC" : "QC Failure"}</SelectItem>
                <SelectItem value="manufacturing_defect">{isRtl ? "عيب تصنيع" : "Mfg Defect"}</SelectItem>
                <SelectItem value="customer_complaint">{isRtl ? "شكوى عميل" : "Complaint"}</SelectItem>
                <SelectItem value="warranty">{isRtl ? "مطالبة ضمان" : "Warranty"}</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort Select */}
            <Select value={sort} onValueChange={handleSortChange}>
              <SelectTrigger className="w-36 h-9 text-xs rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">{isRtl ? "الأحدث أولاً" : "Newest"}</SelectItem>
                <SelectItem value="oldest">{isRtl ? "الأقدم أولاً" : "Oldest"}</SelectItem>
                <SelectItem value="severity_desc">{isRtl ? "الأعلى خطورة" : "Highest Severity"}</SelectItem>
                <SelectItem value="remake_number">{isRtl ? "رقم الحالة" : "Case Number"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Status Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/60">
          {statuses.map((s) => (
            <button
              key={s.key}
              onClick={() => handleStatusFilterChange(s.key)}
              className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                statusFilter === s.key
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {isRtl ? s.labelAr : s.labelEn}
            </button>
          ))}
        </div>
      </div>

      {/* Remakes Table */}
      <Card className="border rounded-2xl shadow-xs overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>{isRtl ? "رقم الحالة" : "Case #"}</TableHead>
                <TableHead>{isRtl ? "طلب الإنتاج" : "Order #"}</TableHead>
                <TableHead>{isRtl ? "العميل" : "Customer"}</TableHead>
                <TableHead>{isRtl ? "نوع الحالة" : "Type"}</TableHead>
                <TableHead>{isRtl ? "الخطورة" : "Severity"}</TableHead>
                <TableHead>{isRtl ? "الخلل / السبب" : "Defect / Reason"}</TableHead>
                <TableHead>{isRtl ? "الحالة" : "Status"}</TableHead>
                <TableHead>{isRtl ? "التاريخ" : "Date"}</TableHead>
                <TableHead className="text-center w-24">{isRtl ? "الإجراءات" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground text-xs">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>{isRtl ? "جاري تحميل سجلات الجودة..." : "Loading quality cases..."}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : remakesList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-16 text-muted-foreground text-xs">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <ShieldAlert className="h-8 w-8 text-muted-foreground/50" />
                      <span className="font-semibold text-sm">
                        {isRtl ? "لم يتم العثور على حالات مطابقة" : "No quality cases found"}
                      </span>
                      <span className="text-muted-foreground/80">
                        {isRtl ? "جرب تغيير مصطلح البحث أو الفلتر" : "Try adjusting your search or filter criteria"}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                remakesList.map((r) => (
                  <TableRow
                    key={r.id}
                    className="hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => handleOpenDetail(r.id)}
                  >
                    {/* Remake Number */}
                    <TableCell className="font-mono text-xs font-bold text-primary">
                      {r.remakeNumber}
                    </TableCell>

                    {/* Order Number */}
                    <TableCell className="font-mono text-xs text-foreground font-semibold">
                      <Link
                        to="/admin/orders"
                        search={{ orderId: r.orderId }}
                        className="hover:underline flex items-center gap-1 text-primary"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.orderNumber}
                      </Link>
                    </TableCell>

                    {/* Customer */}
                    <TableCell className="text-xs text-foreground">
                      <div>
                        <div className="font-medium">{r.customerName || "—"}</div>
                        {r.customerPhone && (
                          <div className="font-mono text-[11px] text-muted-foreground">{r.customerPhone}</div>
                        )}
                      </div>
                    </TableCell>

                    {/* Type */}
                    <TableCell className="text-xs">
                      <span className="capitalize text-muted-foreground font-medium">
                        {r.type.replace("_", " ")}
                      </span>
                    </TableCell>

                    {/* Severity */}
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] uppercase ${getSeverityBadgeClass(r.severity)}`}>
                        {r.severity}
                      </Badge>
                    </TableCell>

                    {/* Reason */}
                    <TableCell className="text-xs max-w-xs">
                      <div className="truncate font-medium text-foreground">{r.reason}</div>
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] capitalize font-medium ${getStatusBadgeClass(r.status)}`}>
                        {r.status.replace("_", " ")}
                      </Badge>
                    </TableCell>

                    {/* Date */}
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString(isRtl ? "ar-EG" : "en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenDetail(r.id)}
                        className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                      >
                        <span>{isRtl ? "عرض" : "View"}</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Bottom Pagination Bar */}
          <div className="p-3.5 bg-muted/20 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            {/* Record count info */}
            <div>
              {isRtl
                ? `عرض ${startRecord} إلى ${endRecord} من إجمالي ${totalCount} حالة`
                : `Showing ${startRecord}–${endRecord} of ${totalCount} cases`}
            </div>

            {/* Pagination Controls & Page Size */}
            <div className="flex items-center gap-3">
              {/* Page Size Selector */}
              <div className="flex items-center gap-1.5">
                <span>{isRtl ? "لكل صفحة:" : "Per page:"}</span>
                <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                  <SelectTrigger className="h-7 w-16 text-xs rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Page navigation buttons */}
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  onClick={() => setPage(1)}
                  disabled={page <= 1 || isLoading}
                  title={isRtl ? "الصفحة الأولى" : "First Page"}
                >
                  {isRtl ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || isLoading}
                  title={isRtl ? "الصفحة السابقة" : "Previous Page"}
                >
                  {isRtl ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                </Button>

                <span className="px-2 font-medium text-foreground">
                  {page} / {totalPages}
                </span>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || isLoading}
                  title={isRtl ? "الصفحة التالية" : "Next Page"}
                >
                  {isRtl ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  onClick={() => setPage(totalPages)}
                  disabled={page >= totalPages || isLoading}
                  title={isRtl ? "الصفحة الأخيرة" : "Last Page"}
                >
                  {isRtl ? <ChevronsLeft className="h-3.5 w-3.5" /> : <ChevronsRight className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create Remake Modal */}
      <CreateRemakeModal
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={() => refetch()}
      />

      {/* Remake Detail Drawer */}
      <RemakeDetailDrawer
        remakeId={selectedRemakeId}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onUpdated={() => refetch()}
        userRole={currentRole || undefined}
      />
    </div>
  );
}