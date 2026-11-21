import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  listProductsCatalog,
  listProductCategories,
  upsertProductCatalogItem,
  deleteProductCatalogItem,
  createProductCategory,
  type ProductCatalogItem,
  type ProductCategoryOption,
} from "@/lib/products.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Tag,
  Package,
  Layers,
  Sparkles,
  Percent,
} from "lucide-react";

export function ProductsCatalogManager() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const queryClient = useQueryClient();

  const listProductsFn = useServerFn(listProductsCatalog);
  const listCategoriesFn = useServerFn(listProductCategories);
  const upsertProductFn = useServerFn(upsertProductCatalogItem);
  const deleteProductFn = useServerFn(deleteProductCatalogItem);
  const createCategoryFn = useServerFn(createProductCategory);

  // Queries
  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["products-catalog"],
    queryFn: async () => {
      const res = await listProductsFn();
      return Array.isArray(res) ? res : [];
    },
    staleTime: 30_000,
  });

  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ["product-categories"],
    queryFn: async () => {
      const res = await listCategoriesFn();
      return Array.isArray(res) ? res : [];
    },
    staleTime: 60_000,
  });

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");

  // Edit / Create Product Modal
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductCatalogItem | null>(null);

  // Form State
  const [code, setCode] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [categoryId, setCategoryId] = useState<string>("none");
  const [basePrice, setBasePrice] = useState<number>(0);
  const [laborPct, setLaborPct] = useState<number>(15);
  const [wastagePct, setWastagePct] = useState<number>(8);
  const [overheadPct, setOverheadPct] = useState<number>(10);
  const [marginPct, setMarginPct] = useState<number>(25);
  const [descriptionAr, setDescriptionAr] = useState("");
  const [active, setActive] = useState(true);

  // New Category Modal
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [newCatNameAr, setNewCatNameAr] = useState("");
  const [newCatNameEn, setNewCatNameEn] = useState("");
  const [newCatPricingUnit, setNewCatPricingUnit] = useState("unit");

  // Category counts
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { all: products.length, unassigned: 0 };
    for (const p of products) {
      if (p.categoryId) {
        map[p.categoryId] = (map[p.categoryId] || 0) + 1;
      } else {
        map.unassigned = (map.unassigned || 0) + 1;
      }
    }
    return map;
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Category filter
      if (selectedCategoryFilter === "unassigned") {
        if (p.categoryId) return false;
      } else if (selectedCategoryFilter !== "all") {
        if (p.categoryId !== selectedCategoryFilter) return false;
      }

      // Text search
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.trim().toLowerCase();
        const matchesCode = p.code.toLowerCase().includes(q);
        const matchesNameAr = p.nameAr.toLowerCase().includes(q);
        const matchesNameEn = (p.nameEn || "").toLowerCase().includes(q);
        const matchesCatAr = (p.categoryNameAr || "").toLowerCase().includes(q);
        const matchesCatEn = (p.categoryNameEn || "").toLowerCase().includes(q);
        return matchesCode || matchesNameAr || matchesNameEn || matchesCatAr || matchesCatEn;
      }

      return true;
    });
  }, [products, selectedCategoryFilter, searchQuery]);

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!code.trim()) throw new Error(isRtl ? "كود الصنف مطلوب" : "Item code is required");
      if (!nameAr.trim()) throw new Error(isRtl ? "اسم الصنف بالعربية مطلوب" : "Arabic name is required");

      return upsertProductFn({
        data: {
          id: editingProduct?.id,
          code: code.trim(),
          nameAr: nameAr.trim(),
          nameEn: nameEn.trim() || undefined,
          categoryId: categoryId === "none" ? null : categoryId,
          basePrice: Number(basePrice) || 0,
          laborPct: Number(laborPct) || 15,
          wastagePct: Number(wastagePct) || 8,
          overheadPct: Number(overheadPct) || 10,
          marginPct: Number(marginPct) || 25,
          descriptionAr: descriptionAr.trim() || null,
          active,
        },
      });
    },
    onSuccess: () => {
      toast.success(
        editingProduct
          ? isRtl ? "تم تحديث الصنف بنجاح" : "Product updated successfully"
          : isRtl ? "تم إضافة الصنف للكتالوج بنجاح" : "Product created successfully",
      );
      queryClient.invalidateQueries({ queryKey: ["products-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["quotable-products"] });
      setProductDialogOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.message || (isRtl ? "فشل حفظ الصنف" : "Failed to save product"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return deleteProductFn({ data: { id } });
    },
    onSuccess: () => {
      toast.success(isRtl ? "تم حذف الصنف" : "Product deleted");
      queryClient.invalidateQueries({ queryKey: ["products-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["quotable-products"] });
    },
    onError: (err: any) => {
      toast.error(err?.message || (isRtl ? "فشل حذف الصنف" : "Failed to delete product"));
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: async () => {
      if (!newCatNameAr.trim()) throw new Error(isRtl ? "اسم التصنيف بالعربية مطلوب" : "Arabic category name required");
      return createCategoryFn({
        data: {
          nameAr: newCatNameAr.trim(),
          nameEn: newCatNameEn.trim() || newCatNameAr.trim(),
          pricingUnit: newCatPricingUnit,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(isRtl ? "تم إضافة التصنيف بنجاح" : "Category created successfully");
      queryClient.invalidateQueries({ queryKey: ["product-categories"] });
      if (res?.category?.id) {
        setCategoryId(res.category.id);
      }
      setCategoryDialogOpen(false);
      setNewCatNameAr("");
      setNewCatNameEn("");
    },
    onError: (err: any) => {
      toast.error(err?.message || (isRtl ? "فشل إنشاء التصنيف" : "Failed to create category"));
    },
  });

  const openNewProduct = () => {
    setEditingProduct(null);
    setCode("");
    setNameAr("");
    setNameEn("");
    setCategoryId(selectedCategoryFilter !== "all" && selectedCategoryFilter !== "unassigned" ? selectedCategoryFilter : "none");
    setBasePrice(0);
    setLaborPct(15);
    setWastagePct(8);
    setOverheadPct(10);
    setMarginPct(25);
    setDescriptionAr("");
    setActive(true);
    setProductDialogOpen(true);
  };

  const openEditProduct = (p: ProductCatalogItem) => {
    setEditingProduct(p);
    setCode(p.code);
    setNameAr(p.nameAr);
    setNameEn(p.nameEn || "");
    setCategoryId(p.categoryId || "none");
    setBasePrice(p.basePrice);
    setLaborPct(p.laborPct);
    setWastagePct(p.wastagePct);
    setOverheadPct(p.overheadPct);
    setMarginPct(p.marginPct);
    setDescriptionAr(p.descriptionAr || "");
    setActive(p.active);
    setProductDialogOpen(true);
  };

  const formatEGP = (amount: number) => {
    return new Intl.NumberFormat(isRtl ? "ar-EG" : "en-US", {
      style: "currency",
      currency: "EGP",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Search and Action Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground rtl:right-3 rtl:left-auto ltr:left-3 ltr:right-auto" />
          <Input
            placeholder={isRtl ? "بحث في الكتالوج بالاسم، الكود، أو التصنيف..." : "Search catalog by name, code, or category..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rtl:pr-9 ltr:pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCategoryDialogOpen(true)}
            className="h-9 text-xs gap-1.5"
          >
            <Tag className="h-3.5 w-3.5 text-primary" />
            <span>{isRtl ? "تصنيف جديد" : "New Category"}</span>
          </Button>

          <Button
            size="sm"
            onClick={openNewProduct}
            className="h-9 text-xs gap-1.5 font-semibold bg-primary text-primary-foreground shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>{isRtl ? "إضافة صنف للكتالوج" : "New Catalog Item"}</span>
          </Button>
        </div>
      </div>

      {/* Category Classification Pills Filter */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
        <Button
          variant={selectedCategoryFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedCategoryFilter("all")}
          className="h-7 text-xs rounded-full gap-1 px-3"
        >
          <span>{isRtl ? "جميع الأصناف" : "All Items"}</span>
          <Badge
            variant={selectedCategoryFilter === "all" ? "secondary" : "outline"}
            className="ml-1 text-[10px] px-1.5 py-0 h-4 min-w-4"
          >
            {categoryCounts.all || 0}
          </Badge>
        </Button>

        {categories.map((cat) => {
          const count = categoryCounts[cat.id] || 0;
          const isSelected = selectedCategoryFilter === cat.id;
          return (
            <Button
              key={cat.id}
              variant={isSelected ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategoryFilter(cat.id)}
              className="h-7 text-xs rounded-full gap-1 px-3 shrink-0"
            >
              <span>{isRtl ? cat.nameAr : cat.nameEn || cat.nameAr}</span>
              <Badge
                variant={isSelected ? "secondary" : "outline"}
                className="ml-1 text-[10px] px-1.5 py-0 h-4 min-w-4"
              >
                {count}
              </Badge>
            </Button>
          );
        })}

        {(categoryCounts.unassigned || 0) > 0 && (
          <Button
            variant={selectedCategoryFilter === "unassigned" ? "destructive" : "outline"}
            size="sm"
            onClick={() => setSelectedCategoryFilter("unassigned")}
            className="h-7 text-xs rounded-full gap-1 px-3 shrink-0 text-amber-600 border-amber-300 dark:border-amber-800"
          >
            <span>{isRtl ? "غير مصنف" : "Uncategorized"}</span>
            <Badge
              variant="outline"
              className="ml-1 text-[10px] px-1.5 py-0 h-4 min-w-4 bg-amber-500/10"
            >
              {categoryCounts.unassigned}
            </Badge>
          </Button>
        )}
      </div>

      {/* Products Table */}
      <Card className="border border-border/60 shadow-xs">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-28 text-xs">{isRtl ? "الكود" : "Code"}</TableHead>
                <TableHead className="text-xs">{isRtl ? "اسم الصنف والمنتج" : "Product Item"}</TableHead>
                <TableHead className="w-48 text-xs font-semibold text-primary">{isRtl ? "التصنيف / الفئة" : "Category"}</TableHead>
                <TableHead className="w-32 text-xs">{isRtl ? "السعر الأساسي" : "Base Price"}</TableHead>
                <TableHead className="w-44 text-xs">{isRtl ? "نسب التكلفة (عمل/هدر/هامش)" : "Cost Levers"}</TableHead>
                <TableHead className="w-20 text-xs text-center">{isRtl ? "الحالة" : "Status"}</TableHead>
                <TableHead className="w-20 text-xs text-center">{isRtl ? "إجراءات" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productsLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-xs">
                    {isRtl ? "جارٍ تحميل الكتالوج والتصنيفات..." : "Loading products and categories..."}
                  </TableCell>
                </TableRow>
              ) : filteredProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground space-y-2">
                    <Package className="h-8 w-8 mx-auto text-muted-foreground/50" />
                    <p className="text-sm font-medium">{isRtl ? "لا توجد أصناف مطابقة" : "No matching products found"}</p>
                    <p className="text-xs text-muted-foreground">
                      {searchQuery
                        ? isRtl ? "جرب البحث بكلمات أخرى أو اختر تصنيفاً مختلفاً" : "Try searching with different terms"
                        : isRtl ? "أضف أصناف جديدة لربطها بالتصنيفات المطلوبة" : "Add new items to categorize them"}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts.map((p) => {
                  const hasCategory = Boolean(p.categoryId && p.categoryNameAr);
                  return (
                    <TableRow key={p.id} className="hover:bg-muted/30 transition-colors">
                      {/* Code */}
                      <TableCell className="font-mono text-xs font-semibold">
                        <Badge variant="outline" className="font-mono text-[11px] bg-muted/40">
                          {p.code}
                        </Badge>
                      </TableCell>

                      {/* Name */}
                      <TableCell>
                        <div className="font-semibold text-xs sm:text-sm text-foreground">
                          {p.nameAr}
                        </div>
                        {p.nameEn && p.nameEn !== p.nameAr && (
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {p.nameEn}
                          </div>
                        )}
                        {p.descriptionAr && (
                          <div className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                            {p.descriptionAr}
                          </div>
                        )}
                      </TableCell>

                      {/* Category Badge (Interactive Linking) */}
                      <TableCell>
                        {hasCategory ? (
                          <Badge
                            variant="secondary"
                            className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 cursor-pointer transition-colors text-xs gap-1 py-1 px-2.5 font-medium"
                            onClick={() => openEditProduct(p)}
                            title={isRtl ? "اضغط لتعديل تصنيف الصنف" : "Click to reassign category"}
                          >
                            <Tag className="h-3 w-3" />
                            <span>{isRtl ? p.categoryNameAr : p.categoryNameEn || p.categoryNameAr}</span>
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10 cursor-pointer text-xs gap-1 py-1 px-2"
                            onClick={() => openEditProduct(p)}
                            title={isRtl ? "اضغط لربط الصنف بتصنيف" : "Click to assign category"}
                          >
                            <Tag className="h-3 w-3" />
                            <span>{isRtl ? "غير مصنف (ربط الآن)" : "Unassigned (Link)"}</span>
                          </Badge>
                        )}
                      </TableCell>

                      {/* Base Price */}
                      <TableCell className="font-mono text-xs font-bold text-foreground">
                        {formatEGP(p.basePrice)}
                      </TableCell>

                      {/* Cost Levers */}
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-muted-foreground font-mono">
                          <span title={isRtl ? "أيدي عاملة" : "Labor"}>👷 {p.laborPct}%</span>
                          <span title={isRtl ? "هدر" : "Wastage"}>🪵 {p.wastagePct}%</span>
                          <span title={isRtl ? "مصاريف عامة" : "Overhead"}>🏢 {p.overheadPct}%</span>
                          <span title={isRtl ? "هامش ربح" : "Margin"} className="text-primary font-bold">📈 {p.marginPct}%</span>
                        </div>
                      </TableCell>

                      {/* Status */}
                      <TableCell className="text-center">
                        <Badge
                          variant={p.active ? "default" : "secondary"}
                          className={`text-[10px] ${p.active ? "bg-emerald-600 hover:bg-emerald-700" : "opacity-60"}`}
                        >
                          {p.active ? (isRtl ? "نشط" : "Active") : (isRtl ? "معطل" : "Inactive")}
                        </Badge>
                      </TableCell>

                      {/* Actions */}
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => openEditProduct(p)}
                            title={isRtl ? "تعديل الصنف والتصنيف" : "Edit product and category"}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              if (confirm(isRtl ? `حذف الصنف [${p.code}] ${p.nameAr}؟` : `Delete [${p.code}] ${p.nameAr}?`)) {
                                deleteMutation.mutate(p.id);
                              }
                            }}
                            title={isRtl ? "حذف الصنف" : "Delete product"}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Product Edit / Create Dialog */}
      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <span>
                {editingProduct
                  ? isRtl ? `تعديل الصنف: ${editingProduct.nameAr}` : `Edit Product: ${editingProduct.code}`
                  : isRtl ? "إضافة صنف جديد للكتالوج" : "New Catalog Product"}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Category / Classification Selector (Prominent at top) */}
            <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold flex items-center gap-1.5 text-primary">
                  <Tag className="h-3.5 w-3.5" />
                  <span>{isRtl ? "التصنيف / الفئة (Classification)" : "Category / Classification"}</span>
                </Label>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => setCategoryDialogOpen(true)}
                  className="h-auto p-0 text-[11px] text-primary underline"
                >
                  {isRtl ? "+ إضافة تصنيف جديد" : "+ Add new category"}
                </Button>
              </div>

              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-9 text-xs bg-background font-medium">
                  <SelectValue placeholder={isRtl ? "اختر التصنيف (مثال: طاولات، مطابخ...)" : "Select category (e.g. Tables, Kitchens...)"} />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="none" className="text-xs text-muted-foreground font-medium">
                    {isRtl ? "— بدون تصنيف (غير مصنف) —" : "— None (Unassigned) —"}
                  </SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs font-semibold py-1.5">
                      <div className="flex items-center gap-2">
                        <Tag className="h-3 w-3 text-primary" />
                        <span>{c.nameAr}</span>
                        {c.nameEn && <span className="text-muted-foreground font-normal">({c.nameEn})</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {isRtl
                  ? "يربط هذا الصنف بالتصنيف المحدد ليظهر تلقائياً في عروض الأسعار والتسعير المناسب (مثل وضع طاولة الاجتماعات في تصنيف الطاولات)."
                  : "Links this item to a specific category for streamlined quotation builder selection (e.g. Meeting Table in Tables)."}
              </p>
            </div>

            {/* Basic Info: Code & Names */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">{isRtl ? "كود الصنف *" : "Code *"}</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. TBL-MT-001"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs font-semibold">{isRtl ? "اسم الصنف بالعربية *" : "Arabic Name *"}</Label>
                <Input
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  placeholder={isRtl ? "مثال: طاولة اجتماعات 8 أفراد" : "e.g. Meeting Table"}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">{isRtl ? "الاسم بالإنجليزية (اختياري)" : "English Name"}</Label>
              <Input
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. 8-Person Meeting Table"
                className="h-8 text-xs"
              />
            </div>

            {/* Price & Levers */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-2 border-t">
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <Label className="text-xs font-semibold">{isRtl ? "السعر الأساسي (ج.م)" : "Base Price"}</Label>
                <Input
                  type="number"
                  min="0"
                  value={basePrice || ""}
                  onChange={(e) => setBasePrice(parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs font-mono font-bold"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">{isRtl ? "أيدي عاملة %" : "Labor %"}</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={laborPct}
                  onChange={(e) => setLaborPct(parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">{isRtl ? "نسبة الهدر %" : "Wastage %"}</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={wastagePct}
                  onChange={(e) => setWastagePct(parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">{isRtl ? "مصاريف %" : "Overhead %"}</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={overheadPct}
                  onChange={(e) => setOverheadPct(parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground text-primary font-bold">{isRtl ? "هامش ربح %" : "Margin %"}</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={marginPct}
                  onChange={(e) => setMarginPct(parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs font-mono font-bold text-primary"
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1">
              <Label className="text-xs">{isRtl ? "المواصفات والوصف" : "Specifications / Description"}</Label>
              <Textarea
                rows={2}
                value={descriptionAr}
                onChange={(e) => setDescriptionAr(e.target.value)}
                placeholder={isRtl ? "أبعاد، خامات قياسية، تفاصيل فنية..." : "Dimensions, materials, specs..."}
                className="text-xs"
              />
            </div>

            {/* Active Switch */}
            <div className="flex items-center justify-between pt-2">
              <div className="space-y-0.5">
                <Label className="text-xs font-semibold">{isRtl ? "حالة الصنف" : "Active Status"}</Label>
                <p className="text-[11px] text-muted-foreground">
                  {isRtl ? "الأصناف النشطة تظهر في قائمة المقايسات والكتالوج" : "Active items appear in quotation builders"}
                </p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setProductDialogOpen(false)}
              className="text-xs"
            >
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="text-xs font-semibold bg-primary text-primary-foreground"
            >
              {saveMutation.isPending ? "..." : (isRtl ? "حفظ الصنف والتصنيف" : "Save Item")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Add Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" />
              <span>{isRtl ? "إضافة تصنيف / فئة جديدة" : "New Category"}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">{isRtl ? "اسم التصنيف بالعربية *" : "Arabic Name *"}</Label>
              <Input
                value={newCatNameAr}
                onChange={(e) => setNewCatNameAr(e.target.value)}
                placeholder={isRtl ? "مثال: طاولات، كراسي، مكاتب..." : "e.g. Tables"}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{isRtl ? "الاسم بالإنجليزية" : "English Name"}</Label>
              <Input
                value={newCatNameEn}
                onChange={(e) => setNewCatNameEn(e.target.value)}
                placeholder="e.g. Tables"
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{isRtl ? "وحدة التسعير الافتراضية" : "Pricing Unit"}</Label>
              <Select value={newCatPricingUnit} onValueChange={setNewCatPricingUnit}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unit">{isRtl ? "بالقطعة / الوحدة (unit)" : "Unit / Piece"}</SelectItem>
                  <SelectItem value="linear_meter">{isRtl ? "بالمتر الطولي (linear meter)" : "Linear Meter"}</SelectItem>
                  <SelectItem value="m2">{isRtl ? "بالمتر المربع (m²)" : "Square Meter"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCategoryDialogOpen(false)}
              className="text-xs"
            >
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={createCategoryMutation.isPending}
              onClick={() => createCategoryMutation.mutate()}
              className="text-xs font-semibold bg-primary text-primary-foreground"
            >
              {createCategoryMutation.isPending ? "..." : (isRtl ? "إنشاء التصنيف" : "Create Category")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
