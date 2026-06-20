import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { DEFAULT_FORMULA } from "@/lib/pricing/engine";
import type { FormulaStep } from "@/lib/pricing/engine";
import {
  listPricingRules, upsertPricingRule, deletePricingRule,
} from "@/lib/catalog.functions";
import { listPricingFactors } from "@/lib/pricing-factors.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, CheckCircle2, Archive, Trash2, Copy, GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/pricing-rules")({ component: PricingRulesPage });

const OP_LABELS: Record<string, string> = {
  add: "إضافة بند",
  snapshot: "سجّل مجموع",
  mul_pct: "تطبيق عاملاً نسبياً",
};

const OP_FIELDS: Record<string, { key: string; label: string; options: string[] }[]> = {
  add: [{ key: "of", label: "البند", options: ["base_cost", "material_cost", "finish_cost", "veneer_cost", "accessories_cost"] }],
  snapshot: [{ key: "as", label: "الاسم", options: [] }],
  mul_pct: [
    { key: "factor", label: "العامل", options: [] },
    { key: "of", label: "من المجموع", options: [] },
  ],
};

interface Factor { id: string; key: string; label_ar: string; }

function PricingRulesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<FormulaStep[]>([]);
  const [factors, setFactors] = useState<Factor[]>([]);

  const listFn = useServerFn(listPricingRules);
  const upsertFn = useServerFn(upsertPricingRule);
  const deleteFn = useServerFn(deletePricingRule);
  const listFactorsFn = useServerFn(listPricingFactors);

  async function load() {
    try {
      const [r, f] = await Promise.all([listFn(), listFactorsFn()]);
      setRows(r.items ?? []);
      setFactors((f.items as Factor[]) ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    }
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setName("قاعدة جديدة");
    setSteps(JSON.parse(JSON.stringify(DEFAULT_FORMULA.steps)));
    setOpen(true);
  }

  function openEdit(r: any) {
    if (r.status === "active") return toast.error("القواعد الفعّالة غير قابلة للتعديل — أنشئ نسخة جديدة");
    setEditing(r);
    setName(r.name);
    setSteps(JSON.parse(JSON.stringify(r.formula?.steps ?? DEFAULT_FORMULA.steps)));
    setOpen(true);
  }

  function addStep(afterIndex: number) {
    const newStep: FormulaStep = { op: "add", of: "base_cost" };
    const next = [...steps];
    next.splice(afterIndex + 1, 0, newStep);
    setSteps(next);
  }

  function removeStep(i: number) {
    if (steps.length <= 1) return toast.error("يجب أن تبقى خطوة واحدة على الأقل");
    setSteps(steps.filter((_, j) => j !== i));
  }

  function moveStep(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next);
  }

  function updateStep(i: number, patch: Partial<FormulaStep>) {
    const next = [...steps];
    next[i] = { ...next[i], ...patch };
    // Reset fields when op changes
    if ("op" in patch) {
      if (patch.op === "add") { next[i].of = "base_cost"; next[i].as = undefined; next[i].factor = undefined; next[i].add = undefined; }
      if (patch.op === "snapshot") { next[i].as = "snapshot_name"; next[i].of = undefined; next[i].factor = undefined; next[i].add = undefined; }
      if (patch.op === "mul_pct") { next[i].factor = factors[0]?.key ?? "labor"; next[i].of = ""; next[i].add = true; next[i].as = undefined; }
    }
    setSteps(next);
  }

  function factorLabel(key: string) {
    const f = factors.find(x => x.key === key);
    return f ? f.label_ar : key;
  }

  function stepDescription(s: FormulaStep, i: number) {
    if (s.op === "add") return `إضافة ${s.of === "base_cost" ? "السعر الأساسي" : s.of?.replace("_cost", "")}`;
    if (s.op === "snapshot") return `سجّل "${s.as}"`;
    if (s.op === "mul_pct") {
      const fLabel = factorLabel(s.factor ?? "");
      const ofLabel = s.of ? ` من "${s.of}"` : " من المجموع الحالي";
      return `تطبيق ${fLabel}${ofLabel}${s.add ? " +إضافة" : ""}`;
    }
    return "";
  }

  async function save() {
    if (!name.trim()) return toast.error("الاسم مطلوب");
    try {
      const formula = { steps };
      if (editing) {
        await upsertFn({ data: {
          id: editing.id, name, version: editing.version, status: editing.status, formula,
        }});
      } else {
        const maxV = rows.reduce((m, r) => Math.max(m, r.version), 0);
        await upsertFn({ data: {
          name, version: maxV + 1, status: "draft", formula,
          effective_from: null, effective_to: null,
        }});
      }
      toast.success("تم الحفظ"); setOpen(false); load();
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); }
  }

  async function activate(r: any) {
    try {
      for (const x of rows) {
        if (x.status === "active") {
          await upsertFn({ data: {
            id: x.id, name: x.name, version: x.version, status: "archived",
            formula: x.formula, effective_from: x.effective_from,
            effective_to: new Date().toISOString(),
          }});
        }
      }
      await upsertFn({ data: {
        id: r.id, name: r.name, version: r.version, status: "active",
        formula: r.formula, effective_from: new Date().toISOString(), effective_to: null,
      }});
      toast.success(`تم تطبيق v${r.version} على نظام عروض الأسعار`); load();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  async function archive(r: any) {
    try {
      await upsertFn({ data: {
        id: r.id, name: r.name, version: r.version, status: "archived",
        formula: r.formula, effective_from: r.effective_from, effective_to: new Date().toISOString(),
      }});
      load();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  async function remove(r: any) {
    if (r.status === "active") return toast.error("لا يمكن حذف النسخة الفعّالة — قم بأرشفتها أولاً");
    if (!confirm(`حذف النسخة v${r.version}؟ لا يمكن التراجع.`)) return;
    try {
      await deleteFn({ data: { id: r.id } });
      toast.success("تم الحذف"); load();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  async function duplicate(r: any) {
    try {
      const maxV = rows.reduce((m, x) => Math.max(m, x.version), 0);
      await upsertFn({ data: {
        name: `${r.name} (نسخة)`, version: maxV + 1, status: "draft", formula: r.formula,
        effective_from: null, effective_to: null,
      }});
      toast.success("تم إنشاء نسخة قابلة للتعديل"); load();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  const factorKeys = factors.filter(f => f.key).map(f => f.key);
  const snapshotNames = steps.filter(s => s.op === "snapshot" && s.as).map(s => s.as!);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-serif text-3xl font-bold">قواعد التسعير</h1>
          <p className="text-sm text-muted-foreground mt-1">كل عرض سعر يثبت نسخة محددة — لا تتغير النسخ القديمة</p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> نسخة جديدة</Button>
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>النسخة</TableHead><TableHead>الاسم</TableHead><TableHead>الحالة</TableHead><TableHead>سارية من</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell>v{r.version}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "active" ? "default" : r.status === "draft" ? "secondary" : "outline"}>
                    {r.status === "active" ? "فعّالة" : r.status === "draft" ? "مسودة" : "مؤرشفة"}
                  </Badge>
                </TableCell>
                <TableCell>{r.effective_from ? new Date(r.effective_from).toLocaleDateString("ar-EG") : "—"}</TableCell>
                <TableCell className="flex gap-1 justify-end">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(r)} disabled={r.status === "active"} title="تعديل"><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => duplicate(r)} title="تكرار"><Copy className="h-4 w-4" /></Button>
                  {r.status !== "active" && <Button size="icon" variant="ghost" onClick={() => activate(r)} title="تطبيق"><CheckCircle2 className="h-4 w-4 text-primary" /></Button>}
                  {r.status === "active" && <Button size="icon" variant="ghost" onClick={() => archive(r)} title="أرشفة"><Archive className="h-4 w-4" /></Button>}
                  <Button size="icon" variant="ghost" onClick={() => remove(r)} disabled={r.status === "active"} title="حذف"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? `تعديل v${editing.version}` : "نسخة جديدة"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>الاسم</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>

            <div className="space-y-2">
              <Label>خطوات الصيغة</Label>
              {steps.map((s, i) => (
                <div key={i} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-6 text-center">#{i + 1}</span>
                    <Select value={s.op} onValueChange={v => updateStep(i, { op: v as any })}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(OP_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>

                    {s.op === "add" && (
                      <Select value={s.of ?? ""} onValueChange={v => updateStep(i, { of: v })}>
                        <SelectTrigger className="w-48"><SelectValue placeholder="البند" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="base_cost">السعر الأساسي</SelectItem>
                          <SelectItem value="material_cost">تكلفة المواد</SelectItem>
                          <SelectItem value="finish_cost">تكلفة التشطيب</SelectItem>
                          <SelectItem value="veneer_cost">تكلفة الveneer</SelectItem>
                          <SelectItem value="accessories_cost">تكلفة الإكسسوارات</SelectItem>
                        </SelectContent>
                      </Select>
                    )}

                    {s.op === "snapshot" && (
                      <Input value={s.as ?? ""} onChange={e => updateStep(i, { as: e.target.value })} placeholder="اسم اللقطة" className="w-48" />
                    )}

                    {s.op === "mul_pct" && (
                      <>
                        <Select value={s.factor ?? ""} onValueChange={v => updateStep(i, { factor: v })}>
                          <SelectTrigger className="w-40"><SelectValue placeholder="العامل" /></SelectTrigger>
                          <SelectContent>
                            {factorKeys.map(k => <SelectItem key={k} value={k}>{factorLabel(k)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={s.of ?? "__running__"} onValueChange={v => updateStep(i, { of: v === "__running__" ? undefined : v })}>
                          <SelectTrigger className="w-48"><SelectValue placeholder="من المجموع" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__running__">المجموع الحالي</SelectItem>
                            {snapshotNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <label className="flex items-center gap-1 text-xs">
                          <input type="checkbox" checked={!!s.add} onChange={e => updateStep(i, { add: e.target.checked })} />
                          +إضافة للمجموع
                        </label>
                      </>
                    )}

                    <div className="flex gap-0.5 ms-auto">
                      <Button size="icon" variant="ghost" onClick={() => moveStep(i, -1)} disabled={i === 0} title="تحريك لأعلى"><ArrowUp className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} title="تحريك لأسفل"><ArrowDown className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => removeStep(i)} title="حذف الخطوة"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground ps-8">{stepDescription(s, i)}</p>
                  <Button size="sm" variant="ghost" onClick={() => addStep(i)} className="ms-8 gap-1 text-xs"><Plus className="h-3 w-3" /> خطوة بعد هذه</Button>
                </div>
              ))}
              <Button variant="outline" onClick={() => addStep(steps.length - 1)} className="gap-1 w-full"><Plus className="h-4 w-4" /> إضافة خطوة</Button>
            </div>

            <Button onClick={save} className="w-full">حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
