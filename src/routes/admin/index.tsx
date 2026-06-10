import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatEGP } from "@/lib/pricing";
import { FileText, Receipt, ClipboardList, Users, TrendingUp, Package } from "lucide-react";

export const Route = createFileRoute("/admin/")({ component: AdminDashboard });

function AdminDashboard() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [stats, setStats] = useState({
    customers: 0,
    quotes: 0,
    orders: 0,
    revenue: 0,
  });
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">{t("admin.panel")}</h1>
        <p className="text-sm text-muted-foreground mt-1">مرحباً {user?.email}</p>
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