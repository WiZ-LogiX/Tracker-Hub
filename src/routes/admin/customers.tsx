import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/useAuth";
import {
  listCustomersWithStats,
  upsertCustomer,
  deleteCustomer,
} from "@/lib/customers.functions";
import type {
  CustomerListItem,
  CustomerFilterOption,
  CustomerSortOption,
  PaginatedCustomersResult,
} from "@/lib/customer-types";
import { formatEGP } from "@/lib/pricing";
import { Customer360Drawer } from "@/components/customers/Customer360Drawer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  Pencil,
  Search,
  Phone,
  Mail,
  MapPin,
  Building2,
  UserCircle,
  Eye,
  MessageCircle,
  Sparkles,
  Package,
  FileText,
  DollarSign,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/customers")({
  component: CustomersPage,
});

interface CustomerFormData {
  id?: string;
  name: string;
  phone: string;
  email: string;
  governorate: string;
  address: string;
}

const blankForm: CustomerFormData = {
  name: "",
  phone: "",
  email: "",
  governorate: "",
  address: "",
};

function CustomersPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const { currentRole } = useAuth();
  const queryClient = useQueryClient();

  const listCustomersFn = useServerFn(listCustomersWithStats);
  const upsertCustomerFn = useServerFn(upsertCustomer);
  const deleteCustomerFn = useServerFn(deleteCustomer);

  // Search, Filter, Sort, Pagination state
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<CustomerFilterOption>("all");
  const [sort, setSort] = useState<CustomerSortOption>("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [is360Open, setIs360Open] = useState(false);

  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<CustomerFormData>(blankForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // TanStack Query for paginated customers with stats
  const { data: paginationResult, isLoading, refetch } = useQuery({
    queryKey: ["customers", searchTerm, filter, sort, page, pageSize],
    queryFn: async () => {
      const res = await listCustomersFn({
        data: {
          search: searchTerm || undefined,
          filter,
          sort,
          page,
          pageSize,
        },
      });
      return (res as unknown as PaginatedCustomersResult) || {
        rows: [],
        totalCount: 0,
        page: 1,
        pageSize: 25,
        totalPages: 1,
      };
    },
  });

  const customers = paginationResult?.rows || [];
  const totalCount = paginationResult?.totalCount || 0;
  const totalPages = paginationResult?.totalPages || 1;

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setPage(1);
  };

  const handleFilterChange = (newFilter: CustomerFilterOption) => {
    setFilter(newFilter);
    setPage(1);
  };

  const handleSortChange = (newSort: CustomerSortOption) => {
    setSort(newSort);
    setPage(1);
  };

  const handlePageSizeChange = (newSizeStr: string) => {
    setPageSize(Number(newSizeStr));
    setPage(1);
  };

  const handleOpen360 = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setIs360Open(true);
  };

  const handleOpenNew = () => {
    setEditingId(null);
    setForm(blankForm);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (c: CustomerListItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingId(c.id);
    setForm({
      id: c.id,
      name: c.name,
      phone: c.phone || "",
      email: c.email || "",
      governorate: c.governorate || "",
      address: c.address || "",
    });
    setIsFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error(isRtl ? "اسم العميل مطلوب" : "Customer name is required");
      return;
    }

    setSubmitting(true);
    try {
      await upsertCustomerFn({
        data: {
          id: editingId || undefined,
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          governorate: form.governorate.trim() || null,
          address: form.address.trim() || null,
        },
      });

      toast.success(
        editingId
          ? (isRtl ? "تم تحديث بيانات العميل" : "Customer updated")
          : (isRtl ? "تمت إضافة العميل بنجاح" : "Customer added"),
      );
      setIsFormOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save customer");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (c: CustomerListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(isRtl ? `هل أنت متأكد من حذف العميل "${c.name}"؟` : `Delete customer "${c.name}"?`)) {
      return;
    }

    try {
      await deleteCustomerFn({ data: { customerId: c.id } });
      toast.success(isRtl ? "تم حذف العميل" : "Customer deleted");
      refetch();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete customer");
    }
  };

  const canManage = currentRole !== "worker" && currentRole !== "viewer";

  const filters: { key: CustomerFilterOption; labelAr: string; labelEn: string }[] = [
    { key: "all", labelAr: "الكل", labelEn: "All" },
    { key: "active_orders", labelAr: "طلبات نشطة", labelEn: "Active Orders" },
    { key: "outstanding_balance", labelAr: "مستحقات معلقة", labelEn: "Outstanding" },
    { key: "with_quotes", labelAr: "لديهم مقايسات", labelEn: "With Quotes" },
    { key: "no_active_orders", labelAr: "بدون طلبات نشطة", labelEn: "No Active Orders" },
  ];

  const startRecord = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRecord = Math.min(page * pageSize, totalCount);

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2.5 text-foreground">
            <UserCircle className="h-7 w-7 text-primary" />
            <span>{isRtl ? "العملاء وسجل التعاملات" : "Customers & Client 360"}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isRtl
              ? "متابعة بيانات العملاء، المقايسات، أوامر التصنيع، والمستحقات المالية"
              : "Manage customer profiles, quotation histories, manufacturing orders, and balances"}
          </p>
        </div>

        {canManage && (
          <Button
            onClick={handleOpenNew}
            className="gap-2 bg-primary text-primary-foreground font-semibold shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>{isRtl ? "عميل جديد" : "New Customer"}</span>
          </Button>
        )}
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
              placeholder={isRtl ? "بحث باسم العميل، الهاتف، المحافظة..." : "Search name, phone, city..."}
              className="pr-9 rtl:pr-9 rtl:pl-3 pl-9 h-9 text-sm rounded-lg"
            />
          </div>

          {/* Sort Select */}
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={sort} onValueChange={(v) => handleSortChange(v as CustomerSortOption)}>
              <SelectTrigger className="w-40 h-9 text-xs rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">{isRtl ? "الأحدث أولاً" : "Newest"}</SelectItem>
                <SelectItem value="oldest">{isRtl ? "الأقدم أولاً" : "Oldest"}</SelectItem>
                <SelectItem value="name_asc">{isRtl ? "الاسم (أ - ي)" : "Name (A - Z)"}</SelectItem>
                <SelectItem value="name_desc">{isRtl ? "الاسم (ي - أ)" : "Name (Z - A)"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/60">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => handleFilterChange(f.key)}
              className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                filter === f.key
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {isRtl ? f.labelAr : f.labelEn}
            </button>
          ))}
        </div>
      </div>

      {/* Customers Table */}
      <Card className="border rounded-2xl shadow-xs overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>{isRtl ? "العميل" : "Customer"}</TableHead>
                <TableHead>{isRtl ? "بيانات الاتصال" : "Contact"}</TableHead>
                <TableHead>{isRtl ? "الموقع" : "Location"}</TableHead>
                <TableHead className="text-center">{isRtl ? "المقايسات" : "Quotes"}</TableHead>
                <TableHead className="text-center">{isRtl ? "طلبات نشطة" : "Active Orders"}</TableHead>
                <TableHead>{isRtl ? "المدفوع" : "Paid"}</TableHead>
                <TableHead>{isRtl ? "المستحق" : "Balance Due"}</TableHead>
                <TableHead className="text-center w-28">{isRtl ? "الإجراءات" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-xs">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>{isRtl ? "جاري تحميل العملاء..." : "Loading customers..."}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16 text-muted-foreground text-xs">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <UserCircle className="h-8 w-8 text-muted-foreground/50" />
                      <span className="font-semibold text-sm">
                        {isRtl ? "لم يتم العثور على عملاء" : "No customers found"}
                      </span>
                      <span className="text-muted-foreground/80">
                        {isRtl ? "جرب تغيير مصطلح البحث أو الفلتر" : "Try adjusting your search or filter criteria"}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((c) => (
                  <TableRow
                    key={c.id}
                    className="hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => handleOpen360(c.id)}
                  >
                    {/* Customer Name */}
                    <TableCell className="font-semibold text-xs text-foreground">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="truncate max-w-[160px]">{c.name}</span>
                      </div>
                    </TableCell>

                    {/* Contact */}
                    <TableCell className="text-xs text-muted-foreground">
                      <div className="space-y-0.5">
                        {c.phone && (
                          <div className="flex items-center gap-1 font-mono text-[11px] text-foreground">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            <span>{c.phone}</span>
                          </div>
                        )}
                        {c.email && (
                          <div className="flex items-center gap-1 text-[11px]">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            <span className="truncate max-w-[140px]">{c.email}</span>
                          </div>
                        )}
                        {!c.phone && !c.email && <span className="text-muted-foreground/60">—</span>}
                      </div>
                    </TableCell>

                    {/* Location */}
                    <TableCell className="text-xs text-muted-foreground">
                      {c.governorate ? (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          <span>{c.governorate}</span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>

                    {/* Quotes Count */}
                    <TableCell className="text-center font-mono text-xs">
                      {c.quoteCount > 0 ? (
                        <Badge variant="secondary" className="font-mono text-[11px]">
                          {c.quoteCount}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/60">0</span>
                      )}
                    </TableCell>

                    {/* Active Orders Count */}
                    <TableCell className="text-center font-mono text-xs">
                      {c.activeOrderCount > 0 ? (
                        <Badge variant="default" className="font-mono text-[11px] bg-primary">
                          {c.activeOrderCount}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/60">0</span>
                      )}
                    </TableCell>

                    {/* Total Paid */}
                    <TableCell className="font-mono text-xs text-emerald-600 font-semibold">
                      {formatEGP(c.totalPaid)}
                    </TableCell>

                    {/* Outstanding Balance */}
                    <TableCell className="font-mono text-xs">
                      {c.outstandingBalance > 0 ? (
                        <span className="text-rose-600 font-bold bg-rose-50 dark:bg-rose-950/30 px-1.5 py-0.5 rounded">
                          {formatEGP(c.outstandingBalance)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/60">0.00 ج.م.</span>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpen360(c.id)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          title={isRtl ? "عرض ملف العميل 360" : "Customer 360"}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>

                        {canManage && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => handleOpenEdit(c, e)}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              title={isRtl ? "تعديل" : "Edit"}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>

                            {c.activeOrderCount === 0 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => handleDelete(c, e)}
                                className="h-7 w-7 p-0 text-destructive/70 hover:text-destructive"
                                title={isRtl ? "حذف" : "Delete"}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </>
                        )}
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
                ? `عرض ${startRecord} إلى ${endRecord} من إجمالي ${totalCount} عميل`
                : `Showing ${startRecord}–${endRecord} of ${totalCount} customers`}
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

      {/* Customer 360 Workspace Drawer */}
      <Customer360Drawer
        customerId={selectedCustomerId}
        open={is360Open}
        onOpenChange={setIs360Open}
        onRefreshList={() => refetch()}
        userRole={currentRole || undefined}
      />

      {/* Customer Create/Edit Modal */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              {editingId
                ? (isRtl ? "تعديل بيانات العميل" : "Edit Customer")
                : (isRtl ? "إضافة عميل جديد" : "Add New Customer")}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cust-name" className="text-xs font-semibold">
                {isRtl ? "اسم العميل *" : "Customer Name *"}
              </Label>
              <Input
                id="cust-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={isRtl ? "مثال: م. أحمد عبد العزيز" : "e.g. Ahmed Abdelaziz"}
                required
                className="h-9 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cust-phone" className="text-xs font-semibold">
                  {isRtl ? "رقم الهاتف" : "Phone"}
                </Label>
                <Input
                  id="cust-phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="01xxxxxxxxx"
                  className="h-9 text-sm font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cust-gov" className="text-xs font-semibold">
                  {isRtl ? "المحافظة" : "Governorate"}
                </Label>
                <Input
                  id="cust-gov"
                  value={form.governorate}
                  onChange={(e) => setForm({ ...form, governorate: e.target.value })}
                  placeholder={isRtl ? "القاهرة، الجيزة..." : "Cairo, Giza..."}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cust-email" className="text-xs font-semibold">
                {isRtl ? "البريد الإلكتروني" : "Email"}
              </Label>
              <Input
                id="cust-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="client@example.com"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cust-address" className="text-xs font-semibold">
                {isRtl ? "العنوان بالتفصيل" : "Detailed Address"}
              </Label>
              <Input
                id="cust-address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder={isRtl ? "الشارع، الحي، المعالم المميزة..." : "Street, district..."}
                className="h-9 text-sm"
              />
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsFormOpen(false)}
                disabled={submitting}
                className="text-xs h-9"
              >
                {isRtl ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="text-xs h-9 bg-primary text-primary-foreground font-semibold"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5 rtl:mr-0 rtl:ml-1.5" />}
                <span>{editingId ? (isRtl ? "حفظ التعديلات" : "Save Changes") : (isRtl ? "إضافة" : "Add Customer")}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}