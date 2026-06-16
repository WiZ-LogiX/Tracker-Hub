import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listWorkers,
  upsertWorker,
  deleteWorker,
} from "@/lib/catalog.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/workers")({ component: WorkersPage });

function WorkersPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [workload, setWorkload] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: "", role: "", phone: "", active: true });

  const listFn = useServerFn(listWorkers);
  const upsertFn = useServerFn(upsertWorker);
  const deleteFn = useServerFn(deleteWorker);

  useEffect(() => { load(); }, []);
  async function load() {
    try {
      const r = await listFn();
      setRows(r.items ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load workers");
    }

    // Workload comes from production_assignments.
    const { data: as } = await supabase
      .from("production_assignments")
      .select("worker_id,status")
      .in("status", ["pending", "in_progress"]);
    const wl: Record<string, number> = {};
    for (const a of as ?? []) if (a.worker_id) wl[a.worker_id] = (wl[a.worker_id] ?? 0) + 1;
    setWorkload(wl);
  }

  function openNew() { setEditing(null); setForm({ name: "", role: "", phone: "", active: true }); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm({ name: r.name, role: r.role ?? "", phone: r.phone ?? "", active: r.active }); setOpen(true); }

  async function save() {
    if (!form.name.trim()) return toast.error("الاسم مطلوب");
    try {
      const payload = {
        id: editing?.id,
        name: form.name.trim(),
        role: form.role || null,
        phone: form.phone || null,
        active: form.active,
      };
      await upsertFn({ data: payload });
      toast.success("تم الحفظ"); setOpen(false); load();
    } catch (e: any) {
      toast.error(e?.message ?? "فشل الحفظ");
    }
  }

  async function remove(id: string) {
    if (!confirm("تأكيد الحذف؟")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("تم الحذف"); load();
    } catch (e: any) {
      toast.error(e?.message ?? "فشل الحذف");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div><h1 className="font-serif text-3xl font-bold">العمال</h1><p className="text-sm text-muted-foreground mt-1">فريق التصنيع وعبء العمل الحالي</p></div>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> عامل جديد</Button>
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>الاسم</TableHead><TableHead>الدور</TableHead><TableHead>الموبايل</TableHead>
            <TableHead>الحالة</TableHead><TableHead>عبء العمل</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">لا يوجد عمال بعد.</TableCell></TableRow>}
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.role ?? "—"}</TableCell>
                <TableCell>{r.phone ?? "—"}</TableCell>
                <TableCell><Badge variant={r.active ? "default" : "secondary"}>{r.active ? "نشط" : "متوقف"}</Badge></TableCell>
                <TableCell><Badge variant="outline">{workload[r.id] ?? 0}</Badge></TableCell>
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
          <DialogHeader><DialogTitle>{editing ? "تعديل عامل" : "عامل جديد"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>الاسم</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>الدور</Label><Input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} /></div>
            <div><Label>الموبايل</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="flex items-center gap-2"><input type="checkbox" id="active" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="rounded border-gray-300" /><Label htmlFor="active">نشط</Label></div>
            <Button onClick={save} className="w-full">حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}