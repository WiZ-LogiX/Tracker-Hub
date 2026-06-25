import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { updateQuoteStatus } from "@/lib/quote.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatEGP } from "@/lib/pricing";
import { sendNotification } from "@/lib/notifications.functions";
import { generatePdf } from "@/lib/pdf.functions";
import { toast } from "sonner";
import { ArrowRight, Download } from "lucide-react";
import { InternalNotes } from "@/components/admin/InternalNotes";
import { convertQuoteToOrder } from "@/lib/transactional.functions";

export const Route = createFileRoute("/admin/quotes/$id")({ component: QuoteDetail });

function QuoteDetail() {
  const { id } = Route.useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const [quote, setQuote] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [customer, setCustomer] = useState<any>(null);
  const [working, setWorking] = useState(false);

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
      const { data: its } = await supabase.from("quote_items").select("*").eq("quote_id", id);
      setItems(its ?? []);
    }
  }

  const notify = useServerFn(sendNotification);
  const convertFn = useServerFn(convertQuoteToOrder);
  const pdfFn = useServerFn(generatePdf);
  const updateStatusFn = useServerFn(updateQuoteStatus);

  async function handleGeneratePdf() {
    if (!quote) return;
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
      if (status === "accepted" && quote) {
        try {
          const { orderId, orderNumber } = await convertFn({ data: { quoteId: quote.id } });
          if (orderId) {
            try {
              await notify({
                data: { event: "order_opened", entityType: "order", entityId: orderId },
              });
            } catch (e) {
              console.warn("[quotes] order_opened notification failed:", e);
            }
            toast.success(t("quotes.convertedToOrder", { number: orderNumber }));
            nav({ to: "/admin/orders" });
            return;
          }
        } catch (e) {
          console.warn("[quotes] quote→order conversion failed:", e);
          /* continue to reload if conversion fails */
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
          <h1 className="font-serif text-3xl font-bold">
            {quote.quote_number?.startsWith("PLC-")
              ? quote.quote_number
              : `${quote.quote_number || t("quotes.draft")}`}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {customer?.name} • {customer?.phone}
          </p>
        </div>
        <Badge className="text-base px-3 py-1">{quote.status}</Badge>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">{t("quotes.items")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((it, i) => {
            const snap = quote.snapshot?.items?.[i] ?? {};
            return (
              <div key={it.id} className="border rounded-md p-3 text-sm">
                <div className="flex justify-between font-medium">
                  <span>{it.product_name}</span>
                  <span>{formatEGP(Number(it.line_total))}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {it.material_name} • {it.finish_name} • {it.dimension_value} × {it.qty}
                </div>
                {(snap.supplier_name || snap.supplier_country) && (
                  <div className="text-xs mt-1">
                    <span className="text-muted-foreground">{t("quotes.supplierOrigin")}</span>{" "}
                    <span className="font-medium">{snap.supplier_name ?? "—"}</span>
                    {snap.supplier_country && (
                      <span className="text-muted-foreground"> • {snap.supplier_country}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

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
          <div className="flex justify-between font-serif text-2xl font-bold text-primary">
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

      <div className="flex gap-2 flex-wrap">
        {quote.status === "draft" && (
          <Button onClick={() => changeStatus("sent")} disabled={working} className="gap-2">
            {t("quotes.sendQuote")}
          </Button>
        )}
        {quote.status === "sent" && (
          <Button onClick={() => changeStatus("accepted")} disabled={working}>
            {t("quotes.markAccepted")}
          </Button>
        )}
        {quote.status === "sent" && (
          <Button variant="outline" onClick={() => changeStatus("rejected")}>
            {t("quotes.markRejected")}
          </Button>
        )}
        {(quote.status === "accepted" || quote.status === "sent") && (
          <Button variant="secondary" onClick={convertToInvoice} disabled={working}>
            {t("quotes.convertToOrder")}
          </Button>
        )}
        <Button variant="outline" onClick={handleGeneratePdf} disabled={working} className="gap-2">
          <Download className="h-4 w-4" /> {t("quotes.downloadPdf")}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">{t("quotes.internalNotes")}</CardTitle>
        </CardHeader>
        <CardContent>
          <InternalNotes entityType="quote" entityId={id} />
        </CardContent>
      </Card>
    </div>
  );
}
