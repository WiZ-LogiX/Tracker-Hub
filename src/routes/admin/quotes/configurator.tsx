import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus, Sparkles } from "lucide-react";
import { runFormula, DEFAULT_FORMULA, type FactorMap, type EngineSelections } from "@/lib/pricing/engine";
import { calculateQuoteTotals, formatEGP } from "@/lib/pricing";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/quotes/configurator")({ component: ConfiguratorBuilder });

interface Item {
  template_id: string | null;
  custom_name: string;
  category_id: string | null;
  material_id: string | null;
  variant_id: string | null;
  finish_id: string | null;
  veneer_id: string | null;
  accessories: string[];
  dimension_value: number;
  qty: number;
  overrides: FactorMap;
}

const blankItem = (): Item => ({
  template_id: null, custom_name: '', category_id: null, material_id: null, variant_id: null,
  finish_id: null, veneer_id: null, accessories: [], dimension_value: 1, qty: 1,
  overrides: { luxury: 0, complexity: 0, rush: 0 },
});

function ConfiguratorBuilder() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [templates, setTemplates] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [finishes, setFinishes] = useState<any[]>([]);
  const [veneers, setVeneers] = useState<any[]>([]);
  const [accessories, setAccessories] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [factors, setFactors] = useState<any[]>([]);
  const [wastageRules, setWastageRules] = useState<any[]>([]);
  const [activeRule, setActiveRule] = useState<any>(null);

  const [customerId, setCustomerId] = useState('');
  const [items, setItems] = useState<Item[]>([blankItem()]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from('product_templates').select('*').eq('active', true),
      supabase.from('categories').select('*'),
      supabase.from('materials').select('*, wastage_rules!left(wastage_pct)').eq('active', true),
      supabase.from('suppliers').select('*').eq('active', true),
      supabase.from('finishes').select('*').eq('active', true),
      supabase.from('veneers').select('*').eq('active', true),
      supabase.from('accessories').select('*').eq('active', true),
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.from('pricing_factors').select('*').eq('active', true),
      supabase.from('pricing_rules').select('*').eq('status', 'active').maybeSingle(),
      supabase.from('wastage_rules').select('*').eq('active', true),
    ]).then(([t, c, m, sp, f, v, a, cu, pf, pr, wr]) => {
      setTemplates(t.data ?? []); setCategories(c.data ?? []); setMaterials(m.data ?? []);
      setVariants([]); setSuppliers(sp.data ?? []);
      setFinishes(f.data ?? []); setVeneers(v.data ?? []);
      setAccessories(a.data ?? []); setCustomers(cu.data ?? []); setFactors(pf.data ?? []);
      setActiveRule(pr.data ?? null); setWastageRules(wr.data ?? []);
    });
  }, []);

  const supplierById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const s of suppliers) m[s.id] = s;
    return m;
  }, [suppliers]);

  // Build wastage lookup map: material_id -> wastage_pct (from wastage_rules table)
  const wastageMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const wr of wastageRules) {
      if (wr.material_id) map[wr.material_id] = Number(wr.wastage_pct);
    }
    return map;
  }, [wastageRules]);

  function lookupWastage(materialId: string | null | undefined, materialType: string | undefined, dim: number): number | null {
    if (!materialId) return null;
    // First priority: material-specific wastage rule
    if (wastageMap[materialId] != null) return wastageMap[materialId];
    // Fallback: material's own wastage_pct column
    const material = materials.find(m => m.id === materialId);
    if (material?.wastage_pct != null) return Number(material.wastage_pct);
    // Legacy fallback: dimension-based rules by material_type
    if (!materialType) return null;
    const matches = wastageRules.filter(r =>
      r.material_type === materialType &&
      Number(r.min_dimension) <= dim &&
      (r.max_dimension == null || dim < Number(r.max_dimension))
    );
    if (!matches.length) return null;
    return Number(matches[0].wastage_pct);
  }

  // Build global factor map from DB
  const globalFactors: FactorMap = useMemo(() => {
    const map: FactorMap = {};
    for (const f of factors) map[f.key] = Number(f.value_pct);
    return map;
  }, [factors]);

  function updateItem(idx: number, patch: Partial<Item>) {
    setItems(arr => arr.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }
  function removeItem(idx: number) { setItems(arr => arr.filter((_, i) => i !== idx)); }
  function addItem() { setItems(arr => [...arr, blankItem()]); }

  const computed = useMemo(() => items.map(it => {
    const template = templates.find(t => t.id === it.template_id) ?? null;
    const material = materials.find(m => m.id === it.material_id);
    const variant = null as any;
    const supplier = material?.supplier_id ? supplierById[material.supplier_id] : null;
    const finish = finishes.find(f => f.id === it.finish_id);
    const veneer = veneers.find(v => v.id === it.veneer_id);
    const accSelected = accessories.filter(a => it.accessories.includes(a.id));

    const basePrice = Number(template?.base_price ?? 0);
    const matRate = Number(material?.price_per_unit ?? 0);
    const materialCost = matRate * it.dimension_value;
    const subtotalRaw = basePrice + materialCost;
    const finishCost = finish ? subtotalRaw * (Number(finish.price_modifier_pct) / 100) + Number(finish.price_modifier_fixed) : 0;
    const veneerCost = veneer ? Number(veneer.price_per_m2) * it.dimension_value : 0;
    const accessoriesCost = accSelected.reduce((s, a) => s + Number(a.unit_price), 0);

    const selections: EngineSelections = { basePrice, materialCost, finishCost, veneerCost, accessoriesCost, qty: it.qty };
    const autoWastage = lookupWastage(it.material_id, material?.type, it.dimension_value);
    const merged: FactorMap = { ...globalFactors, ...it.overrides };
    if (autoWastage != null && (it.overrides.wastage == null)) merged.wastage = autoWastage;

    const formula = (activeRule?.formula as any) ?? DEFAULT_FORMULA;
    const breakdown = runFormula(formula, selections, merged, activeRule?.version ?? 1);
    return { it, template, material, variant, supplier, finish, veneer, accSelected, breakdown, selections, autoWastage };
  }), [items, templates, materials, suppliers, finishes, veneers, accessories, globalFactors, activeRule, wastageMap, wastageRules, supplierById]);

  const totals = useMemo(() => calculateQuoteTotals({
    itemsLineTotalSum: computed.reduce((s, c) => s + c.breakdown.lineTotal, 0),
    vatPct: 14,
  }), [computed]);

  async function saveQuote(status: 'draft' | 'sent') {
    if (!customerId) return toast.error("اختر عميلاً");
    setSaving(true);
    const { data: quote, error } = await supabase.from('quotes').insert({
      customer_id: customerId,
      status,
      subtotal: totals.subtotal,
      discount_amount: 0,
      vat_pct: 14, vat_amount: totals.vatAmount,
      total: totals.total,
      notes: notes || null,
      snapshot: { rule_version: activeRule?.version, items: computed.map(c => ({
        name: c.template?.name_ar ?? c.it.custom_name ?? 'منتج حر',
        material: c.material?.name_ar,
        supplier_name: c.supplier?.name ?? null,
        supplier_country: c.material?.country_of_origin ?? null,
        breakdown: c.breakdown,
      })) } as any,
    }).select('id').single();
    if (error || !quote) { setSaving(false); return toast.error(error?.message ?? "خطأ"); }

    const itemsToInsert = computed.map(c => ({
      quote_id: quote.id,
      product_id: null,
      product_name: c.template?.name_ar ?? (c.it.custom_name || 'منتج حر'),
      material_id: c.material?.id ?? null,
      material_name: c.material?.name_ar ?? null,
      finish_id: c.finish?.id ?? null,
      finish_name: c.finish?.name_ar ?? null,
      dimension_value: c.it.dimension_value,
      qty: c.it.qty,
      accessories: c.accSelected.map(a => ({ id: a.id, name: a.name_ar, price: a.unit_price })),
      unit_price: c.breakdown.unitPrice,
      line_total: c.breakdown.lineTotal,
      breakdown: c.breakdown as any,
    }));
    const { data: insertedItems } = await supabase.from('quote_items').insert(itemsToInsert as any).select('id');

    if (insertedItems) {
      const configs = insertedItems.map((qi, i) => ({
        quote_item_id: qi.id,
        template_id: computed[i].template?.id ?? null,
        selections: {
          supplier_id: computed[i].material?.supplier_id ?? null,
          supplier_country: computed[i].material?.country_of_origin ?? null,
          finish_id: computed[i].finish?.id, veneer_id: computed[i].veneer?.id,
          accessories: computed[i].accSelected.map(a => a.id), overrides: computed[i].it.overrides,
        },
        dimensions: { value: computed[i].it.dimension_value },
        computed_breakdown: computed[i].breakdown as any,
        pricing_rule_version: activeRule?.version ?? 1,
      }));
      await supabase.from('configurations').insert(configs as any);
    }

    setSaving(false);
    toast.success(status === 'draft' ? "تم الحفظ كمسودة" : "تم إرسال العرض");
    nav({ to: '/admin/quotes/$id', params: { id: quote.id } });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold flex items-center gap-2"><Sparkles className="h-6 w-6 text-primary" /> {t("admin.nav.configurator")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            ابني العرض من الصفر — قاعدة التسعير الفعّالة: <span className="font-bold">{activeRule ? `v${activeRule.version} — ${activeRule.name}` : 'الافتراضية'}</span>
          </p>
        </div>
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
          <CardTitle className="text-lg">بنود العرض</CardTitle>
          <Button size="sm" variant="outline" onClick={addItem} className="gap-1"><Plus className="h-4 w-4" /> إضافة بند</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {computed.map((ci, idx) => {
            const it = ci.it;
            return (
              <div key={idx} className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm">بند #{idx + 1}</div>
                  {items.length > 1 && <Button size="icon" variant="ghost" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <Label>قالب جاهز (اختياري)</Label>
                    <Select value={it.template_id ?? ''} onValueChange={v => updateItem(idx, { template_id: v || null })}>
                      <SelectTrigger><SelectValue placeholder="منتج حر" /></SelectTrigger>
                      <SelectContent>{templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name_ar}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>اسم البند (للمنتج الحر)</Label>
                    <Input value={it.custom_name} onChange={e => updateItem(idx, { custom_name: e.target.value })} placeholder="مثلاً: دريسنج فاخر" />
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <Label>الخامة</Label>
                    <Select value={it.material_id ?? ''} onValueChange={v => updateItem(idx, { material_id: v, variant_id: null })}>
                      <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                      <SelectContent>
                        {materials.map(m => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name_ar} • {formatEGP(Number(m.price_per_unit))}/{m.unit}
                            {(wastageMap[m.id] != null || m.wastage_pct) && ` • هدر: ${wastageMap[m.id] ?? m.wastage_pct}%`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {ci.material && (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {ci.supplier?.name ?? '—'} • {ci.material.country_of_origin ?? '—'}
                        {(wastageMap[ci.material.id] != null || ci.material.wastage_pct) && (
                          <span className="text-gold ml-2">هدر: {wastageMap[ci.material.id] ?? ci.material.wastage_pct}%</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label>التشطيب</Label>
                    <Select value={it.finish_id ?? ''} onValueChange={v => updateItem(idx, { finish_id: v })}>
                      <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                      <SelectContent>{finishes.map(f => <SelectItem key={f.id} value={f.id}>{f.name_ar}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>القشرة (Veneer)</Label>
                    <Select value={it.veneer_id ?? ''} onValueChange={v => updateItem(idx, { veneer_id: v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>{veneers.map(v => <SelectItem key={v.id} value={v.id}>{v.name_ar} • {formatEGP(Number(v.price_per_m2))}/م²</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>القياس (م² / متر)</Label>
                    <Input type="number" step="0.01" value={it.dimension_value} onChange={e => updateItem(idx, { dimension_value: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>العدد</Label>
                    <Input type="number" min={1} value={it.qty} onChange={e => updateItem(idx, { qty: Number(e.target.value) })} />
                  </div>
                </div>

                <div>
                  <Label>الإكسسوارات</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {accessories.map(a => {
                      const checked = it.accessories.includes(a.id);
                      return (
                        <button key={a.id} type="button" onClick={() => {
                          const next = checked ? it.accessories.filter(x => x !== a.id) : [...it.accessories, a.id];
                          updateItem(idx, { accessories: next });
                        }} className={`px-3 py-1.5 rounded-md text-xs border transition ${checked ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-accent'}`}>
                          {a.name_ar} • {formatEGP(Number(a.unit_price))}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label>عوامل اختيارية</Label>
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">
                        هدر % {ci.autoWastage != null && it.overrides.wastage == null && <span className="text-gold">(تلقائي: {ci.autoWastage}%)</span>}
                      </div>
                      <Input type="number" placeholder={ci.autoWastage != null ? String(ci.autoWastage) : '0'}
                        value={it.overrides.wastage ?? ''}
                        onChange={e => updateItem(idx, { overrides: { ...it.overrides, wastage: e.target.value === '' ? undefined as any : Number(e.target.value) } })} />
                    </div>
                    {(['luxury', 'complexity', 'rush'] as const).map(k => (
                      <div key={k}>
                        <div className="text-xs text-muted-foreground mb-1">
                          {k === 'luxury' ? 'فخامة %' : k === 'complexity' ? 'تعقيد %' : 'استعجال %'}
                        </div>
                        <Input type="number" value={it.overrides[k] ?? 0} onChange={e => updateItem(idx, { overrides: { ...it.overrides, [k]: Number(e.target.value) } })} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-card border rounded-md p-3 text-xs space-y-1">
                  {ci.breakdown.lines.map((l, i) => (
                    <div key={i} className="flex justify-between text-muted-foreground"><span>{l.label}</span><span>{formatEGP(l.amount)}</span></div>
                  ))}
                  <Separator />
                  <div className="flex justify-between"><span>سعر الوحدة</span><span>{formatEGP(ci.breakdown.unitPrice)}</span></div>
                  <div className="flex justify-between font-bold text-primary"><span>إجمالي البند</span><span>{formatEGP(ci.breakdown.lineTotal)}</span></div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">الإجمالي</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>ملاحظات</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
          <Separator />
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">المجموع الفرعي</span><span>{formatEGP(totals.subtotal)}</span></div>
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