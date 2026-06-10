import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ensurePricingSetup, seedSampleData } from "@/lib/seed.functions";
import { toast } from "sonner";
import { Database, RefreshCcw, Sparkles } from "lucide-react";

export const Route = createFileRoute("/admin/seed")({ component: SeedPage });

function SeedPage() {
  const [results, setResults] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<"pricing" | "samples" | null>(null);

  const pricingFn = useServerFn(ensurePricingSetup);
  const seedFn = useServerFn(seedSampleData);

  async function restorePricing() {
    setRunning(true);
    setMode("pricing");
    setResults([]);
    try {
      const r = await pricingFn();
      setResults(r.results);
      toast.success("تم استعادة عوامل وقواعد التسعير");
    } catch (e: any) {
      toast.error(e?.message ?? "فشل");
      setResults([`خطأ: ${e?.message ?? "unknown"}`]);
    } finally {
      setRunning(false);
    }
  }

  async function runSeed() {
    setRunning(true);
    setMode("samples");
    setResults([]);
    try {
      const r = await seedFn();
      setResults(r.results);
      toast.success("تم إنشاء البيانات النموذجية");
    } catch (e: any) {
      toast.error(e?.message ?? "فشل");
      setResults([`خطأ: ${e?.message ?? "unknown"}`]);
    } finally {
      setRunning(false);
    }
  }

  const doneCount = results.filter(r => r.startsWith("✓")).length;
  const skipCount = results.filter(r => r.startsWith("-")).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold flex items-center gap-2"><Database className="h-7 w-7" /> إعداد قاعدة البيانات</h1>
        <p className="text-sm text-muted-foreground mt-1">استعادة عوامل وقواعد التسعير الافتراضية وإنشاء بيانات نموذجية للكتالوج</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <RefreshCcw className="h-5 w-5 text-primary" /> استعادة عوامل وقواعد التسعير
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              استعادة عوامل التسعير الافتراضية (العمالة 15%، الهدر 8%، المصاريف الإدارية 10%، هامش الربح 25%) 
              وقاعدة التسعير النشطة بصيغتها الافتراضية.
            </p>
            <Button onClick={restorePricing} disabled={running} className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              {running && mode === "pricing" ? "..." : "استعادة عوامل وقواعد التسعير"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> بيانات نموذجية
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              إنشاء عينات للكتالوج: قوالب منتجات، خامات، موردين، تشطيبات، قشرة، إكسسوارات، عمال، وخصومات.
              لا يتم إنشاء أي بيانات مكررة.
            </p>
            <Button onClick={runSeed} disabled={running} variant="secondary" className="gap-2">
              <Sparkles className="h-4 w-4" />
              {running && mode === "samples" ? "..." : "إنشاء بيانات نموذجية"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">نتائج التنفيذ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 mb-4 text-sm">
              <div><span className="text-green-600 font-bold">{doneCount}</span> تم إنشاؤه</div>
              <div><span className="text-muted-foreground font-bold">{skipCount}</span> موجود مسبقاً</div>
              <div><span className="text-destructive font-bold">{results.length - doneCount - skipCount}</span> أخطاء</div>
            </div>
            <ul className="space-y-1 text-sm max-h-80 overflow-y-auto">
              {results.map((r, i) => (
                <li key={i} className={`${r.startsWith("✓") ? "text-green-600" : r.startsWith("-") ? "text-muted-foreground" : "text-destructive"}`}>
                  {r}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}