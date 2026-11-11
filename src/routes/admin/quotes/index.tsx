import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/useAuth";
import { listQuotations } from "@/lib/quote.functions";
import type {
  QuotationListItem,
  QuoteSortOption,
  QuoteStatusFilter,
  PaginatedQuotationsResult,
} from "@/lib/quote-list-types";
import { formatEGP } from "@/lib/pricing";
import { QuotationCostDrawer } from "@/components/cost-analysis/QuotationCostDrawer";
import { Card, CardContent } from "@/components/ui/card";
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
  Plus,
  Search,
  SlidersHorizontal,
  FileText,
  BarChart3,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Package,
  Briefcase,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/admin/quotes/")({
  component: QuotesPage,
});

function QuotesPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const { currentRole } = useAuth();
  const listQuotationsFn = useServerFn(listQuotations);

  // Search, Filter, Sort, Pagination state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuoteStatusFilter>("all");
  const [sort, setSort] = useState<QuoteSortOption>("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Cost Drawer state
  const [costQuoteId, setCostQuoteId] = useState<string | null>(null);
  const [isCostDrawerOpen, setIsCostDrawerOpen] = useState(false);

  // TanStack Query for paginated quotes
  const { data: paginationResult, isLoading, refetch } = useQuery({
    queryKey: ["quotations-list", searchTerm, statusFilter, sort, page, pageSize],
    queryFn: async () => {
      const res = await listQuotationsFn({
        data: {
          search: searchTerm || undefined,
          status: statusFilter,
          sort,
          page,
          pageSize,
        },
      });
      return (res as unknown as PaginatedQuotationsResult) || {
        rows: [],
        totalCount: 0,
        page: 1,
        pageSize: 25,
        totalPages: 1,
      };
    },
  });

  const quotes = paginationResult?.rows || [];
  const totalCount = paginationResult?.totalCount || 0;
  const totalPages = paginationResult?.totalPages || 1;

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setPage(1);
  };

  const handleStatusFilterChange = (newStatus: QuoteStatusFilter) => {
    setStatusFilter(newStatus);
    setPage(1);
  };

  const handleSortChange = (newSort: QuoteSortOption) => {
    setSort(newSort);
    setPage(1);
  };

  const handlePageSizeChange = (newSizeStr: string) => {
    setPageSize(Number(newSizeStr));
    setPage(1);
  };

  const handleOpenCostAnalysis = (quoteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCostQuoteId(quoteId);
    setIsCostDrawerOpen(true);
  };

  const statuses: { key: QuoteStatusFilter; labelAr: string; labelEn: string }[] = [
    { key: "all", labelAr: "الكل", labelEn: "All" },
    { key: "draft", labelAr: "مسودة", labelEn: "Draft" },
    { key: "sent", labelAr: "مرسلة", labelEn: "Sent" },
    { key: "accepted", labelAr: "مقبولة", labelEn: "Accepted" },
    { key: "converted", labelAr: "تم تحويلها لطلب", labelEn: "Converted" },
    { key: "rejected", labelAr: "مرفوضة", labelEn: "Rejected" },
  ];

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "accepted":
      case "converted":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400";
      case "sent":
      case "pdf_sent":
      case "awaiting_customer_decision":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400";
      case "awaiting_customer_confirmation":
        return "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400";
      case "approved_for_delivery":
        return "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 dark:text-teal-400";
      case "revision_requested":
        return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400";
      case "rejected":
        return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400";
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
            <FileText className="h-7 w-7 text-primary" />
            <span>{isRtl ? "المقايسات وعروض الأسعار" : "Quotations & Estimates"}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isRtl
              ? "إدارة عروض الأسعار التجارية والمقايسات والتحويل لأوامر إنتاج"
              : "Manage commercial quotations, proposals, and convert to manufacturing orders"}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button asChild className="gap-2 bg-primary text-primary-foreground font-semibold shadow-xs">
            <Link to="/admin/quotes/new">
              <Plus className="h-4 w-4" />
              <span>{isRtl ? "عرض سعر جديد" : "New Quotation"}</span>
            </Link>
          </Button>
        </div>
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
              placeholder={isRtl ? "بحث برقم المقايسة، اسم العميل، الهاتف..." : "Search quote #, customer, phone..."}
              className="pr-9 rtl:pr-9 rtl:pl-3 pl-9 h-9 text-sm rounded-lg"
            />
          </div>

          {/* Sort Select */}
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={sort} onValueChange={(v) => handleSortChange(v as QuoteSortOption)}>
              <SelectTrigger className="w-40 h-9 text-xs rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">{isRtl ? "الأحدث أولاً" : "Newest"}</SelectItem>
                <SelectItem value="oldest">{isRtl ? "الأقدم أولاً" : "Oldest"}</SelectItem>
                <SelectItem value="highest_value">{isRtl ? "الأعلى قيمة" : "Highest Total"}</SelectItem>
                <SelectItem value="lowest_value">{isRtl ? "الأقل قيمة" : "Lowest Total"}</SelectItem>
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

      {/* Quotations Table */}
      <Card className="border rounded-2xl shadow-xs overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>{isRtl ? "رقم المقايسة" : "Quote #"}</TableHead>
                <TableHead>{isRtl ? "العميل" : "Customer"}</TableHead>
                <TableHead>{isRtl ? "القيمة قبل الضريبة" : "Subtotal"}</TableHead>
                <TableHead>{isRtl ? "الإجمالي" : "Total (incl. VAT)"}</TableHead>
                <TableHead>{isRtl ? "الحالة" : "Status"}</TableHead>
                <TableHead>{isRtl ? "تاريخ الإنشاء" : "Created Date"}</TableHead>
                <TableHead className="text-center w-32">{isRtl ? "الإجراءات" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-xs">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>{isRtl ? "جاري تحميل المقايسات..." : "Loading quotations..."}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : quotes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16 text-muted-foreground text-xs">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FileText className="h-8 w-8 text-muted-foreground/50" />
                      <span className="font-semibold text-sm">
                        {isRtl ? "لم يتم العثور على مقايسات" : "No quotations found"}
                      </span>
                      <span className="text-muted-foreground/80">
                        {isRtl ? "جرب تغيير مصطلح البحث أو الفلتر" : "Try adjusting your search or filter criteria"}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                quotes.map((q) => (
                  <TableRow
                    key={q.id}
                    className="hover:bg-muted/30 cursor-pointer transition-colors"
                  >
                    {/* Quote Number */}
                    <TableCell className="font-mono text-xs font-bold text-primary">
                      <div className="space-y-0.5">
                        <Link to="/admin/quotes/$id" params={{ id: q.id }} className="hover:underline flex items-center gap-1">
                          <span>{q.quoteNumber}</span>
                          {q.orderId && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 bg-primary/10 text-primary border-primary/20">
                              ORD
                            </Badge>
                          )}
                        </Link>
                        {q.opportunityId && (
                          <Link
                            to="/admin/crm"
                            search={{ opportunityId: q.opportunityId }}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors font-sans"
                            title={q.opportunityTitle || undefined}
                          >
                            <Briefcase className="h-2.5 w-2.5 text-primary/70" />
                            <span>{q.opportunityNumber || "OPP"}</span>
                          </Link>
                        )}
                      </div>
                    </TableCell>

                    {/* Customer */}
                    <TableCell className="text-xs font-medium text-foreground">
                      <div>
                        <div>{q.customerName || "—"}</div>
                        {q.customerPhone && (
                          <div className="font-mono text-[11px] text-muted-foreground">{q.customerPhone}</div>
                        )}
                        {q.salesOwnerName && (
                          <div className="text-[10px] text-muted-foreground/80 flex items-center gap-1 mt-0.5">
                            <span className="font-normal">{isRtl ? "المسؤول:" : "Rep:"}</span>
                            <span>{q.salesOwnerName}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Subtotal */}
                    <TableCell className="font-mono text-xs text-muted-foreground font-medium">
                      {formatEGP(q.subtotal)}
                    </TableCell>

                    {/* Total */}
                    <TableCell className="font-mono text-xs font-bold text-foreground">
                      {formatEGP(q.total)}
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] capitalize font-medium ${getStatusBadgeClass(q.progressiveStatus || q.status)}`}>
                        {q.statusLabelAr || q.status}
                      </Badge>
                    </TableCell>

                    {/* Valid Until / Created At */}
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(q.createdAt).toLocaleDateString(isRtl ? "ar-EG" : "en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        {/* Cost Analysis Trigger */}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => handleOpenCostAnalysis(q.id, e)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                          title={isRtl ? "تحليل التكاليف وهامش الربحية" : "Cost Analysis & Margin"}
                        >
                          <BarChart3 className="h-3.5 w-3.5" />
                        </Button>

                        {/* View Details */}
                        <Link to="/admin/quotes/$id" params={{ id: q.id }}>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                          >
                            <span>{isRtl ? "عرض" : "View"}</span>
                          </Button>
                        </Link>
                      </div>
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
                ? `عرض ${startRecord} إلى ${endRecord} من إجمالي ${totalCount} مقايسة`
                : `Showing ${startRecord}–${endRecord} of ${totalCount} quotations`}
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

      {/* Quotation Cost Analysis Drawer */}
      <QuotationCostDrawer
        quoteId={costQuoteId}
        open={isCostDrawerOpen}
        onOpenChange={setIsCostDrawerOpen}
      />
    </div>
  );
}