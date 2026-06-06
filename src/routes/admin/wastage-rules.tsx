import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/wastage-rules")({ component: WastageRulesPage });

const MATERIAL_TYPES = [
  { value: "wood", label: "خشب طبيعي (Solid wood)" },
  { value: "mdf", label: "MDF" },
  { value: "plywood", label: "خشب لاتيه (Plywood)" },
  { value: "veneer", label: "قشرة (Veneer)" },
  { value: "metal", label: "معدن" },
  { value: "glass", label: "زجاج" },
];

const DEFAULTS = [
  { material_type: "wood", min_dimension: 0, max_dimension: 2, wastage_pct: 12 },
  { material_type: "wood", min_dimension: 2, max_dimension: 5, wastage_pct: 10 },
  { material_type: "wood", min_dimension: 5, max_dimension: null, wastage_pct: 8 },
  { material_type: "mdf", min_dimension: 0, max_dimension: 3, wastage_pct: 8 },
  { material_type: "mdf", min_dimension: 3, max_dimension: null, wastage_pct: 6 },
  { material_type: "plywood", min_dimension: 0, max_dimension: null, wastage_pct: 7 },
  { material_type: "veneer", min_dimension: 0, max_dimension: null, wastage_pct: 15 },
];

function WastageRulesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ material_type: "wood", min_dimension: 0, max_dimension: "" as any, wastage_pct: 8 });

  async function load() {
    const { data } = await supabase.from("wastage_rules").select("*").order("material_type").order("min_dimension");
    setRows(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    setLoading(true);
    const payload: any = {
      material_type: form.material_type,
      min_dimension: Number(form.min_dimension) || 0,
      max_dimension: form.max_dimension === "" ? null : Number(form.max_dimension),
      wastage_pct: Number(form.wastage_pct),
    };
    const { error } = await supabase.from("wastage_rules").insert(payload);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("تمت الإضافة");
    setForm({ material_type: "wood", min_dimension: 0, max_dimension: "" as any, wastage_pct: 8 });
    load();
  }

  async function remove(id: string) {
    if (!confirm("حذف هذه القاعدة؟")) return;
    const { error } = await supabase.from("wastage_rules").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  async function seedDefaults() {
    if (!confirm("سيتم إضافة القواعد الافتراضية. متابعة؟")) return;
    const { error } = await supabase.from("wastage_rules").insert(DEFAULTS as any);
    if (error) return toast.error(error.message);
    toast.success("تمت إضافة الافتراضيات");
    load();
  }

  const grouped: Record<string, any[]> = {};
  for (const r of rows) (grouped[r.material_type] ||= []).push(r);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold flex items-center gap-2"><Sparkles className="h-6 w-6 text-primary" /> قواعد الهدر (Wastage)</h1>
          <p className="text-sm text-muted-foreground mt-1">يتم تطبيقها تلقائياً في الـ Configurator حسب نوع الخامة والقياس.</p>
        </div>
        {rows.length === 0 && <Button variant="outline" onClick={seedDefaults}>إضافة الافتراضيات</Button>}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">إضافة قاعدة</CardTitle></CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-5 gap-3 items-end">
            <div>
              <Label>نوع الخامة</Label>
              <Select value={form.material_type} onValueChange={v => setForm(s => ({ ...s, material_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MATERIAL_TYPES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>من (م²/م)</Label>
              <Input type="number" step="0.1" value={form.min_dimension} onChange={e => setForm(s => ({ ...s, min_dimension: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>إلى (فارغ = بدون حد)</Label>
              <Input type="number" step="0.1" value={form.max_dimension} onChange={e => setForm(s => ({ ...s, max_dimension: e.target.value }))} placeholder="∞" />
            </div>
            <div>
              <Label>نسبة الهدر %</Label>
              <Input type="number" step="0.1" value={form.wastage_pct} onChange={e => setForm(s => ({ ...s, wastage_pct: Number(e.target.value) }))} />
            </div>
            <Button onClick={add} disabled={loading} className="gap-1"><Plus className="h-4 w-4" /> إضافة</Button>
          </div>
        </CardContent>
      </Card>

      {Object.keys(grouped).map(type => (
        <Card key={type}>
          <CardHeader><CardTitle className="text-base">{MATERIAL_TYPES.find(m => m.value === type)?.label ?? type}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>من</TableHead><TableHead>إلى</TableHead><TableHead>الهدر %</TableHead><TableHead></TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {grouped[type].map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{Number(r.min_dimension)}</TableCell>
                    <TableCell>{r.max_dimension == null ? '∞' : Number(r.max_dimension)}</TableCell>
                    <TableCell className="font-bold text-gold">{Number(r.wastage_pct)}%</TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {rows.length === 0 && (
        <Card><CardContent className="py-10 text-center text-muted-foreground">لا توجد قواعد. أضف قاعدة أو اضغط "إضافة الافتراضيات".</CardContent></Card>
      )}
    </div>
  );
}
