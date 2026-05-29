import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/requests")({ component: RequestsPage });

function RequestsPage() {
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from('quote_requests').select('*, customers(name,phone,email)').order('created_at', { ascending: false });
    setRfqs(data ?? []);
  }
  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from('quote_requests').update({ status: status as any }).eq('id', id);
    if (error) return toast.error(error.message);
    toast.success("تم التحديث");
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">طلبات العملاء (RFQ)</h1>
        <p className="text-sm text-muted-foreground mt-1">طلبات عروض الأسعار الواردة من الموقع</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المرجع</TableHead>
                <TableHead>العميل</TableHead>
                <TableHead>المنتج</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead>إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rfqs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">لا توجد طلبات.</TableCell></TableRow>}
              {rfqs.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.reference_number}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.customer_name}</div>
                    <div className="text-xs text-muted-foreground">{r.customer_phone}</div>
                  </TableCell>
                  <TableCell>{r.product_category}</TableCell>
                  <TableCell><Badge variant={r.status === 'new' ? 'default' : 'secondary'}>{r.status}</Badge></TableCell>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleDateString('ar-EG')}</TableCell>
                  <TableCell className="flex gap-2">
                    <Dialog>
                      <DialogTrigger asChild><Button size="sm" variant="outline" onClick={() => setSelected(r)}>عرض</Button></DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <DialogHeader><DialogTitle>{r.reference_number}</DialogTitle></DialogHeader>
                        {selected && <RFQDetail r={selected} onStatusChange={updateStatus} />}
                      </DialogContent>
                    </Dialog>
                    <Link to="/admin/quotes/new" search={{ rfq: r.id } as any}>
                      <Button size="sm">إنشاء عرض</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function RFQDetail({ r, onStatusChange }: { r: any; onStatusChange: (id: string, s: string) => void }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div><div className="text-xs text-muted-foreground">الاسم</div><div>{r.customer_name}</div></div>
        <div><div className="text-xs text-muted-foreground">الموبايل</div><div>{r.customer_phone}</div></div>
        <div><div className="text-xs text-muted-foreground">البريد</div><div>{r.customer_email || '—'}</div></div>
        <div><div className="text-xs text-muted-foreground">المحافظة</div><div>{r.governorate || '—'}</div></div>
        <div><div className="text-xs text-muted-foreground">الفئة</div><div>{r.product_category}</div></div>
        <div><div className="text-xs text-muted-foreground">الميزانية</div><div>{r.budget_range || '—'}</div></div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground mb-1">المواصفات</div>
        <pre className="bg-muted rounded p-2 text-xs overflow-auto">{JSON.stringify(r.specs, null, 2)}</pre>
      </div>
      {r.notes && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">ملاحظات</div>
          <div className="bg-muted rounded p-2 text-xs">{r.notes}</div>
        </div>
      )}
      <div className="flex gap-2 pt-2">
        <Button size="sm" variant="outline" onClick={() => onStatusChange(r.id, 'in_review')}>قيد المراجعة</Button>
        <Button size="sm" variant="outline" onClick={() => onStatusChange(r.id, 'closed')}>إغلاق</Button>
      </div>
    </div>
  );
}
