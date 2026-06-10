import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatEGP } from "@/lib/pricing";
import { FileText, Receipt, ClipboardList, Users, TrendingUp, Package, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/")({ component: AdminDashboard });

function AdminDashboard() {
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

  useEffect(() => {
    Promise.all([
      supabase.from("customers").select("id", { count: "exact", head: true }),
      supabase.from("quotes").select("total"),
      supabase.from("orders").select("id", { count: "exact", head: true }),
    ]).then(([c, q, o]) => {
      const revenue = (q.data ?? []).reduce((s: number, r: any) => s + Number(r.total || 0), 0);
      setStats({
        customers: c.count ?? 0,
        quotes: q.data?.length ?? 0,
        orders: o.count ?? 0,
        revenue,
      });
      setLoading(false);
    });
  }, []);

  async function deleteAllData() {
    if (!confirm("هل أنت متأكد من حذف جميع البيانات؟ هذا الإجراء لا يمكن التراجع عنه.")) return;
    setDeleting(true);
    try {
      const tables = [
        'accessories', 'tenants', 'audit_log', 'categories', 'configurations',
        'quote_items', 'product_templates', 'customers', 'discounts', 'finishes',
        'internal_notes', 'wastage_rules', 'materials', 'suppliers', 'veneers',
        'pricing_factors', 'pricing_rules', 'products', 'quotes', 'invoices',
        'orders', 'production_assignments', 'production_logs', 'production_photos',
        'qc_inspections', 'remakes', 'workers', 'notification_log', 'notification_templates',
      ];
      
      let deleted = 0;
      for (const table of tables) {
        const { error, count } = await supabase
          .from(table as any)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        if (!error) deleted += count ?? 0;
      }
      
      toast.success(`تم حذف ${deleted} سجل`);
      // Reload stats
      setStats({ customers: 0, quotes: 0, orders: 0, revenue: 0 });
    } catch (err: any) {
      toast.error(err?.message ?? "فشل الحذف");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold">{t("admin.panel")}</h1>
          <p className="text-sm text-muted-foreground mt-1">مرحباً {user?.email}</p>
        </div>
        <Button 
          variant="destructive" 
          size="sm" 
          onClick={deleteAllData} 
          disabled={deleting}
          className="gap-2"
        >
          <Trash2 className="h-4 w-4" />
          {deleting ? "جارٍ الحذف..." : "حذف جميع البيانات"}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{loading ? "..." : stats.customers}</div>
              <div className="text-xs text-muted-foreground">العملاء</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{loading ? "..." : stats.quotes}</div>
              <div className="text-xs text-muted-foreground">عروض الأسعار</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{loading ? "..." : stats.orders}</div>
              <div className="text-xs text-muted-foreground">أوامر الإنتاج</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{loading ? "..." : formatEGP(stats.revenue)}</div>
              <div className="text-xs text-muted-foreground">إجمالي عروض الأسعار</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">روابط سريعة</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link to="/admin/quotes/configurator" className="p-4 border rounded-lg hover:bg-accent transition text-center">
            <Package className="h-6 w-6 mx-auto mb-2 text-primary" />
            <div className="text-sm font-medium">منشئ عروض الأسعار</div>
          </Link>
          <Link to="/admin/quotes" className="p-4 border rounded-lg hover:bg-accent transition text-center">
            <FileText className="h-6 w-6 mx-auto mb-2 text-primary" />
            <div className="text-sm font-medium">جميع عروض الأسعار</div>
          </Link>
          <Link to="/admin/orders" className="p-4 border rounded-lg hover:bg-accent transition text-center">
            <ClipboardList className="h-6 w-6 mx-auto mb-2 text-primary" />
            <div className="text-sm font-medium">تتبع الإنتاج</div>
          </Link>
          <Link to="/admin/customers" className="p-4 border rounded-lg hover:bg-accent transition text-center">
            <Users className="h-6 w-6 mx-auto mb-2 text-primary" />
            <div className="text-sm font-medium">العملاء</div>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}