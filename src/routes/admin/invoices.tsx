import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatEGP } from "@/lib/pricing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/invoices")({ component: InvoicesPage });

function InvoicesPage() {
  const [invs, setInvs] = useState<any[]>([]);
  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from('invoices').select('*, customers(name,phone)').order('issued_at', { ascending: false });
    setInvs(data ?? []);
  }
  async function markPaid(id: string, total: number) {
    await supabase.from('invoices').update({ paid_at: new Date().toISOString(), paid_amount: total }).eq('id', id);
    toast.success("تم تسجيل السداد"); load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">الفواتير</h1>
        <p className="text-sm text-muted-foreground mt-1">إدارة الفواتير الصادرة</p>
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>الرقم</TableHead><TableHead>العميل</TableHead><TableHead>الإجمالي</TableHead>
            <TableHead>العربون</TableHead><TableHead>الحالة</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {invs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد فواتير.</TableCell></TableRow>}
            {invs.map(i => (
              <TableRow key={i.id}>
                <TableCell className="font-mono text-xs"><Link to="/admin/invoices/$id" params={{ id: i.id }} className="text-gold hover:underline">{i.invoice_number}</Link></TableCell>
                <TableCell>{i.customers?.name}</TableCell>
                <TableCell className="font-medium">{formatEGP(Number(i.total))}</TableCell>
                <TableCell>{formatEGP(Number(i.deposit_amount))}</TableCell>
                <TableCell><Badge variant={i.paid_at ? 'default' : 'secondary'}>{i.paid_at ? 'مدفوعة' : 'بانتظار السداد'}</Badge></TableCell>
                <TableCell>{!i.paid_at && <Button size="sm" variant="outline" onClick={() => markPaid(i.id, Number(i.total))}>تسجيل سداد</Button>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
