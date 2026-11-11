import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  listCommercialCategories,
  saveCommercialCategory,
  toggleCommercialCategoryActive,
} from "@/lib/commercial-category.functions";
import type {
  CommercialProductCategory,
  CommercialDimensionUnit,
  CommercialPricingUnit,
} from "@/lib/commercial-quote-types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, Edit2, CheckCircle2, XCircle, Layers, Sparkles } from "lucide-react";

export function CommercialCategoriesSettings() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const listCategoriesFn = useServerFn(listCommercialCategories);
  const saveCategoryFn = useServerFn(saveCommercialCategory);
  const toggleActiveFn = useServerFn(toggleCommercialCategoryActive);

  const [categories, setCategories] = useState<CommercialProductCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit / Create Dialog State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CommercialProductCategory | null>(null);
  const [code, setCode] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [dimensionUnit, setDimensionUnit] = useState<CommercialDimensionUnit>("mm");
  const [pricingUnit, setPricingUnit] = useState<CommercialPricingUnit>("pcs");
  const [specsTemplate, setSpecsTemplate] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const data = await listCategoriesFn();
      setCategories(data);
    } catch (e: any) {
      toast.error(e?.message || (isRtl ? "فشل تحميل التصنيفات" : "Failed to load categories"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function handleOpenCreate() {
    setEditingCategory(null);
    setCode("");
    setNameAr("");
    setNameEn("");
    setDimensionUnit("mm");
    setPricingUnit("pcs");
    setSpecsTemplate("");
    setDialogOpen(true);
  }

  function handleOpenEdit(cat: CommercialProductCategory) {
    setEditingCategory(cat);
    setCode(cat.code);
    setNameAr(cat.nameAr);
    setNameEn(cat.nameEn);
    setDimensionUnit(cat.defaultDimensionUnit || "mm");
    setPricingUnit(cat.defaultPricingUnit || "pcs");
    setSpecsTemplate(cat.defaultSpecsTemplateAr || "");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!code.trim() || !nameAr.trim() || !nameEn.trim()) {
      toast.error(isRtl ? "يرجى ملء جميع الحقول المطلوبة" : "Please fill in all required fields");
      return;
    }

    setSaving(true);
    try {
      await saveCategoryFn({
        data: {
          id: editingCategory?.id,
          code: code.trim(),
          nameAr: nameAr.trim(),
          nameEn: nameEn.trim(),
          defaultDimensionUnit: dimensionUnit,
          defaultPricingUnit: pricingUnit,
          defaultSpecsTemplateAr: specsTemplate.trim() || undefined,
          active: editingCategory ? editingCategory.active !== false : true,
        },
      });

      toast.success(
        isRtl
          ? editingCategory
            ? "تم تحديث التصنيف بنجاح"
            : "تمت إضافة التصنيف بنجاح"
          : editingCategory
          ? "Category updated successfully"
          : "Category added successfully",
      );
      setDialogOpen(false);
      await loadData();
    } catch (e: any) {
      toast.error(e?.message || (isRtl ? "فشل حفظ التصنيف" : "Failed to save category"));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(cat: CommercialProductCategory) {
    const nextState = cat.active === false ? true : false;
    try {
      await toggleActiveFn({
        data: {
          categoryId: cat.id || cat.code,
          active: nextState,
        },
      });
      toast.success(
        nextState
          ? isRtl
            ? `تم تفعيل تصنيف ${cat.nameAr}`
            : `Activated ${cat.nameEn}`
          : isRtl
          ? `تم تعطيل تصنيف ${cat.nameAr}`
          : `Deactivated ${cat.nameEn}`,
      );
      await loadData();
    } catch (e: any) {
      toast.error(e?.message || (isRtl ? "فشل تغيير حالة التصنيف" : "Failed to toggle category"));
    }
  }

  return (
    <Card className="shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <span>{isRtl ? "تصنيفات منتجات عروض الأسعار" : "Quotation Product Categories"}</span>
          </CardTitle>
          <CardDescription className="text-xs mt-1">
            {isRtl
              ? "تخصيص الفئات الافتراضية للمقايسات (مطبخ، دريسنج، باب، إلخ)، وحدات الأبعاد، وحدات التسعير، وقوالب المواصفات."
              : "Configure quotation product categories (Kitchen, Dressing, Door, etc.), default units, and specifications templates."}
          </CardDescription>
        </div>
        <Button size="sm" onClick={handleOpenCreate} className="gap-1.5 text-xs">
          <Plus className="h-4 w-4" />
          <span>{isRtl ? "إضافة تصنيف جديد" : "Add Category"}</span>
        </Button>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">
            {isRtl ? "جاري تحميل التصنيفات..." : "Loading categories..."}
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-16">{isRtl ? "الكود" : "Code"}</TableHead>
                  <TableHead>{isRtl ? "الاسم بالعربية" : "Arabic Name"}</TableHead>
                  <TableHead>{isRtl ? "الاسم بالإنجليزية" : "English Name"}</TableHead>
                  <TableHead className="w-24">{isRtl ? "وحدة الأبعاد" : "Dim Unit"}</TableHead>
                  <TableHead className="w-28">{isRtl ? "وحدة التسعير" : "Pricing Unit"}</TableHead>
                  <TableHead className="w-20 text-center">{isRtl ? "الحالة" : "Status"}</TableHead>
                  <TableHead className="w-24 text-center">{isRtl ? "الإجراءات" : "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((cat) => {
                  const isActive = cat.active !== false;
                  return (
                    <TableRow key={cat.id || cat.code} className={!isActive ? "opacity-60 bg-muted/10" : ""}>
                      <TableCell className="font-mono text-xs font-semibold text-primary">{cat.code}</TableCell>
                      <TableCell className="font-medium text-sm">{cat.nameAr}</TableCell>
                      <TableCell className="text-sm">{cat.nameEn}</TableCell>
                      <TableCell className="text-xs font-mono">{cat.defaultDimensionUnit || "mm"}</TableCell>
                      <TableCell className="text-xs font-mono">{cat.defaultPricingUnit || "pcs"}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={isActive ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                          {isActive ? (isRtl ? "نشط" : "Active") : (isRtl ? "معطل" : "Inactive")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => handleOpenEdit(cat)}
                            title={isRtl ? "تعديل التصنيف" : "Edit category"}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className={`h-7 w-7 ${isActive ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50" : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"}`}
                            onClick={() => handleToggleActive(cat)}
                            title={isActive ? (isRtl ? "تعطيل التصنيف" : "Deactivate") : (isRtl ? "تفعيل التصنيف" : "Activate")}
                          >
                            {isActive ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Add / Edit Category Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <span>
                  {editingCategory
                    ? isRtl
                      ? `تعديل تصنيف (${editingCategory.nameAr})`
                      : `Edit Category (${editingCategory.nameEn})`
                    : isRtl
                    ? "إضافة تصنيف منتجات جديد"
                    : "Add Product Category"}
                </span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{isRtl ? "كود التصنيف (إنجليزي بدون مسافات) *" : "Category Code *"}</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. kitchen, dressing, door"
                  className="font-mono text-xs"
                  disabled={!!editingCategory}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">{isRtl ? "الاسم بالعربية *" : "Arabic Name *"}</Label>
                  <Input
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    placeholder="مثال: مطبخ"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">{isRtl ? "الاسم بالإنجليزية *" : "English Name *"}</Label>
                  <Input
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    placeholder="e.g. Kitchen"
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">{isRtl ? "وحدة الأبعاد الافتراضية" : "Default Dimension Unit"}</Label>
                  <Select value={dimensionUnit} onValueChange={(v: CommercialDimensionUnit) => setDimensionUnit(v)}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mm">{isRtl ? "مم (Millimeter)" : "mm (Millimeter)"}</SelectItem>
                      <SelectItem value="cm">{isRtl ? "سم (Centimeter)" : "cm (Centimeter)"}</SelectItem>
                      <SelectItem value="m">{isRtl ? "متر (Meter)" : "m (Meter)"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">{isRtl ? "وحدة التسعير الافتراضية" : "Default Pricing Unit"}</Label>
                  <Select value={pricingUnit} onValueChange={(v: CommercialPricingUnit) => setPricingUnit(v)}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pcs">{isRtl ? "عدد / قطعة (Pieces)" : "pcs (Pieces)"}</SelectItem>
                      <SelectItem value="set">{isRtl ? "طقم / وحدة كاملة (Set)" : "set (Set)"}</SelectItem>
                      <SelectItem value="m2">{isRtl ? "متر مربع (Square Meter)" : "m2 (Square Meter)"}</SelectItem>
                      <SelectItem value="m">{isRtl ? "متر طولي (Linear Meter)" : "m (Linear Meter)"}</SelectItem>
                      <SelectItem value="lot">{isRtl ? "مقطوعية شاملة (Lot)" : "lot (Lot)"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  {isRtl ? "قالب المواصفات الفنية الافتراضي (اختياري)" : "Default Specifications Template (Optional)"}
                </Label>
                <Textarea
                  rows={3}
                  value={specsTemplate}
                  onChange={(e) => setSpecsTemplate(e.target.value)}
                  placeholder={
                    isRtl
                      ? "• خامات الهيكل الداخلي...\n• نوع التجليد ومقاومة الرطوبة...\n• نوع المفصلات والإكسسوارات..."
                      : "• Materials used...\n• Coating and moisture resistance...\n• Hardware and accessories..."
                  }
                  className="text-xs font-sans leading-relaxed"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                {isRtl ? "إلغاء" : "Cancel"}
              </Button>
              <Button size="sm" disabled={saving} onClick={handleSave}>
                {saving ? (isRtl ? "جاري الحفظ..." : "Saving...") : isRtl ? "حفظ التصنيف" : "Save Category"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
