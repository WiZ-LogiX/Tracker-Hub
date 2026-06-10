import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatEGP } from "@/lib/pricing";
import { sendNotification } from "@/lib/notifications.functions";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { InternalNotes } from "@/components/admin/InternalNotes";
import { createOrder } from "@/lib/order.functions";
import { createInvoiceFromQuote } from "@/lib/invoice.functions";
import { generatePLCId } from "@/lib/numbering";

export const Route = createFileRoute("/admin/quotes/$id")({ component: QuoteDetail });

function QuoteDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const [quote, setQuote] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [customer, setCustomer] = useState<any>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => { load(); }, [id]);
  async function load() {
    const { data: q } = await supabase.from('quotes').select('*').eq('id', id).single();
    setQuote(q);
    if (q) {
      const { data: c } = await supabase.from('customers').select('*').eq('id', q.customer_id).single();
      setCustomer(c);
      const { data: its } = await supabase.from('quote_items').select('*').eq('quote_id', id);
      setItems(its ?? []);
    }
  }

  const notify = useServerFn(sendNotification);
  const createOrderFn = useServerFn(createOrder);
  const createInvoiceFn = useServerFn(createInvoiceFromQuote);

  async function changeStatus(status: string) {
    setWorking(true);
    await supabase.from('quotes').update({ status: status as any }).eq('id', id);
    if (status === 'sent') {
      try { await notify({ data: { event: 'quote_sent', entityType: 'quote', entityId: id } }); } catch {}
    }
    setWorking(false);
    toast.success("تم التحديث");
    load();
  }

  async function convertToInvoice() {
    if (!quote) return;
    setWorking(true);

    // Use the existing quote number as the unified PLC ID, or generate one if it's not set
    const plcId = quote.quote_number && quote.quote_number.startsWith('PLC-')
      ? quote.quote_number
      : generatePLCId();

    // If the quote doesn't have a proper PLC ID yet, update it
    if (plcId !== quote.quote_number) {
      await supabase.from('quotes').update({ quote_number: plcId }).eq('id', quote.id);
    }

    try {
      // Create invoice with the unified PLC ID
      const { invoiceId, invoiceNumber } = await createInvoiceFn({
        data: { quoteId: quote.id, customerId: quote.customer_id, plcId }
      });

      // Create order with the same unified PLC ID
      const { orderId, orderNumber } = await createOrderFn({
        data: { quoteId: quote.id, invoiceId, customerId: quote.customer_id, plcId }
      });

      if (orderId) {
        try { await notify({ data: { event: 'order_opened', entityType: 'order', entityId: orderId } }); } catch {}
        toast.success(`تم تحويل عرض الأسعار لفاتورة وأمر إنتاج: ${orderNumber}`);
      }

      setWorking(false);
      nav({ to: "/admin/orders" });
    } catch (e: any) {
      setWorking(false);
      toast.error(e?.message ?? "فشل التحويل");
    }
  }

  if (!quote) return <div className="text-muted-foreground">جارٍ التحميل...</div>;

  return (
    <div className="space-y-6">
      <Link to="/admin/quotes" className="text-sm text-muted-foreground inline-flex items-center gap-1"><ArrowRight className="h-4 w-4 rtl-flip" /> رجوع</Link>
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold">
            {quote.quote_number?.startsWith('PLC-') ? quote.quote_number : `${quote.quote_number || 'مسودة'}`}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{customer?.name} • {customer?.phone}</p>
        </div>
        <Badge className="text-base px-3 py-1">{quote.status}</Badge>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">البنود</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {items.map((it, i) => {
            const snap = (quote.snapshot?.items?.[i]) ?? {};
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
                    <span className="text-muted-foreground">المورد / المنشأ:</span>{' '}
                    <span className="font-medium">{snap.supplier_name ?? '—'}</span>
                    {snap.supplier_country && <span className="text-muted-foreground"> • {snap.supplier_country}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">الإجمالي</CardTitle></CardHeader>
        <CardContent className="p-6 space-y-3">
          <div className="flex justify-between"><span className="text-muted-foreground">المجموع الفرعي</span><span>{formatEGP(Number(quote.subtotal))}</span></div>
          {Number(quote.discount_amount) > 0 && <div className="flex justify-between text-secondary"><span>خصم ({quote.discount_code})</span><span>− {formatEGP(Number(quote.discount_amount))}</span></div>}
          <div className="flex justify-between"><span className="text-muted-foreground">ضريبة القيمة المضافة (14%)</span><span>{formatEGP(Number(quote.vat_amount))}</span></div>
          <Separator />
          <div className="flex justify-between font-serif text-2xl font-bold text-primary"><span>الإجمالي</span><span>{formatEGP(Number(quote.total))}</span></div>
          <div className="text-xs text-muted-foreground">عربون مقترح ({quote.deposit_pct}%): {formatEGP(Number(quote.total) * Number(quote.deposit_pct) / 100)}</div>
          <div className="text-xs text-muted-foreground">صالح حتى: {quote.valid_until}</div>
        </CardContent>
      </Card>

      <div className="flex gap-2 flex-wrap">
        {quote.status === 'draft' && <Button onClick={() => changeStatus('sent')} disabled={working} className="gap-2">إرسال العرض</Button>}
        {quote.status === 'sent' && <Button onClick={() => changeStatus('accepted')} disabled={working}>العميل وافق</Button>}
        {quote.status === 'sent' && <Button variant="outline" onClick={() => changeStatus('rejected')}>رفض</Button>}
        {(quote.status === 'accepted' || quote.status === 'sent') && <Button variant="secondary" onClick={convertToInvoice} disabled={working}>تحويل لفاتورة وأمر إنتاج</Button>}
        <Button variant="outline" onClick={() => window.print()}>طباعة / PDF</Button>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">ملاحظات داخلية</CardTitle></CardHeader>
        <CardContent><InternalNotes entityType="quote" entityId={id} /></CardContent>
      </Card>
    </div>
  );
}