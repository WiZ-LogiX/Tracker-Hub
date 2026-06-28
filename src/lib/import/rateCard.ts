/**
 * Rate-card parser — normalizes April-2026 Excel into importable records.
 *
 * Handles:
 *   - Text-with-currency cells  ('7200جنية' → 7200)
 *   - Trailing/leading spaces   ('GLOSS MAX ' → 'GLOSS MAX')
 *   - Finish-label → canonical code mapping
 *   - Width strings with Arabic suffixes (' 100سم' → 100)
 *   - Special dimensions ('90*90', '60*60') → width_tier 'wide' / 'standard'
 *
 * Output is a flat array of NormalizedPriceRecord plus AddonRecord[]
 * ready for upsert into catalog / pricing-levler tables.
 */

import * as XLSX from "xlsx";

// ── Finish normalization ────────────────────────────────────────────────────

/** Canonical finish codes used in the system. */
export type FinishCode =
  | "HPL"
  | "PVC"
  | "GLOSS_MAX"
  | "POLYLAC"
  | "EGGER_ALVIC";

const FINISH_ALIASES: Record<string, FinishCode> = {
  // English labels (various casing / spacing)
  hpl: "HPL",
  "hpl /pvc": "HPL",
  "hpl/pvc": "HPL",
  pvc: "PVC",
  " gloss max ": "GLOSS_MAX",
  "gloss max": "GLOSS_MAX",
  "gloss max 5k": "GLOSS_MAX",
  "جلوس ماكس": "GLOSS_MAX",
  "جلوس ماكس برو": "GLOSS_MAX",
  "جلوس ماكس برو/5k": "GLOSS_MAX",
  "جلوس ماكس برو /5k": "GLOSS_MAX",
  "لامي جلوس": "GLOSS_MAX",
  polylac: "POLYLAC",
  "يوفي لاك": "POLYLAC",
  egger: "EGGER_ALVIC",
  "egger/alvic": "EGGER_ALVIC",
  alvic: "EGGER_ALVIC",
  "بولي لاك": "EGGER_ALVIC",
  "يلدز": "PVC",
};

/** Normalize any raw finish label to canonical FinishCode. */
export function normalizeFinish(raw: string): FinishCode | null {
  const key = raw
    .toLowerCase()
    .replace(/[\r\n]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Direct match first
  const direct = FINISH_ALIASES[key];
  if (direct) return direct;

  // Substring match — extract finish keyword from longer labels
  // Order matters: check longer patterns first
  const substringPatterns: [RegExp, FinishCode][] = [
    [/egger\s*\/?\s*alvic/, "EGGER_ALVIC"],
    [/بولي لاك/, "EGGER_ALVIC"],
    [/egger/, "EGGER_ALVIC"],
    [/alvic/, "EGGER_ALVIC"],
    [/polylac/, "POLYLAC"],
    [/يوفي لاك/, "POLYLAC"],
    [/جلوس ماكس|لامي جلوس|gloss\s*max/, "GLOSS_MAX"],
    [/يلدز/, "PVC"],
    [/hpl\s*\/?\s*pvc|hpl/, "HPL"],
    [/pvc/, "PVC"],
  ];

  for (const [pattern, code] of substringPatterns) {
    if (pattern.test(key)) return code;
  }

  return null;
}

// ── Value parsing helpers ───────────────────────────────────────────────────

/** Strip 'جنية' suffix and parse numeric. Handles '7200جنية' → 7200. */
export function parseCurrencyCell(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v)
    .replace(/[\u00A0\s]*جنية/gi, "")
    .replace(/[\u00A0\s]*جنيه/gi, "")
    .replace(/,/g, "")
    .trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Parse width string: ' 100سم' → 100, '90*90' → 90, '60سم' → 60. */
export function parseWidth(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[\u00A0\s]/g, "").trim();
  // "90*90" or "60*60" → take first dimension
  const mult = s.match(/^(\d+)\*(\d+)$/);
  if (mult) return Number(mult[1]);
  // "100سم" → 100
  const m = s.match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

/** Map raw width (cm) to a width_tier enum value. */
export function widthToTier(w: number): string {
  if (w >= 90) return "wide";
  if (w >= 60) return "standard";
  if (w >= 40) return "narrow";
  return "narrow";
}

// ── Unit-type labels ────────────────────────────────────────────────────────

export type UnitTypeSlug =
  | "base"
  | "upper"
  | "tall"
  | "drawer"
  | "corner_diagonal"
  | "corner_l";

const UNIT_TYPE_LABELS: Record<string, UnitTypeSlug> = {
  "الوحدات السفلية": "base",
  "الوحدات العلوية": "upper",
  "وحدات السحارات": "tall",
  ادراج: "drawer",
  "زاوية مشطورة": "corner_diagonal",
  "زاوية": "corner_diagonal",
  "ركنة حرف l": "corner_l",
  "ركنة حرف L": "corner_l",
};

/** Detect unit-type slug from a row label string. */
export function detectUnitType(label: string | null): UnitTypeSlug | null {
  if (!label) return null;
  const norm = label
    .replace(/[\r\n]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  for (const [key, slug] of Object.entries(UNIT_TYPE_LABELS)) {
    if (norm.includes(key.toLowerCase())) return slug;
  }
  return null;
}

// ── Normalized record types ─────────────────────────────────────────────────

export interface NormalizedPriceRecord {
  unitType: UnitTypeSlug;
  finishCode: FinishCode;
  /** Original finish label from the sheet, trimmed. */
  finishLabel: string;
  /** Width tier derived from width_cm. */
  widthTier: string;
  /** Raw width in cm (null for special units like corners). */
  widthCm: number | null;
  /** Unit price in EGP. */
  price: number;
  /** If true, this record is for a corner/special unit (no width tier, fixed price). */
  isFixed: boolean;
}

export interface AddonRecord {
  /** Arabic label from the sheet. */
  label: string;
  /** Normalized slug (snake_case). */
  slug: string;
  /** Unit price in EGP. */
  price: number;
  /** 'hardware' | 'accessory' | 'fee' — caller classifies. */
  category: "hardware" | "accessory" | "fee";
}

export interface CoefficientRecord {
  /** Finish code this coefficient applies to. */
  finishCode: FinishCode;
  /** Coefficient multiplier (0-1). */
  coefficient: number;
  /** Human label. */
  label: string;
}

// ── Add-on classification ───────────────────────────────────────────────────

const ADDON_CATEGORIES: Record<string, "hardware" | "accessory" | "fee"> = {
  "تجاليد علوي": "hardware",
  "تجاليد سفلي": "hardware",
  "تجاليد دولاب": "hardware",
  "مطبقية استانلس": "hardware",
  "تروللي استانلس": "hardware",
  "سبت خضار": "accessory",
  زجاج: "accessory",
  "دراع منطبق بلوم": "hardware",
  "دولاب استانلس": "hardware",
  "ليد لايت": "accessory",
  "تجاليد مستوي تاني": "hardware",
  "نقل ومشال": "fee",
  نقل: "fee",
  معاينة: "fee",
};

function addonSlug(label: string): string {
  return label
    .replace(/[\r\n]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/ /g, "_");
}

// ── Parser: Sheet1 (per-finish summary) ─────────────────────────────────────

/**
 * Parse Sheet1 rows 0-4 (per-finish unit prices).
 * Each row: [label, p100, p90, p80, p70, p60, p50, p40, p30,
 *            corner_diag, corner_l, drawer_start, drawer_start2, ...]
 *
 * Width columns B-I map to widths [100, 90, 80, 70, 60, 50, 40, 30].
 * Column J = corner_diagonal price, K = corner_l price.
 */
const SHEET1_WIDTHS = [100, 90, 80, 70, 60, 50, 40, 30];

function parseSheet1FinishRows(
  rows: (string | number | null)[][],
  startRow: number,
  endRow: number,
  unitType: UnitTypeSlug,
): NormalizedPriceRecord[] {
  const records: NormalizedPriceRecord[] = [];

  for (let i = startRow; i <= endRow; i++) {
    const row = rows[i];
    if (!row) continue;
    const rawLabel = String(row[0] ?? "").trim();
    if (!rawLabel) continue;

    const finishCode = normalizeFinish(rawLabel);
    if (!finishCode) continue;

    const finishLabel = rawLabel.replace(/خامة\s*/g, "").trim();

    // Width prices (columns B-I = indices 1-8)
    for (let w = 0; w < SHEET1_WIDTHS.length; w++) {
      const price = parseCurrencyCell(row[w + 1]);
      if (price !== null && price > 0) {
        records.push({
          unitType,
          finishCode,
          finishLabel,
          widthTier: widthToTier(SHEET1_WIDTHS[w]),
          widthCm: SHEET1_WIDTHS[w],
          price,
          isFixed: false,
        });
      }
    }

    // Corner diagonal (column J = index 9)
    const cornerDiag = parseCurrencyCell(row[9]);
    if (cornerDiag !== null && cornerDiag > 0) {
      records.push({
        unitType,
        finishCode,
        finishLabel,
        widthTier: "standard",
        widthCm: null,
        price: cornerDiag,
        isFixed: true,
      });
    }

    // Corner L (column K = index 10)
    const cornerL = parseCurrencyCell(row[10]);
    if (cornerL !== null && cornerL > 0) {
      records.push({
        unitType,
        finishCode,
        finishLabel,
        widthTier: "wide",
        widthCm: null,
        price: cornerL,
        isFixed: true,
      });
    }
  }

  return records;
}

// ── Parser: Лист1 grid (alternative source) ─────────────────────────────────

/**
 * Parse Лист1 header rows to extract finish columns.
 * Row 2: ["EGGER\r\n", "POLYLAC", "GLOSS MAX ", "HPL\r\n", "عرض الوحدة", null]
 * Row 3: ["\r\nALVIC", null, "5K", "\r\nPVC", null, null]
 * Column 0 = EGGER+ALVIC (spans rows 2-3)
 * Column 1 = POLYLAC
 * Column 2 = GLOSS MAX 5K
 * Column 3 = HPL+PVC (spans rows 2-3)
 */
function parseLsheet1Headers(
  rows: (string | number | null)[][],
): Map<number, FinishCode> {
  const colMap = new Map<number, FinishCode>();

  // Row 2: simple headers
  const r2 = rows[2] ?? [];
  const r3 = rows[3] ?? [];

  for (let c = 0; c < 4; c++) {
    const raw = `${String(r2[c] ?? "")}${String(r3[c] ?? "")}`;
    const code = normalizeFinish(raw);
    if (code) colMap.set(c, code);
  }

  return colMap;
}

/**
 * Parse a Lsheet1 price block (e.g. rows 4-11 = base units).
 * Columns A-D = prices per finish, Column E = width (or special), Column F = label.
 */
function parseLsheet1Block(
  rows: (string | number | null)[][],
  startRow: number,
  endRow: number,
  colMap: Map<number, FinishCode>,
  defaultUnitType: UnitTypeSlug,
): NormalizedPriceRecord[] {
  const records: NormalizedPriceRecord[] = [];
  let currentUnitType = defaultUnitType;

  for (let i = startRow; i <= endRow; i++) {
    const row = rows[i];
    if (!row) continue;

    // Column F (index 5) may override unit type
    const labelCell = String(row[5] ?? "").trim();
    const detectedType = detectUnitType(labelCell);
    if (detectedType) currentUnitType = detectedType;

    // Column E (index 4) = width
    const widthVal = row[4];
    const widthCm = parseWidth(widthVal);

    // Columns A-D (indices 0-3) = prices per finish
    for (const [col, finishCode] of colMap) {
      const price = parseCurrencyCell(row[col]);
      if (price !== null && price > 0 && widthCm !== null) {
        records.push({
          unitType: currentUnitType,
          finishCode,
          finishLabel: finishCode,
          widthTier: widthToTier(widthCm),
          widthCm,
          price,
          isFixed: false,
        });
      }
    }
  }

  return records;
}

// ── Parser: Add-ons from Лист1 quote section ────────────────────────────────

function parseAddons(
  rows: (string | number | null)[][],
  startRow: number,
  endRow: number,
): AddonRecord[] {
  const records: AddonRecord[] = [];

  for (let i = startRow; i <= endRow; i++) {
    const row = rows[i];
    if (!row) continue;

    // Label is in column F (index 5) or E (index 4)
    const labelRaw = String(row[5] ?? row[4] ?? "").trim();
    if (!labelRaw || labelRaw === "الاجمالي" || labelRaw === "عدد الوحدات") continue;

    const price = parseCurrencyCell(row[3]); // Column D = unit price
    if (price === null) continue;

    const slug = addonSlug(labelRaw);
    const category = ADDON_CATEGORIES[labelRaw] ?? "accessory";

    records.push({ label: labelRaw, slug, price, category });
  }

  return records;
}

// ── Coefficients (from business context) ────────────────────────────────────

export const KNOWN_COEFFICIENTS: CoefficientRecord[] = [
  { finishCode: "HPL", coefficient: 0.133, label: "HPL board-yield coefficient" },
  { finishCode: "PVC", coefficient: 0.21, label: "PVC board-yield coefficient" },
  { finishCode: "GLOSS_MAX", coefficient: 0.25, label: "GLOSS MAX board-yield coefficient" },
  { finishCode: "POLYLAC", coefficient: 0.133, label: "POLYLAC board-yield coefficient" },
  { finishCode: "EGGER_ALVIC", coefficient: 0.133, label: "EGGER/ALVIC board-yield coefficient" },
];

// ── Main parser ─────────────────────────────────────────────────────────────

export interface ParseResult {
  prices: NormalizedPriceRecord[];
  addons: AddonRecord[];
  coefficients: CoefficientRecord[];
  /** Conflicts / warnings during parse. */
  conflicts: string[];
}

/**
 * Parse the April-2026 rate-card workbook into normalized records.
 *
 * @param buffer  Raw xlsx file contents
 * @returns       Parsed records + conflicts
 */
export function parseRateCard(buffer: Buffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const conflicts: string[] = [];
  const allPrices: NormalizedPriceRecord[] = [];
  const allAddons: AddonRecord[] = [];

  // ── Parse Sheet1 (per-finish summary, rows 0-18) ────────────────────────
  const sheet1 = wb.Sheets["Sheet1"];
  if (sheet1) {
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet1, {
      header: 1,
      defval: null,
    });

    // Lower units: rows 0-4
    allPrices.push(
      ...parseSheet1FinishRows(rows, 0, 4, "base"),
    );
    // Upper units: rows 8-12
    allPrices.push(
      ...parseSheet1FinishRows(rows, 8, 12, "upper"),
    );
    // Tall units: rows 14-18
    allPrices.push(
      ...parseSheet1FinishRows(rows, 14, 18, "tall"),
    );
  }

  // ── Parse Лист1 (main grid) ─────────────────────────────────────────────
  const lsheet = wb.Sheets["Лист1"];
  if (lsheet) {
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(lsheet, {
      header: 1,
      defval: null,
    });

    const colMap = parseLsheet1Headers(rows);
    if (colMap.size === 0) {
      conflicts.push("Лист1: Could not parse finish headers from rows 2-3");
    }

    // Grid 1: base + corner + drawer (rows 4-18)
    allPrices.push(
      ...parseLsheet1Block(rows, 4, 18, colMap, "base"),
    );

    // Grid 2: upper + corner (rows 20-29)
    allPrices.push(
      ...parseLsheet1Block(rows, 20, 29, colMap, "upper"),
    );

    // Add-ons from first quote section (rows 61-73)
    allAddons.push(...parseAddons(rows, 61, 73));
  }

  // ── Dedup: Sheet1 takes precedence over Лист1 ───────────────────────────
  const deduped = deduplicatePrices(allPrices, conflicts);

  return {
    prices: deduped,
    addons: dedupAllAddons(allAddons),
    coefficients: KNOWN_COEFFICIENTS,
    conflicts,
  };
}

// ── Deduplication ───────────────────────────────────────────────────────────

function priceKey(r: NormalizedPriceRecord): string {
  return `${r.unitType}:${r.finishCode}:${r.widthTier}:${r.isFixed ? "fixed" : r.widthCm}`;
}

function deduplicatePrices(
  records: NormalizedPriceRecord[],
  conflicts: string[],
): NormalizedPriceRecord[] {
  // Sheet1 records come first (higher quality), Лист1 fills gaps
  const seen = new Map<string, NormalizedPriceRecord>();

  for (const r of records) {
    const k = priceKey(r);
    if (seen.has(k)) {
      const existing = seen.get(k)!;
      if (existing.price !== r.price) {
        conflicts.push(
          `Duplicate price for ${k}: ${existing.price} vs ${r.price} (keeping first)`,
        );
      }
    } else {
      seen.set(k, r);
    }
  }

  return Array.from(seen.values());
}

function dedupAllAddons(records: AddonRecord[]): AddonRecord[] {
  const seen = new Map<string, AddonRecord>();
  for (const r of records) {
    if (!seen.has(r.slug)) seen.set(r.slug, r);
  }
  return Array.from(seen.values());
}
