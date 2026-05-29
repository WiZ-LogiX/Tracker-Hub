import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, CheckCircle2, Archive } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_FORMULA } from "@/lib/pricing/engine";

export const Route = createFileRoute("/admin/pricing-rules")({ component: PricingRulesPage });

function PricingRulesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState('');
  const [formulaText, setFormulaText] = useState(JSON.stringify(DEFAULT_FORMULA, null, 2));

  async function load() {
    const { data } = await supabase.from('pricing_rules').select('*').order('version', { ascending: false });
    setRows(data ?? []);
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null); setName('قاعدة جديدة'); setFormulaText(JSON.stringify(DEFAULT_FORMULA, null, 2)); setOpen(true);
  }
  function openEdit(r: any) {
    if (r.status === 'active') return toast.error("القواعد الفعّالة غير قابلة للتعديل — أنشئ نسخة جديدة");
    setEditing(r); setName(r.name); setFormulaText(JSON.stringify(r.formula, null, 2)); setOpen(true);
  }
  async function save() {
    let formula: any;
    try { formula = JSON.parse(formulaText); } catch { return toast.error("JSON غير صالح"); }
    if (editing) {
      const { error } = await supabase.from('pricing_rules').update({ name, formula }).eq('id', editing.id);
      if (error) return toast.error(error.message);
    } else {
      const maxV = rows.reduce((m, r) => Math.max(m, r.version), 0);
      const { error } = await supabase.from('pricing_rules').insert({ name, formula, version: maxV + 1, status: 'draft' });
      if (error) return toast.error(error.message);
    }
    toast.success("تم الحفظ"); setOpen(false); load();
  }
  async function activate(r: any) {
    await supabase.from('pricing_rules').update({ status: 'archived' }).eq('status', 'active');
    const { error } = await supabase.from('pricing_rules').update({ status: 'active', effective_from: new Date().toISOString() }).eq('id', r.id);
    if (error) return toast.error(error.message);
    toast.success("تم التفعيل"); load();
  }
  async function archive(r: any) {
    const { error } = await supabase.from('pricing_rules').update({ status: 'archived', effective_to: new Date().toISOString() }).eq('id', r.id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-serif text-3xl font-bold">قواعد التسعير</h1>
          <p className="text-sm text-muted-foreground mt-1">نسخ القاعدة محفوظة دائماً — كل عرض سعر يثبت نسخة محددة</p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> نسخة جديدة</Button>
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>النسخة</TableHead>
            <TableHead>الاسم</TableHead>
            <TableHead>الحالة</TableHead>
            <TableHead>سارية من</TableHead>
            <TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell>v{r.version}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell>
                  <Badge variant={r.status === 'active' ? 'default' : r.status === 'draft' ? 'secondary' : 'outline'}>
                    {r.status === 'active' ? 'فعّالة' : r.status === 'draft' ? 'مسودة' : 'مؤرشفة'}
                  </Badge>
                </TableCell>
                <TableCell>{r.effective_from ? new Date(r.effective_from).toLocaleDateString('ar-EG') : '—'}</TableCell>
                <TableCell className="flex gap-1 justify-end">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(r)} disabled={r.status === 'active'}><Pencil className="h-4 w-4" /></Button>
                  {r.status === 'draft' && <Button size="icon" variant="ghost" onClick={() => activate(r)} title="تفعيل"><CheckCircle2 className="h-4 w-4 text-primary" /></Button>}
                  {r.status === 'active' && <Button size="icon" variant="ghost" onClick={() => archive(r)} title="أرشفة"><Archive className="h-4 w-4" /></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? `تعديل v${editing.version}` : "نسخة جديدة"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>الاسم</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
            <div>
              <Label>الصيغة (JSON DSL)</Label>
              <Textarea value={formulaText} onChange={e => setFormulaText(e.target.value)} rows={20} className="font-mono text-xs" dir="ltr" />
              <p className="text-xs text-muted-foreground mt-1">الخطوات: add (أضف بند)، snapshot (سجّل المجموع)، mul_pct (طبّق عاملاً نسبياً)</p>
            </div>
            <Button onClick={save} className="w-full">حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
