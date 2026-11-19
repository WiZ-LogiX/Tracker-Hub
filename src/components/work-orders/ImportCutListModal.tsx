import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Scissors,
  ArrowRight,
  ArrowLeft,
  Loader2,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  parseCutListCsv,
  computeCutListSummary,
} from "@/lib/cut-list-import.pure";
import type {
  CanonicalColumnKey,
  CutListColumnMap,
  ParsedCutListResult,
} from "@/lib/cut-list-import.types";
import { importWorkOrderCutList } from "@/lib/work-orders.functions";

interface ImportCutListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrderId: string;
  workOrderNumber: string;
  orderNumber: string;
  onSuccess?: () => void;
}

export function ImportCutListModal({
  open,
  onOpenChange,
  workOrderId,
  workOrderNumber,
  orderNumber,
  onSuccess,
}: ImportCutListModalProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const importFn = useServerFn(importWorkOrderCutList);

  const [step, setStep] = useState<1 | 2>(1);
  const [rawText, setRawText] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [sourceUnit, setSourceUnit] = useState<"mm" | "cm">("mm");
  const [importMode, setImportMode] = useState<"replace" | "append">("replace");
  const [columnOverrides, setColumnOverrides] = useState<Partial<CutListColumnMap>>({});
  const [submitting, setSubmitting] = useState(false);

  // Parse CSV reactively
  const parsedResult: ParsedCutListResult | null = useMemo(() => {
    if (!rawText.trim()) return null;
    return parseCutListCsv(rawText, {
      sourceUnit,
      columnMap: columnOverrides,
    });
  }, [rawText, sourceUnit, columnOverrides]);

  // Workshop Sheet Summary
  const summary = useMemo(() => {
    if (!parsedResult || parsedResult.validItems.length === 0) return null;
    return computeCutListSummary(parsedResult.validItems, {
      sheetLengthMm: 2440,
      sheetWidthMm: 1220,
      wastePct: 15,
    });
  }, [parsedResult]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setRawText(content || "");
      setColumnOverrides({});
      setStep(2);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setRawText(content || "");
      setColumnOverrides({});
      setStep(2);
    };
    reader.readAsText(file);
  };

  const handleDownloadSampleTemplate = () => {
    const sampleHeaders = [
      "Part Name",
      "Unit",
      "Material SKU",
      "Material Name",
      "Length (mm)",
      "Width (mm)",
      "Thickness (mm)",
      "Qty",
      "Edge Top",
      "Edge Bottom",
      "Edge Left",
      "Edge Right",
      "Grain",
      "Notes",
    ];

    const sampleRows = [
      [
        "Side Panel Left",
        "Kitchen Base 90",
        "MAT-MDF-18",
        "MDF 18mm White Melamine",
        "720",
        "560",
        "18",
        "2",
        "1mm PVC",
        "none",
        "none",
        "1mm PVC",
        "along_length",
        "Front & Top edge banded",
      ],
      [
        "Bottom Shelf",
        "Kitchen Base 90",
        "MAT-MDF-18",
        "MDF 18mm White Melamine",
        "864",
        "560",
        "18",
        "2",
        "none",
        "none",
        "none",
        "1mm PVC",
        "along_length",
        "Front edge banded",
      ],
      [
        "Back Panel",
        "Kitchen Base 90",
        "MAT-MDF-06",
        "MDF 6mm White Backing",
        "880",
        "700",
        "6",
        "2",
        "none",
        "none",
        "none",
        "none",
        "can_rotate",
        "Slot mounting",
      ],
    ];

    const csvStr =
      "\uFEFF" +
      [sampleHeaders.join(","), ...sampleRows.map((r) => r.map((c) => `"${c}"`).join(","))].join(
        "\n",
      );

    const blob = new Blob([csvStr], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Sample_CutList_Template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCommitImport = async () => {
    if (!parsedResult || parsedResult.validItems.length === 0) {
      toast.error(isRtl ? "لا توجد قطع صالحة للاستيراد" : "No valid cut-list rows to import");
      return;
    }
    if (parsedResult.errors.length > 0) {
      toast.error(
        isRtl
          ? "يرجى تصحيح أخطاء الأبعاد والبيانات قبل إتمام الاستيراد"
          : "Please fix row validation errors before proceeding",
      );
      return;
    }

    setSubmitting(true);
    try {
      await importFn({
        data: {
          workOrderId,
          mode: importMode,
          items: parsedResult.validItems.map((item) => ({
            rowIndex: item.rowIndex,
            partName: item.partName,
            unitName: item.unitName,
            productName: item.productName,
            sectionName: item.sectionName,
            materialSku: item.materialSku,
            materialName: item.materialName,
            lengthMm: item.lengthMm,
            widthMm: item.widthMm,
            thicknessMm: item.thicknessMm,
            quantity: item.quantity,
            unitOfMeasure: item.unitOfMeasure,
            edgeTop: item.edgeTop,
            edgeBottom: item.edgeBottom,
            edgeLeft: item.edgeLeft,
            edgeRight: item.edgeRight,
            grainDirection: item.grainDirection,
            notes: item.notes,
          })),
        },
      });

      toast.success(
        isRtl
          ? `تم استيراد ${parsedResult.validItems.length} قطعة بنجاح إلى أمر التشغيل`
          : `Successfully imported ${parsedResult.validItems.length} cut-list parts`,
      );

      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || (isRtl ? "فشل استيراد كشف التقطيع" : "Failed to import cut list"));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setRawText("");
    setFileName("");
    setColumnOverrides({});
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold">
                {isRtl ? "استيراد كشف تقطيع الورشة (CSV)" : "Import Workshop Cut List (CSV)"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {workOrderNumber} • {orderNumber}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-5 py-3">
            {/* Options Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/40 p-4 rounded-xl border">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  {isRtl ? "وحدة قياس الأبعاد بالملف" : "Source Dimensions Unit"}
                </Label>
                <Select
                  value={sourceUnit}
                  onValueChange={(val: "mm" | "cm") => setSourceUnit(val)}
                >
                  <SelectTrigger className="h-8 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mm">
                      {isRtl ? "مليمتر (mm) — قياسي للورش" : "Millimeters (mm) — Standard"}
                    </SelectItem>
                    <SelectItem value="cm">
                      {isRtl ? "سنتيمتر (cm) — تحويل تلقائي ×10" : "Centimeters (cm) — Auto ×10"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  {isRtl ? "وضع الاستيراد" : "Import Mode"}
                </Label>
                <Select
                  value={importMode}
                  onValueChange={(val: "replace" | "append") => setImportMode(val)}
                >
                  <SelectTrigger className="h-8 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="replace">
                      {isRtl ? "استبدال (حذف الكشف السابق بالكامل)" : "Replace (Overwrite existing cut-list)"}
                    </SelectItem>
                    <SelectItem value="append">
                      {isRtl ? "إضافة (إلحاق القطع الجديدة)" : "Append (Add to existing parts)"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Dropzone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-3 hover:border-primary/60 transition-colors bg-muted/20 cursor-pointer relative"
            >
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <div className="p-3 rounded-full bg-primary/10 text-primary">
                <Upload className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {isRtl ? "اضغط لاختيار ملف CSV أو اسحبه هنا" : "Click to browse or drag & drop CSV file"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isRtl
                    ? "يدعم صيغ PolyBoard, OpenCutList, Khazana, وبرامج القص العالمية"
                    : "Compatible with PolyBoard, OpenCutList, Khazana, and custom Excel exports"}
                </p>
              </div>
            </div>

            {/* Download Sample Template */}
            <div className="flex items-center justify-between p-3.5 rounded-xl border bg-muted/10">
              <div className="flex items-center gap-2.5">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div className="text-xs">
                  <div className="font-semibold text-foreground">
                    {isRtl ? "نموذج كشف تقطيع جاهز للتعبئة" : "Download Sample Cut-List Template"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {isRtl ? "ملف CSV نموذجي يحتوي على شريط الحواف والأبعاد" : "CSV template with edge banding and grain specs"}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadSampleTemplate}
                className="h-8 text-xs font-semibold gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{isRtl ? "تحميل النموذج" : "Download CSV"}</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* File info bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-muted/40 border text-xs">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-[11px]">
                  {fileName}
                </Badge>
                <span className="text-muted-foreground">
                  {parsedResult?.totalRowsParsed} {isRtl ? "صفوف مقروءة" : "rows parsed"}
                </span>
                <Badge
                  variant={
                    parsedResult?.detectedFormat === "polyboard"
                      ? "default"
                      : parsedResult?.detectedFormat === "opencutlist"
                        ? "secondary"
                        : "outline"
                  }
                  className="text-[10px] capitalize"
                >
                  {parsedResult?.detectedFormat} format
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep(1)}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                {isRtl ? "تغيير الملف" : "Change File"}
              </Button>
            </div>

            {/* Column Mapping Section */}
            <div className="p-3.5 rounded-xl border bg-card space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-foreground">
                  {isRtl ? "مطابقة أعمدة الملف (تلقائية مع إمكانية التعديل)" : "Header Column Mapping (Auto-Detected)"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {isRtl ? "تحقق من تطابق الأعمدة الحرجة" : "Verify critical dimensions and names"}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                {(
                  [
                    ["partName", isRtl ? "اسم القطعة *" : "Part Name *"],
                    ["materialName", isRtl ? "الخامة *" : "Material Name *"],
                    ["lengthMm", isRtl ? "الطول (مم) *" : "Length (mm) *"],
                    ["widthMm", isRtl ? "العرض (مم) *" : "Width (mm) *"],
                    ["thicknessMm", isRtl ? "السمك (مم)" : "Thickness (mm)"],
                    ["quantity", isRtl ? "العدد / الكمية *" : "Quantity *"],
                    ["edgeTop", isRtl ? "شريط علوي (T/L1)" : "Edge Top (T/L1)"],
                    ["edgeBottom", isRtl ? "شريط سفلي (B/L2)" : "Edge Bottom (B/L2)"],
                  ] as [CanonicalColumnKey, string][]
                ).map(([key, label]) => {
                  const currentValue =
                    columnOverrides[key] !== undefined
                      ? columnOverrides[key]
                      : parsedResult?.columnMap[key] || "";

                  return (
                    <div key={key} className="space-y-1">
                      <Label className="text-[11px] font-medium text-muted-foreground">
                        {label}
                      </Label>
                      <Select
                        value={currentValue || "__none__"}
                        onValueChange={(val) => {
                          setColumnOverrides((prev) => ({
                            ...prev,
                            [key]: val === "__none__" ? null : val,
                          }));
                        }}
                      >
                        <SelectTrigger className="h-7 text-[11px] bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">
                            <span className="text-muted-foreground">{isRtl ? "غير محدد" : "Not mapped"}</span>
                          </SelectItem>
                          {(parsedResult?.headers || []).map((h) => (
                            <SelectItem key={h} value={h} className="text-xs">
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live Workshop Material & Sheet Estimate Summary */}
            {summary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl border bg-primary/5 text-xs">
                <div>
                  <div className="text-[11px] text-muted-foreground">
                    {isRtl ? "إجمالي القطع" : "Total Parts"}
                  </div>
                  <div className="text-base font-bold font-mono text-foreground">
                    {summary.totalParts} {isRtl ? "قطعة" : "pcs"}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-muted-foreground">
                    {isRtl ? "المساحة الصافية" : "Net Area"}
                  </div>
                  <div className="text-base font-bold font-mono text-primary">
                    {summary.netAreaM2} m²
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-muted-foreground">
                    {isRtl ? "الألواح التقديرية (15% هدر)" : "Est. Sheets (+15% waste)"}
                  </div>
                  <div className="text-base font-bold font-mono text-foreground flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-primary" />
                    <span>~{summary.estimatedSheetsTotal} {isRtl ? "لوح" : "sheets"}</span>
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-muted-foreground">
                    {isRtl ? "شريط الحواف (قشاط)" : "Total Edge Banding"}
                  </div>
                  <div className="text-base font-bold font-mono text-foreground flex items-center gap-1.5">
                    <Scissors className="h-4 w-4 text-amber-500" />
                    <span>{summary.edgeBandingLinearMeters} m</span>
                  </div>
                </div>
              </div>
            )}

            {/* Validation Alerts */}
            {parsedResult && parsedResult.errors.length > 0 && (
              <div className="p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs space-y-1">
                <div className="flex items-center gap-2 font-bold">
                  <AlertCircle className="h-4 w-4" />
                  <span>
                    {isRtl
                      ? `يوجد ${parsedResult.errors.length} أخطاء تمنع الاستيراد:`
                      : `Found ${parsedResult.errors.length} fatal validation errors:`}
                  </span>
                </div>
                <ul className="list-disc list-inside text-[11px] space-y-0.5 max-h-24 overflow-y-auto">
                  {parsedResult.errors.slice(0, 5).map((e, idx) => (
                    <li key={idx}>{e.message}</li>
                  ))}
                  {parsedResult.errors.length > 5 && (
                    <li>... {parsedResult.errors.length - 5} {isRtl ? "أخطاء إضافية" : "more errors"}</li>
                  )}
                </ul>
              </div>
            )}

            {/* Live Preview Table */}
            <div className="border rounded-xl overflow-hidden">
              <div className="p-2.5 bg-muted/40 text-xs font-semibold flex items-center justify-between border-b">
                <span>
                  {isRtl ? "معاينة القطع للتقطيع" : "Cut-List Parts Preview"}{" "}
                  <span className="text-muted-foreground font-normal">
                    ({parsedResult?.validItems.length} {isRtl ? "صالحة" : "valid"})
                  </span>
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {isRtl ? "عرض أول 6 قطع" : "Showing first 6 parts"}
                </span>
              </div>
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow className="text-[11px]">
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>{isRtl ? "القطعة" : "Part"}</TableHead>
                    <TableHead>{isRtl ? "الخامة" : "Material"}</TableHead>
                    <TableHead>{isRtl ? "الأبعاد (ط × ع × س) مم" : "Dimensions (L×W×T) mm"}</TableHead>
                    <TableHead>{isRtl ? "العدد" : "Qty"}</TableHead>
                    <TableHead>{isRtl ? "شريط الحواف" : "Edges (T/B/L/R)"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {parsedResult?.validItems.slice(0, 6).map((item, idx) => {
                    const edgeCount = [item.edgeTop, item.edgeBottom, item.edgeLeft, item.edgeRight].filter(Boolean).length;
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-[10px] text-muted-foreground">
                          {idx + 1}
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-foreground">{item.partName}</div>
                          <div className="text-[10px] text-muted-foreground">{item.unitName}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-foreground">{item.materialName}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">{item.materialSku}</div>
                        </TableCell>
                        <TableCell className="font-mono text-[11px]">
                          {item.lengthMm} × {item.widthMm} × {item.thicknessMm}
                        </TableCell>
                        <TableCell className="font-mono font-bold text-foreground">
                          {item.quantity} {item.unitOfMeasure}
                        </TableCell>
                        <TableCell>
                          {edgeCount > 0 ? (
                            <div className="flex gap-1">
                              {item.edgeTop && <Badge variant="outline" className="text-[9px] px-1 py-0 bg-primary/10">T</Badge>}
                              {item.edgeBottom && <Badge variant="outline" className="text-[9px] px-1 py-0 bg-primary/10">B</Badge>}
                              {item.edgeLeft && <Badge variant="outline" className="text-[9px] px-1 py-0 bg-primary/10">L</Badge>}
                              {item.edgeRight && <Badge variant="outline" className="text-[9px] px-1 py-0 bg-primary/10">R</Badge>}
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          {step === 2 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep(1)}
              disabled={submitting}
              className="text-xs font-semibold gap-1.5"
            >
              {isRtl ? <ArrowRight className="h-3.5 w-3.5" /> : <ArrowLeft className="h-3.5 w-3.5" />}
              <span>{isRtl ? "السابق" : "Back"}</span>
            </Button>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="text-xs text-muted-foreground"
            >
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>

            {step === 2 && (
              <Button
                size="sm"
                onClick={handleCommitImport}
                disabled={
                  submitting ||
                  !parsedResult ||
                  parsedResult.validItems.length === 0 ||
                  parsedResult.errors.length > 0
                }
                className="text-xs font-bold gap-1.5"
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                <span>
                  {importMode === "replace"
                    ? isRtl
                      ? "تأكيد واستبدال كشف التقطيع"
                      : "Confirm & Overwrite Cut List"
                    : isRtl
                      ? "تأكيد وإضافة القطع"
                      : "Confirm & Append Parts"}
                </span>
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
