import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/useAuth";
import { listWorkOrders } from "@/lib/work-orders.functions";
import type {
  ProductionWorkOrder,
  WorkOrderStatus,
  WorkOrderPriority,
  PaginatedWorkOrderResult,
  WorkOrderKpis,
} from "@/lib/work-order-types";
import { WorkOrderDetailDrawer } from "@/components/work-orders/WorkOrderDetailDrawer";
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
  Hammer,
  Search,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Calendar,
  Layers,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/admin/work-orders")({
  component: WorkOrdersPage,
});

function WorkOrdersPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const { currentRole } = useAuth();
  const listWorkOrdersFn = useServerFn(listWorkOrders);

  // Search, Filter, Sort, Pagination state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [sort, setSort] = useState<"newest" | "wo_asc" | "priority_desc" | "scheduled_asc" | "order_asc">("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Detail Drawer
  const [selectedWoId, setSelectedWoId] = useState<string | null>(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);

  // Query
  const { data: result, isLoading, refetch } = useQuery({
    queryKey: [
      "work-orders-list",
      searchTerm,
      statusFilter,
      priorityFilter,
      sort,
      page,
      pageSize,
    ],
    queryFn: async () => {
      const res = await listWorkOrdersFn({
        data: {
          search: searchTerm || undefined,
          status: statusFilter,
          priority: priorityFilter,
          sort,
          page,
          pageSize,
        },
      });
      return (res as unknown as PaginatedWorkOrderResult) || {
        rows: [],
        totalCount: 0,
        page: 1,
        pageSize: 25,
        totalPages: 1,
        kpis: {
          totalWorkOrders: 0,
          readyCount: 0,
          inProgressCount: 0,
          qcPendingCount: 0,
          completedCount: 0,
        },
      };
    },
  });

  const workOrdersList = result?.rows || [];
  const totalCount = result?.totalCount || 0;
  const totalPages = result?.totalPages || 1;
  const kpis = result?.kpis || {
    totalWorkOrders: 0,
    readyCount: 0,
    inProgressCount: 0,
    qcPendingCount: 0,
    completedCount: 0,
  };

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setPage(1);
  };

  const handleStatusFilterChange = (newStatus: string) => {
    setStatusFilter(newStatus);
    setPage(1);
  };

  const handlePriorityFilterChange = (newPri: string) => {
    setPriorityFilter(newPri);
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

  const handleOpenDetail = (woId: string) => {
    setSelectedWoId(woId);
    setIsDetailDrawerOpen(true);
  };

  const getStatusBadge = (status: WorkOrderStatus) => {
    switch (status) {
      case "ready":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "in_progress":
        return "bg-amber-50 text-amber-700 border-amber-300";
      case "qc_pending":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "completed":
        return "bg-emerald-50 text-emerald-700 border-emerald-300";
      case "cancelled":
        return "bg-rose-50 text-rose-700 border-rose-200";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const startRecord = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRecord = Math.min(page * pageSize, totalCount);

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 border-b pb-5">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <Hammer className="h-7 w-7 text-primary" />
            <span>{isRtl ? "أوامر الشغل والتصنيع بالورشة" : "Production Work Orders"}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isRtl
              ? "إدارة حزم تشغيل الورشة، كشوف التقطيع (Cut Lists)، وحجوزات الخامات لأوامر الإنتاج"
              : "Factory execution work packages, cut lists, material allocations, and stage tracking"}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="border rounded-2xl p-4 shadow-xs">
          <div className="text-xs text-muted-foreground">{isRtl ? "إجمالي أوامر الشغل" : "Total Work Orders"}</div>
          <div className="text-2xl font-bold font-mono mt-1 text-foreground">{kpis.totalWorkOrders}</div>
        </Card>

        <Card className="border rounded-2xl p-4 shadow-xs bg-blue-50/40 dark:bg-blue-950/20 border-blue-200/60">
          <div className="text-xs text-blue-700 dark:text-blue-400 font-medium">{isRtl ? "جاهزة للتشغيل" : "Ready for Floor"}</div>
          <div className="text-2xl font-bold font-mono mt-1 text-blue-700 dark:text-blue-400">{kpis.readyCount}</div>
        </Card>

        <Card className="border rounded-2xl p-4 shadow-xs bg-amber-50/40 dark:bg-amber-950/20 border-amber-200/60">
          <div className="text-xs text-amber-700 dark:text-amber-400 font-medium">{isRtl ? "قيد التنفيذ بالورشة" : "In Progress"}</div>
          <div className="text-2xl font-bold font-mono mt-1 text-amber-700 dark:text-amber-400">{kpis.inProgressCount}</div>
        </Card>

        <Card className="border rounded-2xl p-4 shadow-xs bg-purple-50/40 dark:bg-purple-950/20 border-purple-200/60">
          <div className="text-xs text-purple-700 dark:text-purple-400 font-medium">{isRtl ? "في انتظار الفحص (QC)" : "QC Pending"}</div>
          <div className="text-2xl font-bold font-mono mt-1 text-purple-700 dark:text-purple-400">{kpis.qcPendingCount}</div>
        </Card>

        <Card className="border rounded-2xl p-4 shadow-xs bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/60">
          <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">{isRtl ? "مكتملة التصنيع" : "Completed"}</div>
          <div className="text-2xl font-bold font-mono mt-1 text-emerald-700 dark:text-emerald-400">{kpis.completedCount}</div>
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
              placeholder={isRtl ? "بحث برقم أمر الشغل، أمر البيع، العميل..." : "Search WO#, order#, customer..."}
              className="pr-9 rtl:pr-9 rtl:pl-3 pl-9 h-9 text-sm rounded-lg"
            />
          </div>

          {/* Priority & Sort Selects */}
          <div className="flex items-center gap-2">
            <Select value={priorityFilter} onValueChange={handlePriorityFilterChange}>
              <SelectTrigger className="w-32 h-9 text-xs rounded-lg">
                <SelectValue placeholder={isRtl ? "الأولوية" : "Priority"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isRtl ? "كافة الأولويات" : "All Priorities"}</SelectItem>
                <SelectItem value="low">{isRtl ? "منخفضة" : "Low"}</SelectItem>
                <SelectItem value="medium">{isRtl ? "متوسطة" : "Medium"}</SelectItem>
                <SelectItem value="high">{isRtl ? "عالية" : "High"}</SelectItem>
                <SelectItem value="critical">{isRtl ? "عاجلة جداً" : "Critical"}</SelectItem>
              </SelectContent>
            </Select>

            <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={sort} onValueChange={handleSortChange}>
              <SelectTrigger className="w-36 h-9 text-xs rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">{isRtl ? "الأحدث" : "Newest"}</SelectItem>
                <SelectItem value="wo_asc">{isRtl ? "رقم أمر الشغل" : "WO Number"}</SelectItem>
                <SelectItem value="scheduled_asc">{isRtl ? "الموعد المجدول" : "Scheduled Date"}</SelectItem>
                <SelectItem value="order_asc">{isRtl ? "رقم أمر البيع" : "Order Number"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/60">
          <button
            onClick={() => handleStatusFilterChange("all")}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
              statusFilter === "all"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {isRtl ? "كافة الحالات" : "All Statuses"}
          </button>
          <button
            onClick={() => handleStatusFilterChange("ready")}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
              statusFilter === "ready"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {isRtl ? "جاهز للتشغيل" : "Ready"}
          </button>
          <button
            onClick={() => handleStatusFilterChange("in_progress")}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
              statusFilter === "in_progress"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {isRtl ? "قيد التنفيذ" : "In Progress"}
          </button>
          <button
            onClick={() => handleStatusFilterChange("qc_pending")}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
              statusFilter === "qc_pending"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {isRtl ? "فحص الجودة (QC)" : "QC Pending"}
          </button>
          <button
            onClick={() => handleStatusFilterChange("completed")}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
              statusFilter === "completed"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {isRtl ? "مكتمل" : "Completed"}
          </button>
        </div>
      </div>

      {/* Work Orders Table */}
      <Card className="border rounded-2xl shadow-xs overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>{isRtl ? "رقم أمر الشغل" : "WO Number"}</TableHead>
                <TableHead>{isRtl ? "أمر البيع المرتبط" : "Order #"}</TableHead>
                <TableHead>{isRtl ? "العميل" : "Customer"}</TableHead>
                <TableHead>{isRtl ? "الأولوية" : "Priority"}</TableHead>
                <TableHead>{isRtl ? "مرحلة الإنتاج" : "Production Stage"}</TableHead>
                <TableHead>{isRtl ? "الحالة" : "Status"}</TableHead>
                <TableHead>{isRtl ? "الموعد المجدول" : "Scheduled"}</TableHead>
                <TableHead className="text-center w-28">{isRtl ? "الإجراءات" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-xs">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>{isRtl ? "جاري تحميل أوامر الشغل..." : "Loading work orders..."}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : workOrdersList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16 text-muted-foreground text-xs">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Hammer className="h-8 w-8 text-muted-foreground/50" />
                      <span className="font-semibold text-sm">
                        {isRtl ? "لم يتم العثور على أوامر شغل مطابقة" : "No work orders found"}
                      </span>
                      <span className="text-muted-foreground/80">
                        {isRtl ? "يمكنك إنشاء أمر شغل جديد من شاشة تفاصيل أمر البيع" : "You can create work orders from Order Detail"}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                workOrdersList.map((wo) => (
                  <TableRow
                    key={wo.id}
                    onClick={() => handleOpenDetail(wo.id)}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    {/* WO Number */}
                    <TableCell className="font-mono text-xs font-bold text-primary">
                      <div className="flex items-center gap-1.5">
                        <span>{wo.workOrderNumber}</span>
                        {wo.remakeNumber && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 bg-rose-50 text-rose-700 border-rose-300">
                            {wo.remakeNumber}
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Order Number */}
                    <TableCell className="font-mono text-xs text-foreground font-medium">
                      {wo.orderNumber}
                    </TableCell>

                    {/* Customer */}
                    <TableCell className="text-xs">
                      <div className="font-medium text-foreground">{wo.customerName}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{wo.customerPhone}</div>
                    </TableCell>

                    {/* Priority */}
                    <TableCell className="text-xs">
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase font-mono ${
                          wo.priority === "critical"
                            ? "bg-rose-100 text-rose-800 border-rose-300"
                            : wo.priority === "high"
                              ? "bg-amber-100 text-amber-800 border-amber-300"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {wo.priority}
                      </Badge>
                    </TableCell>

                    {/* Production Stage */}
                    <TableCell className="text-xs font-medium text-foreground capitalize">
                      {wo.currentStage}
                    </TableCell>

                    {/* Status */}
                    <TableCell className="text-xs">
                      <Badge variant="outline" className={`text-[10px] capitalize ${getStatusBadge(wo.status)}`}>
                        {wo.status.replace("_", " ")}
                      </Badge>
                    </TableCell>

                    {/* Scheduled Date */}
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {wo.scheduledDate || "—"}
                    </TableCell>

                    {/* Action */}
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDetail(wo.id);
                        }}
                        className="h-7 text-xs text-primary font-semibold"
                      >
                        {isRtl ? "كشف التشغيل" : "Package"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Bottom Pagination Bar */}
          <div className="p-3.5 bg-muted/20 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <div>
              {isRtl
                ? `عرض ${startRecord} إلى ${endRecord} من إجمالي ${totalCount} أمر شغل`
                : `Showing ${startRecord}–${endRecord} of ${totalCount} work orders`}
            </div>

            <div className="flex items-center gap-3">
              {/* Page Size */}
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

      {/* Work Order Detail Drawer */}
      <WorkOrderDetailDrawer
        workOrderId={selectedWoId}
        open={isDetailDrawerOpen}
        onOpenChange={setIsDetailDrawerOpen}
        userRole={currentRole || undefined}
        onStatusChanged={() => refetch()}
      />
    </div>
  );
}
