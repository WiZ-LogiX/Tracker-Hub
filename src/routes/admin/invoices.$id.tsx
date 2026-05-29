import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatEGP } from "@/lib/pricing";
import { toast } from "sonner";
import { ArrowRight, Factory, CheckCircle2 } from "lucide-react";
import { InternalNotes } from "@/components/admin/InternalNotes";

export const Route = createFileRoute("/admin/invoices/$id")({ component: InvoiceDetail });

function InvoiceDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const [inv, setInv] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [order, setOrder] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { load(); }, [id]);
  async function load() {
    const { data: i } = await supabase.from("invoices").select("*").eq("id", id).single();
    setInv(i);
    if (!i) return;
    const [{ data: c }, { data: its }, { data: ord }] = await Promise.all([
      supabase.from("customers").select("*").eq("id", i.customer_id).single(),
      i.quote_id ? supabase.from("quote_items").select("*").eq("quote_id", i.quote_id) : Promise.resolve({ data: [] }),
      supabase.from("orders").select("*").eq("invoice_id", id).maybeSingle(),
    ]);
    setCustomer(c); setItems(its ?? []); setOrder(ord ?? null);
  }

  async function markPaid() {
    setBusy(true);
    await supabase.from("invoices").update({ paid_at: new Date().toISOString(), paid_amount: inv.total }).eq("id", id);
    setBusy(false); toast.success("تم تسجيل السداد"); load();
  }

  async function createOrder() {
    if (!inv || order) return;
    setBusy(true);
    const expected = new Date(); expected.setDate(expected.getDate() + 30);
    const { data: ord, error } = await supabase.from("orders").insert({
      quote_id: inv.quote_id, invoice_id: inv.id, customer_id: inv.customer_id,
      total: inv.total, deposit: inv.deposit_amount,
      contract_date: new Date().toISOString().slice(0, 10),
      expected_delivery: expected.toISOString().slice(0, 10),
    }).select("id").single();
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("تم إنشاء أمر الإنتاج");
    nav({ to: "/admin/orders" });
  }

  if (!inv) return <div className="text-muted-foreground">جارٍ التحميل...</div>;
  const paid = !!inv.paid_at;
  const depositPaid = paid || Number(inv.paid_amount) >= Number(inv.deposit_amount);

  return (
    <div className="space-y-6">
      <Link to="/admin/invoices" className="text-sm text-muted-foreground inline-flex items-center gap-1"><ArrowRight className="h-4 w-4 rtl-flip" /> رجوع</Link>
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold">{inv.invoice_number}</h1>
          <p className="text-sm text-muted-foreground mt-1">{customer?.name} • {customer?.phone}</p>
        </div>
        <Badge className="text-base px-3 py-1" variant={paid ? "default" : "secondary"}>{paid ? "مدفوعة" : "بانتظار السداد"}</Badge>
      </div>

      {items.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">البنود</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {items.map(it => (
              <div key={it.id} className="border rounded-md p-3 text-sm flex justify-between">
                <div>
                  <div className="font-medium">{it.product_name}</div>
                  <div className="text-xs text-muted-foreground">{it.material_name} • {it.finish_name} • {it.dimension_value} × {it.qty}</div>
                </div>
                <div className="font-medium">{formatEGP(Number(it.line_total))}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-6 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">الإجمالي</span><span>{formatEGP(Number(inv.total))}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">العربون</span><span>{formatEGP(Number(inv.deposit_amount))}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">المسدد</span><span>{formatEGP(Number(inv.paid_amount))}</span></div>
          <Separator />
          <div className="flex justify-between font-serif text-xl font-bold text-primary"><span>المتبقي</span><span>{formatEGP(Number(inv.total) - Number(inv.paid_amount))}</span></div>
        </CardContent>
      </Card>

      <div className="flex gap-2 flex-wrap">
        {!paid && <Button onClick={markPaid} disabled={busy} className="gap-2"><CheckCircle2 className="h-4 w-4" /> تسجيل سداد كامل</Button>}
        {!order && depositPaid && <Button variant="secondary" onClick={createOrder} disabled={busy} className="gap-2"><Factory className="h-4 w-4" /> إنشاء أمر إنتاج</Button>}
        {order && <Link to="/admin/orders"><Button variant="outline" className="gap-2"><Factory className="h-4 w-4" /> عرض أمر الإنتاج</Button></Link>}
        <Button variant="outline" onClick={() => window.print()}>طباعة / PDF</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">ملاحظات داخلية</CardTitle></CardHeader>
        <CardContent><InternalNotes entityType="invoice" entityId={id} /></CardContent>
      </Card>
    </div>
  );
}
