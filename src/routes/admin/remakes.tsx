import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/remakes")({ component: RemakesPage });

const STATUSES = ["open", "in_progress", "completed"];
const STATUS_AR: Record<string, string> = { open: "مفتوح", in_progress: "قيد التنفيذ", completed: "مكتمل" };

function RemakesPage() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase
      .from("remakes")
      .select("*, orders(order_number, customers(name))")
      .order("created_at", { ascending: false });
    setRows(data ?? []);
  }

  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from("remakes").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم التحديث"); load();
  }

  const now = new Date();
  const thisMonth = rows.filter(r => {
    const d = new Date(r.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = rows.filter(r => {
    const d = new Date(r.created_at);
    return d.getFullYear() === lastMonthDate.getFullYear() && d.getMonth() === lastMonthDate.getMonth();
  }).length;
  const openCount = rows.filter(r => r.status === "open").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">إعادة التصنيع</h1>
        <p className="text-sm text-muted-foreground mt-1">متابعة قطع الإنتاج التي رسبت في الفحص</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">هذا الشهر</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{thisMonth}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">الشهر السابق</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{lastMonth}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">مفتوح حالياً</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-gold">{openCount}</div></CardContent></Card>
      </div>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>الأمر</TableHead><TableHead>العميل</TableHead><TableHead>السبب</TableHead>
            <TableHead>التاريخ</TableHead><TableHead>الحالة</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">لا توجد إعادات تصنيع.</TableCell></TableRow>}
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.orders?.order_number ?? "—"}</TableCell>
                <TableCell>{r.orders?.customers?.name ?? "—"}</TableCell>
                <TableCell className="max-w-xs"><div className="text-xs whitespace-pre-wrap">{r.reason}</div></TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("ar-EG")}</TableCell>
                <TableCell>
                  <Select value={r.status} onValueChange={v => setStatus(r.id, v)}>
                    <SelectTrigger className="h-8 w-36"><SelectValue><Badge variant={r.status === "completed" ? "default" : r.status === "in_progress" ? "secondary" : "outline"}>{STATUS_AR[r.status]}</Badge></SelectValue></SelectTrigger>
                    <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_AR[s]}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
