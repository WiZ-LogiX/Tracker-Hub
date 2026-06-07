import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listMaterials, upsertMaterial } from "@/lib/materials.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Sparkles, RefreshCw, Database, Copy, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { formatEGP } from "@/lib/pricing";

export const Route = createFileRoute("/admin/wastage-rules")({ component: WastageRulesPage });

interface WastageRule {
  id: string;
  material_id: string | null;
  min_dimension: number;
  max_dimension: number | null;
  wastage_pct: number;
  active: boolean;
}

function WastageRulesPage() {
  const [materials, setMaterials] = useState<any[]>([]);
  const [rules, setRules] = useState<WastageRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);
  const listFn = useServerFn(listMaterials);
  const upsertFn = useServerFn(upsertMaterial);

  async function load() {
    setLoading(true);
    try {
      const [{ items }, { data: rulesData }] = await Promise.all([
        listFn(),
        supabase.from("wastage_rules").select("*").eq("active", true).order("material_id").order("min_dimension"),
      ]);
      setMaterials(items ?? []);
      setRules((rulesData ?? []) as WastageRule[]);
      setMigrationNeeded(false);
    } catch (e: any) {
      if (e.message.includes("material_id") || e.message.includes("relationship") || e.message.includes("min_dimension") || e.message.includes("max_dimension")) {
        setMigrationNeeded(true);
      } else {
        toast.error(e?.message ?? "فشل التحميل");
      }
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  function getRulesForMaterial(materialId: string) {
    return rules.filter(r => r.material_id === materialId);
  }

  async function saveWastage(material: any, wastagePct: number) {
    setSaving(material.id);
    try {
      await upsertFn({
        data: {
          id: material.id,
          name_ar: material.name_ar,
          name_en: material.name_en,
          type: material.type,
          unit: material.unit,
          price_per_unit: material.price_per_unit,
          wastage_pct: wastagePct,
          supplier_id: material.supplier_id,
          country_of_origin: material.country_of_origin,
          active: material.active,
        },
      });
      toast.success(`تم تحديث هدر ${material.name_ar}`);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "فشل الحفظ");
    } finally {
      setSaving(null);
    }
  }

  async function addDimensionRule(materialId: string, materialName: string) {
    const newMin = 0;
    const { error } = await supabase.from("wastage_rules").insert({
      material_id: materialId,
      min_dimension: 0,
      max_dimension: null,
      wastage_pct: 5,
      active: true,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`تم إضافة قاعدة جديدة لـ ${materialName}`);
    load();
  }

  async function updateDimensionRule(rule: WastageRule, field: "min_dimension" | "max_dimension" | "wastage_pct", value: number | null) {
    const { error } = await supabase.from("wastage_rules").update({
      [field]: value,
    }).eq("id", rule.id);
    if (error) return toast.error(error.message);
    toast.success("تم التحديث");
    load();
  }

  async function deleteDimensionRule(rule: WastageRule) {
    if (!confirm("حذف هذه القاعدة؟")) return;
    const { error } = await supabase.from("wastage_rules").delete().eq("id", rule.id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    load();
  }

  async function syncAllMaterials() {
    setLoading(true);
    try {
      const { data } = await supabase.from("materials").select("id, wastage_pct").eq("active", true);
      let count = 0;
      for (const m of data ?? []) {
        if (m.wastage_pct && m.wastage_pct > 0) {
          const { error } = await supabase.from("wastage_rules").upsert({
            material_id: m.id,
            min_dimension: 0,
            max_dimension: null,
            wastage_pct: m.wastage_pct,
            active: true,
          }, { onConflict: "material_id,min_dimension" });
          if (!error) count++;
        }
      }
      if (count > 0) toast.success(`تمت مزامنة ${count} قاعدة هدر`);
      else toast.info("لا توجد خامات بها نسبة هدر للمزامنة");
      load();
    } catch (e: any) {
      if (e.message.includes("material_id") || e.message.includes("min_dimension") || e.message.includes("max_dimension")) {
        setMigrationNeeded(true);
        toast.error("يجب تشغيل سكريبت الترقية في Supabase أولاً (انظر الزر أدناه)");
      } else {
        toast.error(e?.message ?? "فشل المزامنة");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> قواعد الهدر حسب الأبعاد
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            كل خامة يمكن أن يكون لها عدة قواعد هدر حسب نطاق القياس (م² أو متر).<br />
            القاعدة المطابقة: <code>min ≤ القياس < max</code> (الحد الأعلى غير مشمول).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={syncAllMaterials} disabled={loading} className="gap-2">
            <RefreshCw className="h-4 w-4" /> مزامنة مع الخامات
          </Button>
        </div>
      </div>

      {migrationNeeded && (
        <Card className="border-yellow-500/50 bg-yellow-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-yellow-800">
              <Database className="h-5 w-5" /> ترقية قاعدة البيانات مطلوبة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              جدول <code>wastage_rules</code> لا يحتوي على أعمدة <code>min_dimension</code> و <code>max_dimension</code> بعد.
              يجب تشغيل السكريبت التالي في <strong>Supabase Dashboard → SQL Editor</strong>:
            </div>
            <div className="bg-gray-900 text-gray-100 p-4 rounded-md text-xs font-mono overflow-x-auto relative">
              <button 
                onClick={() => navigator.clipboard.writeText(migrationSQL)}
                className="absolute top-2 right-2 text-xs bg-gray-700 px-2 py-1 rounded hover:bg-gray-600"
              >
                نسخ
              </button>
              <pre>{migrationSQL}</pre>
            </div>
            <div className="flex gap-2">
              <Button variant="default" onClick={() => { navigator.clipboard.writeText(migrationSQL); toast.success("تم النسخ - الصق في Supabase SQL Editor"); }}>
                <Copy className="h-4 w-4" /> نسخ السكريبت
              </Button>
              <Button variant="outline" onClick={load} disabled={loading}>
                <RefreshCw className="h-4 w-4" /> أعد التحميل بعد التشغيل
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              بعد تشغيل السكريبت في Supabase، اضغط "أعد التحميل" أعلاه.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">قواعد الهدر للخامات النشطة</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <div className="py-8 text-center text-muted-foreground">جارٍ التحميل...</div>}
          {!loading && migrationNeeded && (
            <div className="py-8 text-center text-muted-foreground">
              شغل سكريبت الترقية أعلاه أولاً، ثم اضغط "أعد التحميل".
            </div>
          )}
          {!loading && !migrationNeeded && materials.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">لا توجد خامات.</div>
          )}
          {!loading && !migrationNeeded && materials.length > 0 && (
            <div className="space-y-3">
              {materials.map(m => {
                const materialRules = getRulesForMaterial(m.id);
                return (
                  <div key={m.id} className="border rounded-lg overflow-hidden">
                    <div 
                      className="bg-muted/30 px-4 py-3 flex items-center justify-between cursor-pointer"
                      onClick={() => setExpandedMaterial(expandedMaterial === m.id ? null : m.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="font-medium">{m.name_ar}</div>
                        <Badge variant="outline">{m.type}</Badge>
                        <span className="text-sm text-muted-foreground">{formatEGP(m.price_per_unit)} / {m.unit}</span>
                        {m.wastage_pct && m.wastage_pct > 0 && (
                          <Badge variant="secondary" className="gap-1">
                            <span className="h-2 w-2 rounded-full bg-yellow-500" /> هدر افتراضي: {m.wastage_pct}%
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {materialRules.length} قاعدة أبعاد
                        </span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={(e) => { e.stopPropagation(); addDimensionRule(m.id, m.name_ar); }}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        {expandedMaterial === m.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </div>
                    
                    {expandedMaterial === m.id && (
                      <div className="p-4 space-y-3 bg-card border-t">
                        {materialRules.length === 0 ? (
                          <div className="text-sm text-muted-foreground text-center py-4">
                            لا توجد قواعد أبعاد بعد. اضغط <kbd className="bg-muted px-1.5 rounded">+</kbd> لإضافة أول قاعدة.
                          </div>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-24">من (شامل)</TableHead>
                                <TableHead className="w-24">إلى (غير شامل)</TableHead>
                                <TableHead className="w-24">نسبة الهدر %</TableHead>
                                <TableHead></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {materialRules.map((rule, idx) => (
                                <TableRow key={rule.id}>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={rule.min_dimension}
                                      onChange={e => updateDimensionRule(rule, "min_dimension", Number(e.target.value) || 0)}
                                      className="w-full text-center text-sm"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={rule.max_dimension ?? ''}
                                      onChange={e => {
                                        const v = e.target.value;
                                        updateDimensionRule(rule, "max_dimension", v === '' ? null : Number(v));
                                      }}
                                      placeholder="لا حد"
                                      className="w-full text-center text-sm"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      max="100"
                                      value={rule.wastage_pct}
                                      onChange={e => updateDimensionRule(rule, "wastage_pct", Number(e.target.value) || 0)}
                                      className="w-24 text-center text-sm"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-6 w-6 text-destructive"
                                      onClick={() => deleteDimensionRule(rule)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                        <div className="text-xs text-muted-foreground pt-2 border-t">
                          <strong>مثال:</strong> قاعدة 0–2 بـ 5%، قاعدة 2–5 بـ 7%، قاعدة 5–(فارغ) بـ 10%.
                          القياس 2.5 سيطابق القاعدة الثانية (2 ≤ 2.5 < 5).
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">إضافة خامة جديدة (مع قاعدة هدر تلقائياً)</CardTitle></CardHeader>
        <CardContent>
          <AddMaterialForm onSuccess={load} />
        </CardContent>
      </Card>
    </div>
  );
}

const migrationSQL = `-- COPY AND RUN IN SUPABASE DASHBOARD → SQL EDITOR
ALTER TABLE public.wastage_rules
  ADD COLUMN IF NOT EXISTS min_dimension numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_dimension numeric;

CREATE INDEX IF NOT EXISTS wastage_rules_material_dim_idx
  ON public.wastage_rules (material_id, min_dimension, max_dimension);

UPDATE public.wastage_rules
SET min_dimension = 0, max_dimension = NULL
WHERE material_id IS NOT NULL
  AND (min_dimension IS NULL OR min_dimension = 0)
  AND max_dimension IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wastage_rules_material_min_unique
  ON public.wastage_rules (material_id, min_dimension)
  WHERE material_id IS NOT NULL;`;

function AddMaterialForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({
    name_ar: "", name_en: "", type: "wood", unit: "m²",
    price_per_unit: 0, wastage_pct: 8, supplier_id: "", country_of_origin: "", active: true,
  });
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const upsertFn = useServerFn(upsertMaterial);

  useEffect(() => {
    supabase.from("suppliers").select("id, name").eq("active", true).then(({ data }) => setSuppliers(data ?? []));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await upsertFn({
        data: {
          name_ar: form.name_ar,
          name_en: form.name_en || form.name_ar,
          type: form.type,
          unit: form.unit,
          price_per_unit: Number(form.price_per_unit),
          wastage_pct: Number(form.wastage_pct),
          supplier_id: form.supplier_id || null,
          country_of_origin: form.country_of_origin || null,
          active: form.active,
        },
      });
      toast.success("تمت إضافة الخامة مع قاعدة الهدر");
      onSuccess();
      setForm({ name_ar: "", name_en: "", type: "wood", unit: "m²", price_per_unit: 0, wastage_pct: 8, supplier_id: "", country_of_origin: "", active: true });
    } catch (e: any) {
      toast.error(e?.message ?? "فشل الإضافة");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid md:grid-cols-4 gap-3 items-end">
      <div className="md:col-span-2 space-y-1.5">
        <Label>الاسم بالعربي *</Label>
        <Input value={form.name_ar} onChange={e => setForm({ ...form, name_ar: e.target.value })} required />
      </div>
      <div className="space-y-1.5">
        <Label>Name (EN)</Label>
        <Input value={form.name_en} onChange={e => setForm({ ...form, name_en: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>النوع</Label>
        <Input value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} placeholder="wood / mdf / metal..." />
      </div>
      <div className="space-y-1.5">
        <Label>الوحدة</Label>
        <Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>السعر / الوحدة</Label>
        <Input type="number" step="0.01" value={form.price_per_unit} onChange={e => setForm({ ...form, price_per_unit: Number(e.target.value) })} required />
      </div>
      <div className="space-y-1.5">
        <Label>نسبة الهدر % *</Label>
        <Input type="number" step="0.1" min="0" max="100" value={form.wastage_pct} onChange={e => setForm({ ...form, wastage_pct: Number(e.target.value) })} required />
      </div>
      <div className="space-y-1.5">
        <Label>المورد</Label>
        <select value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })} className="w-full border rounded-md px-3 py-2 bg-background">
          <option value="">— اختر —</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>بلد المنشأ</Label>
        <Input value={form.country_of_origin} onChange={e => setForm({ ...form, country_of_origin: e.target.value })} />
      </div>
      <div className="flex items-end">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="h-4 w-4" />
          <span className="text-sm">نشط</span>
        </label>
      </div>
      <Button type="submit" disabled={saving} className="gap-2 h-10">
        <Plus className="h-4 w-4" /> {saving ? "جارٍ الحفظ..." : "إضافة الخامة + قاعدة هدر"}
      </Button>
    </form>
  );
}