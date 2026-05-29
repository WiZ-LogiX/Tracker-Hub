import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Inbox, FileText, Receipt, ClipboardList, ArrowLeft } from "lucide-react";
import { formatEGP } from "@/lib/pricing";
import { STAGE_LABEL_AR, OrderStage } from "@/lib/stages";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/")({ component: Dashboard });

function Dashboard() {
  const [stats, setStats] = useState({ rfqs: 0, quotes: 0, invoices: 0, orders: 0, revenue: 0 });
  const [recentRfqs, setRecentRfqs] = useState<any[]>([]);
  const [activeOrders, setActiveOrders] = useState<any[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ count: rfqs }, { count: quotes }, { count: invoices }, { count: orders }, inv, rfq, ord] = await Promise.all([
      supabase.from('quote_requests').select('*', { count: 'exact', head: true }).eq('status', 'new'),
      supabase.from('quotes').select('*', { count: 'exact', head: true }).neq('status', 'rejected'),
      supabase.from('invoices').select('*', { count: 'exact', head: true }),
      supabase.from('orders').select('*', { count: 'exact', head: true }).neq('current_stage', 'completed'),
      supabase.from('invoices').select('total'),
      supabase.from('quote_requests').select('*').order('created_at', { ascending: false }).limit(5),
      supabase.from('orders').select('*, customers(name)').neq('current_stage', 'completed').order('created_at', { ascending: false }).limit(5),
    ]);
    const revenue = (inv.data ?? []).reduce((s: number, r: any) => s + Number(r.total || 0), 0);
    setStats({ rfqs: rfqs ?? 0, quotes: quotes ?? 0, invoices: invoices ?? 0, orders: orders ?? 0, revenue });
    setRecentRfqs(rfq.data ?? []);
    setActiveOrders(ord.data ?? []);
  }

  const tiles = [
    { label: "طلبات جديدة", value: stats.rfqs, icon: Inbox, link: "/admin/requests", accent: "bg-gold/20 text-gold" },
    { label: "عروض أسعار نشطة", value: stats.quotes, icon: FileText, link: "/admin/quotes", accent: "bg-primary/10 text-primary" },
    { label: "فواتير", value: stats.invoices, icon: Receipt, link: "/admin/invoices", accent: "bg-secondary/15 text-secondary" },
    { label: "أوامر إنتاج جارية", value: stats.orders, icon: ClipboardList, link: "/admin/orders", accent: "bg-accent text-accent-foreground" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">لوحة الإدارة</h1>
        <p className="text-sm text-muted-foreground mt-1">نظرة عامة على نشاط النظام</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {tiles.map(t => (
          <Link key={t.label} to={t.link}>
            <Card className="hover:border-secondary transition cursor-pointer h-full">
              <CardContent className="p-5">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center mb-3 ${t.accent}`}>
                  <t.icon className="h-5 w-5" />
                </div>
                <div className="text-3xl font-bold font-serif">{t.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{t.label}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="text-xs text-muted-foreground mb-1">إجمالي قيمة الفواتير</div>
          <div className="text-4xl font-bold font-serif text-primary">{formatEGP(stats.revenue)}</div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-serif">آخر طلبات العملاء</CardTitle>
            <Link to="/admin/requests" className="text-xs text-secondary hover:underline inline-flex items-center gap-1">
              عرض الكل <ArrowLeft className="h-3 w-3 rtl-flip" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentRfqs.length === 0 && <p className="text-sm text-muted-foreground">لا يوجد طلبات بعد.</p>}
            {recentRfqs.map(r => (
              <Link key={r.id} to="/admin/requests" className="block p-3 rounded-md hover:bg-muted">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="font-medium text-sm">{r.customer_name}</div>
                    <div className="text-xs text-muted-foreground">{r.product_category} • {r.reference_number}</div>
                  </div>
                  <Badge variant={r.status === 'new' ? 'default' : 'secondary'} className="text-[10px]">{r.status}</Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-serif">أوامر إنتاج جارية</CardTitle>
            <Link to="/admin/orders" className="text-xs text-secondary hover:underline inline-flex items-center gap-1">
              عرض الكل <ArrowLeft className="h-3 w-3 rtl-flip" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeOrders.length === 0 && <p className="text-sm text-muted-foreground">لا توجد أوامر جارية.</p>}
            {activeOrders.map(o => (
              <div key={o.id} className="p-3 rounded-md hover:bg-muted">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="font-medium text-sm">{o.customers?.name ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">{o.order_number}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{STAGE_LABEL_AR[o.current_stage as OrderStage]}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
