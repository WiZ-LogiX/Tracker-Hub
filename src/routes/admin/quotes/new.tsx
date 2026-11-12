"use client";

import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { saveCommercialQuote, getCommercialQuote } from "@/lib/quote.functions";
import { listCommercialCategories } from "@/lib/commercial-category.functions";
import { listQuotableProducts, type QuotableProduct } from "@/lib/catalog.functions";
import { generatePdf } from "@/lib/pdf.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Trash2,
  Plus,
  Copy,
  ArrowUp,
  ArrowDown,
  Download,
  Briefcase,
  Layers,
  Sparkles,
  Database,
  ExternalLink,
  ImageIcon,
  ShieldCheck,
  Truck,
  Calendar,
  DollarSign,
  FileText,
  Eye,
  CheckCircle2,
  Save,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatEGP } from "@/lib/pricing";
import { toast } from "sonner";
import { z } from "zod";
import { getNextPLCNumber } from "@/lib/numbering";
import {
  DEFAULT_COMMERCIAL_CATEGORIES,
  COMMERCIAL_PRICING_UNITS,
  COMMERCIAL_DIMENSION_UNITS,
  DEFAULT_COMMERCIAL_TERMS,
  type CommercialProductCategory,
  type CommercialQuoteLine,
  type CommercialQuoteTerms,
  type CommercialDimensionUnit,
  type CommercialPricingUnit,
  calculateCommercialLineTotal,
  calculateCommercialQuoteTotals,
} from "@/lib/commercial-quote-types";

const searchSchema = z.object({
  rfq: z.string().optional(),
  opportunityId: z.string().optional(),
  quoteId: z.string().optional(),
  customerId: z.string().optional(),
});

export const Route = createFileRoute("/admin/quotes/new")({
  component: CommercialQuoteBuilder,
  validateSearch: searchSchema,
});

/**
 * Creates a clean quotation line item.
 * When categoryCode is empty string "", it starts unselected requiring explicit category selection.
 */
function createCleanLine(
  categoryCode = "",
  categoriesList: CommercialProductCategory[] = DEFAULT_COMMERCIAL_CATEGORIES,
): CommercialQuoteLine {
  const cat = categoryCode ? categoriesList.find((c) => c.code === categoryCode) : undefined;

  const pricingUnit = cat?.defaultPricingUnit || "set";
  const pUnitObj = COMMERCIAL_PRICING_UNITS.find((u) => u.code === pricingUnit);

  return {
    id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    productId: null,
    productCode: null,
    isCustom: false,
    category: cat ? cat.code : "",
    categoryNameAr: cat ? cat.nameAr : "",
    categoryNameEn: cat ? cat.nameEn : "",
    name: cat ? cat.nameAr : "",
    description: "",
    quantity: 1,
    dimensions: {
      width: undefined,
      height: undefined,
      depth: undefined,
      unit: cat?.defaultDimensionUnit || "m",
    },
    pricingUnit: pricingUnit,
    pricingUnitAr: pUnitObj?.labelAr ?? "طقم",
    pricingUnitEn: pUnitObj?.labelEn ?? "Set",
    imageUrl: "",
    technicalSpecs: cat?.defaultSpecsTemplateAr || "",
    unitPrice: 0,
    lineTotal: 0,
  };
}

function CommercialQuoteBuilder() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const nav = useNavigate();
  const search = Route.useSearch();

  const saveCommercialQuoteFn = useServerFn(saveCommercialQuote);
  const getCommercialQuoteFn = useServerFn(getCommercialQuote);
  const listCategoriesFn = useServerFn(listCommercialCategories);
  const listQuotableProductsFn = useServerFn(listQuotableProducts);
  const pdfFn = useServerFn(generatePdf);

  const [categories, setCategories] = useState<CommercialProductCategory[]>(DEFAULT_COMMERCIAL_CATEGORIES);
  const [products, setProducts] = useState<QuotableProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState<string>(search.customerId ?? "");
  const [opportunityId, setOpportunityId] = useState<string>(search.opportunityId ?? "");
  const [linkedOpp, setLinkedOpp] = useState<any>(null);

  const [quoteNumber, setQuoteNumber] = useState<string>("");
  const [status, setStatus] = useState<"draft" | "sent">("draft");
  const [validUntil, setValidUntil] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });

  const [lines, setLines] = useState<CommercialQuoteLine[]>([createCleanLine("")]);
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountCode, setDiscountCode] = useState<string>("");
  const [applyVat, setApplyVat] = useState<boolean>(false);
  const [terms, setTerms] = useState<CommercialQuoteTerms>(DEFAULT_COMMERCIAL_TERMS);
  const [showTerms, setShowTerms] = useState<boolean>(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Active categories for user selection
  const activeCategories = useMemo(
    () => categories.filter((c) => c.active !== false),
    [categories],
  );

  // 1. Initial Load: Categories, Customers & Existing Quote or Numbering
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        // Load custom configured categories from server
        try {
          const loadedCats = await listCategoriesFn();
          if (Array.isArray(loadedCats) && loadedCats.length > 0) {
            setCategories(loadedCats);
          }
        } catch {
          // Fallback to DEFAULT_COMMERCIAL_CATEGORIES
        }

        // Load catalog products from database
        try {
          setProductsLoading(true);
          const prods = await listQuotableProductsFn();
          if (Array.isArray(prods) && prods.length > 0) {
            setProducts(prods);
          }
        } catch (err) {
          console.warn("Failed to load catalog products:", err);
        } finally {
          setProductsLoading(false);
        }

        const { data: custData } = await supabase
          .from("customers")
          .select("id, name, phone, email, address")
          .order("name", { ascending: true });
        setCustomers(custData ?? []);

        // If editing existing quote
        if (search.quoteId) {
          const res = await getCommercialQuoteFn({ data: { quoteId: search.quoteId } });
          if (res?.quote) {
            setQuoteNumber(res.quote.quoteNumber);
            setCustomerId(res.quote.customerId);
            setOpportunityId(res.quote.opportunityId ?? "");
            setStatus(res.quote.status === "sent" ? "sent" : "draft");
            setValidUntil(res.quote.validUntil || "");
            const disc = Number(res.quote.discountAmount) || 0;
            setDiscountAmount(disc);
            setDiscountValue(disc);
            setDiscountType("amount");
            setDiscountCode(res.quote.discountCode || "");
            setApplyVat(Number(res.quote.vatAmount) > 0);
            if (res.lines && res.lines.length > 0) {
              setLines(res.lines);
            }
            if (res.terms) {
              setTerms(res.terms);
            }
          }
        } else {
          // Generate new PLC quote number
          try {
            const nextNo = await getNextPLCNumber("quote");
            setQuoteNumber(nextNo);
          } catch {
            setQuoteNumber("PLC-00001");
          }
        }

        // Linked RFQ if present
        if (search.rfq) {
          const { data: rfqRow } = await supabase
            .from("quote_requests")
            .select("customer_id")
            .eq("id", search.rfq)
            .maybeSingle();
          if (rfqRow?.customer_id) {
            setCustomerId(rfqRow.customer_id);
          }
        }
      } catch (err: any) {
        toast.error(err?.message || "Error loading quotation data");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [search.quoteId, search.rfq]);

  // 2. Load Opportunity if linked
  useEffect(() => {
    if (opportunityId) {
      supabase
        .from("opportunities")
        .select("id, opportunity_number, title, project_type, stage, customer_id")
        .eq("id", opportunityId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setLinkedOpp(data);
            if (!customerId && data.customer_id) {
              setCustomerId(data.customer_id);
            }
          }
        });
    }
  }, [opportunityId, customerId]);

  // Selected customer details
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId),
    [customers, customerId],
  );

  // Line calculations & Totals
  const rawSubtotal = useMemo(() => {
    return lines.reduce((acc, l) => acc + (l.lineTotal || 0), 0);
  }, [lines]);

  // Synchronize discount amount if discount is percentage-based
  useEffect(() => {
    if (discountType === "percent") {
      const calculated = Math.round((rawSubtotal * discountValue) / 100);
      setDiscountAmount(calculated);
    } else {
      setDiscountAmount(discountValue);
    }
  }, [discountType, discountValue, rawSubtotal]);

  const totals = useMemo(() => {
    return calculateCommercialQuoteTotals({
      lines,
      discountAmount,
      vatPct: 14,
      applyVat,
      depositPct: terms.paymentSchedule?.[0]?.percent ?? 60,
    });
  }, [lines, discountAmount, applyVat, terms.paymentSchedule]);

  // Line mutation helpers
  function updateLine(idx: number, patch: Partial<CommercialQuoteLine>) {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== idx) return line;
        const updated = { ...line, ...patch };

        // Recalculate line total if quantity or unitPrice changed
        if (patch.quantity !== undefined || patch.unitPrice !== undefined) {
          const q = patch.quantity !== undefined ? patch.quantity : line.quantity;
          const p = patch.unitPrice !== undefined ? patch.unitPrice : line.unitPrice;
          updated.lineTotal = calculateCommercialLineTotal(q, p);
        }

        return updated;
      }),
    );
  }

  // Handle category switch on an item
  function handleCategoryChange(idx: number, newCategoryCode: string) {
    const cat = categories.find((c) => c.code === newCategoryCode);
    if (!cat) return;

    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== idx) return line;

        const pUnitObj = COMMERCIAL_PRICING_UNITS.find((u) => u.code === cat.defaultPricingUnit);
        const isDefaultName =
          !line.name ||
          line.name === line.categoryNameAr ||
          categories.some((c) => c.nameAr === line.name);

        const isSpecsEmptyOrDefault =
          !line.technicalSpecs ||
          categories.some((c) => c.defaultSpecsTemplateAr === line.technicalSpecs);

        return {
          ...line,
          category: cat.code,
          categoryNameAr: cat.nameAr,
          categoryNameEn: cat.nameEn,
          name: isDefaultName ? cat.nameAr : line.name,
          dimensions: {
            ...(line.dimensions || {}),
            unit: cat.defaultDimensionUnit,
          },
          pricingUnit: cat.defaultPricingUnit,
          pricingUnitAr: pUnitObj?.labelAr ?? "عدد",
          pricingUnitEn: pUnitObj?.labelEn ?? "pcs",
          technicalSpecs: isSpecsEmptyOrDefault ? cat.defaultSpecsTemplateAr || "" : line.technicalSpecs,
        };
      }),
    );
  }

  // Handle selecting an item from the catalog database
  function handleProductSelect(idx: number, productId: string) {
    if (productId === "custom") {
      updateLine(idx, {
        productId: null,
        productCode: null,
        isCustom: true,
      });
      return;
    }

    const prod = products.find((p) => p.id === productId);
    if (!prod) return;

    // Match or find closest category
    let matchedCat = categories.find(
      (c) =>
        c.code.toLowerCase() === (prod.categoryNameEn || "").toLowerCase() ||
        c.nameAr === prod.categoryNameAr ||
        c.nameEn.toLowerCase() === (prod.categoryNameEn || "").toLowerCase(),
    );

    if (!matchedCat && prod.categoryNameEn) {
      const en = prod.categoryNameEn.toLowerCase();
      if (en.includes("kitchen")) matchedCat = categories.find((c) => c.code === "kitchen");
      else if (en.includes("wardrobe") || en.includes("dressing")) matchedCat = categories.find((c) => c.code === "dressing");
      else if (en.includes("door")) matchedCat = categories.find((c) => c.code === "door");
      else if (en.includes("table") || en.includes("bed") || en.includes("office")) matchedCat = categories.find((c) => c.code === "custom");
    }

    const categoryCode = matchedCat ? matchedCat.code : (categories[0]?.code || "custom");
    const categoryNameAr = prod.categoryNameAr || matchedCat?.nameAr || "منتج";
    const categoryNameEn = prod.categoryNameEn || matchedCat?.nameEn || "Product";

    // Map pricing unit
    let pUnit: CommercialPricingUnit = "pcs";
    if (prod.pricingUnit === "linear_meter" || prod.pricingUnit === "m") {
      pUnit = "m";
    } else if (prod.pricingUnit === "square_meter" || prod.pricingUnit === "m2") {
      pUnit = "m2";
    } else if (prod.pricingUnit === "set") {
      pUnit = "set";
    } else if (matchedCat?.defaultPricingUnit) {
      pUnit = matchedCat.defaultPricingUnit;
    }
    const pUnitObj = COMMERCIAL_PRICING_UNITS.find((u) => u.code === pUnit);

    const basePrice = prod.basePrice || 0;
    const currentQty = lines[idx]?.quantity || 1;

    updateLine(idx, {
      productId: prod.id,
      productCode: prod.code,
      isCustom: false,
      category: categoryCode,
      categoryNameAr,
      categoryNameEn,
      name: isRtl ? prod.nameAr : (prod.nameEn || prod.nameAr),
      technicalSpecs: prod.descriptionAr || matchedCat?.defaultSpecsTemplateAr || "",
      pricingUnit: pUnit,
      pricingUnitAr: pUnitObj?.labelAr ?? "عدد",
      pricingUnitEn: pUnitObj?.labelEn ?? "pcs",
      unitPrice: basePrice,
      lineTotal: calculateCommercialLineTotal(currentQty, basePrice),
    });
  }

  function addLine(categoryCode = "") {
    setLines((prev) => [...prev, createCleanLine(categoryCode, categories)]);
  }

  function duplicateLine(idx: number) {
    const src = lines[idx];
    const copy: CommercialQuoteLine = {
      ...src,
      id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: `${src.name} (نسخة)`,
      dimensions: src.dimensions ? { ...src.dimensions } : undefined,
    };
    setLines((prev) => {
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
    toast.success(isRtl ? "تم تكرار البند" : "Line duplicated");
  }

  function moveLine(idx: number, direction: "up" | "down") {
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= lines.length) return;
    setLines((prev) => {
      const next = [...prev];
      const temp = next[idx];
      next[idx] = next[targetIdx];
      next[targetIdx] = temp;
      return next;
    });
  }

  function removeLine(idx: number) {
    if (lines.length <= 1) {
      toast.error(isRtl ? "يجب أن يحتوي عرض السعر على بند واحد على الأقل" : "Quotation must have at least one line");
      return;
    }
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function updatePaymentMilestone(idx: number, percent: number) {
    setTerms((prev) => {
      const nextSchedule = [...prev.paymentSchedule];
      if (nextSchedule[idx]) {
        nextSchedule[idx] = { ...nextSchedule[idx], percent };
      }
      return { ...prev, paymentSchedule: nextSchedule };
    });
  }

  // Authoritative Save function
  async function handleSave(newStatus: "draft" | "sent") {
    if (!customerId) {
      toast.error(isRtl ? "يرجى تحديد العميل أولاً" : "Please select a customer first");
      return;
    }

    if (lines.length === 0) {
      toast.error(isRtl ? "يرجى إضافة بند واحد على الأقل" : "Please add at least one line item");
      return;
    }

    for (const [i, line] of lines.entries()) {
      if (!line.category) {
        toast.error(isRtl ? `يرجى اختيار نوع المنتج للبند رقم ${i + 1}` : `Please select a product category for line ${i + 1}`);
        return;
      }
      if (!line.name.trim()) {
        toast.error(isRtl ? `البند رقم ${i + 1} يتطلب اسماً` : `Line ${i + 1} requires a name`);
        return;
      }
      if (!line.quantity || line.quantity <= 0) {
        toast.error(isRtl ? `الكمية في البند رقم ${i + 1} يجب أن تكون أكبر من صفر` : `Quantity for line ${i + 1} must be positive`);
        return;
      }
      if (!line.unitPrice || line.unitPrice <= 0) {
        toast.error(isRtl ? `يرجى إدخال سعر صحيح للبند رقم ${i + 1}` : `Please enter a valid price for line ${i + 1}`);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await saveCommercialQuoteFn({
        data: {
          quoteId: search.quoteId || null,
          customer_id: customerId,
          opportunity_id: opportunityId || null,
          quote_number: quoteNumber,
          status: newStatus,
          lines,
          discount_amount: discountAmount,
          discount_code: discountCode || null,
          vat_pct: 14,
          apply_vat: applyVat,
          valid_until: validUntil || null,
          terms,
        },
      });

      setStatus(newStatus);
      toast.success(
        newStatus === "draft"
          ? isRtl
            ? "تم حفظ عرض السعر التجاري كمسودة بنجاح"
            : "Commercial quotation saved as draft"
          : isRtl
          ? "تم إرسال عرض السعر للعميل بنجاح"
          : "Commercial quotation sent to customer",
      );

      nav({ to: "/admin/quotes/$id", params: { id: res.quoteId } });
    } catch (e: any) {
      toast.error(e?.message ?? (isRtl ? "فشل حفظ عرض السعر" : "Failed to save quotation"));
    } finally {
      setSaving(false);
    }
  }

  // Live PDF preview & export
  async function handleDownloadPdf() {
    if (!search.quoteId) {
      toast.info(isRtl ? "يرجى حفظ عرض السعر أولاً لتحميل الـ PDF الرسمي" : "Please save quotation first to generate PDF");
      await handleSave("draft");
      return;
    }

    setGeneratingPdf(true);
    try {
      const res = await pdfFn({
        data: {
          entityType: "quote",
          entityId: search.quoteId,
        },
      });
      window.open(res.downloadUrl, "_blank", "noopener,noreferrer");
      toast.success(isRtl ? "تم إنشاء وتجهيز الـ PDF بنجاح" : "PDF generated successfully");
    } catch (err: any) {
      toast.error(err?.message || (isRtl ? "فشل تجهيز الـ PDF" : "PDF generation failed"));
    } finally {
      setGeneratingPdf(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse p-4">
        <div className="h-8 w-64 bg-muted rounded" />
        <div className="h-4 w-96 bg-muted rounded" />
        <div className="h-48 bg-muted rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-20 max-w-6xl mx-auto">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {search.quoteId
                ? isRtl
                  ? `تعديل عرض السعر التجاري (${quoteNumber})`
                  : `Edit Commercial Quote (${quoteNumber})`
                : isRtl
                ? "منشئ عروض الأسعار التجارية (PeleCanon)"
                : "Commercial Quotation Builder"}
            </h1>
            <Badge variant="outline" className="border-emerald-600 text-emerald-700 bg-emerald-50 text-xs">
              {isRtl ? "مظهر مستر شاهين" : "Shaheen Presentation"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isRtl
              ? "اختر البند ← أدخل المقاسات ← اكتب المواصفات ← أدخل السعر مباشرة دون تعقيد."
              : "Select Item → Enter Dimensions → Technical Specifications → Commercial Price."}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreviewOpen(true)}
            className="gap-1.5 text-xs text-primary border-primary/30 hover:bg-primary/5"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>{isRtl ? "معاينة عرض السعر" : "Preview Quote"}</span>
          </Button>
          <Link to="/admin/quotes">
            <Button variant="ghost" size="sm" className="text-xs">
              {isRtl ? "العودة للقائمة" : "Back to Quotes"}
            </Button>
          </Link>
        </div>
      </div>

      {/* Linked Opportunity Banner (if present) */}
      {linkedOpp && (
        <Card className="border-primary/40 bg-primary/5 shadow-xs">
          <CardContent className="p-3 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary shrink-0" />
              <div>
                <span className="font-semibold text-foreground">
                  {isRtl ? "مرتبط بالصفقة البيعية:" : "Linked Opportunity:"}{" "}
                  <span className="font-mono text-primary font-bold">{linkedOpp.opportunity_number}</span> — {linkedOpp.title}
                </span>
                <span className="text-[11px] text-muted-foreground mr-2">({linkedOpp.stage})</span>
              </div>
            </div>
            <Link to="/admin/crm" search={{ opportunityId: linkedOpp.id }}>
              <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 text-primary px-2">
                <ExternalLink className="h-3 w-3" />
                <span>{isRtl ? "عرض في CRM" : "View in CRM"}</span>
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* ── Compact Header Bar: Customer & Quote Context ── */}
      <Card className="shadow-xs bg-card border-border/80">
        <CardContent className="p-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Customer Selector */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">
                {isRtl ? "العميل المستهدف *" : "Customer *"}
              </Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={isRtl ? "اختر العميل..." : "Select Customer..."} />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.name} {c.phone ? `(${c.phone})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCustomer && (
                <div className="text-[11px] text-muted-foreground truncate pt-0.5">
                  {selectedCustomer.phone && <span>📞 {selectedCustomer.phone}</span>}
                  {selectedCustomer.address && <span className="mr-2">📍 {selectedCustomer.address}</span>}
                </div>
              )}
            </div>

            {/* Quote Number */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">
                {isRtl ? "رقم عرض السعر" : "Quote Number"}
              </Label>
              <Input
                value={quoteNumber}
                onChange={(e) => setQuoteNumber(e.target.value)}
                className="h-9 text-xs font-mono font-bold text-primary"
                placeholder="PLC-00001"
              />
            </div>

            {/* Valid Until */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">
                {isRtl ? "صالح حتى" : "Valid Until"}
              </Label>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Commercial Quotation Line Items (Core Simplified Form) ── */}
      <Card className="shadow-xs border-primary/20">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <span>{isRtl ? "بنود عرض السعر والمواصفات الفنية" : "Quotation Items & Technical Specs"}</span>
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {isRtl
                ? "اختر الفئة، اكتب المقاسات والمواصفات، وحدد السعر مباشرة."
                : "Select category, enter dimensions and specifications, and set the price directly."}
            </CardDescription>
          </div>

          {/* ONE Obvious Action to Add Items */}
          <Button
            size="sm"
            onClick={() => addLine("")}
            className="gap-1.5 text-xs bg-primary text-primary-foreground font-semibold shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{isRtl ? "إضافة بند جديد" : "+ Add Item"}</span>
          </Button>
        </CardHeader>

        <CardContent className="space-y-5">
          {lines.map((line, idx) => (
            <div
              key={line.id}
              className="border border-border/80 rounded-xl p-4 bg-card shadow-2xs space-y-3.5 transition hover:border-primary/40"
            >
              {/* Item Header Bar */}
              <div className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-xs font-bold px-2 py-0.5">
                    #{idx + 1}
                  </Badge>
                  <span className="font-semibold text-sm">
                    {line.category ? `${line.categoryNameAr} — ${line.name}` : (isRtl ? "بند جديد (اختر نوع المنتج)" : "New Item (Select Product Category)")}
                  </span>
                  {line.category && line.dimensions?.width ? (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      {[line.dimensions.width, line.dimensions.height, line.dimensions.depth]
                        .filter((v): v is number => v !== undefined && v !== null && !isNaN(v))
                        .join(" × ")} {line.dimensions.unit || "m"}
                    </Badge>
                  ) : null}
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => moveLine(idx, "up")}
                    disabled={idx === 0}
                    title={isRtl ? "تحريك لأعلى" : "Move up"}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => moveLine(idx, "down")}
                    disabled={idx === lines.length - 1}
                    title={isRtl ? "تحريك لأسفل" : "Move down"}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => duplicateLine(idx)}
                    title={isRtl ? "تكرار البند" : "Duplicate line"}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  {lines.length > 1 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      onClick={() => removeLine(idx)}
                      title={isRtl ? "حذف البند" : "Remove line"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {!line.category ? (
                /* Step 1 Clean Initial State: Choose from Catalog or Category */
                <div className="p-4 sm:p-5 bg-muted/20 border border-dashed border-primary/40 rounded-xl space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5">
                    <div>
                      <Label className="text-sm font-bold text-foreground flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span>{isRtl ? "اختر الصنف من الكتالوج أو الفئة *" : "Select Catalog Item or Product Category *"}</span>
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isRtl
                          ? "يمكنك اختيار صنف جاهز من الكتالوج لتحميل المواصفات والأسعار مباشرة، أو اختيار فئة عامة."
                          : "Choose an item directly from the catalog database or select a category template to start."}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                    {/* Option A: Select from Catalog Database */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-primary flex items-center gap-1">
                        <Database className="h-3.5 w-3.5" />
                        <span>{isRtl ? "أصناف الكتالوج وقاعدة البيانات" : "From Catalog Database"}</span>
                      </Label>
                      <Select
                        value={line.productId || ""}
                        onValueChange={(v) => handleProductSelect(idx, v)}
                      >
                        <SelectTrigger className="h-10 font-medium text-xs sm:text-sm bg-background border-primary/50 focus:ring-primary shadow-xs">
                          <SelectValue placeholder={isRtl ? "اختر صنفاً من الكتالوج..." : "Select from catalog items..."} />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id} className="text-xs sm:text-sm py-1.5">
                              <span className="font-mono text-[10px] text-muted-foreground mr-1.5">[{p.code}]</span>
                              <span className="font-semibold">{p.nameAr}</span>
                              {p.basePrice > 0 && (
                                <span className="text-primary font-mono text-xs ml-1.5 font-bold">
                                  ({formatEGP(p.basePrice)})
                                </span>
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Option B: Select Category Template */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                        <Layers className="h-3.5 w-3.5" />
                        <span>{isRtl ? "أو فئة عامة / بند مخصص" : "Or Category Template"}</span>
                      </Label>
                      <Select
                        value={line.category || ""}
                        onValueChange={(v) => handleCategoryChange(idx, v)}
                      >
                        <SelectTrigger className="h-10 font-medium text-xs sm:text-sm bg-background border-border focus:ring-primary shadow-xs">
                          <SelectValue placeholder={isRtl ? "اختر نوع المنتج / Select product category" : "Select product category / اختر نوع المنتج"} />
                        </SelectTrigger>
                        <SelectContent>
                          {activeCategories.map((c) => (
                            <SelectItem key={c.id || c.code} value={c.code} className="text-xs sm:text-sm py-1.5">
                              <span className="font-semibold">{c.nameAr}</span>
                              <span className="text-muted-foreground text-xs mx-1.5 font-normal">({c.nameEn})</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ) : (
                /* Full Step-by-Step Form Once Category / Item Is Selected */
                <>
                  {/* STEP 1: Select Catalog Item, Title & Quantity */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    {/* Catalog Item Combobox/Dropdown */}
                    <div className="sm:col-span-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold flex items-center gap-1">
                          <Database className="h-3.5 w-3.5 text-primary" />
                          <span>{isRtl ? "صنف الكتالوج" : "Catalog Item"}</span>
                        </Label>
                        {line.productCode && (
                          <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 text-primary border-primary/30">
                            {line.productCode}
                          </Badge>
                        )}
                      </div>
                      <Select
                        value={line.productId || (line.isCustom ? "custom" : "")}
                        onValueChange={(v) => handleProductSelect(idx, v)}
                      >
                        <SelectTrigger className="h-9 font-medium text-xs">
                          <SelectValue placeholder={isRtl ? "اختر من الكتالوج..." : "Select catalog product..."} />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          <SelectItem value="custom" className="text-xs font-semibold text-primary">
                            {isRtl ? "✦ صنف مخصص / غير مدرج بالكتالوج" : "✦ Custom / Non-Catalog Item"}
                          </SelectItem>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id} className="text-xs">
                              <span className="font-mono text-[10px] text-muted-foreground mr-1.5">[{p.code}]</span>
                              <span className="font-medium">{p.nameAr}</span>
                              {p.basePrice > 0 && (
                                <span className="text-muted-foreground text-[10px] ml-1.5">
                                  ({formatEGP(p.basePrice)})
                                </span>
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Item Name / Description (Fully Editable) */}
                    <div className="sm:col-span-5 space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">{isRtl ? "اسم البند والوصف" : "Item Title / Description"}</Label>
                        <span className="text-[10px] text-muted-foreground">
                          {line.categoryNameAr ? `(${line.categoryNameAr})` : ""}
                        </span>
                      </div>
                      <Input
                        value={line.name}
                        onChange={(e) => updateLine(idx, { name: e.target.value })}
                        placeholder={isRtl ? `مثال: ${line.categoryNameAr} مودرن` : "e.g. Modern Custom Cabinet"}
                        className="h-9 text-xs"
                      />
                    </div>

                    {/* Quantity & Commercial Pricing Unit */}
                    <div className="sm:col-span-3 space-y-1">
                      <Label className="text-xs font-semibold">{isRtl ? "الكمية والوحدة" : "Quantity & Unit"}</Label>
                      <div className="flex gap-1.5">
                        <Input
                          type="number"
                          step="any"
                          min={0.01}
                          value={line.quantity === 0 ? "" : line.quantity}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateLine(idx, { quantity: val === "" ? 0 : Math.max(0.01, Number(val)) });
                          }}
                          placeholder="1"
                          className="h-9 w-20 text-xs font-semibold text-center"
                        />
                        <Select
                          value={line.pricingUnit}
                          onValueChange={(v: CommercialPricingUnit) => {
                            const u = COMMERCIAL_PRICING_UNITS.find((unit) => unit.code === v);
                            updateLine(idx, {
                              pricingUnit: v,
                              pricingUnitAr: u?.labelAr ?? "عدد",
                              pricingUnitEn: u?.labelEn ?? "pcs",
                            });
                          }}
                        >
                          <SelectTrigger className="h-9 text-xs flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COMMERCIAL_PRICING_UNITS.map((u) => (
                              <SelectItem key={u.code} value={u.code} className="text-xs">
                                {u.labelAr} ({u.labelEn})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* STEP 2 & 3: Dimensions & Commercial Price */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                    {/* Dimensions Group */}
                    <div className="md:col-span-7 bg-muted/20 p-2.5 rounded-lg border border-border/60 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-foreground">
                          {isRtl ? "المقاسات والأبعاد:" : "Dimensions:"}
                        </Label>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-muted-foreground">{isRtl ? "الوحدة:" : "Unit:"}</span>
                          <Select
                            value={line.dimensions?.unit || "m"}
                            onValueChange={(v: CommercialDimensionUnit) =>
                              updateLine(idx, {
                                dimensions: {
                                  ...(line.dimensions || {}),
                                  unit: v,
                                },
                              })
                            }
                          >
                            <SelectTrigger className="h-6 w-20 text-[11px] py-0 px-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {COMMERCIAL_DIMENSION_UNITS.map((u) => (
                                <SelectItem key={u.code} value={u.code} className="text-xs">
                                  {u.labelAr} ({u.labelEn})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Input
                            type="number"
                            step="any"
                            placeholder={isRtl ? "العرض (W)" : "Width"}
                            className="h-8 text-xs bg-background"
                            value={line.dimensions?.width ?? ""}
                            onChange={(e) =>
                              updateLine(idx, {
                                dimensions: {
                                  ...(line.dimensions || { unit: "m" }),
                                  width: e.target.value !== "" ? Number(e.target.value) : undefined,
                                },
                              })
                            }
                          />
                        </div>
                        <div>
                          <Input
                            type="number"
                            step="any"
                            placeholder={isRtl ? "الارتفاع (H)" : "Height"}
                            className="h-8 text-xs bg-background"
                            value={line.dimensions?.height ?? ""}
                            onChange={(e) =>
                              updateLine(idx, {
                                dimensions: {
                                  ...(line.dimensions || { unit: "m" }),
                                  height: e.target.value !== "" ? Number(e.target.value) : undefined,
                                },
                              })
                            }
                          />
                        </div>
                        <div>
                          <Input
                            type="number"
                            step="any"
                            placeholder={isRtl ? "العمق (D)" : "Depth"}
                            className="h-8 text-xs bg-background"
                            value={line.dimensions?.depth ?? ""}
                            onChange={(e) =>
                              updateLine(idx, {
                                dimensions: {
                                  ...(line.dimensions || { unit: "m" }),
                                  depth: e.target.value !== "" ? Number(e.target.value) : undefined,
                                },
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>

                    {/* Direct Commercial Price Group */}
                    <div className="md:col-span-5 bg-primary/5 p-2.5 rounded-lg border border-primary/20 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5 text-primary" />
                          <span>
                            {line.quantity > 1
                              ? isRtl
                                ? "سعر الوحدة التجارية:"
                                : "Unit Price:"
                              : isRtl
                              ? "سعر البند الإجمالي:"
                              : "Total Item Price:"}
                          </span>
                        </Label>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {line.pricingUnitAr}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          step="any"
                          min={0}
                          value={line.unitPrice === 0 ? "" : line.unitPrice}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateLine(idx, { unitPrice: val === "" ? 0 : Math.max(0, Number(val)) });
                          }}
                          placeholder="0"
                          className="h-8 text-xs font-bold font-mono bg-background text-primary"
                        />
                        <div className="whitespace-nowrap text-right rtl:text-right ltr:text-left">
                          <span className="text-xs font-serif font-bold text-primary block">
                            {formatEGP(line.lineTotal)}
                          </span>
                          {line.quantity > 1 && (
                            <span className="text-[10px] text-muted-foreground block">
                              ({line.quantity} × {formatEGP(line.unitPrice)})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Technical Specifications & Optional Design Image */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                    {/* Specifications Area */}
                    <div className="md:col-span-8 space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-muted-foreground">
                          {isRtl ? "المواصفات الفنية:" : "Technical Specifications:"}
                        </Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-5 text-[11px] text-primary gap-1 px-1.5"
                          onClick={() => {
                            const cat = categories.find((c) => c.code === line.category);
                            if (cat?.defaultSpecsTemplateAr) {
                              updateLine(idx, { technicalSpecs: cat.defaultSpecsTemplateAr });
                              toast.success(isRtl ? "تم ملء القالب الفني" : "Template loaded");
                            }
                          }}
                        >
                          <Sparkles className="h-3 w-3" />
                          <span>{isRtl ? "قالب فني جاهز" : "Load Template"}</span>
                        </Button>
                      </div>
                      <Textarea
                        rows={3}
                        value={line.technicalSpecs}
                        onChange={(e) => updateLine(idx, { technicalSpecs: e.target.value })}
                        placeholder={
                          isRtl
                            ? "• الهيكل الداخلي والخارجي، نوع الخشب، المفصلات، والتشطيب..."
                            : "Enter multiline technical specifications..."
                        }
                        className="text-xs leading-relaxed font-sans"
                      />
                    </div>

                    {/* Optional Design Image */}
                    <div className="md:col-span-4 space-y-1">
                      <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                        <ImageIcon className="h-3.5 w-3.5" />
                        <span>{isRtl ? "صورة التصميم (اختياري):" : "Design Photo (Optional):"}</span>
                      </Label>
                      <Input
                        value={line.imageUrl || ""}
                        onChange={(e) => updateLine(idx, { imageUrl: e.target.value })}
                        placeholder="https://... أو data:image/..."
                        className="h-8 text-xs"
                      />
                      {line.imageUrl ? (
                        <div className="relative mt-1 border rounded p-1 bg-muted/20 flex items-center justify-center h-16 overflow-hidden">
                          <img src={line.imageUrl} alt={line.name} className="max-h-full max-w-full object-contain rounded" />
                          <Button
                            size="icon"
                            variant="destructive"
                            className="h-4 w-4 absolute top-1 right-1"
                            onClick={() => updateLine(idx, { imageUrl: "" })}
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}

          {/* Obvious Bottom Button to Add More Items */}
          <div className="pt-2 flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => addLine("")}
              className="gap-2 border-dashed border-primary/40 text-primary hover:bg-primary/5 w-full sm:w-auto px-6 py-3 font-semibold text-xs"
            >
              <Plus className="h-4 w-4" />
              <span>{isRtl ? "إضافة بند آخر" : "+ Add Another Line"}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Clearly Separated Optional Contract & Delivery Terms ── */}
      <Card className="shadow-xs border-dashed border-border/80 bg-muted/10">
        <CardHeader
          className="py-3 px-4 cursor-pointer select-none"
          onClick={() => setShowTerms(!showTerms)}
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-semibold">
                {isRtl ? "شروط التعاقد والضمان والتسليم" : "Contract Terms & Milestones"}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground bg-background">
                <span>{isRtl ? "جدول دفعات التعاقد" : "Payment Schedule"}</span>: 60% / 30% / 10% • {terms.deliveryDays} {isRtl ? "يوم" : "days"} • {terms.warrantyYears} {isRtl ? "سنوات ضمان" : "yr warranty"}
              </Badge>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground">
                {showTerms ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                <span>{showTerms ? (isRtl ? "إخفاء التفاصيل" : "Hide") : (isRtl ? "تعديل الشروط" : "Edit")}</span>
              </Button>
            </div>
          </div>
        </CardHeader>

        {showTerms && (
          <CardContent className="space-y-4 pt-1 pb-4 px-4 border-t">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Delivery Timeline */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <Truck className="h-3.5 w-3.5 text-primary" />
                  <span>{isRtl ? "مدة التسليم (أيام عمل)" : "Delivery (Days)"}</span>
                </Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={1}
                    value={terms.deliveryDays}
                    onChange={(e) => setTerms({ ...terms, deliveryDays: Number(e.target.value) || 30 })}
                    className="h-8 text-xs"
                  />
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {isRtl ? "يوم عمل" : "days"}
                  </span>
                </div>
              </div>

              {/* Warranty Duration */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  <span>{isRtl ? "فترة الضمان (سنوات)" : "Warranty (Years)"}</span>
                </Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={0}
                    value={terms.warrantyYears}
                    onChange={(e) => setTerms({ ...terms, warrantyYears: Number(e.target.value) || 5 })}
                    className="h-8 text-xs"
                  />
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {isRtl ? "سنوات" : "years"}
                  </span>
                </div>
              </div>

              {/* Transport & Installation Included */}
              <div className="space-y-1 flex flex-col justify-end">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer p-2 border rounded-md bg-background">
                  <input
                    type="checkbox"
                    checked={terms.transportAndInstallIncluded}
                    onChange={(e) => setTerms({ ...terms, transportAndInstallIncluded: e.target.checked })}
                    className="rounded text-primary focus:ring-primary h-4 w-4"
                  />
                  <span>{isRtl ? "السعر شامل النقل والتركيب" : "Includes transport & installation"}</span>
                </label>
              </div>
            </div>

            {/* Payment Schedule (60% / 30% / 10%) */}
            <div className="space-y-2 pt-1">
              <Label className="text-xs font-semibold flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                <span>{isRtl ? "جدول دفعات التعاقد" : "Payment Schedule"}</span>
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(terms.paymentSchedule || []).map((ms, idx) => (
                  <div key={idx} className="border p-2 rounded-md bg-background space-y-1 text-xs">
                    <div className="flex justify-between items-center font-medium">
                      <span>{ms.timingAr || ms.timing}</span>
                      <Badge variant="outline" className="font-bold text-primary text-[10px]">
                        {ms.percent}%
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={ms.percent}
                        onChange={(e) => updatePaymentMilestone(idx, Number(e.target.value))}
                        className="h-6 text-xs w-16"
                      />
                      <span className="text-[10px] text-muted-foreground">
                        = {formatEGP((totals.total * ms.percent) / 100)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom Notes */}
            <div className="space-y-1 pt-1">
              <Label className="text-xs font-semibold">
                {isRtl ? "ملاحظات إضافية خاصة بالمشروع" : "Additional Project Notes"}
              </Label>
              <Textarea
                rows={2}
                value={terms.customNotes || ""}
                onChange={(e) => setTerms({ ...terms, customNotes: e.target.value })}
                placeholder={isRtl ? "أي بنود أو اشتراطات خاصة بهذا المشروع..." : "Any custom project terms..."}
                className="text-xs"
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Compact Totals & Final Save Card ── */}
      <Card className="shadow-xs border-primary/30">
        <CardHeader className="py-3 px-4 border-b">
          <CardTitle className="text-base flex items-center justify-between">
            <span>{isRtl ? "إجمالي عرض السعر والاعتماد" : "Quotation Summary & Totals"}</span>
            <span className="font-mono text-sm text-primary font-bold">{quoteNumber}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            {/* Discount Section (Amount or Percent) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">{isRtl ? "الخصم التجاري" : "Discount"}</Label>
                <div className="flex items-center gap-1 border rounded-md p-0.5 bg-muted/30 text-xs">
                  <button
                    type="button"
                    onClick={() => setDiscountType("amount")}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                      discountType === "amount" ? "bg-background shadow-xs text-primary font-bold" : "text-muted-foreground"
                    }`}
                  >
                    {isRtl ? "مبلغ (ج.م.)" : "Amount (EGP)"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType("percent")}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                      discountType === "percent" ? "bg-background shadow-xs text-primary font-bold" : "text-muted-foreground"
                    }`}
                  >
                    {isRtl ? "نسبة (%)" : "Percent (%)"}
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <Input
                  type="number"
                  min={0}
                  placeholder={discountType === "amount" ? (isRtl ? "قيمة الخصم بالجنيه..." : "Discount in EGP...") : "%"}
                  value={discountValue === 0 ? "" : discountValue}
                  onChange={(e) => setDiscountValue(e.target.value === "" ? 0 : Number(e.target.value))}
                  className="h-8 text-xs"
                />
                <Input
                  placeholder={isRtl ? "كود الخصم (اختياري)..." : "Code (optional)"}
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value)}
                  className="h-8 text-xs w-36"
                />
              </div>

              {/* VAT toggle */}
              <div className="pt-1">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyVat}
                    onChange={(e) => setApplyVat(e.target.checked)}
                    className="rounded text-primary focus:ring-primary h-4 w-4"
                  />
                  <span>{isRtl ? "إضافة ضريبة القيمة المضافة (14%)" : "Apply 14% VAT"}</span>
                </label>
              </div>
            </div>

            {/* Calculations Breakdown */}
            <div className="space-y-1.5 text-xs bg-muted/30 p-3.5 rounded-lg border">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{isRtl ? "المجموع الفرعي (قبل الخصم):" : "Subtotal:"}</span>
                <span className="font-medium">{formatEGP(totals.subtotal)}</span>
              </div>
              {totals.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>{isRtl ? "الخصم المطبق:" : "Discount:"}</span>
                  <span>− {formatEGP(totals.discountAmount)}</span>
                </div>
              )}
              {applyVat && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{isRtl ? "ضريبة القيمة المضافة (14%):" : "VAT (14%):"}</span>
                  <span>{formatEGP(totals.vatAmount)}</span>
                </div>
              )}
              <Separator className="my-1" />
              <div className="flex justify-between items-baseline font-serif text-lg sm:text-xl font-bold text-primary">
                <span>{isRtl ? "السعر الإجمالي بعد الخصم:" : "Grand Total:"}</span>
                <span>{formatEGP(totals.total)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground pt-0.5">
                <span>{isRtl ? "الدفعة المقدمة المقترحة (60%):" : "Suggested Advance (60%):"}</span>
                <span className="font-semibold text-foreground">{formatEGP(totals.depositAmount)}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Action Buttons: 2 Prominent Actions & Secondary Exports */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
            <div className="text-xs text-muted-foreground">
              {isRtl ? "الحالة:" : "Status:"}{" "}
              <Badge variant={status === "sent" ? "default" : "secondary"} className="capitalize">
                {status}
              </Badge>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewOpen(true)}
                className="gap-1.5 text-primary border-primary/30 hover:bg-primary/5 text-xs font-semibold"
              >
                <Eye className="h-4 w-4" />
                <span>{isRtl ? "معاينة عرض السعر" : "Preview"}</span>
              </Button>
              <Button
                size="sm"
                variant="default"
                disabled={saving || generatingPdf}
                onClick={() => handleSave("draft")}
                className="gap-1.5 bg-primary text-primary-foreground font-semibold shadow-xs text-xs"
              >
                <Save className="h-4 w-4" />
                <span>{isRtl ? "حفظ كمسودة" : "Save as Draft"}</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={saving || generatingPdf}
                onClick={() => handleSave("sent")}
                className="gap-1.5 text-xs"
              >
                <span>{isRtl ? "اعتماد وإرسال عرض السعر" : "Send Quote"}</span>
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={saving || generatingPdf}
                onClick={handleDownloadPdf}
                className="gap-1.5 text-xs"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{generatingPdf ? (isRtl ? "جاري التجهيز..." : "Generating...") : isRtl ? "تحميل PDF" : "Download PDF"}</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── In-Builder Quotation Preview Dialog (Shaheen 4-column Presentation) ── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl font-bold font-serif flex items-center gap-2">
                  <span>{isRtl ? "معاينة عرض السعر التجاري" : "Quotation Preview"}</span>
                  <Badge variant="outline" className="border-emerald-600 text-emerald-700 bg-emerald-50 text-xs">
                    {quoteNumber}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {isRtl
                    ? "معاينة حية للمقايسة كما ستظهر في المستند والـ PDF الموجه للعميل (مظهر مستر شاهين)."
                    : "Live preview of the quotation document matching the Shaheen visual presentation."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Document Preview Canvas */}
          <div className="border rounded-xl p-5 bg-card space-y-6 shadow-xs text-xs">
            {/* Header / Brand & Meta */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
              <div>
                <div className="text-2xl font-serif font-black tracking-wider text-primary">PELECANON</div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-widest">
                  Modern Woodwork & Architectural Solutions
                </div>
              </div>
              <div className="text-left rtl:text-right space-y-0.5 text-[11px]">
                <div>
                  <span className="text-muted-foreground">{isRtl ? "رقم المقايسة:" : "Quote #:"}</span>{" "}
                  <span className="font-mono font-bold text-foreground">{quoteNumber}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{isRtl ? "التاريخ:" : "Date:"}</span>{" "}
                  <span className="font-medium">{new Date().toISOString().slice(0, 10)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{isRtl ? "صالح حتى:" : "Valid Until:"}</span>{" "}
                  <span className="font-medium">{validUntil}</span>
                </div>
              </div>
            </div>

            {/* Customer Box */}
            <div className="bg-muted/20 border rounded-lg p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <span className="text-muted-foreground block text-[10px]">{isRtl ? "العميل المستهدف" : "Customer"}</span>
                <span className="font-bold text-foreground text-sm">{selectedCustomer?.name || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">{isRtl ? "رقم الهاتف" : "Phone"}</span>
                <span className="font-mono text-foreground">{selectedCustomer?.phone || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">{isRtl ? "العنوان" : "Address"}</span>
                <span className="text-foreground truncate block">{selectedCustomer?.address || "القاهرة، مصر"}</span>
              </div>
            </div>

            {/* Shaheen 4-Column Table */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-primary/10 text-primary font-bold border-b text-right rtl:text-right ltr:text-left">
                    <th className="p-2.5 w-12 text-center">م</th>
                    <th className="p-2.5 w-48">{isRtl ? "البند والتصميم" : "Item & Design"}</th>
                    <th className="p-2.5 w-40">{isRtl ? "المقاسات والكمية" : "Dimensions & Qty"}</th>
                    <th className="p-2.5">{isRtl ? "المواصفات الفنية" : "Technical Specs"}</th>
                    <th className="p-2.5 w-32 text-center">{isRtl ? "السعر" : "Price"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lines.map((line, idx) => {
                    const dims = [line.dimensions?.width, line.dimensions?.height, line.dimensions?.depth]
                      .filter((v): v is number => v !== undefined && v !== null && !isNaN(v))
                      .join(" × ");
                    return (
                      <tr key={line.id} className="align-top hover:bg-muted/10 transition">
                        <td className="p-2.5 text-center font-mono font-bold text-muted-foreground">{idx + 1}</td>
                        <td className="p-2.5 space-y-2">
                          <div className="font-bold text-foreground">{line.name || (isRtl ? "بند بدون اسم" : "Unnamed Item")}</div>
                          {line.categoryNameAr ? (
                            <Badge variant="outline" className="text-[10px]">
                              {line.categoryNameAr}
                            </Badge>
                          ) : null}
                          {line.imageUrl ? (
                            <div className="mt-1 border rounded p-1 bg-background h-20 w-28 flex items-center justify-center overflow-hidden">
                              <img src={line.imageUrl} alt={line.name} className="max-h-full max-w-full object-contain" />
                            </div>
                          ) : null}
                        </td>
                        <td className="p-2.5 space-y-1">
                          {dims ? (
                            <div className="font-mono text-[11px] font-semibold text-foreground">
                              {dims} {line.dimensions?.unit || "m"}
                            </div>
                          ) : (
                            <div className="text-muted-foreground text-[11px]">مقاسات معتمدة</div>
                          )}
                          <div className="text-muted-foreground text-[11px]">
                            {isRtl ? "الكمية:" : "Qty:"}{" "}
                            <span className="font-bold text-foreground">
                              {line.quantity} {line.pricingUnitAr}
                            </span>
                          </div>
                        </td>
                        <td className="p-2.5 text-muted-foreground whitespace-pre-line leading-relaxed text-[11px]">
                          {line.technicalSpecs || "—"}
                        </td>
                        <td className="p-2.5 text-center space-y-1">
                          <div className="font-serif text-sm font-bold text-primary">
                            {formatEGP(line.lineTotal)}
                          </div>
                          {line.quantity > 1 && (
                            <div className="text-[10px] text-muted-foreground">
                              ({formatEGP(line.unitPrice)} / {line.pricingUnitAr})
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals Summary */}
            <div className="flex justify-end">
              <div className="w-full sm:w-80 space-y-1.5 bg-muted/20 p-3 rounded-lg border text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{isRtl ? "المجموع الفرعي:" : "Subtotal:"}</span>
                  <span className="font-medium">{formatEGP(totals.subtotal)}</span>
                </div>
                {totals.discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>{isRtl ? "الخصم التجاري:" : "Discount:"}</span>
                    <span>− {formatEGP(totals.discountAmount)}</span>
                  </div>
                )}
                {applyVat && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>{isRtl ? "ضريبة القيمة المضافة (14%):" : "VAT (14%):"}</span>
                    <span>{formatEGP(totals.vatAmount)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-serif text-base font-bold text-primary">
                  <span>{isRtl ? "الإجمالي النهائي:" : "Grand Total:"}</span>
                  <span>{formatEGP(totals.total)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground pt-0.5">
                  <span>{isRtl ? "الدفعة المقدمة (60%):" : "Advance (60%):"}</span>
                  <span className="font-bold text-foreground">{formatEGP(totals.depositAmount)}</span>
                </div>
              </div>
            </div>

            {/* Contract Conditions / Shaheen Terms */}
            <div className="border rounded-lg p-3 bg-muted/10 space-y-2 text-xs">
              <div className="font-bold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span>{isRtl ? "الشروط والأحكام والضمان المعتمدة" : "Contract Terms & Milestones"}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                <div>
                  • {isRtl ? "مدة التسليم:" : "Delivery:"} {terms.deliveryDays} {isRtl ? "يوم عمل" : "days"}
                </div>
                <div>
                  • {isRtl ? "الضمان الفعلي:" : "Warranty:"} {terms.warrantyYears} {isRtl ? "سنوات" : "years"}
                </div>
                <div>
                  • {isRtl ? "شروط الدفع:" : "Payment:"} 60% / 30% / 10%
                </div>
              </div>
              {terms.customNotes && (
                <div className="text-[11px] text-muted-foreground pt-1 border-t">
                  <span className="font-medium text-foreground">{isRtl ? "ملاحظات:" : "Notes:"}</span> {terms.customNotes}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setPreviewOpen(false)}>
              {isRtl ? "إغلاق المعاينة" : "Close Preview"}
            </Button>
            <Button
              onClick={() => {
                setPreviewOpen(false);
                handleSave("draft");
              }}
              disabled={saving}
              className="gap-1.5 bg-primary text-primary-foreground font-semibold"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{isRtl ? "حفظ كمسودة" : "Save as Draft"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
