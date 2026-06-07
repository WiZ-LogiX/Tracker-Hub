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
import { Plus, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatEGP } from "@/lib/pricing";

export const Route = createFileRoute("/admin/wastage-rules")({ component: WastageRulesPage });

function WastageRulesPage() {
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const listFn = useServerFn(listMaterials);
  const upsertFn = useServerFn(upsertMaterial);

  async function load() {
    setLoading(true);
    try {
      const { items } = await listFn();
      setMaterials(items ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

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

  async function syncAllMaterials() {
    setLoading(true);
    try {
      // Fetch all materials and ensure they have wastage rules
      const { data } = await supabase.from("materials").select("id, wastage_pct").eq("active", true);
      for (const m of data ?? []) {
        if (m.wastage_pct && m.wastage_pct > 0) {
          await supabase.from("wastage_rules").upsert({
            material_id: m.id,
            wastage_pct: m.wastage_pct,
            active: true,
          }, { onConflict: "material_id" });
        }
      }
      toast.success("تمت مزامنة قواعد الهدر مع الخامات");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "فشل المزامنة");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> قواعد الهدر حسب الخامة
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            كل خامة لها نسبة هدر واحدة. يتم تطبيقها تلقائياً في منشئ عروض الأسعار.
          </p>
        </div>
        <Button variant="outline" onClick={syncAllMaterials} disabled={loading} className="gap-2">
          <RefreshCw className="h-4 w-4" /> مزامنة مع الخامات
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">نسب الهدر للخامات النشطة</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <div className="py-8 text-center text-muted-foreground">جارٍ التحميل...</div>}
          {!loading && materials.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">لا توجد خامات.</div>
          )}
          {!loading && materials.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الخامة</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>الوحدة</TableHead>
                  <TableHead>السعر / الوحدة</TableHead>
                  <TableHead className="w-32">نسبة الهدر %</TableHead>
                  <TableHead>حالة القاعدة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name_ar}</TableCell>
                    <TableCell>{m.type}</TableCell>
                    <TableCell>{m.unit}</TableCell>
                    <TableCell>{formatEGP(m.price_per_unit)} / {m.unit}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={m.wastage_rule?.wastage_pct ?? m.wastage_pct ?? 0}
                        onChange={e => saveWastage(m, Number(e.target.value) || 0)}
                        disabled={saving === m.id}
                        className="w-24 text-center"
                      />
                    </TableCell>
                    <TableCell>
                      {m.wastage_rule ? (
                        <Badge variant="default" className="gap-1">
                          <span className="h-2 w-2 rounded-full bg-green-500" /> نشطة
                        </Badge>
                      ) : (m.wastage_pct && m.wastage_pct > 0 ? (
                        <Badge variant="secondary" className="gap-1">
                          <span className="h-2 w-2 rounded-full bg-yellow-500" /> بانتظار المزامنة
                        </Badge>
                      ) : (
                        <Badge variant="outline">لا توجد قاعدة</Badge>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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