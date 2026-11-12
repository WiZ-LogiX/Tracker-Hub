import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/useAuth";
import { listDeliveries } from "@/lib/delivery.functions";
import type {
  DeliveryHandover,
  DeliveryStatus,
  PaginatedDeliveryResult,
  DeliveryKpis,
} from "@/lib/delivery-types";
import { DeliveryDetailDrawer } from "@/components/deliveries/DeliveryDetailDrawer";
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
  Truck,
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
  MapPin,
  Wrench,
  PenTool,
} from "lucide-react";

export const Route = createFileRoute("/admin/deliveries")({
  component: DeliveriesPage,
});

function DeliveriesPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const { currentRole } = useAuth();
  const listDeliveriesFn = useServerFn(listDeliveries);

  // Search, Filter, Sort, Pagination state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [installationFilter, setInstallationFilter] = useState<boolean | undefined>(undefined);
  const [sort, setSort] = useState<"newest" | "del_asc" | "scheduled_asc" | "order_asc">("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Detail Drawer
  const [selectedDelId, setSelectedDelId] = useState<string | null>(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);

  // Query
  const { data: result, isLoading, refetch } = useQuery({
    queryKey: [
      "deliveries-list",
      searchTerm,
      statusFilter,
      installationFilter,
      sort,
      page,
      pageSize,
    ],
    queryFn: async () => {
      const res = await listDeliveriesFn({
        data: {
          search: searchTerm || undefined,
          status: statusFilter,
          installationRequired: installationFilter,
          sort,
          page,
          pageSize,
        },
      });
      return (res as unknown as PaginatedDeliveryResult) || {
        rows: [],
        totalCount: 0,
        page: 1,
        pageSize: 25,
        totalPages: 1,
        kpis: {
          totalDeliveries: 0,
          readyForDispatch: 0,
          dispatched: 0,
          outForDelivery: 0,
          installationPending: 0,
          handoverPending: 0,
          completed: 0,
        },
      };
    },
  });

  const deliveriesList = result?.rows || [];
  const totalCount = result?.totalCount || 0;
  const totalPages = result?.totalPages || 1;
  const kpis = result?.kpis || {
    totalDeliveries: 0,
    readyForDispatch: 0,
    dispatched: 0,
    outForDelivery: 0,
    installationPending: 0,
    handoverPending: 0,
    completed: 0,
  };

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setPage(1);
  };

  const handleStatusFilterChange = (newStatus: string) => {
    setStatusFilter(newStatus);
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

  const handleOpenDetail = (delId: string) => {
    setSelectedDelId(delId);
    setIsDetailDrawerOpen(true);
  };

  const getStatusBadge = (status: DeliveryStatus) => {
    switch (status) {
      case "ready_for_dispatch":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "dispatched":
        return "bg-amber-50 text-amber-700 border-amber-300";
      case "out_for_delivery":
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case "delivered":
        return "bg-teal-50 text-teal-700 border-teal-300";
      case "installation_pending":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "installed":
        return "bg-emerald-50 text-emerald-700 border-emerald-300";
      case "handover_pending":
        return "bg-amber-50 text-amber-800 border-amber-300";
      case "completed":
        return "bg-emerald-100 text-emerald-800 border-emerald-400 font-bold";
      case "delivery_failed":
        return "bg-rose-50 text-rose-700 border-rose-300 font-bold";
      case "cancelled":
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
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2.5 text-foreground">
            <Truck className="h-7 w-7 text-primary" />
            <span>{isRtl ? "الشحن، التوصيل، ومحاضر الاستلام" : "Dispatch, Delivery & Handover"}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isRtl
              ? "متابعة خروج الشحنات من المصنع، رحلات التوصيل، التركيبات، وتوقيع العميل النهائي"
              : "Track factory dispatch, delivery runs, on-site installations, and customer sign-off"}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="border rounded-2xl p-4 shadow-xs">
          <div className="text-xs text-muted-foreground">{isRtl ? "إجمالي الشحنات" : "Total Deliveries"}</div>
          <div className="text-2xl font-bold font-mono mt-1 text-foreground">{kpis.totalDeliveries}</div>
        </Card>

        <Card className="border rounded-2xl p-4 shadow-xs bg-blue-50/40 dark:bg-blue-950/20 border-blue-200/60">
          <div className="text-xs text-blue-700 dark:text-blue-400 font-medium">{isRtl ? "جاهزة للشحن" : "Ready for Dispatch"}</div>
          <div className="text-2xl font-bold font-mono mt-1 text-blue-700 dark:text-blue-400">{kpis.readyForDispatch}</div>
        </Card>

        <Card className="border rounded-2xl p-4 shadow-xs bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-200/60">
          <div className="text-xs text-indigo-700 dark:text-indigo-400 font-medium">{isRtl ? "في طريقها للعميل" : "Out for Delivery"}</div>
          <div className="text-2xl font-bold font-mono mt-1 text-indigo-700 dark:text-indigo-400">{kpis.outForDelivery}</div>
        </Card>

        <Card className="border rounded-2xl p-4 shadow-xs bg-purple-50/40 dark:bg-purple-950/20 border-purple-200/60">
          <div className="text-xs text-purple-700 dark:text-purple-400 font-medium">{isRtl ? "قيد التركيب بالموقع" : "Installation Pending"}</div>
          <div className="text-2xl font-bold font-mono mt-1 text-purple-700 dark:text-purple-400">{kpis.installationPending}</div>
        </Card>

        <Card className="border rounded-2xl p-4 shadow-xs bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/60">
          <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">{isRtl ? "تم الاستلام والتوقيع" : "Completed Handover"}</div>
          <div className="text-2xl font-bold font-mono mt-1 text-emerald-700 dark:text-emerald-400">{kpis.completed}</div>
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
              placeholder={isRtl ? "بحث برقم الشحنة، أمر البيع، العميل، العنوان..." : "Search Delivery#, order#, customer, address..."}
              className="pr-9 rtl:pr-9 rtl:pl-3 pl-9 h-9 text-sm rounded-lg"
            />
          </div>

          {/* Sort Select */}
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={sort} onValueChange={handleSortChange}>
              <SelectTrigger className="w-40 h-9 text-xs rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">{isRtl ? "الأحدث" : "Newest"}</SelectItem>
                <SelectItem value="del_asc">{isRtl ? "رقم الشحنة" : "Delivery #"}</SelectItem>
                <SelectItem value="scheduled_asc">{isRtl ? "الموعد المجدول" : "Scheduled Date"}</SelectItem>
                <SelectItem value="order_asc">{isRtl ? "رقم أمر البيع" : "Order #"}</SelectItem>
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
            {isRtl ? "كافة الشحنات" : "All Deliveries"}
          </button>
          <button
            onClick={() => handleStatusFilterChange("ready_for_dispatch")}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
              statusFilter === "ready_for_dispatch"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {isRtl ? "جاهز للشحن" : "Ready for Dispatch"}
          </button>
          <button
            onClick={() => handleStatusFilterChange("out_for_delivery")}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
              statusFilter === "out_for_delivery"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {isRtl ? "في الطريق للعميل" : "Out for Delivery"}
          </button>
          <button
            onClick={() => handleStatusFilterChange("installation_pending")}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
              statusFilter === "installation_pending"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {isRtl ? "قيد التركيب" : "Installing"}
          </button>
          <button
            onClick={() => handleStatusFilterChange("completed")}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
              statusFilter === "completed"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {isRtl ? "تم الاستلام والتوقيع" : "Completed"}
          </button>

          <button
            onClick={() => setInstallationFilter(installationFilter === true ? undefined : true)}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ml-auto rtl:ml-0 rtl:mr-auto ${
              installationFilter === true
                ? "bg-purple-600 text-white shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {isRtl ? "يتطلب تركيب فقط" : "Requires Installation Only"}
          </button>
        </div>
      </div>

      {/* Deliveries Table */}
      <Card className="border rounded-2xl shadow-xs overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>{isRtl ? "رقم الشحنة" : "Delivery #"}</TableHead>
                <TableHead>{isRtl ? "أمر البيع" : "Order #"}</TableHead>
                <TableHead>{isRtl ? "العميل" : "Customer"}</TableHead>
                <TableHead>{isRtl ? "عنوان التوصيل" : "Delivery Address"}</TableHead>
                <TableHead>{isRtl ? "الحالة" : "Status"}</TableHead>
                <TableHead>{isRtl ? "التوقيع" : "Sign-Off"}</TableHead>
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
                      <span>{isRtl ? "جاري تحميل الشحنات..." : "Loading deliveries..."}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : deliveriesList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16 text-muted-foreground text-xs">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Truck className="h-8 w-8 text-muted-foreground/50" />
                      <span className="font-semibold text-sm">
                        {isRtl ? "لم يتم العثور على أذونات تسليم مطابقة" : "No delivery records found"}
                      </span>
                      <span className="text-muted-foreground/80">
                        {isRtl ? "يمكنك تجهيز إذن تسليم جديد من تفاصيل أمر البيع" : "You can prepare deliveries from Order Detail"}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                deliveriesList.map((del) => (
                  <TableRow
                    key={del.id}
                    onClick={() => handleOpenDetail(del.id)}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    {/* Delivery Number */}
                    <TableCell className="font-mono text-xs font-bold text-primary">
                      {del.deliveryNumber}
                    </TableCell>

                    {/* Order Number */}
                    <TableCell className="font-mono text-xs text-foreground font-medium">
                      {del.orderNumber}
                    </TableCell>

                    {/* Customer */}
                    <TableCell className="text-xs">
                      <div className="font-medium text-foreground">{del.customerName}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{del.customerPhone}</div>
                    </TableCell>

                    {/* Address */}
                    <TableCell className="text-xs max-w-xs truncate text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0 text-primary" />
                        <span className="truncate">{del.deliveryAddress}</span>
                      </div>
                    </TableCell>

                    {/* Status */}
                    <TableCell className="text-xs">
                      <Badge variant="outline" className={`text-[10px] capitalize ${getStatusBadge(del.status)}`}>
                        {del.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>

                    {/* Signature */}
                    <TableCell className="text-xs">
                      {del.signatureDataUrl ? (
                        <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-300 gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          <span>{isRtl ? "موقع" : "Signed"}</span>
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/60">{isRtl ? "في الانتظار" : "Pending"}</span>
                      )}
                    </TableCell>

                    {/* Scheduled */}
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {del.scheduledDate || "—"}
                    </TableCell>

                    {/* Action */}
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDetail(del.id);
                        }}
                        className="h-7 text-xs text-primary font-semibold"
                      >
                        {isRtl ? "متابعة" : "View"}
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
                ? `عرض ${startRecord} إلى ${endRecord} من إجمالي ${totalCount} شحنة`
                : `Showing ${startRecord}–${endRecord} of ${totalCount} deliveries`}
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

      {/* Delivery Detail Drawer */}
      <DeliveryDetailDrawer
        deliveryId={selectedDelId}
        open={isDetailDrawerOpen}
        onOpenChange={setIsDetailDrawerOpen}
        userRole={currentRole || undefined}
        onStatusChanged={() => refetch()}
      />
    </div>
  );
}
