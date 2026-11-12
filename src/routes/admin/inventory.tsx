import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/lib/useAuth";
import { listStock, deleteInventoryItem } from "@/lib/inventory.functions";
import {
  type StockItem,
  type StockItemType,
  type PaginatedStockResult,
  type StockKpis,
  MATERIAL_CATEGORIES,
  HARDWARE_CATEGORIES,
  getCategoryLabel,
} from "@/lib/inventory-types";
import { StockAdjustmentModal } from "@/components/inventory/StockAdjustmentModal";
import { InventoryItemModal } from "@/components/inventory/InventoryItemModal";
import { StockItemDetailModal } from "@/components/inventory/StockItemDetailModal";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Boxes,
  Plus,
  Search,
  SlidersHorizontal,
  Edit3,
  Pencil,
  Eye,
  Trash2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Package,
  Layers,
  Wrench,
  X,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

// ── Search Schema for URL State Persistence ─────────────────────────────────

const inventorySearchSchema = z.object({
  tab: z.enum(["materials", "hardware"]).optional().default("materials"),
  search: z.string().optional().default(""),
  category: z.string().optional().default("all"),
  lowStock: z.boolean().optional().default(false),
  sort: z
    .enum(["name_asc", "sku_asc", "lowest_stock", "highest_reserved", "newest"])
    .optional()
    .default("name_asc"),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(25),
});

export type InventorySearchParams = {
  tab?: "materials" | "hardware";
  search?: string;
  category?: string;
  lowStock?: boolean;
  sort?: "name_asc" | "sku_asc" | "lowest_stock" | "highest_reserved" | "newest";
  page?: number;
  pageSize?: number;
};

export const Route = createFileRoute("/admin/inventory")({
  validateSearch: (search: Record<string, unknown>): InventorySearchParams => {
    return inventorySearchSchema.parse(search);
  },
  component: InventoryPage,
});

function InventoryPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const { currentRole } = useAuth();
  const listStockFn = useServerFn(listStock);
  const deleteInventoryItemFn = useServerFn(deleteInventoryItem);

  // Read persisted URL search state
  const searchParams = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const currentTab = searchParams.tab ?? "materials";
  const currentCategory = searchParams.category ?? "all";
  const currentLowStock = searchParams.lowStock ?? false;
  const currentSort = searchParams.sort ?? "name_asc";
  const currentPage = searchParams.page ?? 1;
  const currentPageSize = searchParams.pageSize ?? 25;

  // Local draft for immediate search input responsiveness
  const [searchDraft, setSearchDraft] = useState(searchParams.search ?? "");
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setSearchDraft(searchParams.search ?? "");
  }, [searchParams.search]);

  // Helper to patch URL search parameters without full page reloads
  const updateSearch = (patch: Partial<InventorySearchParams>) => {
    navigate({
      search: (prev) => {
        const next = { ...prev, ...patch };
        // Reset page to 1 if search, category, tab, lowStock, or sort changes unless page is explicitly specified
        if (
          patch.search !== undefined ||
          patch.category !== undefined ||
          patch.tab !== undefined ||
          patch.lowStock !== undefined ||
          patch.sort !== undefined
        ) {
          if (patch.page === undefined) {
            next.page = 1;
          }
        }
        return next;
      },
      replace: true,
    });
  };

  const handleSearchChange = (val: string) => {
    setSearchDraft(val);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => {
      updateSearch({ search: val });
    }, 250);
  };

  const handleClearSearch = () => {
    setSearchDraft("");
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    updateSearch({ search: "" });
  };

  const handleTabChange = (newTab: "materials" | "hardware") => {
    if (newTab === currentTab) return;
    updateSearch({
      tab: newTab,
      category: "all",
      page: 1,
    });
  };

  const handleCategoryChange = (catKey: string) => {
    updateSearch({ category: catKey, page: 1 });
  };

  const handleLowStockToggle = () => {
    updateSearch({ lowStock: !currentLowStock, page: 1 });
  };

  const handleSortChange = (newSort: any) => {
    updateSearch({ sort: newSort, page: 1 });
  };

  const handlePageSizeChange = (newSizeStr: string) => {
    updateSearch({ pageSize: Number(newSizeStr), page: 1 });
  };

  const handlePageChange = (newPage: number) => {
    updateSearch({ page: newPage });
  };

  // Modals state
  const [adjustItem, setAdjustItem] = useState<StockItem | null>(null);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemModalMode, setItemModalMode] = useState<"create" | "edit">("create");
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<StockItem | null>(null);

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedItemForDetail, setSelectedItemForDetail] = useState<StockItem | null>(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StockItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // TanStack Query for paginated stock items with caching (staleTime: 60s)
  const itemTypeForQuery = currentTab === "materials" ? "material" : "hardware";

  const { data: result, isLoading, refetch } = useQuery({
    queryKey: [
      "stock-items-list",
      itemTypeForQuery,
      searchParams.search,
      currentCategory,
      currentLowStock,
      currentSort,
      currentPage,
      currentPageSize,
    ],
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const res = await listStockFn({
        data: {
          search: searchParams.search ? searchParams.search.trim() : undefined,
          type: itemTypeForQuery,
          category: currentCategory,
          lowStockOnly: currentLowStock,
          sort: currentSort,
          page: currentPage,
          pageSize: currentPageSize,
        },
      });
      return (res as unknown as PaginatedStockResult) || {
        rows: [],
        totalCount: 0,
        page: 1,
        pageSize: 25,
        totalPages: 1,
        kpis: {
          totalItems: 0,
          materialsCount: 0,
          hardwareCount: 0,
          lowStockCount: 0,
          totalReservedUnits: 0,
          materialsLowStockCount: 0,
          hardwareLowStockCount: 0,
          materialsTotalStock: 0,
          hardwareTotalStock: 0,
          materialsReservedUnits: 0,
          hardwareReservedUnits: 0,
        },
      };
    },
  });

  const stockList = result?.rows || [];
  const totalCount = result?.totalCount || 0;
  const totalPages = result?.totalPages || 1;
  const kpis: StockKpis = result?.kpis || {
    totalItems: 0,
    materialsCount: 0,
    hardwareCount: 0,
    lowStockCount: 0,
    totalReservedUnits: 0,
    materialsLowStockCount: 0,
    hardwareLowStockCount: 0,
    materialsTotalStock: 0,
    hardwareTotalStock: 0,
    materialsReservedUnits: 0,
    hardwareReservedUnits: 0,
  };

  const handleOpenAdjust = (item: StockItem) => {
    setAdjustItem(item);
    setIsAdjustModalOpen(true);
  };

  const handleOpenCreate = () => {
    setItemModalMode("create");
    setSelectedItemForEdit(null);
    setItemModalOpen(true);
  };

  const handleOpenEdit = (item: StockItem) => {
    setItemModalMode("edit");
    setSelectedItemForEdit(item);
    setItemModalOpen(true);
  };

  const handleOpenDetail = (item: StockItem) => {
    setSelectedItemForDetail(item);
    setDetailModalOpen(true);
  };

  const handleOpenDelete = (item: StockItem) => {
    setDeleteTarget(item);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.reservedQuantity > 0) {
      toast.error(
        isRtl
          ? `لا يمكن أرشفة هذا الصنف لوجود ${deleteTarget.reservedQuantity} وحدة محجوزة للإنتاج`
          : `Cannot archive item with ${deleteTarget.reservedQuantity} active reserved units`,
      );
      return;
    }

    setIsDeleting(true);
    try {
      await deleteInventoryItemFn({ data: { stockItemId: deleteTarget.id } });
      toast.success(
        isRtl
          ? `تم أرشفة الصنف [${deleteTarget.sku}] بنجاح من المخزون`
          : `Item [${deleteTarget.sku}] archived successfully from inventory`,
      );
      setDeleteModalOpen(false);
      setDeleteTarget(null);
      refetch();
    } catch (err: any) {
      toast.error(err?.message || (isRtl ? "فشل أرشفة الصنف" : "Failed to archive item"));
    } finally {
      setIsDeleting(false);
    }
  };

  const canAdjust = currentRole !== "viewer";

  const startRecord = totalCount === 0 ? 0 : (currentPage - 1) * currentPageSize + 1;
  const endRecord = Math.min(currentPage * currentPageSize, totalCount);

  // Scoped categories for active tab
  const activeCategories = currentTab === "materials" ? MATERIAL_CATEGORIES : HARDWARE_CATEGORIES;

  // Active section config
  const isMaterialsTab = currentTab === "materials";
  const sectionTitle = isMaterialsTab
    ? t("inventory.rawMaterials", "Raw Materials")
    : t("inventory.accessoriesHardware", "Accessories & Hardware");
  const sectionDesc = isMaterialsTab
    ? t(
        "inventory.rawMaterialsDesc",
        "Manage production materials, available stock, units, costs, and reorder levels.",
      )
    : t(
        "inventory.accessoriesHardwareDesc",
        "Manage hardware, fittings, and accessories used in furniture manufacturing and installation.",
      );

  return (
    <div className="space-y-6 pb-12">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2.5 text-foreground">
              <Boxes className="h-7 w-7 text-primary" />
              <span>{t("inventory.title", "Inventory Management")}</span>
            </h1>
            <Badge variant="outline" className="text-xs font-mono font-medium py-0.5 px-2">
              {kpis.totalItems} {isRtl ? "صنف كلي" : "Items Total"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {t(
              "inventory.subtitle",
              "Track raw materials and hardware stock, verify readiness, and allocate supplies",
            )}
          </p>
        </div>

        {/* Action Button: Add Item */}
        {canAdjust && (
          <div className="flex items-center gap-2">
            <Button
              onClick={handleOpenCreate}
              className="gap-2 bg-primary text-primary-foreground shadow-xs h-9 text-xs font-medium"
            >
              <Plus className="h-4 w-4" />
              <span>{t("inventory.addItem", "Add Inventory Item")}</span>
            </Button>
          </div>
        )}
      </div>

      {/* ── Primary Section Tabs Switcher (Persistent URL state) ─────────────── */}
      <div className="bg-muted/40 p-1.5 rounded-2xl border flex items-center gap-2 shadow-2xs">
        <button
          type="button"
          onClick={() => handleTabChange("materials")}
          className={`flex-1 flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${
            isMaterialsTab
              ? "bg-background text-foreground shadow-xs border border-border/80"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50"
          }`}
        >
          <Layers className={`h-4 w-4 ${isMaterialsTab ? "text-primary" : "text-muted-foreground"}`} />
          <span>{t("inventory.rawMaterials", "Raw Materials")}</span>
          <Badge
            variant="secondary"
            className={`text-xs font-mono font-bold px-2 py-0.5 ${
              isMaterialsTab
                ? "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {kpis.materialsCount}
          </Badge>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("hardware")}
          className={`flex-1 flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${
            !isMaterialsTab
              ? "bg-background text-foreground shadow-xs border border-border/80"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50"
          }`}
        >
          <Wrench className={`h-4 w-4 ${!isMaterialsTab ? "text-primary" : "text-muted-foreground"}`} />
          <span>{t("inventory.accessoriesHardware", "Accessories & Hardware")}</span>
          <Badge
            variant="secondary"
            className={`text-xs font-mono font-bold px-2 py-0.5 ${
              !isMaterialsTab
                ? "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {kpis.hardwareCount}
          </Badge>
        </button>
      </div>

      {/* ── Active Section Banner ────────────────────────────────────────────── */}
      <div className="p-4 sm:p-5 rounded-2xl border bg-card shadow-xs transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              {isMaterialsTab ? <Layers className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                <span>{sectionTitle}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  ({isMaterialsTab ? (isRtl ? "خشب، ألواح، قشرة" : "Wood, MDF, Plywood, HPL") : (isRtl ? "مفصلات، مقابض، سكك" : "Hinges, Handles, Runners, Fasteners")})
                </span>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">{sectionDesc}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs shrink-0 self-end sm:self-center">
            <span className="text-muted-foreground">
              {isRtl ? "الأصناف المطابقة:" : "Filtered Items:"}{" "}
              <strong className="text-foreground font-mono font-bold">{totalCount}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* ── Section KPI Summary Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* Card 1: Items Count */}
        <Card className="border rounded-2xl p-4 shadow-xs">
          <div className="text-xs text-muted-foreground font-semibold">
            {isMaterialsTab
              ? isRtl
                ? "أصناف الخامات"
                : "Material Items"
              : isRtl
              ? "أصناف الهاردوير"
              : "Hardware Items"}
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono mt-1 text-foreground">
            {isMaterialsTab ? kpis.materialsCount : kpis.hardwareCount}
          </div>
        </Card>

        {/* Card 2: Total Units In Stock */}
        <Card className="border rounded-2xl p-4 shadow-xs">
          <div className="text-xs text-muted-foreground font-semibold">
            {isMaterialsTab
              ? isRtl
                ? "إجمالي الألواح بالمخزن"
                : "Total Sheets In Stock"
              : isRtl
              ? "إجمالي القطع بالمخزن"
              : "Total Fittings In Stock"}
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono mt-1 text-emerald-700 dark:text-emerald-400">
            {isMaterialsTab
              ? kpis.materialsTotalStock ?? 0
              : kpis.hardwareTotalStock ?? 0}
          </div>
        </Card>

        {/* Card 3: Reserved for Production */}
        <Card className="border rounded-2xl p-4 shadow-xs">
          <div className="text-xs text-primary font-semibold">
            {isRtl ? "المحجوز لأوامر الإنتاج" : "Reserved for Orders"}
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono mt-1 text-primary">
            {isMaterialsTab
              ? kpis.materialsReservedUnits ?? 0
              : kpis.hardwareReservedUnits ?? 0}
          </div>
        </Card>

        {/* Card 4: Low Stock Alert */}
        <Card
          className={`border rounded-2xl p-4 shadow-xs ${
            (isMaterialsTab ? (kpis.materialsLowStockCount ?? 0) : (kpis.hardwareLowStockCount ?? 0)) > 0
              ? "bg-amber-50/50 dark:bg-amber-950/20 border-amber-300/70 dark:border-amber-900/50"
              : "bg-card"
          }`}
        >
          <div className="text-xs text-amber-800 dark:text-amber-300 font-semibold flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            <span>{t("inventory.lowStockAlert", "Low Stock Alert")}</span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono mt-1 text-amber-800 dark:text-amber-300">
            {isMaterialsTab
              ? kpis.materialsLowStockCount ?? 0
              : kpis.hardwareLowStockCount ?? 0}
          </div>
        </Card>

        {/* Card 5: Global Inventory Items */}
        <Card className="border rounded-2xl p-4 shadow-xs bg-muted/20">
          <div className="text-xs text-muted-foreground font-semibold">
            {isRtl ? "إجمالي الكتالوج (الكل)" : "Catalog Scope"}
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono mt-1 text-foreground/80">
            {kpis.totalItems}
          </div>
        </Card>
      </div>

      {/* ── Search, Sort, and Category Filter Bar ────────────────────────────── */}
      <div className="bg-card border rounded-2xl p-4 shadow-xs space-y-3.5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 sm:max-w-md">
            <Search className="absolute right-3 rtl:right-3 rtl:left-auto left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchDraft}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={
                isMaterialsTab
                  ? isRtl
                    ? "بحث في الخامات (كود الصنف، نوع الخشب، المقاس)..."
                    : "Search materials (SKU, wood type, thickness)..."
                  : isRtl
                  ? "بحث في الإكسسوارات (كود الصنف، مفصلة، مقبض)..."
                  : "Search hardware (SKU, fitting name, brand)..."
              }
              className="pr-9 rtl:pr-9 rtl:pl-8 pl-9 h-9 text-sm rounded-lg"
            />
            {searchDraft && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute left-2.5 rtl:left-2.5 rtl:right-auto right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title={isRtl ? "مسح البحث" : "Clear search"}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Sort Select */}
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={currentSort} onValueChange={handleSortChange}>
              <SelectTrigger className="w-44 h-9 text-xs rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name_asc">{isRtl ? "الاسم (أ - ي)" : "Name (A - Z)"}</SelectItem>
                <SelectItem value="sku_asc">{isRtl ? "كود الصنف (SKU)" : "SKU Code"}</SelectItem>
                <SelectItem value="lowest_stock">{isRtl ? "الأقل رصيداً متاحاً" : "Lowest Stock"}</SelectItem>
                <SelectItem value="highest_reserved">{isRtl ? "الأعلى حجزاً للطلبات" : "Highest Reserved"}</SelectItem>
                <SelectItem value="newest">{isRtl ? "الأحدث إضافة" : "Newest"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Category Filter Pills (Scoped to Active Section) */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/60">
          <span className="text-xs font-semibold text-muted-foreground ml-1 rtl:ml-0 rtl:mr-1">
            {isRtl ? "الفئات:" : "Categories:"}
          </span>

          {activeCategories.map((cat) => {
            const active = currentCategory === cat.key;
            const label = isRtl ? cat.labelAr : cat.labelEn;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => handleCategoryChange(cat.key)}
                className={`px-3.5 py-1.5 text-xs rounded-full font-medium transition-all ${
                  active
                    ? "bg-primary text-primary-foreground shadow-xs font-bold"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}

          {/* Low Stock Toggle Pill */}
          <button
            type="button"
            onClick={handleLowStockToggle}
            className={`px-3.5 py-1.5 text-xs rounded-full font-medium transition-all ml-auto rtl:ml-0 rtl:mr-auto flex items-center gap-1.5 ${
              currentLowStock
                ? "bg-amber-600 text-white shadow-xs font-bold"
                : "bg-amber-100/60 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100 border border-amber-200/60"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{isRtl ? "تنبيه نقص الرصيد فقط" : "Low Stock Only"}</span>
          </button>
        </div>
      </div>

      {/* ── Stock Items Table ─────────────────────────────────────────────────── */}
      <Card className="border rounded-2xl shadow-xs overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-40">{t("inventory.sku", "SKU / Item Code")}</TableHead>
                <TableHead>{isRtl ? "اسم الصنف / التوصيف" : "Item / Material Name"}</TableHead>
                <TableHead>{isRtl ? "الفئة" : "Category"}</TableHead>
                <TableHead className="text-end w-24">{t("inventory.unitOfMeasure", "Unit")}</TableHead>
                <TableHead className="text-end w-28">{t("inventory.physicalStock", "Physical Stock")}</TableHead>
                <TableHead className="text-end w-24">{t("inventory.reservedStock", "Reserved")}</TableHead>
                <TableHead className="text-end w-28">{t("inventory.availableStock", "Available Stock")}</TableHead>
                <TableHead className="text-center w-36">{isRtl ? "الإجراءات" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-xs">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>{isRtl ? "جاري تحميل بيانات المخزون..." : "Loading inventory..."}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : stockList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16 text-muted-foreground text-xs">
                    <div className="flex flex-col items-center justify-center gap-2">
                      {isMaterialsTab ? (
                        <Layers className="h-8 w-8 text-muted-foreground/50" />
                      ) : (
                        <Wrench className="h-8 w-8 text-muted-foreground/50" />
                      )}
                      <span className="font-semibold text-sm">
                        {isRtl ? "لم يتم العثور على أصناف مطابقة" : "No stock items found"}
                      </span>
                      <span className="text-muted-foreground/80">
                        {isRtl
                          ? "جرب تغيير مصطلح البحث أو اختيار فئة أخرى"
                          : "Try adjusting your search query or category filter"}
                      </span>
                      {canAdjust && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleOpenCreate}
                          className="mt-2 text-xs gap-1.5"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>{t("inventory.addItem", "Add Inventory Item")}</span>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                stockList.map((item) => {
                  const isLow = item.freeQuantity <= item.minReorderLevel;
                  const isOut = item.physicalQuantity === 0;
                  const categoryLabel = getCategoryLabel(
                    item.category || "other",
                    item.itemType,
                    isRtl ? "ar" : "en",
                  );

                  return (
                    <TableRow key={item.id} className="hover:bg-muted/30 transition-colors">
                      {/* SKU */}
                      <TableCell className="font-mono text-xs font-bold text-primary">
                        {item.sku}
                      </TableCell>

                      {/* Name */}
                      <TableCell className="text-xs font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <span className="text-xs sm:text-sm font-semibold">{item.name}</span>
                          {isOut ? (
                            <Badge variant="destructive" className="text-xs px-2 py-0.5 font-bold">
                              {isRtl ? "نفد الرصيد" : "Out of stock"}
                            </Badge>
                          ) : isLow ? (
                            <Badge
                              variant="outline"
                              className="text-xs px-2 py-0.5 font-bold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border-amber-300"
                            >
                              {isRtl ? "منخفض" : "Low"}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>

                      {/* Category Badge */}
                      <TableCell className="text-xs">
                        <Badge
                          variant="outline"
                          className="text-xs font-medium bg-muted/60 text-foreground border-border/80 dark:bg-muted/40 dark:text-muted-foreground px-2.5 py-0.5"
                        >
                          {categoryLabel}
                        </Badge>
                      </TableCell>

                      {/* Unit */}
                      <TableCell className="text-xs text-muted-foreground font-mono text-end">
                        {item.unit}
                      </TableCell>

                      {/* Physical Stock */}
                      <TableCell className="font-mono text-xs sm:text-sm font-bold text-foreground text-end">
                        {item.physicalQuantity}
                      </TableCell>

                      {/* Reserved Stock */}
                      <TableCell className="font-mono text-xs sm:text-sm text-end">
                        {item.reservedQuantity > 0 ? (
                          <span className="text-primary font-bold bg-primary/10 px-2 py-0.5 rounded">
                            {item.reservedQuantity}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">0</span>
                        )}
                      </TableCell>

                      {/* Available Free Stock */}
                      <TableCell className="font-mono text-xs sm:text-sm font-bold text-end">
                        <span
                          className={
                            item.freeQuantity <= 0
                              ? "text-destructive"
                              : "text-emerald-700 dark:text-emerald-400"
                          }
                        >
                          {item.freeQuantity}
                        </span>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* View Details */}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleOpenDetail(item)}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                            title={t("inventory.viewDetails", "View Details & History")}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

                          {/* Adjust Stock */}
                          {canAdjust && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenAdjust(item)}
                              className="h-8 text-xs px-2.5 text-primary font-semibold gap-1.5"
                              title={t("inventory.adjustStock", "Adjust Stock")}
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">
                                {isRtl ? "رصيد" : "Stock"}
                              </span>
                            </Button>
                          )}

                          {/* Edit Item */}
                          {canAdjust && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleOpenEdit(item)}
                              className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                              title={t("inventory.editItem", "Edit Item")}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          {/* Archive / Delete Item */}
                          {canAdjust && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleOpenDelete(item)}
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              title={t("inventory.archiveItem", "Archive Item")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Bottom Pagination Bar */}
          <div className="p-3.5 bg-muted/20 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <div>
              {isRtl
                ? `عرض ${startRecord} إلى ${endRecord} من إجمالي ${totalCount} صنف`
                : `Showing ${startRecord}–${endRecord} of ${totalCount} items`}
            </div>

            <div className="flex items-center gap-4">
              {/* Page Size Selector */}
              <div className="flex items-center gap-1.5">
                <span>{isRtl ? "لكل صفحة:" : "Per page:"}</span>
                <Select value={String(currentPageSize)} onValueChange={handlePageSizeChange}>
                  <SelectTrigger className="h-7 w-16 text-xs rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Navigation Buttons */}
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage <= 1 || isLoading}
                  className="h-7 w-7"
                  title={isRtl ? "الصفحة الأولى" : "First Page"}
                >
                  <ChevronsLeft className="h-3.5 w-3.5 rtl:rotate-180" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1 || isLoading}
                  className="h-7 w-7"
                  title={isRtl ? "الصفحة السابقة" : "Previous Page"}
                >
                  <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />
                </Button>

                <span className="px-2 font-mono font-medium text-foreground">
                  {currentPage} / {totalPages}
                </span>

                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages || isLoading}
                  className="h-7 w-7"
                  title={isRtl ? "الصفحة التالية" : "Next Page"}
                >
                  <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => handlePageChange(totalPages)}
                  disabled={currentPage >= totalPages || isLoading}
                  className="h-7 w-7"
                  title={isRtl ? "الصفحة الأخيرة" : "Last Page"}
                >
                  <ChevronsRight className="h-3.5 w-3.5 rtl:rotate-180" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Item Create / Edit Modal ─────────────────────────────────────────── */}
      <InventoryItemModal
        open={itemModalOpen}
        onOpenChange={setItemModalOpen}
        mode={itemModalMode}
        item={selectedItemForEdit}
        defaultItemType={isMaterialsTab ? "material" : "hardware"}
        onSuccess={() => {
          refetch();
        }}
      />

      {/* ── Adjustment Modal ─────────────────────────────────────────────────── */}
      <StockAdjustmentModal
        open={isAdjustModalOpen}
        onOpenChange={setIsAdjustModalOpen}
        item={adjustItem}
        onAdjusted={() => {
          refetch();
        }}
      />

      {/* ── Item Detail Modal ────────────────────────────────────────────────── */}
      <StockItemDetailModal
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        item={selectedItemForDetail}
        onAdjustClick={(item) => {
          setSelectedItemForDetail(null);
          setDetailModalOpen(false);
          handleOpenAdjust(item);
        }}
      />

      {/* ── Archive / Delete Confirmation Modal ─────────────────────────────── */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              <span>{t("inventory.archiveItem", "Archive Item")}</span>
            </DialogTitle>
            <DialogDescription className="text-xs pt-1">
              {isRtl
                ? `هل أنت متأكد من أرشفة الصنف [${deleteTarget?.sku}] (${deleteTarget?.name})؟`
                : `Are you sure you want to archive item [${deleteTarget?.sku}] (${deleteTarget?.name})?`}
            </DialogDescription>
          </DialogHeader>

          <div className="bg-muted/40 p-3 rounded-lg text-xs space-y-1 text-muted-foreground border">
            <p>
              {isRtl
                ? "• سيتم استبعاد الصنف من قوائم المخزون النشطة وأوامر الشراء الجديدة."
                : "• This item will be safely archived from active inventory lists."}
            </p>
            <p>
              {isRtl
                ? "• لا يمكن حذف الصنف إذا كان مرتبطاً بحجوزات إنتاج حالية."
                : "• Items with active production reservations cannot be removed."}
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteModalOpen(false)}
              disabled={isDeleting}
            >
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="gap-1.5"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{isRtl ? "جاري الأرشفة..." : "Archiving..."}</span>
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{t("inventory.archiveItem", "Archive Item")}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
