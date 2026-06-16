import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listDiscounts,
  upsertDiscount,
  deleteDiscount,
} from "@/lib/catalog.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/discounts")({ component: DiscountsPage });

function DiscountsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const blankForm = { code: "", type: "percentage", value: 0, max_value: "", max_uses: "", active: true };
  const [form, setForm] = useState<any>(blankForm);

  const listFn = useServerFn(listDiscounts);
  const upsertFn = useServerFn(upsertDiscount);
  const deleteFn = useServerFn(deleteDiscount);

  async function load() {
    try {
      const r = await listFn();
      setRows(r.items ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    }
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm(blankForm); setOpen(true); }
  function openEdit(r: any) {
    setEditing(r);
    setForm({
      code: r.code,
      type: r.type,
      value: String(r.value ?? 0),
      max_value: r.max_value != null ? String(r.max_value) : "",
      max_uses: r.max_uses != null ? String(r.max_uses) : "",
      active: r.active,
    });
    setOpen(true);
  }

  async function save() {
    try {
      const payload = {
        id: editing?.id,
        code: form.code,
        type: form.type,
        value: Number(form.value),
        max_value: form.max_value !== "" ? Number(form.max_value) : null,
        max_uses: form.max_uses !== "" ? Number(form.max_uses) : null,
        active: form.active,
      };
      await upsertFn({ data: payload });
      toast.success("تم الحفظ"); setOpen(false); load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  async function remove(id: string) {
    if (!confirm("تأكيد الحذف؟")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("تم الحذف"); load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-serif text-3xl font-bold">الخصومات</h1>
          <p className="text-sm text-muted-foreground mt-1">كوبونات الخصم</p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> جديد</Button>
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>الكود</TableHead>
            <TableHead>النوع</TableHead>
            <TableHead>القيمة</TableHead>
            <TableHead>الحد الأقصى</TableHead>
            <TableHead>أقصى استخدام</TableHead>
            <TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد بيانات.</TableCell></TableRow>}
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-mono">{r.code}</TableCell>
                <TableCell>{r.type}</TableCell>
                <TableCell>{r.value}</TableCell>
                <TableCell>{r.max_value ?? '—'}</TableCell>
                <TableCell>{r.max_uses ?? '—'}</TableCell>
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
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "تعديل خصم" : "إضافة خصم"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>الكود</Label><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></div>
            <div><Label>النوع (percentage / fixed)</Label><Input value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} /></div>
            <div><Label>القيمة</Label><Input type="number" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} /></div>
            <div><Label>الحد الأقصى</Label><Input type="number" value={form.max_value} onChange={e => setForm({ ...form, max_value: e.target.value })} /></div>
            <div><Label>أقصى استخدام</Label><Input type="number" value={form.max_uses} onChange={e => setForm({ ...form, max_uses: e.target.value })} /></div>
            <div className="flex items-center gap-2"><input type="checkbox" id="active" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="rounded border-gray-300" /><Label htmlFor="active">نشط</Label></div>
            <Button onClick={save} className="w-full">حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}