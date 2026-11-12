import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getPublicOrder,
  getPublicTrackingByRef,
  getPublicOrdersByPhone,
  getPublicAttachmentDownloadUrl,
  getPublicQuotePdfDownloadUrl,
  submitPublicCustomerDecision,
} from "@/lib/tracking.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ORDER_STAGES,
  STAGE_LABEL_AR,
  OrderStage,
  stageIndex,
  CUSTOMER_TRACKING_STAGES,
  CUSTOMER_STAGE_LABEL_AR,
  getInternalSubStageLabelAr,
  customerStageIndex,
} from "@/lib/stages";
import { formatEGP } from "@/lib/pricing";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { z } from "zod";

export const Route = createFileRoute("/track")({
  validateSearch: z.object({ ref: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "تتبع طلبك وعرض السعر — PeleCanon" },
      { name: "description", content: "تابع حالة عرض السعر وتصنيع طلبك خطوة بخطوة مع الصور." },
    ],
  }),
  component: TrackPage,
});

function TrackPage() {
  const { t } = useTranslation();
  const fetchOrder = useServerFn(getPublicOrder);
  const fetchByRef = useServerFn(getPublicTrackingByRef);
  const fetchByPhone = useServerFn(getPublicOrdersByPhone);
  const { ref } = Route.useSearch();
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneOnly, setPhoneOnly] = useState("");
  const [matches, setMatches] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const loadByRef = async (reference: string) => {
    setLoading(true);
    try {
      const r = await fetchByRef({ data: { reference } });
      setResult(r);
    } catch (err: any) {
      if (reference.startsWith("ORD-") || reference.startsWith("PLC-") || reference.startsWith("QUO-") || reference.startsWith("Q-")) {
        setOrderNumber(reference);
      }
      toast.error(err?.message || t("track.notFound", "لم يتم العثور على السجل"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ref) return;
    loadByRef(ref);
  }, [ref]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fetchOrder({ data: { orderNumber: orderNumber.trim(), phone: phone.trim() } });
      setResult(r);
    } catch (err: any) {
      toast.error(err?.message || t("track.notFound", "لم يتم العثور على السجل"));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function onPhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMatches(null);
    setResult(null);
    try {
      const list = await fetchByPhone({ data: { phone: phoneOnly.trim() } });
      if (!list.length) toast.error(t("track.noMatches", "لا توجد نتائج مسجلة بهذا الهاتف"));
      setMatches(list);
    } catch (err: any) {
      toast.error(err?.message || t("track.searchError", "حدث خطأ أثناء البحث"));
    } finally {
      setLoading(false);
    }
  }

  async function openFromList(token_or_number: string) {
    setLoading(true);
    try {
      const r = await fetchByRef({ data: { reference: token_or_number } });
      setResult(r);
      setMatches(null);
    } catch (err: any) {
      toast.error(err?.message || t("track.openError", "فشل فتح السجل"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center">
            <img src="/images/brand-logo.png" alt="PeleCanon" className="h-8 w-auto object-contain dark:hidden" />
            <img src="/images/brand-logo-dark.png" alt="PeleCanon" className="h-8 w-auto object-contain hidden dark:block" />
          </Link>
          <Link to="/"><Button variant="ghost" size="sm">{t("common.home", "الرئيسية")}</Button></Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="font-serif text-3xl font-bold">{t("track.title", "تتبع الطلبات وعروض الأسعار")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("track.subtitle", "تابع حالة عرض السعر، قرارات الاعتماد، ومراحل تصنيع طلبك خطوة بخطوة.")}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("track.byPhoneTitle", "البحث السريع برقم الهاتف")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onPhoneSubmit} className="grid sm:grid-cols-3 gap-3 items-end">
              <div className="sm:col-span-2 space-y-1.5">
                <Label>{t("track.phone", "رقم الهاتف")}</Label>
                <Input
                  value={phoneOnly}
                  onChange={(e) => setPhoneOnly(e.target.value.replace(/[^\d+]/g, ""))}
                  placeholder="01xxxxxxxxx أو +201xxxxxxxxx"
                  inputMode="tel"
                  required
                />
                <p className="text-xs text-muted-foreground">{t("track.phoneHint", "أدخل الرقم المسجل عند طلب المقايسة أو الطلب")}</p>
              </div>
              <Button type="submit" disabled={loading}>{loading ? "..." : t("track.search", "بحث")}</Button>
            </form>
            {matches && matches.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-xs text-muted-foreground">{t("track.resultsCount", { n: matches.length })}</div>
                {matches.map((m: any, idx: number) => (
                  <button
                    key={m.order_number || idx}
                    type="button"
                    onClick={() => openFromList(m.tracking_token || m.order_number)}
                    className="w-full text-right border rounded-md p-3 hover:bg-accent transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-semibold">{m.order_number}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                        {m.is_quote ? "عرض سعر" : "أمر تصنيع"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                      <span>{m.customer_name}</span>
                      <span>المرحلة: {m.current_stage}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {matches && matches.length === 0 && (
              <div className="mt-4 text-sm text-muted-foreground text-center py-3 border rounded-md">
                {t("track.noMatches", "لا توجد نتائج مسجلة بهذا الهاتف")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("track.byRefTitle", "البحث برقم الطلب أو المقايسة والهاتف")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="grid sm:grid-cols-3 gap-3 items-end">
              <div className="space-y-1.5">
                <Label>{t("track.orderNumber", "رقم الطلب أو عرض السعر")}</Label>
                <Input
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="ORD-... أو QUO-..."
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("track.phone", "رقم الهاتف")}</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="01xxxxxxxxx"
                  required
                />
              </div>
              <Button type="submit" disabled={loading}>{loading ? "..." : t("track.search", "بحث")}</Button>
            </form>
          </CardContent>
        </Card>

        {result && (
          result.type === "quote" ? (
            <QuoteView data={result} onReload={() => (ref ? loadByRef(ref) : null)} />
          ) : (
            <OrderView data={result} />
          )
        )}
      </main>
    </div>
  );
}

function QuoteView({ data, onReload }: { data: any; onReload: () => void }) {
  const { quote } = data;
  const getPdfUrlFn = useServerFn(getPublicQuotePdfDownloadUrl);
  const submitDecisionFn = useServerFn(submitPublicCustomerDecision);
  const [downloading, setDownloading] = useState(false);
  const [decisionType, setDecisionType] = useState<"accept" | "reject" | "revision_requested" | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleDownloadPdf() {
    if (!quote?.tracking_token) {
      toast.error("رابط التتبع غير صالح أو منتهي الصلاحية");
      return;
    }
    setDownloading(true);
    try {
      const res = await getPdfUrlFn({ data: { trackingToken: quote.tracking_token } });
      window.open(res.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e?.message || "فشل تحميل ملف عرض السعر");
    } finally {
      setDownloading(false);
    }
  }

  async function handleDecisionSubmit(type: "accept" | "reject" | "revision_requested") {
    if (type !== "accept" && !notes.trim()) {
      toast.error(type === "revision_requested" ? "يرجى كتابة ملاحظات التعديل المطلوبة" : "يرجى توضيح سبب الرفض");
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitDecisionFn({
        data: {
          trackingToken: quote.tracking_token,
          decision: type,
          notes: notes.trim() || undefined,
        },
      });
      toast.success(res.message);
      setDecisionType(null);
      setNotes("");
      onReload();
    } catch (e: any) {
      toast.error(e?.message || "فشل تسجيل القرار");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Quote Summary Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="text-xs text-muted-foreground">عرض سعر رسمي</span>
              <CardTitle className="text-xl font-bold font-mono">{quote.quote_number}</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold border bg-primary/10 text-primary border-primary/20">
                {quote.status_label_ar}
              </span>
              {quote.version > 1 && (
                <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                  إصدار V{quote.version}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-4 text-sm border-t pt-4">
          <div>
            <div className="text-xs text-muted-foreground">اسم العميل</div>
            <div className="font-semibold text-foreground">{quote.customer_name}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">إجمالي عرض السعر</div>
            <div className="font-semibold text-primary">{formatEGP(Number(quote.total))}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">نسبة العربون</div>
            <div className="font-semibold">{quote.deposit_pct}%</div>
          </div>
          {quote.valid_until && (
            <div>
              <div className="text-xs text-muted-foreground">صالح حتى تاريخ</div>
              <div>{new Date(quote.valid_until).toLocaleDateString("ar-EG")}</div>
            </div>
          )}
          <div>
            <div className="text-xs text-muted-foreground">تاريخ الإصدار</div>
            <div>{new Date(quote.created_at).toLocaleDateString("ar-EG")}</div>
          </div>
        </CardContent>
      </Card>

      {/* Customer Decision Interactive Card */}
      {quote.can_decide && (
        <Card className="border-primary/40 bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-primary">قرار العميل بخصوص عرض السعر</CardTitle>
            <p className="text-xs text-muted-foreground">
              يسعدنا مراجعتكم لعرض السعر واتخاذ القرار المناسب لكم مباشرة عبر المنصة.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3 flex-wrap">
              <Button
                onClick={() => handleDecisionSubmit("accept")}
                disabled={submitting}
                className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 flex-1 sm:flex-none cursor-pointer"
              >
                ✓ قبول عرض السعر
              </Button>
              <Button
                variant="outline"
                onClick={() => setDecisionType(decisionType === "revision_requested" ? null : "revision_requested")}
                disabled={submitting}
                className="border-amber-500 text-amber-700 hover:bg-amber-50 dark:text-amber-400 gap-2 flex-1 sm:flex-none cursor-pointer"
              >
                ✎ طلب تعديل
              </Button>
              <Button
                variant="ghost"
                onClick={() => setDecisionType(decisionType === "reject" ? null : "reject")}
                disabled={submitting}
                className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 gap-2 cursor-pointer"
              >
                ✕ رفض العرض
              </Button>
            </div>

            {decisionType && (
              <div className="p-4 rounded-md border bg-muted/30 space-y-3">
                <Label className="text-sm font-medium">
                  {decisionType === "revision_requested"
                    ? "ما هي التعديلات أو الملاحظات التي تود تعديلها في المقايسة؟"
                    : "يرجى توضيح سبب الرفض لمساعدتنا في تقديم خدمة أفضل:"}
                </Label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="اكتب ملاحظاتك هنا..."
                  className="w-full min-h-[90px] rounded-md border border-input bg-background p-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setDecisionType(null)} disabled={submitting}>
                    إلغاء
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleDecisionSubmit(decisionType)}
                    disabled={submitting}
                    className={decisionType === "revision_requested" ? "bg-amber-600 hover:bg-amber-700 text-white" : "bg-rose-600 hover:bg-rose-700 text-white"}
                  >
                    {submitting ? "..." : "تأكيد وإرسال"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Download PDF Button */}
      <Card>
        <CardContent className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-sm">مستند عرض السعر المعتمد (PDF)</div>
            <div className="text-xs text-muted-foreground">
              يمكنك استعراض وتحميل نسخة طبق الأصل من عرض السعر بصيغة PDF عبر رابط آمن ومؤقت.
            </div>
          </div>
          <Button onClick={handleDownloadPdf} disabled={downloading} variant="outline" className="gap-2 w-full sm:w-auto cursor-pointer">
            {downloading ? "جاري التحضير..." : "📄 تحميل مستند PDF"}
          </Button>
        </CardContent>
      </Card>

      {/* Customer Journey Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">سجل رحلة عرض السعر والتصنيع</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {quote.journey_timeline.map((item: any, i: number) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <div className={`h-5 w-5 rounded-full mt-0.5 flex items-center justify-center text-[10px] font-bold ${
                  item.completed
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground border"
                }`}>
                  {item.completed ? "✓" : (i + 1)}
                </div>
                <div className="flex-1">
                  <div className={`font-medium ${item.completed ? "text-foreground" : "text-muted-foreground"}`}>
                    {item.title}
                  </div>
                  {item.timestamp && (
                    <div className="text-xs text-muted-foreground">
                      {new Date(item.timestamp).toLocaleString("ar-EG")}
                    </div>
                  )}
                  {item.decisionNotes && (
                    <div className="text-xs text-muted-foreground mt-0.5 p-1.5 bg-muted rounded">
                      ملاحظات: {item.decisionNotes}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* If Converted to Order, Show Order Progress */}
      {quote.converted_order && (
        <Card className="border-primary/30 dark:border-primary/30 bg-primary/5 dark:bg-primary/10">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-primary font-semibold">تم بدء التنفيذ الفعلي</span>
                <CardTitle className="text-lg">أمر تصنيع: {quote.converted_order.order_number}</CardTitle>
              </div>
              <span className="text-xs px-2.5 py-1 rounded bg-primary/15 text-primary font-medium">
                {quote.converted_order.customer_stage_label_ar}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3 text-xs">
              <div>
                <span className="text-muted-foreground">المرحلة الحالية: </span>
                <span className="font-semibold text-primary">{quote.converted_order.customer_stage_label_ar}</span>
              </div>
              {quote.converted_order.internal_sub_stage_label_ar && (
                <div>
                  <span className="text-muted-foreground">ورشة التصنيع: </span>
                  <span className="font-semibold text-amber-700 dark:text-amber-400">{quote.converted_order.internal_sub_stage_label_ar}</span>
                </div>
              )}
              {quote.converted_order.expected_delivery && (
                <div>
                  <span className="text-muted-foreground">التسليم المتوقع: </span>
                  <span className="font-semibold">{new Date(quote.converted_order.expected_delivery).toLocaleDateString("ar-EG")}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OrderView({ data }: { data: any }) {
  const { t } = useTranslation();
  const { order, logs, photos, attachments = [] } = data;
  const currentCustStage = order.customer_stage || "order_confirmed";
  const cIdx = customerStageIndex(currentCustStage);
  const getDownloadUrlFn = useServerFn(getPublicAttachmentDownloadUrl);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function handleAttachmentClick(a: any, e: React.MouseEvent) {
    e.preventDefault();
    if (!order.tracking_token) {
      window.open(a.url, "_blank", "noopener,noreferrer");
      return;
    }

    setDownloadingId(a.id);
    try {
      const res = await getDownloadUrlFn({
        data: {
          trackingToken: order.tracking_token,
          attachmentId: a.id,
        },
      });
      window.open(res.downloadUrl, "_blank", "noopener,noreferrer");
    } catch {
      window.open(a.url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg">
            <span>{order.order_number}</span>
            <span className="text-sm font-normal text-muted-foreground">{order.customer_name}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">{t("track.currentStage", "المرحلة الحالية")}</div>
            <div className="font-semibold text-primary">{order.customer_stage_label_ar || order.current_stage}</div>
            {order.internal_sub_stage_label_ar && (
              <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                ورشة: {order.internal_sub_stage_label_ar}
              </div>
            )}
          </div>
          {order.total != null && (
            <div><div className="text-xs text-muted-foreground">{t("track.total", "الإجمالي")}</div><div>{formatEGP(Number(order.total))}</div></div>
          )}
          {order.deposit != null && (
            <div><div className="text-xs text-muted-foreground">{t("track.deposit", "العربون")}</div><div>{formatEGP(Number(order.deposit))}</div></div>
          )}
          {order.expected_delivery && <div><div className="text-xs text-muted-foreground">{t("track.expected", "التسليم المتوقع")}</div><div>{new Date(order.expected_delivery).toLocaleDateString("ar-EG")}</div></div>}
          {order.delivered_at && <div><div className="text-xs text-muted-foreground">{t("track.deliveredAt", "تم التسليم في")}</div><div>{new Date(order.delivered_at).toLocaleDateString("ar-EG")}</div></div>}
        </CardContent>
      </Card>

      {/* 6 Simplified Customer Tracking Stages */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>{t("track.stageProgress", "مراحل التصنيع والتسليم")}</span>
            <span className="text-xs font-normal text-muted-foreground">النموذج المعتمد (6 مراحل)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {CUSTOMER_TRACKING_STAGES.map((s, i) => {
              const isPast = i < cIdx;
              const isCurrent = i === cIdx;
              return (
                <div
                  key={s}
                  className={`p-3 rounded-lg border flex flex-col justify-between transition-all ${
                    isCurrent
                      ? "border-primary bg-primary/5 shadow-sm"
                      : isPast
                      ? "border-primary/25 bg-primary/5 dark:border-primary/30 dark:bg-primary/10"
                      : "border-muted bg-muted/20 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-muted-foreground">0{i + 1}</span>
                    {isPast && <span className="text-xs text-primary font-bold">✓ مكتمل</span>}
                    {isCurrent && <span className="text-xs text-primary font-bold animate-pulse">● قيد التنفيذ</span>}
                  </div>
                  <div className={`text-sm font-semibold ${isCurrent ? "text-primary" : "text-foreground"}`}>
                    {CUSTOMER_STAGE_LABEL_AR[s]}
                  </div>
                  {isCurrent && s === "in_production" && order.internal_sub_stage_label_ar && (
                    <div className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 p-1.5 rounded border border-amber-200">
                      العمل الحالي: <span className="font-bold">{order.internal_sub_stage_label_ar}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {photos.length > 0 && (() => {
        const groups: Record<string, any[]> = {};
        for (const p of photos) {
          const k = p.stage || "unknown";
          (groups[k] ||= []).push(p);
        }
        const orderStages = ORDER_STAGES.filter((s) => groups[s]);
        return (
          <Card>
            <CardHeader><CardTitle className="text-base">{t("track.productionPhotos", "صور مراحل الإنتاج")}</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              {orderStages.map((stage) => (
                <div key={stage} className="space-y-2">
                  <div className="text-sm font-bold text-primary">
                    {STAGE_LABEL_AR[stage as OrderStage] || stage}{" "}
                    <span className="text-xs text-muted-foreground font-normal">({groups[stage].length})</span>
                  </div>
                  <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {groups[stage].map((p: any) => (
                      <a key={p.id} href={p.photo_url} target="_blank" rel="noreferrer" className="block group">
                        <img
                          src={p.photo_url}
                          alt={p.caption || ""}
                          className="w-full aspect-square object-cover rounded-md border"
                          loading="lazy"
                        />
                        {p.caption && <div className="mt-1 text-xs text-muted-foreground">{p.caption}</div>}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })()}

      {attachments.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t("track.attachments", { n: attachments.length })}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
              {attachments.map((a: any) => {
                const isImage = (a.contentType ?? "").startsWith("image/");
                const isPdf = a.contentType === "application/pdf";
                const sizeLabel =
                  a.sizeBytes < 1024
                    ? `${a.sizeBytes} B`
                    : a.sizeBytes < 1024 * 1024
                    ? `${(a.sizeBytes / 1024).toFixed(1)} KB`
                    : `${(a.sizeBytes / 1024 / 1024).toFixed(2)} MB`;
                return (
                  <div
                    key={a.id}
                    className="block border rounded-md overflow-hidden hover:border-primary transition"
                  >
                    {isImage ? (
                      <a href={a.url} target="_blank" rel="noreferrer">
                        <img
                          src={a.url}
                          alt={a.fileName ?? ""}
                          className="w-full aspect-square object-cover bg-muted"
                          loading="lazy"
                        />
                      </a>
                    ) : (
                      <div className="w-full aspect-square bg-muted flex flex-col items-center justify-center gap-1 text-muted-foreground">
                        <div className="text-3xl">{isPdf ? "📄" : "📎"}</div>
                        <div className="text-[10px] uppercase tracking-wider">
                          {a.contentType?.split("/")[1] ?? ""}
                        </div>
                      </div>
                    )}
                    <div className="p-2 space-y-1">
                      <div className="text-xs font-medium truncate" title={a.fileName}>
                        {a.fileName}
                      </div>
                      <div className="text-[10px] text-muted-foreground flex justify-between">
                        <span>{sizeLabel}</span>
                        <span>{new Date(a.createdAt).toLocaleDateString("ar-EG")}</span>
                      </div>
                      {a.caption && (
                        <div className="text-[10px] text-muted-foreground line-clamp-2">
                          {a.caption}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleAttachmentClick(a, e)}
                        disabled={downloadingId === a.id}
                        className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline w-full justify-center border border-primary/40 rounded-sm py-1 cursor-pointer hover:bg-primary/10 transition"
                      >
                        {downloadingId === a.id
                          ? "..."
                          : `⬇ ${isImage ? t("track.openOrDownload", "عرض أو تحميل") : isPdf ? t("track.openPdf", "فتح ملف PDF") : t("track.downloadFile", "تحميل الملف")}`}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {logs.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t("track.stageLog", "سجل المراحل")}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {logs.map((l: any) => (
                <div key={l.id} className="text-sm border-r-2 border-primary pr-3">
                  <div className="font-medium">{STAGE_LABEL_AR[l.stage_to as OrderStage] || l.stage_to}</div>
                  <div className="text-xs text-muted-foreground">{new Date(l.transitioned_at).toLocaleString("ar-EG")}</div>
                  {l.notes && <div className="text-xs mt-0.5">{l.notes}</div>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
