import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { ensurePricingSetup } from "@/lib/seed.functions";
import { formatEGP } from "@/lib/pricing";
import { toast } from "sonner";
import { Users, FileText, ClipboardList, DollarSign, Trash2, Settings, Database, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/admin/")({ component: Dashboard });

function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [stats, setStats] = useState({
    customers: 0,
    quotes: 0,
    orders: 0,
    revenue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  async function loadStats() {
    const [c, q, o] = await Promise.all([
      supabase.from("customers").select("id", { count: "exact", head: true }),
      supabase.from("quotes").select("total"),
      supabase.from("orders").select("id", { count: "exact", head: true }),
    ]);
    const revenue = (q.data ?? []).reduce((s: number, r: any) => s + Number(r.total || 0), 0);
    setStats({
      customers: c.count ?? 0,
      quotes: q.data?.length ?? 0,
      orders: o.count ?? 0,
      revenue,
    });
    setLoading(false);
  }

  async function deleteTransientData() {
    if (!confirm("هل أنت متأكد من حذف عروض الأسعار والفواتير وأوامر الإنتاج فقط؟\nسيتم الاحتفاظ بقوالب المنتجات والخامات والموردين والتشطيبات والقشرة والإكسسوارات وعوامل التسعير وقواعد الهدر والخصومات والعمال.")) return;
    setDeleting(true);
    try {
      const tables = [
        'production_photos',
        'production_logs',
        'production_assignments',
        'qc_inspections',
        'remakes',
        'orders',
        'invoices',
        'quote_items',
        'configurations',
        'quotes',
      ];
      
      let deleted = 0;
      for (const table of tables) {
        const { error, count } = await supabase
          .from(table as any)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        if (!error) deleted += count ?? 0;
      }
      
      toast.success(`تم حذف ${deleted} سجل (عروض أسعار، فواتير، أوامر إنتاج فقط)`);
      setStats({ ...stats, quotes: 0, orders: 0, revenue: 0 });
    } catch (err: any) {
      toast.error(err?.message ?? "فشل الحذف");
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => { loadStats(); }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-muted rounded animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-serif text-3xl font-bold">{t("admin.panel")}</h1>
          <p className="text-sm text-muted-foreground mt-1">مرحباً {user?.email}</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="destructive" 
            size="sm" 
            onClick={deleteTransientData} 
            disabled={deleting}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            {deleting ? "جارٍ الحذف..." : "حذف البيانات المؤقتة"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">العملاء</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-serif">{stats.customers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">عروض الأسعار</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-serif">{stats.quotes}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">أوامر الإنتاج</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-serif">{stats.orders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي الإيرادات</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-serif">{formatEGP(stats.revenue)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-serif">إعدادات النظام</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link to="/admin/seed" className="flex items-center gap-2 p-3 border rounded-md hover:bg-accent transition">
              <Database className="h-5 w-5 text-primary" />
              <div className="text-sm font-medium flex-1">إعداد قاعدة البيانات</div>
              <ArrowLeft className="h-4 w-4 rtl-flip text-muted-foreground" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}