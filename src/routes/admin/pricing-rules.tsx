import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { DEFAULT_FORMULA } from "@/lib/pricing/engine";
import {
  listPricingRules,
  upsertPricingRule,
  deletePricingRule,
} from "@/lib/catalog.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, CheckCircle2, Archive, Trash2, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/pricing-rules")({ component: PricingRulesPage });

function PricingRulesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState('');
  const [formulaText, setFormulaText] = useState(JSON.stringify(DEFAULT_FORMULA, null, 2));

  const listFn = useServerFn(listPricingRules);
  const upsertFn = useServerFn(upsertPricingRule);
  const deleteFn = useServerFn(deletePricingRule);

  async function load() {
    try {
      const r = await listFn();
      setRows(r.items ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    }
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
    try {
      if (editing) {
        await upsertFn({ data: {
          id: editing.id,
          name, version: editing.version, status: editing.status, formula,
        }});
      } else {
        const maxV = rows.reduce((m, r) => Math.max(m, r.version), 0);
        await upsertFn({ data: {
          name, version: maxV + 1, status: 'draft', formula,
          effective_from: null, effective_to: null,
        }});
      }
      toast.success("تم الحفظ"); setOpen(false); load();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    }
  }
  async function activate(r: any) {
    try {
      for (const x of rows) {
        if (x.status === 'active') {
          await upsertFn({ data: {
            id: x.id,
            name: x.name, version: x.version, status: x.status === 'active' ? 'archived' : x.status,
            formula: x.formula,
            effective_from: x.effective_from,
            effective_to: x.status === 'active' ? new Date().toISOString() : x.effective_to,
          }});
        }
      }
      await upsertFn({ data: {
        id: r.id,
        name: r.name, version: r.version, status: 'active',
        formula: r.formula,
        effective_from: new Date().toISOString(),
        effective_to: null,
      }});
      toast.success(`تم تطبيق v${r.version} على نظام عروض الأسعار`); load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }
  async function archive(r: any) {
    try {
      await upsertFn({ data: {
        id: r.id, name: r.name, version: r.version, status: 'archived',
        formula: r.formula,
        effective_from: r.effective_from,
        effective_to: new Date().toISOString(),
      }});
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }
  async function remove(r: any) {
    if (r.status === 'active') return toast.error("لا يمكن حذف النسخة الفعّالة — قم بأرشفتها أولاً");
    if (!confirm(`حذف النسخة v${r.version}؟ لا يمكن التراجع.`)) return;
    try {
      await deleteFn({ data: { id: r.id } });
      toast.success("تم الحذف"); load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }
  async function duplicate(r: any) {
    try {
      const maxV = rows.reduce((m, x) => Math.max(m, x.version), 0);
      await upsertFn({ data: {
        name: `${r.name} (نسخة)`, version: maxV + 1, status: 'draft', formula: r.formula,
        effective_from: null, effective_to: null,
      }});
      toast.success("تم إنشاء نسخة قابلة للتعديل"); load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
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
                  <Button size="icon" variant="ghost" onClick={() => openEdit(r)} disabled={r.status === 'active'} title="تعديل"><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => duplicate(r)} title="تكرار كمسودة"><Copy className="h-4 w-4" /></Button>
                  {r.status !== 'active' && <Button size="icon" variant="ghost" onClick={() => activate(r)} title="تطبيق هذه النسخة"><CheckCircle2 className="h-4 w-4 text-primary" /></Button>}
                  {r.status === 'active' && <Button size="icon" variant="ghost" onClick={() => archive(r)} title="أرشفة"><Archive className="h-4 w-4" /></Button>}
                  <Button size="icon" variant="ghost" onClick={() => remove(r)} disabled={r.status === 'active'} title="حذف"><Trash2 className="h-4 w-4 text-destructive" /></Button>
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