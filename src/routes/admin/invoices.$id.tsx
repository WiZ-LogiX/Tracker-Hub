import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { sendNotification } from "@/lib/notifications.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatEGP } from "@/lib/pricing";
import { toast } from "sonner";
import { ArrowRight, Factory, CheckCircle2, Receipt, Calculator } from "lucide-react";
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
  const notify = useServerFn(sendNotification);

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
    if (ord) {
      try { await notify({ data: { event: 'order_opened', entityType: 'order', entityId: ord.id } }); } catch {}
    }
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

      <Tabs defaultValue="invoice" className="w-full">
        <TabsList>
          <TabsTrigger value="invoice" className="gap-2"><Receipt className="h-4 w-4" /> الفاتورة</TabsTrigger>
          <TabsTrigger value="breakdown" className="gap-2"><Calculator className="h-4 w-4" /> تفصيل التكلفة</TabsTrigger>
        </TabsList>

        <TabsContent value="invoice" className="space-y-4 mt-4">
          {items.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg">البنود</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {items.map(it => {
                  const accs = Array.isArray(it.accessories) ? it.accessories : [];
                  return (
                    <div key={it.id} className="border rounded-md p-3 text-sm flex justify-between gap-3">
                      <div className="space-y-1">
                        <div className="font-medium">{it.product_name}</div>
                        <div className="text-xs text-muted-foreground">{it.material_name} • {it.finish_name} • {it.dimension_value} × {it.qty}</div>
                        {accs.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium">إكسسوارات: </span>
                            {accs.map((a: any) => a.name).filter(Boolean).join("، ")}
                          </div>
                        )}
                      </div>
                      <div className="font-medium whitespace-nowrap">{formatEGP(Number(it.line_total))}</div>
                    </div>
                  );
                })}
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
        </TabsContent>

        <TabsContent value="breakdown" className="space-y-4 mt-4">
          <p className="text-xs text-muted-foreground">تفصيل داخلي للتكلفة لكل بند — لا يظهر للعميل في الفاتورة.</p>
          {items.map(it => {
            const b = (it.breakdown ?? {}) as any;
            const lines: { label: string; amount: number }[] = Array.isArray(b.lines) ? b.lines : [];
            const accs = Array.isArray(it.accessories) ? it.accessories : [];
            const labelMap: Record<string, string> = {
              base_cost: "السعر الأساسي", material_cost: "تكلفة الخامة", finish_cost: "التشطيب",
              veneer_cost: "القشرة", accessories_cost: "الإكسسوارات",
              labor: "العمالة", wastage: "الهدر", overhead: "مصاريف عامة",
              margin: "هامش الربح", luxury: "فخامة", complexity: "تعقيد", rush: "استعجال",
            };
            return (
              <Card key={it.id}>
                <CardHeader>
                  <CardTitle className="text-base flex justify-between flex-wrap gap-2">
                    <span>{it.product_name}</span>
                    <span className="text-sm text-muted-foreground font-normal">{it.material_name} • {it.dimension_value} × {it.qty}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {lines.length === 0 && <div className="text-muted-foreground text-xs">لا يوجد تفصيل محفوظ لهذا البند.</div>}
                  {lines.map((l, i) => (
                    <div key={i} className="flex justify-between text-muted-foreground">
                      <span>{labelMap[l.label] ?? l.label}</span>
                      <span>{formatEGP(Number(l.amount))}</span>
                    </div>
                  ))}
                  {accs.length > 0 && (
                    <>
                      <Separator />
                      <div className="text-xs text-muted-foreground font-medium mt-2">الإكسسوارات المختارة</div>
                      {accs.map((a: any, i: number) => (
                        <div key={i} className="flex justify-between text-muted-foreground text-xs">
                          <span>• {a.name ?? '—'}</span>
                          <span>{a.price != null ? formatEGP(Number(a.price)) : ''}</span>
                        </div>
                      ))}
                    </>
                  )}
                  <Separator />
                  <div className="flex justify-between"><span>سعر الوحدة</span><span>{b.unitPrice != null ? formatEGP(Number(b.unitPrice)) : '—'}</span></div>
                  <div className="flex justify-between font-bold text-primary"><span>إجمالي البند</span><span>{formatEGP(Number(it.line_total))}</span></div>
                </CardContent>
              </Card>
            );
          })}
          {items.length === 0 && <p className="text-sm text-muted-foreground">لا توجد بنود.</p>}
        </TabsContent>
      </Tabs>

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
