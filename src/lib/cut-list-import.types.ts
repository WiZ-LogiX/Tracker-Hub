/**
 * Sprint 7A — Workshop-Grade Cut-List Types
 * Client-safe type definitions for CSV cut-list import, column mappings, and material summary.
 */

export type CanonicalColumnKey =
  | "partName"
  | "unitName"
  | "productName"
  | "sectionName"
  | "materialSku"
  | "materialName"
  | "lengthMm"
  | "widthMm"
  | "thicknessMm"
  | "quantity"
  | "unitOfMeasure"
  | "edgeTop"
  | "edgeBottom"
  | "edgeLeft"
  | "edgeRight"
  | "grainDirection"
  | "notes";

export type CutListColumnMap = Record<CanonicalColumnKey, string | null>;

export interface NormalizedCutListRow {
  id?: string;
  rowIndex: number;
  partName: string;
  unitName: string;
  productName: string;
  sectionName: string;
  materialSku: string;
  materialName: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  quantity: number;
  unitOfMeasure: string;
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;
  grainDirection: "along_length" | "along_width" | "none" | "can_rotate";
  notes: string | null;
  source: "csv_import" | "snapshot";
}

export interface CutListRowIssue {
  rowIndex: number;
  field?: CanonicalColumnKey;
  message: string;
  severity: "error" | "warning";
}

export interface ParsedCutListResult {
  headers: string[];
  delimiter: string;
  detectedFormat: "standard" | "polyboard" | "opencutlist" | "khazana" | "custom";
  columnMap: CutListColumnMap;
  totalRowsParsed: number;
  validItems: NormalizedCutListRow[];
  errors: CutListRowIssue[];
  warnings: CutListRowIssue[];
}

export interface MaterialCutListSummary {
  materialName: string;
  thicknessMm: number;
  partCount: number;
  netAreaM2: number;
  estimatedSheets: number;
  edgeBandingLinearMeters: number;
}

export interface CutListSummary {
  totalRows: number;
  totalParts: number;
  netAreaM2: number;
  estimatedSheetsTotal: number;
  edgeBandingLinearMeters: number;
  materials: MaterialCutListSummary[];
  sheetDimensions: {
    sheetLengthMm: number;
    sheetWidthMm: number;
    wastePct: number;
  };
}

export interface CutListParseOptions {
  sourceUnit?: "mm" | "cm";
  columnMap?: Partial<CutListColumnMap>;
}

export interface CutListSummaryOptions {
  sheetLengthMm?: number;
  sheetWidthMm?: number;
  wastePct?: number;
}
