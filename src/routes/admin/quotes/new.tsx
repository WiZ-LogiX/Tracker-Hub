import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus } from "lucide-react";
import { calculateLine, calculateQuoteTotals, formatEGP } from "@/lib/pricing";
import { toast } from "sonner";
import { z } from "zod";
import { getNextPLCNumber } from "@/lib/numbering";

const searchSchema = z.object({ rfq: z.string().optional() });

export const Route = createFileRoute("/admin/quotes/new")({
  component: QuoteBuilder,
  validateSearch: searchSchema,
});

interface Item {
  product_id: string;
  material_id: string;
  finish_id: string;
  dimension_value: number;
  qty: number;
  accessories: string[]; // ids
}

function QuoteBuilder() {
  const nav = useNavigate();
  const { rfq } = useSearch({ from: "/admin/quotes/new" });
  const [products, setProducts] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [finishes, setFinishes] = useState<any[]>([]);
  const [accessories, setAccessories] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [items, setItems] = useState<Item[]>([{ product_id: "", material_id: "", finish_id: "", dimension_value: 1, qty: 1, accessories: [] }]);
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<any>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [quoteNumber, setQuoteNumber] = useState<string>("");

  useEffect(() => {
    Promise.all([
      supabase.from('products').select('*').eq('active', true),
      supabase.from('materials').select('*').eq('active', true),
      supabase.from('finishes').select('*').eq('active', true),
      supabase.from('accessories').select('*').eq('active', true),
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
    ]).then(([p, m, f, a, c]) => {
      setProducts(p.data ?? []); setMaterials(m.data ?? []); setFinishes(f.data ?? []);
      setAccessories(a.data ?? []); setCustomers(c.data ?? []);
    });
    
    // Generate PLC number on load
    getNextPLCNumber("quote").then(setQuoteNumber).catch(() => setQuoteNumber("PLC-000000"));
  }, []);

  useEffect(() => {
    if (rfq) {
      supabase.from('quote_requests').select('customer_id').eq('id', rfq).single()
        .then(({ data }) => data?.customer_id && setCustomerId(data.customer_id));
    }
  }, [rfq]);

  function updateItem(idx: number, patch: Partial<Item>) {
    setItems(arr => arr.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }
  function removeItem(idx: number) { setItems(arr => arr.filter((_, i) => i !== idx)); }
  function addItem() {
    setItems(arr => [...arr, { product_id: "", material_id: "", finish_id: "", dimension_value: 1, qty: 1, accessories: [] }]);
  }

  const calculatedItems = useMemo(() => items.map(it => {
    const product = products.find(p => p.id === it.product_id);
    const material = materials.find(m => m.id === it.material_id);
    const finish = finishes.find(f => f.id === it.finish_id);
    const accSelected = accessories.filter(a => it.accessories.includes(a.id));
    const accessoriesTotal = accSelected.reduce((s, a) => s + Number(a.unit_price), 0);
    if (!product) return { it, product, material, finish, accSelected, breakdown: null };
    const breakdown = calculateLine({
      basePrice: Number(product.base_price),
      dimensionValue: it.dimension_value,
      qty: it.qty,
      materialPricePerUnit: Number(material?.price_per_unit ?? 0),
      finishPctModifier: Number(finish?.price_modifier_pct ?? 0),
      finishFixedModifier: Number(finish?.price_modifier_fixed ?? 0),
      accessoriesTotal,
      laborPct: Number(product.labor_pct),
      wastagePct: Number(product.wastage_pct),
      overheadPct: Number(product.overhead_pct),
      marginPct: Number(product.margin_pct),
    });
    return { it, product, material, finish, accSelected, breakdown };
  }), [items, products, materials, finishes, accessories]);

  const totals = useMemo(() => calculateQuoteTotals({
    itemsLineTotalSum: calculatedItems.reduce((s, ci) => s + (ci.breakdown?.lineTotal ?? 0), 0),
    discountType: appliedDiscount?.type,
    discountValue: appliedDiscount ? Number(appliedDiscount.value) : 0,
    discountMaxValue: appliedDiscount?.max_value ? Number(appliedDiscount.max_value) : null,
    vatPct: 14,
  }), [calculatedItems, appliedDiscount]);

  async function applyDiscount() {
    if (!discountCode) { setAppliedDiscount(null); return; }
    const { data } = await supabase.from('discounts').select('*').eq('code', discountCode).eq('active', true).maybeSingle();
    if (!data) { toast.error("الكوبون غير صالح"); setAppliedDiscount(null); return; }
    setAppliedDiscount(data);
    toast.success("تم تطبيق الخصم");
  }

  async function saveQuote(status: 'draft' | 'sent') {
    if (!customerId) return toast.error("اختر عميلاً");
    if (calculatedItems.some(ci => !ci.breakdown)) return toast.error("بعض البنود غير مكتملة");
    setSaving(true);
    const { data: quote, error } = await supabase.from('quotes').insert({
      customer_id: customerId,
      request_id: rfq ?? null,
      status,
      subtotal: totals.subtotal,
      discount_amount: totals.discountAmount,
      discount_code: appliedDiscount?.code ?? null,
      vat_pct: 14, vat_amount: totals.vatAmount,
      total: totals.total,
      notes: notes || null,
      quote_number: quoteNumber, // Use PLC-XXXXX format
      snapshot: { items: calculatedItems.map(c => ({ product: c.product?.name_ar, material: c.material?.name_ar, finish: c.finish?.name_ar, breakdown: c.breakdown })) } as any,
    }).select('id').single();
    if (error || !quote) { setSaving(false); return toast.error(error?.message ?? "خطأ"); }

    const itemsToInsert = calculatedItems.filter(ci => ci.breakdown).map(ci => ({
      quote_id: quote.id,
      product_id: ci.product!.id,
      product_name: ci.product!.name_ar,
      material_id: ci.material?.id ?? null,
      material_name: ci.material?.name_ar ?? null,
      finish_id: ci.finish?.id ?? null,
      finish_name: ci.finish?.name_ar ?? null,
      dimension_value: ci.it.dimension_value,
      qty: ci.it.qty,
      accessories: ci.accSelected.map(a => ({ id: a.id, name: a.name_ar, price: a.unit_price })),
      unit_price: ci.breakdown!.unitPrice,
      line_total: ci.breakdown!.lineTotal,
      breakdown: ci.breakdown!,
    }));
    await supabase.from('quote_items').insert(itemsToInsert as any);

    if (rfq) await supabase.from('quote_requests').update({ status: 'quoted' as any }).eq('id', rfq);

    setSaving(false);
    toast.success(status === 'draft' ? "تم الحفظ كمسودة" : "تم إرسال العرض");
    nav({ to: '/admin/quotes/$id', params: { id: quote.id } });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">إنشاء عرض سعر</h1>
        <p className="text-sm text-muted-foreground mt-1">بناء عرض سعر تفصيلي بفورمولا التسعير المركزية</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">العميل</CardTitle></CardHeader>
        <CardContent>
          <Label>اختر العميل</Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name} • {c.phone}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">رقم العرض: <span className="font-mono text-primary">{quoteNumber}</span></CardTitle>
          <Button size="sm" variant="outline" onClick={addItem} className="gap-1"><Plus className="h-4 w-4" /> إضافة بند</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {calculatedItems.map((ci, idx) => (
            <div key={idx} className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm">بند #{idx + 1}</div>
                {items.length > 1 && <Button size="icon" variant="ghost" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <Label>المنتج</Label>
                  <Select value={ci.it.product_id} onValueChange={v => updateItem(idx, { product_id: v })}>
                    <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                    <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name_ar} ({p.code})</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>الخامة</Label>
                  <Select value={ci.it.material_id} onValueChange={v => updateItem(idx, { material_id: v })}>
                    <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                    <SelectContent>{materials.map(m => <SelectItem key={m.id} value={m.id}>{m.name_ar} — {formatEGP(Number(m.price_per_unit))}/{m.unit}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>التشطيب</Label>
                  <Select value={ci.it.finish_id} onValueChange={v => updateItem(idx, { finish_id: v })}>
                    <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                    <SelectContent>{finishes.map(f => <SelectItem key={f.id} value={f.id}>{f.name_ar} {Number(f.price_modifier_pct) > 0 && `(+${f.price_modifier_pct}%)`}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>القياس (متر/م²)</Label>
                  <Input type="number" step="0.01" value={ci.it.dimension_value} onChange={e => updateItem(idx, { dimension_value: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>العدد</Label>
                  <Input type="number" min={1} value={ci.it.qty} onChange={e => updateItem(idx, { qty: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <Label>الإكسسوارات</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {accessories.map(a => {
                    const checked = ci.it.accessories.includes(a.id);
                    return (
                      <button key={a.id} type="button" onClick={() => {
                        const next = checked ? ci.it.accessories.filter(x => x !== a.id) : [...ci.it.accessories, a.id];
                        updateItem(idx, { accessories: next });
                      }} className={`px-3 py-1.5 rounded-md text-xs border transition ${checked ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-accent'}`}>
                        {a.name_ar} • {formatEGP(Number(a.unit_price))}
                      </button>
                    );
                  })}
                </div>
              </div>
              {ci.breakdown && (
                <div className="bg-card border rounded-md p-3 text-xs space-y-1">
                  <div className="flex justify-between"><span>سعر الوحدة</span><span>{formatEGP(ci.breakdown.unitPrice)}</span></div>
                  <div className="flex justify-between font-bold text-primary"><span>إجمالي البند</span><span>{formatEGP(ci.breakdown.lineTotal)}</span></div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">الإجمالي</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="كود خصم" value={discountCode} onChange={e => setDiscountCode(e.target.value)} />
            <Button variant="outline" onClick={applyDiscount}>تطبيق</Button>
          </div>
          <div><Label>ملاحظات</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
          <Separator />
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">المجموع الفرعي</span><span>{formatEGP(totals.subtotal)}</span></div>
            {totals.discountAmount > 0 && <div className="flex justify-between text-secondary"><span>الخصم</span><span>− {formatEGP(totals.discountAmount)}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">ضريبة القيمة المضافة (14%)</span><span>{formatEGP(totals.vatAmount)}</span></div>
            <Separator />
            <div className="flex justify-between font-serif text-2xl font-bold text-primary"><span>الإجمالي</span><span>{formatEGP(totals.total)}</span></div>
          </div>
          <div className="flex gap-2 pt-3">
            <Button variant="outline" disabled={saving} onClick={() => saveQuote('draft')}>حفظ كمسودة</Button>
            <Button disabled={saving} onClick={() => saveQuote('sent')}>إرسال العرض</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}