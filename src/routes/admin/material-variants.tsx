import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { formatEGP } from "@/lib/pricing";

export const Route = createFileRoute("/admin/material-variants")({ component: MaterialVariantsPage });

interface Row {
  id: string;
  material_id: string;
  supplier_id: string | null;
  country_of_origin: string | null;
  price_per_unit: number;
  currency: string;
  valid_from: string;
  valid_to: string | null;
  active: boolean;
}

function MaterialVariantsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const blank: Row = { id: '', material_id: '', supplier_id: null, country_of_origin: '', price_per_unit: 0, currency: 'EGP', valid_from: new Date().toISOString().slice(0,10), valid_to: null, active: true };
  const [form, setForm] = useState<Row>(blank);

  async function load() {
    const [v, m, s] = await Promise.all([
      supabase.from('material_variants').select('*').order('created_at', { ascending: false }),
      supabase.from('materials').select('*').eq('active', true),
      supabase.from('suppliers').select('*').eq('active', true),
    ]);
    setRows(v.data ?? []); setMaterials(m.data ?? []); setSuppliers(s.data ?? []);
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm(blank); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm({ ...blank, ...r }); setOpen(true); }
  async function save() {
    if (!form.material_id) return toast.error("اختر الخامة");
    const payload: any = {
      material_id: form.material_id,
      supplier_id: form.supplier_id || null,
      country_of_origin: form.country_of_origin || null,
      price_per_unit: Number(form.price_per_unit),
      currency: form.currency || 'EGP',
      valid_from: form.valid_from,
      valid_to: form.valid_to || null,
      active: form.active,
    };
    const q = editing
      ? supabase.from('material_variants').update(payload).eq('id', editing.id)
      : supabase.from('material_variants').insert(payload);
    const { error } = await q;
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ"); setOpen(false); load();
  }
  async function remove(id: string) {
    if (!confirm("تأكيد الحذف؟")) return;
    const { error } = await supabase.from('material_variants').delete().eq('id', id);
    if (error) return toast.error(error.message);
    load();
  }

  function matName(id: string) { return materials.find(m => m.id === id)?.name_ar ?? '—'; }
  function supName(id: string | null) { return id ? (suppliers.find(s => s.id === id)?.name ?? '—') : '—'; }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-serif text-3xl font-bold">متغيرات الخامات</h1>
          <p className="text-sm text-muted-foreground mt-1">سعر الخامة لكل مورد/بلد منشأ — يدعم تاريخ الصلاحية</p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> جديد</Button>
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>الخامة</TableHead>
            <TableHead>المورد</TableHead>
            <TableHead>بلد المنشأ</TableHead>
            <TableHead>السعر</TableHead>
            <TableHead>من</TableHead>
            <TableHead>حتى</TableHead>
            <TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد بيانات.</TableCell></TableRow>}
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell>{matName(r.material_id)}</TableCell>
                <TableCell>{supName(r.supplier_id)}</TableCell>
                <TableCell>{r.country_of_origin ?? '—'}</TableCell>
                <TableCell>{formatEGP(Number(r.price_per_unit))}</TableCell>
                <TableCell>{r.valid_from}</TableCell>
                <TableCell>{r.valid_to ?? '—'}</TableCell>
                <TableCell className="flex gap-1 justify-end">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "تعديل" : "إضافة متغير"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>الخامة</Label>
              <Select value={form.material_id} onValueChange={v => setForm({ ...form, material_id: v })}>
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>{materials.map(m => <SelectItem key={m.id} value={m.id}>{m.name_ar}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>المورد</Label>
              <Select value={form.supplier_id ?? ''} onValueChange={v => setForm({ ...form, supplier_id: v || null })}>
                <SelectTrigger><SelectValue placeholder="اختياري" /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>بلد المنشأ</Label><Input value={form.country_of_origin ?? ''} onChange={e => setForm({ ...form, country_of_origin: e.target.value })} /></div>
            <div><Label>السعر / الوحدة</Label><Input type="number" step="0.01" value={form.price_per_unit} onChange={e => setForm({ ...form, price_per_unit: Number(e.target.value) })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>من</Label><Input type="date" value={form.valid_from} onChange={e => setForm({ ...form, valid_from: e.target.value })} /></div>
              <div><Label>حتى (اختياري)</Label><Input type="date" value={form.valid_to ?? ''} onChange={e => setForm({ ...form, valid_to: e.target.value || null })} /></div>
            </div>
            <Button onClick={save} className="w-full">حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
