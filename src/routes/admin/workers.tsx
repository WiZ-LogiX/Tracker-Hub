import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/workers")({ component: WorkersPage });

function WorkersPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [workload, setWorkload] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: "", role: "", phone: "", active: true });

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: ws }, { data: as }] = await Promise.all([
      supabase.from("workers").select("*").order("created_at", { ascending: false }),
      supabase.from("production_assignments").select("worker_id,status").in("status", ["pending", "in_progress"]),
    ]);
    setRows(ws ?? []);
    const wl: Record<string, number> = {};
    for (const a of as ?? []) if (a.worker_id) wl[a.worker_id] = (wl[a.worker_id] ?? 0) + 1;
    setWorkload(wl);
  }

  function openNew() { setEditing(null); setForm({ name: "", role: "", phone: "", active: true }); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm({ name: r.name, role: r.role ?? "", phone: r.phone ?? "", active: r.active }); setOpen(true); }

  async function save() {
    if (!form.name.trim()) return toast.error("الاسم مطلوب");
    const payload = { name: form.name.trim(), role: form.role || null, phone: form.phone || null, active: form.active };
    const q = editing
      ? supabase.from("workers").update(payload).eq("id", editing.id)
      : supabase.from("workers").insert(payload);
    const { error } = await q;
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ"); setOpen(false); load();
  }

  async function remove(id: string) {
    if (!confirm("تأكيد الحذف؟")) return;
    const { error } = await supabase.from("workers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف"); load();
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-serif text-3xl font-bold">العمال</h1>
          <p className="text-sm text-muted-foreground mt-1">فريق التصنيع وعبء العمل الحالي</p>
        </div>
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
                <TableCell><Badge variant="outline">{workload[r.id] ?? 0} تكليف نشط</Badge></TableCell>
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
            <div><Label>الدور (نجار / دهان / تجميع...)</Label><Input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} /></div>
            <div><Label>الموبايل</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} /><Label>نشط</Label></div>
            <Button onClick={save} className="w-full">حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
