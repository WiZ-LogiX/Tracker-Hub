import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, FileText, ClipboardList, TrendingUp, RefreshCcw, Database } from "lucide-react";
import { toast } from "sonner";
import { formatEGP } from "@/lib/pricing";

export const Route = createFileRoute("/admin/")({ component: DashboardPage });

function DashboardPage() {
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState({ customers: 0, quotes: 0, orders: 0, revenue: 0 });
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  async function loadStats() {
    setLoading(true);
    const [c, q, o] = await Promise.all([
      supabase.from("customers").select("id", { count: "exact", head: true }),
      supabase.from("quotes").select("total", { count: "exact", head: true }),
      supabase.from("orders").select("id,total", { count: "exact", head: true }),
    ]);
    const revenue = (o.data ?? []).reduce((sum, row: any) => sum + Number(row.total || 0), 0);
    setStats({
      customers: c.count ?? 0,
      quotes: q.count ?? 0,
      orders: o.count ?? 0,
      revenue,
    });
    setLoading(false);
  }

  useEffect(() => { loadStats(); }, []);

  async function deleteTransientData() {
    if (!confirm(t("dashboard.deleteConfirm"))) return;
    setDeleting(true);
    try {
      const tables = [
        "production_photos",
        "production_logs",
        "production_assignments",
        "qc_inspections",
        "remakes",
        "orders",
        "invoices",
        "quote_items",
        "configurations",
        "quotes",
      ];
      let deleted = 0;
      for (const table of tables) {
        const { error, count } = await supabase
          .from(table as any)
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
        if (!error) deleted += count ?? 0;
      }
      const newCount = deleted;
      toast.success(t("dashboard.deleted", { count: newCount }));
      setStats({ ...stats, quotes: 0, orders: 0, revenue: 0 });
    } catch (err: any) {
      toast.error(err?.message ?? "فشل الحذف");
    } finally {
      setDeleting(false);
    }
  }

  const cards = [
    { icon: Users, label: t("dashboard.customers"), value: stats.customers, color: "bg-gold/10 text-gold" },
    { icon: FileText, label: t("dashboard.quotes"), value: stats.quotes, color: "bg-secondary/10 text-secondary" },
    { icon: ClipboardList, label: t("dashboard.orders"), value: stats.orders, color: "bg-primary/10 text-primary" },
    { icon: TrendingUp, label: t("dashboard.revenue"), value: formatEGP(stats.revenue), color: "bg-emerald-500/10 text-emerald-700" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">{t("dashboard.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">نظرة عامة على النظام</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">{c.label}</div>
                  <div className="text-2xl font-bold font-serif mt-1">
                    {loading ? "—" : c.value}
                  </div>
                </div>
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${c.color}`}>
                  <c.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            {t("dashboard.systemSettings")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              onClick={deleteTransientData}
              disabled={deleting}
              className="gap-2"
            >
              <RefreshCcw className={`h-4 w-4 ${deleting ? "animate-spin" : ""}`} />
              {deleting ? t("dashboard.deleting") : t("dashboard.deleteTransient")}
            </Button>
            <Link to="/admin/seed">
              <Button variant="secondary" className="gap-2 w-full">
                <Database className="h-4 w-4" />
                {t("dashboard.dbSetup")}
              </Button>
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("dashboard.deleteConfirm").split("\n")[0]}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}