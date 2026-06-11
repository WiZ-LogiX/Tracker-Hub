import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/wastage-rules")({ component: WastageRulesPage });

function WastageRulesPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ material_id: '_none', material_type: 'wood', min_dimension: 0, max_dimension: '', wastage_pct: 8, active: true });

  useEffect(() => { load(); }, []);
  async function load() {
    const [r, m] = await Promise.all([
      supabase.from("wastage_rules").select("*").order("material_type").order("min_dimension"),
      supabase.from("materials").select("id,name_ar,type").eq("active", true).order("name_ar"),
    ]);
    setRows(r.data ?? []); setMaterials(m.data ?? []);
  }

  function openNew() { setEditing(null); setForm({ material_id: '_none', material_type: 'wood', min_dimension: 0, max_dimension: '', wastage_pct: 8, active: true }); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm({ material_id: r.material_id ?? '_none', material_type: r.material_type, min_dimension: r.min_dimension, max_dimension: r.max_dimension ?? '', wastage_pct: r.wastage_pct, active: r.active }); setOpen(true); }

  async function save() {
    const payload = { material_id: form.material_id === '_none' ? null : form.material_id, material_type: form.material_type, min_dimension: Number(form.min_dimension), max_dimension: form.max_dimension ? Number(form.max_dimension) : null, wastage_pct: Number(form.wastage_pct), active: form.active };
    const q = editing ? supabase.from("wastage_rules").update(payload).eq("id", editing.id) : supabase.from("wastage_rules").insert(payload);
    const { error } = await q;
    if (error) return toast.error(error.message);
    toast.success(t("wastageRules.saved")); setOpen(false); load();
  }

  async function remove(id: string) {
    if (!confirm(t("common.confirmDelete"))) return;
    const { error } = await supabase.from("wastage_rules").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("wastageRules.deleted")); load();
  }

  async function applyMaterialWastage() {
    let count = 0;
    for (const m of materials) {
      if (!m.wastage_pct) continue;
      const existing = rows.find(r => r.material_id === m.id);
      if (existing) { const { error } = await supabase.from("wastage_rules").update({ wastage_pct: Number(m.wastage_pct) }).eq("id", existing.id); if (!error) count++; }
      else { const { error } = await supabase.from("wastage_rules").insert({ material_id: m.id, material_type: m.type || 'wood', min_dimension: 0, max_dimension: null, wastage_pct: Number(m.wastage_pct), active: true }); if (!error) count++; }
    }
    toast.success(t("wastageRules.applied", { count })); load();
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div><h1 className="font-serif text-3xl font-bold">{t("wastageRules.title")}</h1><p className="text-sm text-muted-foreground mt-1">{t("wastageRules.subtitle")}</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={applyMaterialWastage} className="gap-2"><RefreshCcw className="h-4 w-4" /> {t("wastageRules.applyFromMaterials")}</Button>
          <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> {t("wastageRules.new")}</Button>
        </div>
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("wastageRules.material")}</TableHead><TableHead>{t("wastageRules.materialType")}</TableHead>
            <TableHead>{t("wastageRules.minDim")}</TableHead><TableHead>{t("wastageRules.maxDim")}</TableHead>
            <TableHead>{t("wastageRules.wastagePct")}</TableHead><TableHead>{t("wastageRules.status")}</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{t("wastageRules.noRules")}</TableCell></TableRow>}
            {rows.map(r => { const mat = materials.find(m => m.id === r.material_id); return (
              <TableRow key={r.id}>
                <TableCell>{mat?.name_ar ?? r.material_id ?? t("wastageRules.general")}</TableCell>
                <TableCell>{r.material_type}</TableCell>
                <TableCell>{r.min_dimension}</TableCell><TableCell>{r.max_dimension ?? '—'}</TableCell>
                <TableCell className="font-bold">{r.wastage_pct}%</TableCell>
                <TableCell><Badge variant={r.active ? "default" : "secondary"}>{r.active ? t("workers.active") : t("workers.inactive")}</Badge></TableCell>
                <TableCell className="flex gap-1 justify-end">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            );})}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? t("wastageRules.edit") : t("wastageRules.new")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t("wastageRules.material")}</Label>
              <Select value={form.material_id} onValueChange={v => setForm({ ...form, material_id: v })}>
                <SelectTrigger><SelectValue placeholder={t("wastageRules.general")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">{t("wastageRules.general")}</SelectItem>
                  {materials.map(m => <SelectItem key={m.id} value={m.id}>{m.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("wastageRules.materialType")}</Label><Input value={form.material_type} onChange={e => setForm({ ...form, material_type: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("wastageRules.minDim")}</Label><Input type="number" step="0.01" value={form.min_dimension} onChange={e => setForm({ ...form, min_dimension: Number(e.target.value) })} /></div>
              <div><Label>{t("wastageRules.maxDim")}</Label><Input type="number" step="0.01" value={form.max_dimension} onChange={e => setForm({ ...form, max_dimension: e.target.value === '' ? '' : Number(e.target.value) })} /></div>
            </div>
            <div><Label>{t("wastageRules.wastagePct")}</Label><Input type="number" step="0.1" value={form.wastage_pct} onChange={e => setForm({ ...form, wastage_pct: Number(e.target.value) })} /></div>
            <div className="flex items-center gap-2"><input type="checkbox" id="active" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="rounded border-gray-300" /><Label htmlFor="active" className="mb-0">{t("workers.active")}</Label></div>
            <Button onClick={save} className="w-full">{t("common.save")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}