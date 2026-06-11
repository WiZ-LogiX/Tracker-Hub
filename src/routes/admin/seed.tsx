import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ensurePricingSetup, seedSampleData } from "@/lib/seed.functions";
import { toast } from "sonner";
import { Database, RefreshCcw, Sparkles } from "lucide-react";

export const Route = createFileRoute("/admin/seed")({ component: SeedPage });

function SeedPage() {
  const { t } = useTranslation();
  const [results, setResults] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<"pricing" | "samples" | null>(null);

  const pricingFn = useServerFn(ensurePricingSetup);
  const seedFn = useServerFn(seedSampleData);

  async function restorePricing() {
    setRunning(true); setMode("pricing"); setResults([]);
    try { const r = await pricingFn(); setResults(r.results); toast.success(t("seedData.restorePricing")); }
    catch (e: any) { toast.error(e?.message ?? "Error"); setResults([`Error: ${e?.message ?? "unknown"}`]); }
    finally { setRunning(false); }
  }

  async function runSeed() {
    setRunning(true); setMode("samples"); setResults([]);
    try { const r = await seedFn(); setResults(r.results); toast.success(t("seedData.seedSamples")); }
    catch (e: any) { toast.error(e?.message ?? "Error"); setResults([`Error: ${e?.message ?? "unknown"}`]); }
    finally { setRunning(false); }
  }

  const doneCount = results.filter(r => r.startsWith("✓")).length;
  const skipCount = results.filter(r => r.startsWith("-")).length;

  return (
    <div className="space-y-6">
      <div><h1 className="font-serif text-3xl font-bold flex items-center gap-2"><Database className="h-7 w-7" /> {t("seedData.title")}</h1><p className="text-sm text-muted-foreground mt-1">{t("seedData.subtitle")}</p></div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><RefreshCcw className="h-5 w-5 text-primary" /> {t("seedData.restorePricing")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("seedData.restorePricingDesc")}</p>
            <Button onClick={restorePricing} disabled={running} className="gap-2"><RefreshCcw className="h-4 w-4" />{running && mode === "pricing" ? "..." : t("seedData.restorePricing")}</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> {t("seedData.seedSamples")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("seedData.seedSamplesDesc")}</p>
            <Button onClick={runSeed} disabled={running} variant="secondary" className="gap-2"><Sparkles className="h-4 w-4" />{running && mode === "samples" ? "..." : t("seedData.seedSamples")}</Button>
          </CardContent>
        </Card>
      </div>
      {results.length > 0 && (
        <Card><CardHeader><CardTitle className="text-lg">{t("seedData.results")}</CardTitle></CardHeader><CardContent>
          <div className="flex gap-4 mb-4 text-sm">
            <div><span className="text-green-600 font-bold">{doneCount}</span> {t("seedData.created")}</div>
            <div><span className="text-muted-foreground font-bold">{skipCount}</span> {t("seedData.existing")}</div>
            <div><span className="text-destructive font-bold">{results.length - doneCount - skipCount}</span> {t("seedData.errors")}</div>
          </div>
          <ul className="space-y-1 text-sm max-h-80 overflow-y-auto">
            {results.map((r, i) => (
              <li key={i} className={`${r.startsWith("✓") ? "text-green-600" : r.startsWith("-") ? "text-muted-foreground" : "text-destructive"}`}>{r}</li>
            ))}
          </ul>
        </CardContent></Card>
      )}
    </div>
  );
}