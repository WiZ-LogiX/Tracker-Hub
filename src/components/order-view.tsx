import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ORDER_STAGES, OrderStage, stageIndex, getStageLabelAr } from "@/lib/stages";
import { formatEGP } from "@/lib/pricing";
import { ShareTrackingLink } from "@/components/share-tracking-link";
import { buildTrackingUrl } from "@/lib/tracking-url";

export type OrderSummary = {
  order_number: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  current_stage?: string | null;
};

export type OrderViewData = {
  order: {
    order_number: string;
    customer_name?: string | null;
    customer_phone?: string | null;
    current_stage: string;
    total?: number | string | null;
    deposit?: number | string | null;
    expected_delivery?: string | null;
    delivered_at?: string | null;
  };
  logs: Array<{
    id: string;
    stage_to: string;
    transitioned_at: string;
    notes?: string | null;
  }>;
  photos: Array<{
    id: string;
    stage?: string | null;
    photo_url: string;
    caption?: string | null;
  }>;
};

/**
 * Customer-facing order tracker card — used inside the admin "Track a customer's
 * order" collapsible panel on `/admin/orders`. Renders the same fields n8n would
 * send the customer, plus the share/copy buttons so an admin can grab the URL
 * to forward via any channel.
 */
export function OrderView({ data }: { data: OrderViewData }) {
  const { t } = useTranslation();
  const { order, logs, photos } = data;
  const idx = stageIndex(order.current_stage as OrderStage);
  const trackingUrl = buildTrackingUrl(order.order_number);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg flex-wrap gap-2">
            <span>{order.order_number}</span>
            <span className="text-sm font-normal text-muted-foreground">
              {order.customer_name}
            </span>
          </CardTitle>
          <div className="text-xs text-muted-foreground">
            <span className="font-mono break-all" dir="ltr">{trackingUrl}</span>
          </div>
          <div className="pt-2">
            <ShareTrackingLink
              url={trackingUrl}
              ref={order.order_number}
              recipientPhone={order.customer_phone ?? null}
              customerName={order.customer_name ?? null}
              variant="block"
            />
          </div>
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
          const stageKeys = ORDER_STAGES.filter(s => groups[s]);
          return (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("track.productionPhotos")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {stageKeys.map(stage => (
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
