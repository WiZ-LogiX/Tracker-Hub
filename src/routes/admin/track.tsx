import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPublicOrder, getPublicTrackingByRef, getPublicOrdersByPhone } from "@/lib/tracking.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ORDER_STAGES, OrderStage, stageIndex, getStageLabelAr } from "@/lib/stages";
import { formatEGP } from "@/lib/pricing";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { z } from "zod";

export const Route = createFileRoute("/admin/track")({
  validateSearch: z.object({ ref: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "تتبع طلبك — PeleCanon" },
      { name: "description", content: "تابع حالة تصنيع طلبك خطوة بخطوة مع الصور." },
    ],
  }),
  component: AdminTrackPage,
});

function AdminTrackPage() {
  const { t, i18n } = useTranslation();
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

  useEffect(() => {
    if (!ref) return;
    (async () => {
      setLoading(true);
      try {
        const r = await fetchByRef({ data: { reference: ref } });
        setResult(r);
      } catch (err: any) {
        toast.error(err?.message || t("track.notFound"));
      } finally {
        setLoading(false);
      }
    })();
  }, [ref]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fetchOrder({
        data: { orderNumber: orderNumber.trim(), phone: phone.trim() },
      });
      setResult(r);
    } catch (err: any) {
      toast.error(err?.message || t("track.notFound"));
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
      if (!list.length) toast.error(t("track.noMatches"));
      setMatches(list);
    } catch (err: any) {
      toast.error(err?.message || t("track.searchError"));
    } finally {
      setLoading(false);
    }
  }

  async function openOrderFromList(orderNumber: string) {
    setLoading(true);
    try {
      const r = await fetchByRef({ data: { reference: orderNumber } });
      setResult(r);
      setMatches(null);
    } catch (err: any) {
      toast.error(err?.message || t("track.openError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div dir={i18n.language === "ar" ? "rtl" : "ltr"} className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="font-serif font-bold text-lg">
            PeleCanon
          </Link>
          <Link to="/admin">
            <Button variant="ghost" size="sm">
              {t("common.home")}
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="font-serif text-3xl font-bold">{t("track.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("track.subtitle")}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("track.byPhoneTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={onPhoneSubmit}
              className="grid sm:grid-cols-3 gap-3 items-end"
            >
              <div className="sm:col-span-2 space-y-1.5">
                <Label>{t("track.phone")}</Label>
                <Input
                  value={phoneOnly}
                  onChange={e =>
                    setPhoneOnly(e.target.value.replace(/[^\d+]/g, ""))
                  }
                  placeholder="01xxxxxxxxx أو +201xxxxxxxxx"
                  inputMode="tel"
                  required
                />
                <p className="text-xs text-muted-foreground">{t("track.phoneHint")}</p>
              </div>
              <Button type="submit" disabled={loading}>
                {loading ? "..." : t("track.search")}
              </Button>
            </form>

            {matches && matches.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-xs text-muted-foreground">
                  {t("track.resultsCount", { n: matches.length })}
                </div>
                {matches.map((m: any) => (
                  <button
                    key={m.order_number}
                    type="button"
                    onClick={() => openOrderFromList(m.order_number)}
                    className="w-full text-right border rounded-md p-3 hover:bg-accent transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm">{m.order_number}</span>
                      <span className="text-xs text-muted-foreground">
                        {m.customer_name}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {t("track.stage")}: {getStageLabelAr(m.current_stage)}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {matches && matches.length === 0 && (
              <div className="mt-4 text-sm text-muted-foreground text-center py-3 border rounded-md">
                {t("track.noMatches")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("track.byRefTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={onSubmit}
              className="grid sm:grid-cols-3 gap-3 items-end"
            >
              <div className="space-y-1.5">
                <Label>{t("track.orderNumber")}</Label>
                <Input
                  value={orderNumber}
                  onChange={e => setOrderNumber(e.target.value)}
                  placeholder="ORD-..."
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("track.phone")}</Label>
                <Input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="01xxxxxxxxx"
                  required
                />
              </div>
              <Button type="submit" disabled={loading}>
                {loading ? "..." : t("track.track")}
              </Button>
            </form>
          </CardContent>
        </Card>

        {result && <OrderView data={result} />}
      </main>
    </div>
  );
}

function OrderView({ data }: { data: any }) {
  const { t } = useTranslation();
  const { order, logs, photos } = data;
  const idx = stageIndex(order.current_stage as OrderStage);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg">
            <span>{order.order_number}</span>
            <span className="text-sm font-normal text-muted-foreground">
              {order.customer_name}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">{t("track.currentStage")}</div>
            <div className="font-medium">{getStageLabelAr(order.current_stage)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("track.total")}</div>
            <div>{formatEGP(Number(order.total))}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("track.deposit")}</div>
            <div>{formatEGP(Number(order.deposit))}</div>
          </div>
          {order.expected_delivery && (
            <div>
              <div className="text-xs text-muted-foreground">{t("track.expected")}</div>
              <div>
                {new Date(order.expected_delivery).toLocaleDateString("ar-EG")}
              </div>
            </div>
          )}
          {order.delivered_at && (
            <div>
              <div className="text-xs text-muted-foreground">{t("track.deliveredAt")}</div>
              <div>
                {new Date(order.delivered_at).toLocaleDateString("ar-EG")}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("track.stageProgress")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {ORDER_STAGES.map((s, i) => (
              <div
                key={s}
                className={`flex items-center gap-3 text-sm ${
                  i <= idx ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <div
                  className={`h-3 w-3 rounded-full ${
                    i < idx ? "bg-secondary" : i === idx ? "bg-gold" : "bg-muted"
                  }`}
                />
                <span className={i === idx ? "font-bold" : ""}>{getStageLabelAr(s)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {photos.length > 0 &&
        (() => {
          const groups: Record<string, any[]> = {};
          for (const p of photos) {
            (groups[p.stage || "unknown"] ||= []).push(p);
          }
          const order = ORDER_STAGES.filter(s => groups[s]);
          return (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("track.productionPhotos")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {order.map(stage => (
                  <div key={stage} className="space-y-2">
                    <div className="text-sm font-bold text-gold">
                      {getStageLabelAr(stage)} ({groups[stage].length})
                    </div>
                    <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {groups[stage].map((p: any) => (
                        <a
                          key={p.id}
                          href={p.photo_url}
                          target="_blank"
                          rel="noreferrer"
                          className="block group"
                        >
                          <img
                            src={p.photo_url}
                            alt={p.caption || ""}
                            className="w-full aspect-square object-cover rounded-md border"
                            loading="lazy"
                          />
                          {p.caption && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {p.caption}
                            </div>
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })()}

      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("track.stageLog")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {logs.map((l: any) => (
                <div key={l.id} className="text-sm border-r-2 border-secondary pr-3">
                  <div className="font-medium">{getStageLabelAr(l.stage_to)}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(l.transitioned_at).toLocaleString("ar-EG")}
                  </div>
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