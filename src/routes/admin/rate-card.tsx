import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, CheckCircle, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { importRateCard } from "@/lib/importRateCard.functions";
import type { ImportDiff } from "@/lib/importRateCard.functions";

export const Route = createFileRoute("/admin/rate-card")({
  component: RateCardPage,
});

function RateCardPage() {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [diff, setDiff] = useState<ImportDiff | null>(null);
  const [committed, setCommitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const importFn = useServerFn(importRateCard);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setDiff(null);
      setCommitted(false);
    }
  }

  async function handleDryRun() {
    if (!file) return;
    setLoading(true);
    try {
      const b64 = await fileToBase64(file);
      const result = await importFn({
        data: { fileBufferBase64: b64, dryRun: true },
      });
      if (result?.diff) {
        setDiff(result.diff);
        setCommitted(false);
        toast.success("Dry run complete — review the diff below");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to parse rate card");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!file) return;
    setLoading(true);
    try {
      const b64 = await fileToBase64(file);
      const result = await importFn({
        data: { fileBufferBase64: b64, dryRun: false },
      });
      if (result?.result) {
        setDiff(result.diff);
        setCommitted(true);
        toast.success(`Import complete: ${result.result.pricesWritten} prices, ${result.result.addonsWritten} addons, ${result.result.coefficientsWritten} coefficients`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to import rate card");
    } finally {
      setLoading(false);
    }
  }

  const summary = diff?.summary;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        {t("rateCard.title", "استيراد بطاقة الأسعار")}
      </h1>

      {/* Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            {t("rateCard.upload", "رفع ملف Excel")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={loading}
            >
              <Upload className="mr-2 h-4 w-4" />
              {file ? file.name : t("rateCard.chooseFile", "اختر ملف")}
            </Button>
            {file && (
              <Badge variant="secondary">
                {(file.size / 1024).toFixed(1)} KB
              </Badge>
            )}
          </div>

          {file && !diff && (
            <Button onClick={handleDryRun} disabled={loading}>
              {loading ? "..." : t("rateCard.dryRun", "معاينة (Dry Run)")}
            </Button>
          )}

          {diff && (
            <div className="flex gap-3">
              <Button
                onClick={handleConfirm}
                disabled={loading || committed}
                variant={committed ? "secondary" : "default"}
              >
                {committed
                  ? t("rateCard.committed", "تم الاستيراد ✓")
                  : t("rateCard.confirm", "تأكيد الاستيراد")}
              </Button>
              {!committed && (
                <Button variant="outline" onClick={handleDryRun} disabled={loading}>
                  {t("rateCard.reDryRun", "إعادة المعاينة")}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      {summary && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {summary.pricesCreated}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t("rateCard.newPrices", "أسعار جديدة")}
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {summary.pricesUpdated}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t("rateCard.updatedPrices", "أسعار محدثة")}
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-muted-foreground">
                  {summary.pricesSkipped}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t("rateCard.unchanged", "بدون تغيير")}
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">
                  {summary.totalConflicts}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t("rateCard.conflicts", "تعارضات")}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Diff tabs */}
      {diff && (
        <Tabs defaultValue="prices">
          <TabsList>
            <TabsTrigger value="prices">
              {t("rateCard.tabPrices", "الأسعار")} ({diff.prices.length})
            </TabsTrigger>
            <TabsTrigger value="addons">
              {t("rateCard.tabAddons", "الإضافات")} ({diff.addons.length})
            </TabsTrigger>
            <TabsTrigger value="coefficients">
              {t("rateCard.tabCoefficients", "المعاملات")} ({diff.coefficients.length})
            </TabsTrigger>
            {diff.conflicts.length > 0 && (
              <TabsTrigger value="conflicts">
                <AlertTriangle className="mr-1 h-4 w-4" />
                {t("rateCard.tabConflicts", "تعارضات")} ({diff.conflicts.length})
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="prices">
            <Card>
              <CardContent className="pt-4">
                <div className="max-h-[600px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("rateCard.colAction", "الإجراء")}</TableHead>
                        <TableHead>{t("rateCard.colUnitType", "نوع الوحدة")}</TableHead>
                        <TableHead>{t("rateCard.colFinish", "الخامة")}</TableHead>
                        <TableHead>{t("rateCard.colWidth", "العرض")}</TableHead>
                        <TableHead>{t("rateCard.colCurrent", "السعر الحالي")}</TableHead>
                        <TableHead>{t("rateCard.colNew", "السعر الجديد")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {diff.prices.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <ActionBadge action={p.action} />
                          </TableCell>
                          <TableCell>{p.unitType}</TableCell>
                          <TableCell>{p.finishCode}</TableCell>
                          <TableCell>
                            {p.isFixed
                              ? t("rateCard.fixed", "ثابت")
                              : `${p.widthCm}cm (${p.widthTier})`}
                          </TableCell>
                          <TableCell>
                            {p.currentPrice !== null
                              ? `${p.currentPrice.toLocaleString()} جنية`
                              : "—"}
                          </TableCell>
                          <TableCell className="font-medium">
                            {p.newPrice.toLocaleString()} جنية
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="addons">
            <Card>
              <CardContent className="pt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("rateCard.colAction", "الإجراء")}</TableHead>
                      <TableHead>{t("rateCard.colLabel", "الوصف")}</TableHead>
                      <TableHead>{t("rateCard.colCategory", "الفئة")}</TableHead>
                      <TableHead>{t("rateCard.colCurrent", "السعر الحالي")}</TableHead>
                      <TableHead>{t("rateCard.colNew", "السعر الجديد")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diff.addons.map((a, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <ActionBadge action={a.action} />
                        </TableCell>
                        <TableCell>{a.label}</TableCell>
                        <TableCell>{a.category}</TableCell>
                        <TableCell>
                          {a.currentPrice !== null
                            ? `${a.currentPrice.toLocaleString()} جنية`
                            : "—"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {a.newPrice.toLocaleString()} جنية
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="coefficients">
            <Card>
              <CardContent className="pt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("rateCard.colAction", "الإجراء")}</TableHead>
                      <TableHead>{t("rateCard.colFinish", "الخامة")}</TableHead>
                      <TableHead>{t("rateCard.colCurrent", "المعامل الحالي")}</TableHead>
                      <TableHead>{t("rateCard.colNew", "المعامل الجديد")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diff.coefficients.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <ActionBadge action={c.action} />
                        </TableCell>
                        <TableCell>{c.finishCode}</TableCell>
                        <TableCell>
                          {c.currentCoefficient !== null
                            ? c.currentCoefficient.toFixed(3)
                            : "—"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {c.newCoefficient.toFixed(3)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {diff.conflicts.length > 0 && (
            <TabsContent value="conflicts">
              <Card>
                <CardContent className="pt-4">
                  <ul className="space-y-2">
                    {diff.conflicts.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  if (action === "create")
    return <Badge className="bg-green-100 text-green-800">جديد</Badge>;
  if (action === "update")
    return <Badge className="bg-blue-100 text-blue-800">تحديث</Badge>;
  return <Badge variant="secondary">بدون تغيير</Badge>;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result as ArrayBuffer;
      const b64 = btoa(
        new Uint8Array(buf).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          "",
        ),
      );
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
