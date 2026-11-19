/**
 * Sprint 7A — Workshop-Grade Cut-List CSV Parser & Math
 * Pure, client-safe utilities for CSV parsing, header auto-mapping, and sheet estimation.
 */

import type {
  CanonicalColumnKey,
  CutListColumnMap,
  CutListParseOptions,
  CutListRowIssue,
  CutListSummary,
  CutListSummaryOptions,
  MaterialCutListSummary,
  NormalizedCutListRow,
  ParsedCutListResult,
} from "./cut-list-import.types";

// ── Arabic-Indic Numerals to Western Digits ─────────────────────────────────

const ARABIC_INDIC_DIGITS: Record<string, string> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

export function normalizeNumericString(val: unknown): string {
  if (val === null || val === undefined) return "";
  let s = String(val).trim();
  // Convert Arabic-Indic digits
  s = s.replace(/[٠-٩]/g, (d) => ARABIC_INDIC_DIGITS[d] || d);
  // Remove common unit suffixes and whitespace
  s = s.replace(/(mm|cm|m|مم|سم|م|pcs|قطعة)/gi, "").trim();
  return s;
}

export function parseNumberSafely(val: unknown, fallback = 0): number {
  const norm = normalizeNumericString(val);
  if (!norm) return fallback;
  // If comma is used as decimal separator (e.g. "18,5")
  const standardized = norm.replace(",", ".");
  const n = parseFloat(standardized);
  return isNaN(n) ? fallback : n;
}

// ── CSV Formula Injection Sanitizer ─────────────────────────────────────────

export function sanitizeCsvFormula(val: unknown): string {
  if (val === null || val === undefined) return "";
  let s = String(val).trim();
  if (!s) return "";
  // Check if string starts with formula triggers: =, +, -, @, or tab (\t)
  if (/^[=+\-@\t\r]/.test(s)) {
    // If it's a valid standalone number (e.g. positive number parsed from string), don't sanitize
    if (/^[+\-]?\d+(\.\d+)?$/.test(s)) {
      return s;
    }
    // Prefix with single quote to prevent spreadsheet execution
    return `'${s}`;
  }
  return s;
}

// ── Delimiter & RFC-4180 CSV Parsing ───────────────────────────────────────

export function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0).slice(0, 5);
  if (firstLines.length === 0) return ",";

  let commaCount = 0;
  let semiCount = 0;
  let tabCount = 0;

  for (const line of firstLines) {
    commaCount += (line.match(/,/g) || []).length;
    semiCount += (line.match(/;/g) || []).length;
    tabCount += (line.match(/\t/g) || []).length;
  }

  if (semiCount > commaCount && semiCount > tabCount) return ";";
  if (tabCount > commaCount && tabCount > semiCount) return "\t";
  return ",";
}

export function parseCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  // Clean BOM
  let cleaned = text;
  if (cleaned.charCodeAt(0) === 0xfeff) {
    cleaned = cleaned.slice(1);
  }

  let i = 0;
  const len = cleaned.length;

  while (i < len) {
    const char = cleaned[i];
    const nextChar = cleaned[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i += 2;
          continue;
        } else {
          // End quote
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === delimiter) {
        currentRow.push(currentField.trim());
        currentField = "";
        i++;
        continue;
      } else if (char === "\r") {
        if (nextChar === "\n") i++;
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = "";
        i++;
        continue;
      } else if (char === "\n") {
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = "";
        i++;
        continue;
      } else {
        currentField += char;
        i++;
      }
    }
  }

  // Push final field/row if any
  currentRow.push(currentField.trim());
  if (currentRow.some((f) => f.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

// ── Header Auto-Mapping Dictionary ──────────────────────────────────────────

const HEADER_MATCHERS: Record<CanonicalColumnKey, (norm: string) => boolean> = {
  partName: (h) =>
    /^(part|part[\s_-]?name|name|component|piece|panel|panel[\s_-]?name|اسم[\s_-]?(القطعة|الجزء)|القطعة|d[eé]signation|item)$/i.test(
      h,
    ),
  unitName: (h) =>
    /^(unit|cabinet|unit[\s_-]?name|cabinet[\s_-]?name|subassembly|الوحدة|الخزانة|meuble|caisson)$/i.test(
      h,
    ),
  productName: (h) => /^(product|product[\s_-]?name|المنتج|projet|project)$/i.test(h),
  sectionName: (h) => /^(section|section[\s_-]?name|القسم|room|الغرفة|zone)$/i.test(h),
  materialSku: (h) =>
    /^(sku|code|material[\s_-]?sku|material[\s_-]?code|الكود|رمز[\s_-]?المادة|ref|r[eé]f[eé]rence)$/i.test(
      h,
    ),
  materialName: (h) =>
    /^(material|material[\s_-]?name|الخامة|المادة|نوع[\s_-]?الخشب|mati[eè]re|board|wood)$/i.test(h),
  lengthMm: (h) =>
    /^(length|length[\s_-]?\(?mm\)?|height|height[\s_-]?\(?mm\)?|long|longueur|الطول|الارتفاع|l)$/i.test(
      h,
    ),
  widthMm: (h) =>
    /^(width|width[\s_-]?\(?mm\)?|larg|largeur|العرض|w)$/i.test(h),
  thicknessMm: (h) =>
    /^(thickness|thickness[\s_-]?\(?mm\)?|thick|t|ep|epaisseur|[eé]paisseur|السمك|التخنة|السمك[\s_-]?\(?مم\)?)$/i.test(
      h,
    ),
  quantity: (h) =>
    /^(qty|quantity|count|pieces|pcs|الكمية|العدد|qte|quantit[eé])$/i.test(h),
  unitOfMeasure: (h) => /^(unit|uom|unit[\s_-]?of[\s_-]?measure|وحدة[\s_-]?القياس)$/i.test(h),
  edgeTop: (h) =>
    /^(edge[\s_-]?top|top[\s_-]?edge|شريط[\s_-]?علوي|l1|edge[\s_-]?1|chant[\s_-]?haut|chant[\s_-]?l1)$/i.test(
      h,
    ),
  edgeBottom: (h) =>
    /^(edge[\s_-]?bottom|bottom[\s_-]?edge|شريط[\s_-]?سفلي|l2|edge[\s_-]?2|chant[\s_-]?bas|chant[\s_-]?l2)$/i.test(
      h,
    ),
  edgeLeft: (h) =>
    /^(edge[\s_-]?left|left[\s_-]?edge|شريط[\s_-]?يسار|w1|edge[\s_-]?3|chant[\s_-]?gauche|chant[\s_-]?w1)$/i.test(
      h,
    ),
  edgeRight: (h) =>
    /^(edge[\s_-]?right|right[\s_-]?edge|شريط[\s_-]?يمين|w2|edge[\s_-]?4|chant[\s_-]?droit|chant[\s_-]?w2)$/i.test(
      h,
    ),
  grainDirection: (h) =>
    /^(grain|grain[\s_-]?direction|rotation|اتجاه[\s_-]?الثمرة|sens[\s_-]?du[\s_-]?fil|fil|direction)$/i.test(
      h,
    ),
  notes: (h) =>
    /^(notes?|remarks?|comments?|ملاحظات|remarques?|observations?|cnc|edge[\s_-]?notes?)$/i.test(
      h,
    ),
};

export function autoMapHeaders(headers: string[]): CutListColumnMap {
  const result: CutListColumnMap = {
    partName: null,
    unitName: null,
    productName: null,
    sectionName: null,
    materialSku: null,
    materialName: null,
    lengthMm: null,
    widthMm: null,
    thicknessMm: null,
    quantity: null,
    unitOfMeasure: null,
    edgeTop: null,
    edgeBottom: null,
    edgeLeft: null,
    edgeRight: null,
    grainDirection: null,
    notes: null,
  };

  const usedIndices = new Set<number>();

  // Pass 1: exact and standard matchers
  for (const [key, matcher] of Object.entries(HEADER_MATCHERS) as [
    CanonicalColumnKey,
    (h: string) => boolean,
  ][]) {
    for (let idx = 0; idx < headers.length; idx++) {
      if (usedIndices.has(idx)) continue;
      const raw = headers[idx].trim();
      const clean = raw.toLowerCase().replace(/[\(\)\[\]]/g, "").trim();
      if (matcher(clean) || matcher(raw)) {
        result[key] = raw;
        usedIndices.add(idx);
        break;
      }
    }
  }

  return result;
}

export function normalizeGrainDirection(
  val: unknown,
): "along_length" | "along_width" | "none" | "can_rotate" {
  if (!val) return "along_length";
  const s = String(val).trim().toLowerCase();
  if (s === "along_width" || s === "width" || s === "عرض" || s === "عرضي") {
    return "along_width";
  }
  if (s === "can_rotate" || s === "rotate" || s === "حر" || s === "أي اتجاه" || s === "any") {
    return "can_rotate";
  }
  if (s === "none" || s === "لا يوجد" || s === "بدون" || s === "no") {
    return "none";
  }
  return "along_length";
}

export function normalizeEdgeBanding(val: unknown): string | null {
  if (!val) return null;
  const s = String(val).trim();
  const lower = s.toLowerCase();
  if (
    lower === "none" ||
    lower === "no" ||
    lower === "-" ||
    lower === "0" ||
    lower === "لا" ||
    lower === "لا يوجد" ||
    lower === "بدون" ||
    lower === "false"
  ) {
    return null;
  }
  return sanitizeCsvFormula(s);
}

// ── Main Cut-List CSV Parser ────────────────────────────────────────────────

export function parseCutListCsv(
  rawText: string,
  options: CutListParseOptions = {},
): ParsedCutListResult {
  const { sourceUnit = "mm", columnMap: overrideMap } = options;
  const delimiter = detectDelimiter(rawText);
  const rows = parseCsvRows(rawText, delimiter);

  if (rows.length === 0) {
    return {
      headers: [],
      delimiter,
      detectedFormat: "standard",
      columnMap: {
        partName: null,
        unitName: null,
        productName: null,
        sectionName: null,
        materialSku: null,
        materialName: null,
        lengthMm: null,
        widthMm: null,
        thicknessMm: null,
        quantity: null,
        unitOfMeasure: null,
        edgeTop: null,
        edgeBottom: null,
        edgeLeft: null,
        edgeRight: null,
        grainDirection: null,
        notes: null,
      },
      totalRowsParsed: 0,
      validItems: [],
      errors: [{ rowIndex: 0, message: "CSV file is empty", severity: "error" }],
      warnings: [],
    };
  }

  const rawHeaders = rows[0];
  const autoMap = autoMapHeaders(rawHeaders);
  const columnMap: CutListColumnMap = {
    ...autoMap,
    ...(overrideMap || {}),
  };

  // Header index lookup
  const colIndexLookup: Partial<Record<CanonicalColumnKey, number>> = {};
  for (const [key, headerName] of Object.entries(columnMap) as [CanonicalColumnKey, string | null][]) {
    if (headerName) {
      const idx = rawHeaders.indexOf(headerName);
      if (idx !== -1) colIndexLookup[key] = idx;
    }
  }

  // Detect format
  let detectedFormat: ParsedCutListResult["detectedFormat"] = "standard";
  const headerStr = rawHeaders.join(" ").toLowerCase();
  if (headerStr.includes("l1") && headerStr.includes("w1")) {
    detectedFormat = "polyboard";
  } else if (headerStr.includes("opencutlist") || headerStr.includes("délignage")) {
    detectedFormat = "opencutlist";
  } else if (headerStr.includes("خزانة") || headerStr.includes("تخنة") || headerStr.includes("شريط")) {
    detectedFormat = "khazana";
  }

  const validItems: NormalizedCutListRow[] = [];
  const errors: CutListRowIssue[] = [];
  const warnings: CutListRowIssue[] = [];

  const multiplier = sourceUnit === "cm" ? 10 : 1;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    // Check if entire row is empty
    if (!row || row.every((c) => !c || c.trim().length === 0)) {
      continue;
    }

    const rowIndex = r;
    const getValue = (key: CanonicalColumnKey): string => {
      const idx = colIndexLookup[key];
      return idx !== undefined && idx < row.length ? row[idx] : "";
    };

    const rawPartName = getValue("partName");
    const rawMaterialName = getValue("materialName");
    const rawSku = getValue("materialSku");
    const rawLength = getValue("lengthMm");
    const rawWidth = getValue("widthMm");
    const rawThickness = getValue("thicknessMm");
    const rawQty = getValue("quantity");

    const partName = sanitizeCsvFormula(rawPartName || `Part ${r}`);
    const materialName = sanitizeCsvFormula(rawMaterialName || "Default Board");
    const materialSku = sanitizeCsvFormula(rawSku || "CUSTOM");
    const unitName = sanitizeCsvFormula(getValue("unitName") || "Unit");
    const productName = sanitizeCsvFormula(getValue("productName") || "Custom Product");
    const sectionName = sanitizeCsvFormula(getValue("sectionName") || "General");
    const notes = sanitizeCsvFormula(getValue("notes")) || null;

    const rawLenNum = parseNumberSafely(rawLength, 0);
    const rawWidthNum = parseNumberSafely(rawWidth, 0);
    const rawThickNum = parseNumberSafely(rawThickness, 18);
    const rawQtyNum = parseNumberSafely(rawQty, 1);

    const lengthMm = Math.round(rawLenNum * multiplier * 100) / 100;
    const widthMm = Math.round(rawWidthNum * multiplier * 100) / 100;
    const thicknessMm = Math.round(rawThickNum * (rawThickness ? multiplier : 1) * 100) / 100;
    const quantity = Math.round(rawQtyNum * 100) / 100;

    let hasFatalError = false;

    if (!rawPartName && !colIndexLookup.partName) {
      // If no part name column was mapped at all
      warnings.push({
        rowIndex,
        field: "partName",
        message: `Row ${r}: Part name column not mapped, generated "${partName}"`,
        severity: "warning",
      });
    }

    if (lengthMm <= 0) {
      errors.push({
        rowIndex,
        field: "lengthMm",
        message: `Row ${r}: Length must be greater than 0 mm (got ${lengthMm})`,
        severity: "error",
      });
      hasFatalError = true;
    }

    if (widthMm <= 0) {
      errors.push({
        rowIndex,
        field: "widthMm",
        message: `Row ${r}: Width must be greater than 0 mm (got ${widthMm})`,
        severity: "error",
      });
      hasFatalError = true;
    }

    if (thicknessMm <= 0) {
      errors.push({
        rowIndex,
        field: "thicknessMm",
        message: `Row ${r}: Thickness must be greater than 0 mm (got ${thicknessMm})`,
        severity: "error",
      });
      hasFatalError = true;
    }

    if (quantity <= 0) {
      errors.push({
        rowIndex,
        field: "quantity",
        message: `Row ${r}: Quantity must be greater than 0 (got ${quantity})`,
        severity: "error",
      });
      hasFatalError = true;
    }

    // Size warnings (> 3660 mm which is standard jumbo sheet max dimension)
    if (lengthMm > 3660 || widthMm > 3660) {
      warnings.push({
        rowIndex,
        message: `Row ${r}: Dimension exceeds standard sheet length (3660 mm)`,
        severity: "warning",
      });
    }

    if (!hasFatalError) {
      validItems.push({
        rowIndex,
        partName,
        unitName,
        productName,
        sectionName,
        materialSku,
        materialName,
        lengthMm,
        widthMm,
        thicknessMm,
        quantity,
        unitOfMeasure: getValue("unitOfMeasure") || "pcs",
        edgeTop: normalizeEdgeBanding(getValue("edgeTop")),
        edgeBottom: normalizeEdgeBanding(getValue("edgeBottom")),
        edgeLeft: normalizeEdgeBanding(getValue("edgeLeft")),
        edgeRight: normalizeEdgeBanding(getValue("edgeRight")),
        grainDirection: normalizeGrainDirection(getValue("grainDirection")),
        notes,
        source: "csv_import",
      });
    }
  }

  return {
    headers: rawHeaders,
    delimiter,
    detectedFormat,
    columnMap,
    totalRowsParsed: rows.length - 1,
    validItems,
    errors,
    warnings,
  };
}

// ── Sheet & Edge-Banding Workshop Math ──────────────────────────────────────

export function computeCutListSummary(
  items: NormalizedCutListRow[] | {
    lengthMm: number;
    widthMm: number;
    thicknessMm: number;
    quantity: number;
    materialName: string;
    edgeTop?: string | null;
    edgeBottom?: string | null;
    edgeLeft?: string | null;
    edgeRight?: string | null;
  }[],
  options: CutListSummaryOptions = {},
): CutListSummary {
  const { sheetLengthMm = 2440, sheetWidthMm = 1220, wastePct = 15 } = options;

  const sheetAreaM2 = (sheetLengthMm * sheetWidthMm) / 1_000_000; // e.g. 2.9768 m²
  const wasteMultiplier = 1 + wastePct / 100; // e.g. 1.15

  // Group by materialName + thicknessMm
  const materialGroups = new Map<
    string,
    {
      materialName: string;
      thicknessMm: number;
      partCount: number;
      netAreaM2: number;
      edgeBandingLinearMeters: number;
    }
  >();

  let totalRows = 0;
  let totalParts = 0;
  let totalNetAreaM2 = 0;
  let totalEdgeBandingM = 0;

  for (const item of items) {
    const qty = Number(item.quantity || 1);
    const length = Number(item.lengthMm || 0);
    const width = Number(item.widthMm || 0);
    const thick = Number(item.thicknessMm || 18);
    const matName = item.materialName || "Standard Board";

    totalRows += 1;
    totalParts += qty;

    const rowAreaM2 = (length * width * qty) / 1_000_000;
    totalNetAreaM2 += rowAreaM2;

    // Edge banding linear meters calculation:
    // (edgeTop ? L : 0) + (edgeBottom ? L : 0) + (edgeLeft ? W : 0) + (edgeRight ? W : 0)
    let edgesMm = 0;
    if (item.edgeTop) edgesMm += length;
    if (item.edgeBottom) edgesMm += length;
    if (item.edgeLeft) edgesMm += width;
    if (item.edgeRight) edgesMm += width;

    const rowEdgeM = (edgesMm * qty) / 1000;
    totalEdgeBandingM += rowEdgeM;

    const groupKey = `${matName}__${thick}`;
    const existing = materialGroups.get(groupKey) || {
      materialName: matName,
      thicknessMm: thick,
      partCount: 0,
      netAreaM2: 0,
      edgeBandingLinearMeters: 0,
    };

    existing.partCount += qty;
    existing.netAreaM2 += rowAreaM2;
    existing.edgeBandingLinearMeters += rowEdgeM;
    materialGroups.set(groupKey, existing);
  }

  const materials: MaterialCutListSummary[] = Array.from(materialGroups.values()).map((g) => {
    const netArea = Math.round(g.netAreaM2 * 1000) / 1000;
    const grossArea = netArea * wasteMultiplier;
    // Estimated sheets (ceil to whole sheet for workshop sizing)
    const sheets = sheetAreaM2 > 0 ? Math.ceil(grossArea / sheetAreaM2) : 0;
    return {
      materialName: g.materialName,
      thicknessMm: g.thicknessMm,
      partCount: g.partCount,
      netAreaM2: netArea,
      estimatedSheets: sheets,
      edgeBandingLinearMeters: Math.round(g.edgeBandingLinearMeters * 10) / 10,
    };
  });

  const estimatedSheetsTotal = materials.reduce((sum, m) => sum + m.estimatedSheets, 0);

  return {
    totalRows,
    totalParts: Math.round(totalParts * 100) / 100,
    netAreaM2: Math.round(totalNetAreaM2 * 1000) / 1000,
    estimatedSheetsTotal,
    edgeBandingLinearMeters: Math.round(totalEdgeBandingM * 10) / 10,
    materials,
    sheetDimensions: {
      sheetLengthMm,
      sheetWidthMm,
      wastePct,
    },
  };
}
