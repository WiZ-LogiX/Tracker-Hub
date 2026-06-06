import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatEGP } from "@/lib/pricing";
import { BarChart3 } from "lucide-react";

export const Route = createFileRoute("/admin/cost-analysis")({ component: CostAnalysisPage });

const LABELS: Record<string, string> = {
  base_cost: "السعر الأساسي",
  material_cost: "الخامات",
  finish_cost: "التشطيب",
  veneer_cost: "القشرة",
  accessories_cost: "الإكسسوارات",
  labor: "العمالة",
  wastage: "الهدر",
  overhead: "المصاريف الإدارية",
  margin: "هامش الربح",
  luxury: "الفخامة",
  complexity: "التعقيد",
  rush: "الاستعجال",
};

const RANGES = [
  { v: "30", l: "آخر 30 يومًا" },
  { v: "90", l: "آخر 90 يومًا" },
  { v: "365", l: "آخر سنة" },
  { v: "0", l: "كل البيانات" },
];

interface AggRow { label: string; total: number; count: number }

function CostAnalysisPage() {
  const [days, setDays] = useState("90");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const since = days === "0"
      ? null
      : new Date(Date.now() - Number(days) * 86400_000).toISOString();
    let q = supabase.from("quote_items").select("breakdown, line_total, unit_price, qty, material_name, accessories, created_at").order("created_at", { ascending: false }).limit(1000);
    if (since) q = q.gte("created_at", since);
    q.then(({ data }) => {
      setItems(data ?? []);
      setLoading(false);
    });
  }, [days]);

  const agg = useMemo(() => {
    const byLabel = new Map<string, AggRow>();
    let totalRevenue = 0;
    let totalCount = 0;
    const matCount = new Map<string, { name: string; qty: number; revenue: number }>();
    const accCount = new Map<string, { name: string; uses: number; revenue: number }>();

    for (const it of items) {
      const bd = (it.breakdown ?? {}) as any;
      const lines: { label: string; amount: number }[] = Array.isArray(bd.lines) ? bd.lines : [];
      const qty = Number(it.qty || 1);
      const lineTotal = Number(it.line_total || 0);
      totalRevenue += lineTotal;
      totalCount += 1;

      for (const ln of lines) {
        const cur = byLabel.get(ln.label) ?? { label: ln.label, total: 0, count: 0 };
        cur.total += Number(ln.amount || 0) * qty;
        cur.count += 1;
        byLabel.set(ln.label, cur);
      }

      if (it.material_name) {
        const cur = matCount.get(it.material_name) ?? { name: it.material_name, qty: 0, revenue: 0 };
        cur.qty += qty;
        cur.revenue += lineTotal;
        matCount.set(it.material_name, cur);
      }
      const accs = Array.isArray(it.accessories) ? it.accessories : [];
      for (const a of accs) {
        const name = a?.name ?? "—";
        const cur = accCount.get(name) ?? { name, uses: 0, revenue: 0 };
        cur.uses += 1;
        cur.revenue += Number(a?.price || 0) * qty;
        accCount.set(name, cur);
      }
    }

    const rows = Array.from(byLabel.values()).sort((a, b) => b.total - a.total);
    const topMaterials = Array.from(matCount.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
    const topAccessories = Array.from(accCount.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
    const grandTotal = rows.reduce((s, r) => s + r.total, 0);
    const marginRow = rows.find(r => r.label === "margin");
    const avgMarginShare = grandTotal > 0 && marginRow ? (marginRow.total / grandTotal) * 100 : 0;

    return { rows, grandTotal, totalRevenue, totalCount, avgMarginShare, topMaterials, topAccessories };
  }, [items]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="h-7 w-7" /> تحليل التكلفة
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ما الذي يحرّك أسعار عروضك فعلاً — الخامات، العمالة، الهدر، الهامش؟
          </p>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RANGES.map(r => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-5">
          <div className="text-xs text-muted-foreground">إجمالي قيمة بنود عروض الأسعار</div>
          <div className="text-2xl font-bold font-serif mt-1">{formatEGP(agg.totalRevenue)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="text-xs text-muted-foreground">عدد البنود المُحلَّلة</div>
          <div className="text-2xl font-bold font-serif mt-1">{agg.totalCount}</div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="text-xs text-muted-foreground">متوسط مساهمة هامش الربح</div>
          <div className="text-2xl font-bold font-serif mt-1">{agg.avgMarginShare.toFixed(1)}%</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg font-serif">مكونات التكلفة</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
          {!loading && agg.rows.length === 0 && (
            <p className="text-sm text-muted-foreground">لا توجد بنود بعد في الفترة المختارة.</p>
          )}
          {agg.rows.map(r => {
            const pct = agg.grandTotal > 0 ? (r.total / agg.grandTotal) * 100 : 0;
            return (
              <div key={r.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{LABELS[r.label] ?? r.label}</span>
                  <span className="text-muted-foreground">{formatEGP(r.total)} • {pct.toFixed(1)}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-lg font-serif">أكثر الخامات تأثيرًا</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {agg.topMaterials.length === 0 && <p className="text-sm text-muted-foreground">لا بيانات.</p>}
            {agg.topMaterials.map(m => (
              <div key={m.name} className="flex justify-between text-sm p-2 rounded hover:bg-muted">
                <span>{m.name}</span>
                <span className="text-muted-foreground">{m.qty.toFixed(1)} × {formatEGP(m.revenue)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg font-serif">أكثر الإكسسوارات استخدامًا</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {agg.topAccessories.length === 0 && <p className="text-sm text-muted-foreground">لا بيانات.</p>}
            {agg.topAccessories.map(a => (
              <div key={a.name} className="flex justify-between text-sm p-2 rounded hover:bg-muted">
                <span>{a.name}</span>
                <span className="text-muted-foreground">{a.uses} مرة • {formatEGP(a.revenue)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
