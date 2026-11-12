import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import {
  updateQuoteStatus,
  getQuoteCommercialContext,
  approveQuoteAndRequestConfirmation,
  recordCustomerQuoteConsent,
  recordCustomerQuoteDecision,
  getQuotationProgressiveStatus,
} from "@/lib/quote.functions";
import { QUOTATION_STAGE_LABEL_AR, type QuotationLifecycleStage } from "@/lib/stages";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEGP } from "@/lib/pricing";
import { sendNotification } from "@/lib/notifications.functions";
import { generatePdf } from "@/lib/pdf.functions";
import { toast } from "sonner";
import {
  ArrowRight,
  Download,
  Briefcase,
  ExternalLink,
  Edit,
  ShieldCheck,
  Truck,
  Calendar,
  ImageIcon,
  Sparkles,
  UserCircle,
  FolderKanban,
  ClipboardList,
  Package,
  Receipt,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";
import { InternalNotes } from "@/components/admin/InternalNotes";
import { convertQuoteToOrder } from "@/lib/transactional.functions";
import { Customer360Drawer } from "@/components/customers/Customer360Drawer";

const TreeConfigurator = lazy(() =>
  import("@/components/quote/TreeConfigurator").then((m) => ({ default: m.TreeConfigurator })),
);

const QuoteCatalogSummary = lazy(() =>
  import("@/components/quote/QuoteCatalogSummary").then((m) => ({ default: m.QuoteCatalogSummary })),
);

export const Route = createFileRoute("/admin/quotes/$id")({ component: QuoteDetail });

function QuoteDetail() {
  const { id } = Route.useParams();
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const nav = useNavigate();
  const [quote, setQuote] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [customer, setCustomer] = useState<any>(null);
  const [customer360Id, setCustomer360Id] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [isV2, setIsV2] = useState<boolean | null>(null);
  const [commercialContext, setCommercialContext] = useState<any>(null);

  const getCommercialContextFn = useServerFn(getQuoteCommercialContext);

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    const { data: q } = await supabase.from("quotes").select("*").eq("id", id).single();
    setQuote(q);
    if (q) {
      const { data: c } = await supabase
        .from("customers")
        .select("*")
        .eq("id", q.customer_id)
        .single();
      setCustomer(c);

      // Check if this is a V2 quote (has hierarchy data)
      const { data: products } = await supabase
        .from("quotation_products")
        .select("id")
        .eq("quotation_id", id)
        .limit(1);
      const v2 = (products?.length ?? 0) > 0;
      setIsV2(v2);

      if (!v2) {
        const { data: its } = await supabase.from("quote_items").select("*").eq("quote_id", id);
        setItems(its ?? []);
      }

      // Fetch linked Opportunity commercial context
      try {
        const cc = await getCommercialContextFn({ data: { quoteId: id } });
        setCommercialContext(cc);
      } catch {
        // Non-blocking
      }
    }
  }

  const notify = useServerFn(sendNotification);
  const convertFn = useServerFn(convertQuoteToOrder);
  const pdfFn = useServerFn(generatePdf);
  const updateStatusFn = useServerFn(updateQuoteStatus);
  const approveAndRequestFn = useServerFn(approveQuoteAndRequestConfirmation);
  const recordConsentFn = useServerFn(recordCustomerQuoteConsent);
  const recordDecisionFn = useServerFn(recordCustomerQuoteDecision);

  const [revisionNotes, setRevisionNotes] = useState("");
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);

  const progStatus: QuotationLifecycleStage = quote ? getQuotationProgressiveStatus(quote) : "draft";

  async function handleApproveAndRequest() {
    setWorking(true);
    try {
      await approveAndRequestFn({ data: { quote_id: id } });
      toast.success(isRtl ? "تم اعتماد عرض السعر وإرسال طلب التأكيد للعميل عبر واتساب" : "Quote approved & WhatsApp confirmation requested");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "فشل اعتماد عرض السعر");
    } finally {
      setWorking(false);
    }
  }

  async function handleRecordConsent(consent: boolean) {
    setWorking(true);
    try {
      await recordConsentFn({ data: { quoteId: id, consent } });
      if (consent) {
        toast.success(isRtl ? "تم تسجيل موافقة العميل وإرسال رابط ملف العرض عبر واتساب" : "Customer consent recorded & PDF link sent");
      } else {
        toast.info(isRtl ? "تم تسجيل عدم رغبة العميل في استلام العرض حالياً" : "Customer decline recorded");
      }
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "فشل تسجيل استجابة العميل");
    } finally {
      setWorking(false);
    }
  }

  async function handleRecordDecision(decision: "accept" | "reject" | "revision_requested", notes?: string) {
    setWorking(true);
    try {
      const res = await recordDecisionFn({ data: { quoteId: id, decision, notes } });
      toast.success(res.message);
      setShowRevisionDialog(false);
      setRevisionNotes("");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "فشل تسجيل قرار العميل");
    } finally {
      setWorking(false);
    }
  }

  async function handleGeneratePdf() {
    if (!quote?.id) {
      toast.error(isRtl ? "بيانات عرض السعر غير متوفرة" : "Quote data not available");
      return;
    }
    setWorking(true);
    try {
      const { downloadUrl } = await pdfFn({ data: { entityType: "quote", entityId: quote.id } });
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
      toast.success(t("quotes.pdfGenerated"));
    } catch (e: any) {
      toast.error(e?.message ?? t("quotes.pdfFailed"));
    } finally {
      setWorking(false);
    }
  }

  async function changeStatus(status: string) {
    setWorking(true);
    try {
      await updateStatusFn({ data: { quote_id: id, status: status as any } });
      if (status === "sent") {
        try {
          await notify({ data: { event: "quote_sent", entityType: "quote", entityId: id } });
        } catch (e) {
          console.warn("[quotes] quote_sent notification failed:", e);
        }
      }
      toast.success(t("quotes.updated"));
      load();
    } catch (e: any) {
      toast.error(e?.message ?? t("quotes.updateFailed"));
    } finally {
      setWorking(false);
    }
  }

  async function convertToInvoice() {
    if (!quote) return;
    if (quote.status !== "accepted") {
      toast.error(isRtl ? "لا يمكن التحويل لأمر إنتاج إلا بعد اعتماد وقبول العميل لعرض السعر أولاً" : "Only accepted quotations can be converted to an order");
      return;
    }
    setWorking(true);

    try {
      const { orderId, orderNumber } = await convertFn({
        data: { quoteId: quote.id },
      });

      if (orderId) {
        try {
          await notify({ data: { event: "order_opened", entityType: "order", entityId: orderId } });
        } catch (e) {
          console.warn("[quotes] order_opened notification failed:", e);
        }
        toast.success(t("quotes.convertedToInvoiceAndOrder", { number: orderNumber }));
      }

      nav({ to: "/admin/orders" });
    } catch (e: any) {
      toast.error(e?.message ?? t("quotes.convertFailed"));
    } finally {
      setWorking(false);
    }
  }

  if (!quote) return <div className="text-muted-foreground">{t("quotes.loading")}</div>;

  return (
    <div className="space-y-6">
      <Link
        to="/admin/quotes"
        className="text-sm text-muted-foreground inline-flex items-center gap-1"
      >
        <ArrowRight className="h-4 w-4 rtl-flip" /> {t("quotes.back")}
      </Link>
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {quote.quote_number?.startsWith("PLC-")
              ? quote.quote_number
              : `${quote.quote_number || t("quotes.draft")}`}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            {customer ? (
              <button
                type="button"
                onClick={() => setCustomer360Id(customer.id)}
                className="text-sm font-medium text-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5 underline underline-offset-4 decoration-primary/40 hover:decoration-primary"
                title={isRtl ? "عرض ملف العميل الشامل (Customer 360)" : "View Customer 360 profile"}
              >
                <UserCircle className="h-4 w-4 text-primary" />
                <span>{customer.name}</span>
                <span className="text-xs text-muted-foreground font-normal">({customer.phone})</span>
              </button>
            ) : (
              <span className="text-sm text-muted-foreground">{customer?.name || "—"}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="text-base px-3 py-1 bg-primary text-primary-foreground">
            {QUOTATION_STAGE_LABEL_AR[progStatus] || quote.status}
          </Badge>
          {quote.snapshot?.version > 1 && (
            <Badge variant="outline" className="text-xs font-mono">
              إصدار V{quote.snapshot.version}
            </Badge>
          )}
        </div>
      </div>

      {/* Quotation Lifecycle Stepper */}
      <Card className="border-muted bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>{isRtl ? "مسار اعتماد وتأكيد عرض السعر" : "Quotation Lifecycle & Customer Confirmation"}</span>
            </CardTitle>
            <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5">
              {QUOTATION_STAGE_LABEL_AR[progStatus] || progStatus}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 text-center text-xs">
            {[
              { id: "draft", label: "المسودة" },
              { id: "awaiting_customer_confirmation", label: "تأكيد واتساب" },
              { id: "approved_for_delivery", label: "الموافقة ع الاستلام" },
              { id: "pdf_sent", label: "إرسال المستند" },
              { id: "awaiting_customer_decision", label: "قرار العميل" },
              { id: "accepted", label: "معتمد تجارياً" },
              { id: "converted", label: "أمر الإنتاج" },
            ].map((step, idx) => {
              const stagesOrder = [
                "draft",
                "awaiting_customer_confirmation",
                "approved_for_delivery",
                "pdf_sent",
                "awaiting_customer_decision",
                "accepted",
                "converted",
              ];
              const curIdx = stagesOrder.indexOf(progStatus === "revision_requested" ? "draft" : progStatus);
              const isPast = curIdx > idx;
              const isCurrent = curIdx === idx;
              return (
                <div
                  key={step.id}
                  className={`p-2 rounded border flex flex-col items-center justify-center gap-1 ${
                    isCurrent
                      ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                      : isPast
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                      : "border-muted bg-muted/20 text-muted-foreground opacity-60"
                  }`}
                >
                  <span className="text-[10px]">{isPast ? "✓" : `0${idx + 1}`}</span>
                  <span className="truncate w-full">{step.label}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quotation-Centered Business Relationships Lifecycle Section */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-3 border-b border-border/60">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
              <Briefcase className="h-4 w-4 text-primary" />
              <span>{isRtl ? "العلاقات التجارية ودورة العمل المتكاملة" : "Business Relationships & Connected Lifecycle"}</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs bg-muted/40 font-mono">
                {quote?.quote_number || quote?.quoteNumber}
              </Badge>
              {commercialContext?.projectId && (
                <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10">
                  <Link
                    to="/admin/projects/$id"
                    params={{ id: commercialContext.projectId }}
                  >
                    <FolderKanban className="h-3 w-3" />
                    <span>{isRtl ? "مساحة عمل المشروع" : "Project Workspace"}</span>
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {/* 1. Customer */}
          <div className="p-3 rounded-lg border border-border/80 bg-card/60 flex flex-col justify-between space-y-2">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                  <UserCircle className="h-3.5 w-3.5 text-primary" />
                  {isRtl ? "العميل" : "Customer"}
                </span>
                <Badge variant="outline" className="text-[10px] text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300">
                  {isRtl ? "مسجل" : "Registered"}
                </Badge>
              </div>
              <div className="mt-1.5 font-semibold text-foreground text-sm truncate">
                {customer?.name || commercialContext?.customerName || "—"}
              </div>
              <div className="text-[11px] font-mono text-muted-foreground truncate">
                {customer?.phone || commercialContext?.customerPhone || customer?.email || commercialContext?.customerEmail || "—"}
              </div>
            </div>
            {(customer?.id || commercialContext?.customerId) && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setCustomer360Id(customer?.id || commercialContext?.customerId)}
                className="w-full h-7 text-xs gap-1.5 cursor-pointer mt-1"
              >
                <Sparkles className="h-3 w-3 text-primary" />
                <span>{isRtl ? "ملف العميل 360°" : "Customer 360°"}</span>
              </Button>
            )}
          </div>

          {/* 2. CRM Opportunity */}
          <div className="p-3 rounded-lg border border-border/80 bg-card/60 flex flex-col justify-between space-y-2">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                  <Briefcase className="h-3.5 w-3.5 text-primary" />
                  {isRtl ? "الفرصة البيعية (CRM)" : "CRM Opportunity"}
                </span>
                <Badge variant="outline" className={`text-[10px] ${commercialContext?.opportunityId ? "text-primary border-primary/30 bg-primary/5" : "text-muted-foreground"}`}>
                  {commercialContext?.opportunityId ? (isRtl ? "مرتبطة" : "Linked") : (isRtl ? "عرض مباشر" : "Direct Quote")}
                </Badge>
              </div>
              <div className="mt-1.5 font-semibold text-foreground truncate">
                {commercialContext?.opportunityTitle || (isRtl ? "عرض سعر تجاري مباشر" : "Direct Commercial Quote")}
              </div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                <span className="font-mono">{commercialContext?.opportunityNumber || "—"}</span>
                {commercialContext?.opportunityStage && (
                  <span>• {commercialContext.opportunityStage}</span>
                )}
              </div>
            </div>
            {commercialContext?.opportunityId ? (
              <Link to="/admin/crm" search={{ opportunityId: commercialContext.opportunityId }}>
                <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1.5">
                  <ExternalLink className="h-3 w-3" />
                  <span>{isRtl ? "عرض في CRM" : "View in CRM"}</span>
                </Button>
              </Link>
            ) : (
              <div className="text-[11px] text-muted-foreground/80 italic py-1">
                {isRtl ? "طلب مباشر من العميل بدون مسار بيعي سابق" : "Direct customer request without prior lead"}
              </div>
            )}
          </div>

          {/* 3. Project Workspace */}
          <div className="p-3 rounded-lg border border-border/80 bg-card/60 flex flex-col justify-between space-y-2">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                  <FolderKanban className="h-3.5 w-3.5 text-primary" />
                  {isRtl ? "مساحة عمل المشروع" : "Project Workspace"}
                </span>
                <Badge variant="outline" className={`text-[10px] ${commercialContext?.projectId ? "text-primary border-primary/30 bg-primary/5" : "text-muted-foreground"}`}>
                  {commercialContext?.projectId ? (isRtl ? "نشط" : "Active") : (isRtl ? "عند القبول" : "Pending")}
                </Badge>
              </div>
              <div className="mt-1.5 font-semibold text-foreground truncate">
                {commercialContext?.projectTitle || (isRtl ? "مشروع العرض" : "Project Workspace")}
              </div>
              <div className="text-[11px] font-mono text-muted-foreground">
                {commercialContext?.projectNumber || (isRtl ? "يُنشأ فور اعتماد العرض" : "Created upon acceptance")}
              </div>
            </div>
            {commercialContext?.projectId ? (
              <Button asChild size="sm" variant="outline" className="w-full h-7 text-xs gap-1.5">
                <Link to="/admin/projects/$id" params={{ id: commercialContext.projectId }}>
                  <FolderKanban className="h-3 w-3" />
                  <span>{isRtl ? "فتح مساحة العمل" : "Open Workspace"}</span>
                </Link>
              </Button>
            ) : (
              <div className="text-[11px] text-muted-foreground/80 italic py-1">
                {isRtl ? "متاح تلقائياً للربط بعد قبول العرض" : "Available automatically after quote acceptance"}
              </div>
            )}
          </div>

          {/* 4. Production Order */}
          <div className="p-3 rounded-lg border border-border/80 bg-card/60 flex flex-col justify-between space-y-2">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                  <ClipboardList className="h-3.5 w-3.5 text-primary" />
                  {isRtl ? "أمر الإنتاج والتصنيع" : "Production Order"}
                </span>
                <Badge variant="outline" className={`text-[10px] ${commercialContext?.orderId ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400" : "text-muted-foreground"}`}>
                  {commercialContext?.orderStage || (isRtl ? "غير منشأ" : "Unordered")}
                </Badge>
              </div>
              <div className="mt-1.5 font-semibold text-foreground">
                {commercialContext?.orderNumber ? (
                  <span className="font-mono">{commercialContext.orderNumber}</span>
                ) : (
                  <span>{isRtl ? "لم يتم تحويله لأمر إنتاج بعد" : "Not yet converted"}</span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {commercialContext?.orderTotal != null ? (
                  <span className="font-mono">{formatEGP(commercialContext.orderTotal)}</span>
                ) : (
                  <span>{isRtl ? "التحويل متاح بعد اعتماد العرض" : "Convertible upon acceptance"}</span>
                )}
              </div>
            </div>
            {commercialContext?.orderId ? (
              <Button asChild size="sm" variant="outline" className="w-full h-7 text-xs gap-1.5">
                <Link to="/admin/orders">
                  <ClipboardList className="h-3 w-3" />
                  <span>{isRtl ? "تتبع الإنتاج" : "Track Production"}</span>
                </Link>
              </Button>
            ) : quote?.status === "accepted" || quote?.status === "approved" || quote?.status === "converted" ? (
              <Button
                size="sm"
                onClick={convertToInvoice}
                disabled={working}
                className="w-full h-7 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <span>{isRtl ? "تحويل إلى أمر إنتاج الآن" : "Convert to Order Now"}</span>
              </Button>
            ) : (
              <div className="text-[11px] text-muted-foreground/80 italic py-1">
                {isRtl ? "يتطلب قبول العميل لإنشاء أمر الإنتاج" : "Requires customer acceptance"}
              </div>
            )}
          </div>

          {/* 5. Delivery & Handover */}
          <div className="p-3 rounded-lg border border-border/80 bg-card/60 flex flex-col justify-between space-y-2">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                  <Truck className="h-3.5 w-3.5 text-primary" />
                  {isRtl ? "التسليم والتركيب" : "Delivery & Handover"}
                </span>
                <Badge variant="outline" className={`text-[10px] ${commercialContext?.deliveryId ? "text-primary border-primary/30 bg-primary/5" : "text-muted-foreground"}`}>
                  {commercialContext?.deliveryStatus || (isRtl ? "مرحلة لاحقة" : "Pending")}
                </Badge>
              </div>
              <div className="mt-1.5 font-semibold text-foreground">
                {commercialContext?.deliveryNumber ? (
                  <span className="font-mono">{commercialContext.deliveryNumber}</span>
                ) : (
                  <span>{isRtl ? "جدولة التسليم" : "Delivery Scheduling"}</span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {commercialContext?.deliveryScheduledDate ? (
                  <span>{new Date(commercialContext.deliveryScheduledDate).toLocaleDateString(isRtl ? "ar-EG" : "en-US")}</span>
                ) : (
                  <span>{isRtl ? "يتم الجدولة بعد اكتمال التصنيع" : "Scheduled after production"}</span>
                )}
              </div>
            </div>
            {commercialContext?.deliveryId ? (
              <Button asChild size="sm" variant="outline" className="w-full h-7 text-xs gap-1.5">
                <Link to="/admin/deliveries">
                  <Truck className="h-3 w-3" />
                  <span>{isRtl ? "سجل التسليم" : "View Delivery"}</span>
                </Link>
              </Button>
            ) : (
              <div className="text-[11px] text-muted-foreground/80 italic py-1">
                {isRtl ? "يُجدول تلقائياً بعد إنهاء أوامر الشغل" : "Scheduled after work orders complete"}
              </div>
            )}
          </div>

          {/* 6. Invoices & Payments */}
          <div className="p-3 rounded-lg border border-border/80 bg-card/60 flex flex-col justify-between space-y-2">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                  <Receipt className="h-3.5 w-3.5 text-primary" />
                  {isRtl ? "الفاتورة والمدفوعات" : "Invoice & Payments"}
                </span>
                <Badge variant="outline" className={`text-[10px] ${commercialContext?.invoiceId ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400" : "text-muted-foreground"}`}>
                  {commercialContext?.invoiceId ? (Number(commercialContext.invoicePaidAmount || 0) >= Number(commercialContext.invoiceTotal || 0) ? (isRtl ? "مسددة" : "Paid") : (isRtl ? "تحت التحصيل" : "Active")) : (isRtl ? "غير مفوتر" : "Unbilled")}
                </Badge>
              </div>
              <div className="mt-1.5 font-semibold text-foreground font-mono">
                {commercialContext?.invoiceNumber || (isRtl ? "لم تُصدر فاتورة بعد" : "No invoice issued")}
              </div>
              <div className="text-[11px] text-muted-foreground font-mono">
                {commercialContext?.invoiceTotal != null ? (
                  <span>{formatEGP(commercialContext.invoicePaidAmount || 0)} / {formatEGP(commercialContext.invoiceTotal)}</span>
                ) : (
                  <span className="font-sans">{isRtl ? "تُنشأ الدفعة المقدمة عند التعاقد" : "Deposit created upon contract"}</span>
                )}
              </div>
            </div>
            {commercialContext?.invoiceId ? (
              <Button asChild size="sm" variant="outline" className="w-full h-7 text-xs gap-1.5">
                <Link to="/admin/invoices">
                  <Receipt className="h-3 w-3" />
                  <span>{isRtl ? "إدارة الفواتير" : "View Invoices"}</span>
                </Link>
              </Button>
            ) : (
              <div className="text-[11px] text-muted-foreground/80 italic py-1">
                {isRtl ? "تصدر الفاتورة تلقائياً عند تحويل الأمر" : "Issued automatically on conversion"}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {isV2 === null ? (
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      ) : isV2 ? (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{t("quotes.items")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <TreeConfigurator quotationId={id} onTreeChange={() => load()} />
              </Suspense>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{t("quotes.catalogSummary", "Catalog Summary")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<Skeleton className="h-32 w-full" />}>
                <QuoteCatalogSummary quotationId={id} />
              </Suspense>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          {/* Check if Commercial Mode (Shaheen model) */}
          {(() => {
            const snap = (quote.snapshot as any) || {};
            const isCommercial =
              snap.quotationMode === "commercial" ||
              (Array.isArray(snap.lines) && snap.lines.length > 0) ||
              items.some((it) => it.breakdown?.technicalSpecs || it.breakdown?.category);

            if (isCommercial) {
              const commercialLines: any[] =
                Array.isArray(snap.lines) && snap.lines.length > 0
                  ? snap.lines
                  : items.map((it) => {
                      const bd = it.breakdown || {};
                      const dims = bd.dimensions
                        ? `${bd.dimensions.width ?? ""}${bd.dimensions.height ? ` × ${bd.dimensions.height}` : ""}${bd.dimensions.depth ? ` × ${bd.dimensions.depth}` : ""} ${bd.dimensions.unit || "مم"}`.trim()
                        : (it.dimension_value || null);
                      return {
                        id: it.id,
                        name: it.product_name,
                        categoryNameAr: it.material_name || bd.categoryNameAr || "منتج",
                        dimensions: dims,
                        pricingUnitAr: it.finish_name || bd.pricingUnitAr || "عدد",
                        quantity: it.qty,
                        unitPrice: Number(it.unit_price),
                        lineTotal: Number(it.line_total),
                        imageUrl: bd.imageUrl || null,
                        technicalSpecs: bd.technicalSpecs || null,
                      };
                    });

              const termsData = snap.terms;

              return (
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3 flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <span>{isRtl ? "بنود عرض السعر التجاري (مواصفات مستر شاهين)" : "Commercial Quotation Items"}</span>
                        </CardTitle>
                      </div>
                      <Badge variant="outline" className="text-xs border-emerald-600 text-emerald-700 bg-emerald-50">
                        {isRtl ? "مواصفات راقية" : "Shaheen Style"}
                      </Badge>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {commercialLines.map((line, idx) => (
                        <div
                          key={line.id || idx}
                          className="border rounded-xl p-4 bg-muted/20 space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b pb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="font-mono text-xs font-bold">
                                #{idx + 1}
                              </Badge>
                              <span className="font-bold text-base text-foreground">
                                {line.categoryNameAr} — {line.name}
                              </span>
                              {(() => {
                                const dimStr =
                                  typeof line.dimensions === "object" && line.dimensions !== null
                                    ? [line.dimensions.width, line.dimensions.height, line.dimensions.depth]
                                        .filter((v) => v !== undefined && v !== null && v !== "")
                                        .join(" × ") + (line.dimensions.unit ? ` ${line.dimensions.unit}` : "")
                                    : typeof line.dimensions === "string"
                                      ? line.dimensions
                                      : null;
                                return dimStr ? (
                                  <Badge variant="outline" className="text-[11px]">
                                    {dimStr}
                                  </Badge>
                                ) : null;
                              })()}
                            </div>
                            <div className="text-sm font-semibold text-primary">
                              {line.quantity} {line.pricingUnitAr || "عدد"} × {formatEGP(Number(line.unitPrice))} ={" "}
                              <span className="font-mono text-lg font-bold">{formatEGP(Number(line.lineTotal))}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                            {/* Design Photo */}
                            <div className="md:col-span-1">
                              {line.imageUrl ? (
                                <div className="border rounded-lg p-1 bg-background h-32 flex items-center justify-center overflow-hidden">
                                  <img
                                    src={line.imageUrl}
                                    alt={line.name}
                                    className="max-h-full max-w-full object-contain rounded"
                                  />
                                </div>
                              ) : (
                                <div className="border border-dashed rounded-lg p-3 h-32 flex flex-col items-center justify-center text-muted-foreground text-xs bg-background/50">
                                  <ImageIcon className="h-6 w-6 mb-1 text-muted-foreground/40" />
                                  <span>{isRtl ? "تصميم معتمد" : "Approved design"}</span>
                                </div>
                              )}
                            </div>

                            {/* Technical Specs */}
                            <div className="md:col-span-3 space-y-1">
                              <span className="text-xs font-semibold text-muted-foreground block">
                                {isRtl ? "المواصفات الفنية المعتمدة:" : "Technical Specifications:"}
                              </span>
                              <div className="text-xs leading-relaxed text-foreground whitespace-pre-line bg-background p-3 rounded-md border border-border/60">
                                {line.technicalSpecs || isRtl ? "مواصفات قياسية معتمدة من المصنع." : "Standard factory specifications."}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Commercial Terms & Conditions */}
                  {termsData && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-primary" />
                          <span>{isRtl ? "شروط التعاقد والدفع والضمان" : "Contract Terms & Milestones"}</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/10">
                            <Truck className="h-4 w-4 text-primary shrink-0" />
                            <div>
                              <span className="text-muted-foreground block text-[11px]">{isRtl ? "موعد التسليم" : "Delivery"}</span>
                              <span className="font-semibold text-foreground">
                                {termsData.deliveryDays || 30} {isRtl ? "يوم عمل من التعاقد" : "business days"}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/10">
                            <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                            <div>
                              <span className="text-muted-foreground block text-[11px]">{isRtl ? "الضمان الفعلي" : "Warranty"}</span>
                              <span className="font-semibold text-foreground">
                                {termsData.warrantyYears || 5} {isRtl ? "سنوات ضمان فعلي" : "years warranty"}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/10">
                            <Calendar className="h-4 w-4 text-primary shrink-0" />
                            <div>
                              <span className="text-muted-foreground block text-[11px]">{isRtl ? "شروط الدفع" : "Payment Terms"}</span>
                              <span className="font-semibold text-foreground">60% / 30% / 10%</span>
                            </div>
                          </div>
                        </div>

                        {termsData.notes && termsData.notes.length > 0 && (
                          <div className="pt-1">
                            <span className="font-semibold text-muted-foreground block mb-1">
                              {isRtl ? "ملاحظات:" : "Notes:"}
                            </span>
                            <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                              {termsData.notes.map((n: string, i: number) => (
                                <li key={i}>{n}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              );
            }

            // Legacy non-commercial item cards
            return (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{t("quotes.items")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {items.map((it, i) => {
                    const snapItem = quote.snapshot?.items?.[i] ?? {};
                    return (
                      <div key={it.id} className="border rounded-md p-3 text-sm">
                        <div className="flex justify-between font-medium">
                          <span>{it.product_name}</span>
                          <span>{formatEGP(Number(it.line_total))}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {it.material_name} • {it.finish_name} • {it.dimension_value} × {it.qty}
                        </div>
                        {(snapItem.supplier_name || snapItem.supplier_country) && (
                          <div className="text-xs mt-1">
                            <span className="text-muted-foreground">{t("quotes.supplierOrigin")}</span>{" "}
                            <span className="font-medium">{snapItem.supplier_name ?? "—"}</span>
                            {snapItem.supplier_country && (
                              <span className="text-muted-foreground"> • {snapItem.supplier_country}</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })()}
        </>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">{t("quotes.summary")}</CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("quotes.subtotal")}</span>
            <span>{formatEGP(Number(quote.subtotal))}</span>
          </div>
          {Number(quote.discount_amount) > 0 && (
            <div className="flex justify-between text-secondary">
              <span>
                {t("quotes.discount")} ({quote.discount_code})
              </span>
              <span>− {formatEGP(Number(quote.discount_amount))}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("quotes.vat")}</span>
            <span>{formatEGP(Number(quote.vat_amount))}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-mono text-2xl font-bold text-primary">
            <span>{t("quotes.grandTotal")}</span>
            <span>{formatEGP(Number(quote.total))}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {t("quotes.depositSuggested", { pct: quote.deposit_pct })}:{" "}
            {formatEGP((Number(quote.total) * Number(quote.deposit_pct)) / 100)}
          </div>
          <div className="text-xs text-muted-foreground">
            {t("quotes.validUntil")} {quote.valid_until}
          </div>
        </CardContent>
      </Card>

      {/* Progressive Lifecycle Actions Bar */}
      <Card className="border-primary/20 bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span>{isRtl ? "إجراءات دورة حياة عرض السعر" : "Quotation Lifecycle Actions"}</span>
            <span className="text-xs font-normal text-muted-foreground font-mono">
              الحالة: {QUOTATION_STAGE_LABEL_AR[progStatus] || progStatus}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            {/* 1. Draft or Revision Requested */}
            {(progStatus === "draft" || progStatus === "revision_requested") && (
              <>
                <Button asChild variant="outline" className="gap-1.5 cursor-pointer">
                  <Link to="/admin/quotes/new" search={{ quoteId: id }}>
                    <Edit className="h-4 w-4" />
                    <span>{isRtl ? "تعديل عرض السعر" : "Edit Quote"}</span>
                  </Link>
                </Button>
                <Button
                  onClick={handleApproveAndRequest}
                  disabled={working}
                  className="bg-primary text-primary-foreground gap-2 font-medium cursor-pointer"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>{isRtl ? "اعتماد عرض السعر وطلب تأكيد العميل" : "Approve Quotation & Request Customer Confirmation"}</span>
                </Button>
              </>
            )}

            {/* 2. Awaiting Customer Confirmation */}
            {progStatus === "awaiting_customer_confirmation" && (
              <>
                <Button
                  onClick={() => handleRecordConsent(true)}
                  disabled={working}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 cursor-pointer"
                >
                  <span>{isRtl ? "تسجيل موافقة العميل وإرسال الرابط" : "Record Consent & Send PDF Link"}</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleRecordConsent(false)}
                  disabled={working}
                  className="text-muted-foreground cursor-pointer"
                >
                  <span>{isRtl ? "تسجيل عدم رغبة العميل" : "Record Customer Declined"}</span>
                </Button>
              </>
            )}

            {/* 3. Approved for Delivery / PDF Sent / Awaiting Decision */}
            {(progStatus === "approved_for_delivery" || progStatus === "pdf_sent" || progStatus === "awaiting_customer_decision") && (
              <>
                <Button
                  onClick={() => handleRecordDecision("accept")}
                  disabled={working}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 cursor-pointer"
                >
                  <span>{isRtl ? "اعتماد قبول العميل" : "Record Acceptance"}</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowRevisionDialog(true)}
                  disabled={working}
                  className="border-amber-500 text-amber-700 hover:bg-amber-50 dark:text-amber-400 gap-1.5 cursor-pointer"
                >
                  <span>{isRtl ? "طلب تعديل من العميل" : "Record Revision Request"}</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleRecordDecision("reject")}
                  disabled={working}
                  className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 gap-1.5 cursor-pointer"
                >
                  <span>{isRtl ? "تسجيل رفض العميل" : "Record Rejection"}</span>
                </Button>
              </>
            )}

            {/* 4. Accepted — Ready to Convert to Order */}
            {progStatus === "accepted" && (
              <Button
                variant="default"
                onClick={convertToInvoice}
                disabled={working}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-bold px-4 cursor-pointer"
              >
                <span>{t("quotes.convertToOrder", "تحويل إلى أمر إنتاج")}</span>
              </Button>
            )}

            {/* 5. Converted */}
            {progStatus === "converted" && (
              <Button asChild variant="outline" className="border-emerald-300 text-emerald-700 dark:text-emerald-400">
                <Link to="/admin/orders">
                  <span>{isRtl ? "عرض في أوامر الإنتاج" : "View in Orders"}</span>
                </Link>
              </Button>
            )}

            {/* Guarded disabled convert button when not accepted */}
            {progStatus !== "accepted" && progStatus !== "converted" && (
              <Button
                variant="secondary"
                disabled
                title={isRtl ? "لا يمكن التحويل لأمر إنتاج إلا بعد اعتماد وقبول العميل أولاً" : "Only accepted quotations can be converted to an order"}
                className="opacity-50 cursor-not-allowed"
              >
                <span>{t("quotes.convertToOrder", "تحويل إلى أمر إنتاج")}</span>
              </Button>
            )}

            {/* Always available download PDF */}
            <Button variant="outline" onClick={handleGeneratePdf} disabled={working} className="gap-2 cursor-pointer">
              <Download className="h-4 w-4" /> {t("quotes.downloadPdf")}
            </Button>
          </div>

          {/* Revision Dialog / Form Box */}
          {showRevisionDialog && (
            <div className="p-3 border rounded-md bg-muted/40 space-y-2 mt-2">
              <div className="text-xs font-semibold">
                {isRtl ? "ملاحظات التعديل المطلوبة من العميل:" : "Customer revision notes:"}
              </div>
              <textarea
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                placeholder="اكتب التعديلات المطلوبة (سيتم حفظ الإصدار الحالي والبدء في إصدار V2+)..."
                className="w-full text-xs p-2 rounded border bg-background"
                rows={3}
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowRevisionDialog(false)}>
                  إلغاء
                </Button>
                <Button
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => handleRecordDecision("revision_requested", revisionNotes)}
                  disabled={working || !revisionNotes.trim()}
                >
                  حفظ طلب التعديل
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">{t("quotes.internalNotes")}</CardTitle>
        </CardHeader>
        <CardContent>
          <InternalNotes entityType="quote" entityId={id} />
        </CardContent>
      </Card>

      <Customer360Drawer
        customerId={customer360Id}
        open={!!customer360Id}
        onOpenChange={(open) => !open && setCustomer360Id(null)}
      />
    </div>
  );
}
