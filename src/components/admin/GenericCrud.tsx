import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

export interface FieldDef {
  key: string;
  label: string;
  type?: 'text' | 'number';
  default?: any;
  showInTable?: boolean;
}

export function GenericCrud({
  title, subtitle, table, fields,
}: {
  title: string; subtitle?: string; table: string; fields: FieldDef[];
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const blank = Object.fromEntries(fields.map(f => [f.key, f.default ?? (f.type === 'number' ? 0 : '')]));
  const [form, setForm] = useState<any>(blank);

  useEffect(() => { load(); }, [table]);
  async function load() {
    const { data } = await (supabase as any).from(table).select('*').order('created_at', { ascending: false });
    setRows(data ?? []);
  }
  function openNew() { setEditing(null); setForm(blank); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm({ ...blank, ...r }); setOpen(true); }
  async function save() {
    const payload: any = {};
    for (const f of fields) {
      payload[f.key] = f.type === 'number' ? Number(form[f.key]) : form[f.key];
    }
    const q = editing
      ? (supabase as any).from(table).update(payload).eq('id', editing.id)
      : (supabase as any).from(table).insert(payload);
    const { error } = await q;
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ"); setOpen(false); load();
  }
  async function remove(id: string) {
    if (!confirm("تأكيد الحذف؟")) return;
    const { error } = await (supabase as any).from(table).delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف"); load();
  }

  const tableFields = fields.filter(f => f.showInTable !== false);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-serif text-3xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> جديد</Button>
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            {tableFields.map(f => <TableHead key={f.key}>{f.label}</TableHead>)}
            <TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={tableFields.length + 1} className="text-center py-8 text-muted-foreground">لا توجد بيانات.</TableCell></TableRow>}
            {rows.map(r => (
              <TableRow key={r.id}>
                {tableFields.map(f => <TableCell key={f.key}>{String(r[f.key] ?? '—')}</TableCell>)}
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
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "تعديل" : "إضافة جديد"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {fields.map(f => (
              <div key={f.key}>
                <Label>{f.label}</Label>
                <Input type={f.type === 'number' ? 'number' : 'text'} value={form[f.key] ?? ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
              </div>
            ))}
            <Button onClick={save} className="w-full">حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
