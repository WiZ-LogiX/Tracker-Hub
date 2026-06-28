/**
 * Rate-card parser tests — golden import, key normalization, edge cases.
 *
 * Uses the real April-2026 workbook (public/pricing-april-2026.xlsx)
 * plus synthetic edge-case fixtures.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  parseRateCard,
  normalizeFinish,
  parseCurrencyCell,
  parseWidth,
  widthToTier,
  detectUnitType,
  type ParseResult,
  type FinishCode,
} from "@/lib/import/rateCard";

// ── Fixtures ────────────────────────────────────────────────────────────────

let realWorkbook: Buffer;
let realResult: ParseResult;

beforeAll(() => {
  realWorkbook = readFileSync(
    resolve("public/pricing-april-2026.xlsx"),
  );
  realResult = parseRateCard(realWorkbook);
});

// Synthetic workbook for edge-case testing
function makeSyntheticWorkbook(): Buffer {
  const XLSX = require("xlsx");
  const wb = XLSX.utils.book_new();

  // Sheet1: per-finish summary (5 rows × 10 price cols)
  const sheet1Data = [
    ["الوحدات السفلية للمطبخ علي خامة HPL /PVC", 7700, 7200, 6700, 6100, 5600, 4500, 4000, 3500, 7800, 9500],
    ["الوحدات السفلية للمطبخ علي خامة يلدز", 7800, 7200, 6700, 6200, 5600, 4600, 4000, 3500, 7800, 9600],
    ["الوحدات السفلية للمطبخ علي خامة جلوس ماكس برو/5K ", 8000, 7400, 6900, 6300, 5700, 4700, 4100, 3500, 7900, 9700],
    ["الوحدات السفلية للمطبخ علي خامة POLYLAC", 8800, 8100, 7500, 6900, 6200, 5100, 4400, 3800, 8200, 10200],
    ["الوحدات السفلية للمطبخ علي خامة EGGER/ALVIC", 9200, 8500, 7800, 7100, 6500, 5300, 4600, 3900, 8400, 10400],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
  XLSX.utils.book_append_sheet(wb, ws1, "Sheet1");

  // Лист1: main grid with add-ons
  const lsheetData = [
    // Headers
    ["EGGER\r\n", "POLYLAC", "GLOSS MAX ", "HPL\r\n", "عرض الوحدة", null],
    ["\r\nALVIC", null, "5K", "\r\nPVC", null, null],
    // Grid: base units
    [9200, 8800, 8000, 7700, 100, "الوحدات السفلية"],
    [8500, 8100, 7400, 7200, 90, null],
    // Add-ons
    ...Array.from({ length: 50 }, () => [null, 0, null, 0, null, null]),
    [null, 0, null, 500, null, "تجاليد علوي"],
    [null, 0, null, 800, null, "تجاليد سفلي"],
    [null, 0, null, 2600, null, "تجاليد دولاب"],
  ];
  const wsL = XLSX.utils.aoa_to_sheet(lsheetData);
  XLSX.utils.book_append_sheet(wb, wsL, "Лист1");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buf);
}

// ── 1. Key normalization ────────────────────────────────────────────────────

describe("normalizeFinish", () => {
  it("trims trailing spaces", () => {
    expect(normalizeFinish("GLOSS MAX ")).toBe("GLOSS_MAX");
    expect(normalizeFinish("  GLOSS MAX  ")).toBe("GLOSS_MAX");
  });

  it("maps English finish labels", () => {
    expect(normalizeFinish("HPL")).toBe("HPL");
    expect(normalizeFinish("PVC")).toBe("PVC");
    expect(normalizeFinish("POLYLAC")).toBe("POLYLAC");
    expect(normalizeFinish("EGGER")).toBe("EGGER_ALVIC");
    expect(normalizeFinish("ALVIC")).toBe("EGGER_ALVIC");
    expect(normalizeFinish("EGGER/ALVIC")).toBe("EGGER_ALVIC");
  });

  it("maps Arabic finish labels", () => {
    expect(normalizeFinish("يلدز")).toBe("PVC");
    expect(normalizeFinish("لامي جلوس")).toBe("GLOSS_MAX");
    expect(normalizeFinish("جلوس ماكس")).toBe("GLOSS_MAX");
    expect(normalizeFinish("جلوس ماكس برو")).toBe("GLOSS_MAX");
    expect(normalizeFinish("يوفي لاك")).toBe("POLYLAC");
    expect(normalizeFinish("بولي لاك")).toBe("EGGER_ALVIC");
  });

  it("extracts finish from compound Arabic labels", () => {
    expect(
      normalizeFinish("الوحدات السفلية للمطبخ علي خامة HPL /PVC"),
    ).toBe("HPL");
    expect(
      normalizeFinish("الوحدات السفلية للمطبخ علي خامة يلدز"),
    ).toBe("PVC");
    expect(
      normalizeFinish("الوحدات السفلية للمطبخ علي خامة جلوس ماكس برو/5K "),
    ).toBe("GLOSS_MAX");
    expect(
      normalizeFinish("الوحدات السفلية للمطبخ علي خامة POLYLAC"),
    ).toBe("POLYLAC");
    expect(
      normalizeFinish("الوحدات السفلية للمطبخ علي خامة EGGER/ALVIC"),
    ).toBe("EGGER_ALVIC");
  });

  it("returns null for unknown finishes", () => {
    expect(normalizeFinish("TOTALLY UNKNOWN")).toBeNull();
    expect(normalizeFinish("")).toBeNull();
  });

  it("handles newlines in labels", () => {
    expect(normalizeFinish("EGGER\r\n")).toBe("EGGER_ALVIC");
    expect(normalizeFinish("\r\nALVIC")).toBe("EGGER_ALVIC");
    expect(normalizeFinish("HPL\r\n")).toBe("HPL");
    expect(normalizeFinish("\r\nPVC")).toBe("PVC");
  });
});

// ── 2. Value parsing helpers ────────────────────────────────────────────────

describe("parseCurrencyCell", () => {
  it("parses plain numbers", () => {
    expect(parseCurrencyCell(7200)).toBe(7200);
    expect(parseCurrencyCell(0)).toBe(0);
  });

  it("parses text with جنية suffix", () => {
    expect(parseCurrencyCell("7200جنية")).toBe(7200);
    expect(parseCurrencyCell("5900جنية")).toBe(5900);
  });

  it("parses text with جنيه suffix", () => {
    expect(parseCurrencyCell("7200جنيه")).toBe(7200);
  });

  it("handles trailing spaces in currency text", () => {
    expect(parseCurrencyCell("5900جنية        ")).toBe(5900);
  });

  it("handles comma-separated numbers", () => {
    expect(parseCurrencyCell("12,500")).toBe(12500);
  });

  it("returns null for empty/null values", () => {
    expect(parseCurrencyCell(null)).toBeNull();
    expect(parseCurrencyCell(undefined)).toBeNull();
    expect(parseCurrencyCell("")).toBeNull();
  });

  it("returns null for non-numeric text", () => {
    expect(parseCurrencyCell("abc")).toBeNull();
  });
});

describe("parseWidth", () => {
  it("parses plain numbers", () => {
    expect(parseWidth(100)).toBe(100);
  });

  it("parses Arabic width strings", () => {
    expect(parseWidth(" 100سم")).toBe(100);
    expect(parseWidth("90 سم")).toBe(90);
    expect(parseWidth(" 30سم")).toBe(30);
  });

  it("parses dimension strings (90*90)", () => {
    expect(parseWidth("90*90")).toBe(90);
    expect(parseWidth("60*60")).toBe(60);
  });

  it("returns null for empty values", () => {
    expect(parseWidth(null)).toBeNull();
    expect(parseWidth("")).toBeNull();
  });
});

describe("widthToTier", () => {
  it("maps widths to tiers", () => {
    expect(widthToTier(100)).toBe("wide");
    expect(widthToTier(90)).toBe("wide");
    expect(widthToTier(80)).toBe("standard");
    expect(widthToTier(60)).toBe("standard");
    expect(widthToTier(50)).toBe("narrow");
    expect(widthToTier(30)).toBe("narrow");
  });
});

describe("detectUnitType", () => {
  it("detects Arabic unit type labels", () => {
    expect(detectUnitType("الوحدات السفلية")).toBe("base");
    expect(detectUnitType("الوحدات العلوية")).toBe("upper");
    expect(detectUnitType("وحدات السحارات")).toBe("tall");
    expect(detectUnitType("ادراج")).toBe("drawer");
    expect(detectUnitType("زاوية مشطورة")).toBe("corner_diagonal");
    expect(detectUnitType("زاوية")).toBe("corner_diagonal");
    expect(detectUnitType("ركنة حرف L")).toBe("corner_l");
  });

  it("returns null for null/empty", () => {
    expect(detectUnitType(null)).toBeNull();
    expect(detectUnitType("")).toBeNull();
  });
});

// ── 3. Golden import test ───────────────────────────────────────────────────

describe("golden import — real workbook", () => {
  it("parses 186 prices from the April-2026 sheet", () => {
    expect(realResult.prices.length).toBe(186);
  });

  it("parses 13 add-ons", () => {
    expect(realResult.addons.length).toBe(13);
  });

  it("parses 5 coefficients", () => {
    expect(realResult.coefficients.length).toBe(5);
  });

  it("has zero conflicts on the real workbook", () => {
    expect(realResult.conflicts.length).toBe(0);
  });

  // Golden cell verification — exact match to spreadsheet values
  const goldenCells: {
    unitType: string;
    finishCode: FinishCode;
    widthCm: number;
    expected: number;
  }[] = [
    // Sheet1 row 0: HPL/PVC base 100cm
    { unitType: "base", finishCode: "HPL", widthCm: 100, expected: 7700 },
    // Sheet1 row 1: PVC base 100cm
    { unitType: "base", finishCode: "PVC", widthCm: 100, expected: 7800 },
    // Sheet1 row 4: EGGER/ALVIC base 30cm
    { unitType: "base", finishCode: "EGGER_ALVIC", widthCm: 30, expected: 3900 },
    // Sheet1 row 8: HPL upper 100cm
    { unitType: "upper", finishCode: "HPL", widthCm: 100, expected: 5900 },
    // Sheet1 row 12: EGGER/ALVIC upper 30cm
    { unitType: "upper", finishCode: "EGGER_ALVIC", widthCm: 30, expected: 3000 },
    // Лист1 row 4: EGGER/ALVIC base 100cm
    { unitType: "base", finishCode: "EGGER_ALVIC", widthCm: 100, expected: 9200 },
    // Лист1 row 8: HPL base 40cm
    { unitType: "base", finishCode: "HPL", widthCm: 40, expected: 4000 },
    // Sheet1 row 2: GLOSS_MAX base 80cm
    { unitType: "base", finishCode: "GLOSS_MAX", widthCm: 80, expected: 6900 },
    // Sheet1 row 3: POLYLAC base 60cm
    { unitType: "base", finishCode: "POLYLAC", widthCm: 60, expected: 6200 },
    // Sheet1 row 9: PVC upper 90cm
    { unitType: "upper", finishCode: "PVC", widthCm: 90, expected: 5600 },
  ];

  for (const gc of goldenCells) {
    it(`golden cell: ${gc.unitType}/${gc.finishCode}/${gc.widthCm}cm = ${gc.expected}`, () => {
      const rec = realResult.prices.find(
        (p) =>
          p.unitType === gc.unitType &&
          p.finishCode === gc.finishCode &&
          p.widthCm === gc.widthCm &&
          !p.isFixed,
      );
      expect(rec).toBeDefined();
      expect(rec!.price).toBe(gc.expected);
    });
  }

  it("all 5 finish codes present", () => {
    const codes = new Set(realResult.prices.map((p) => p.finishCode));
    expect(codes).toEqual(
      new Set(["HPL", "PVC", "GLOSS_MAX", "POLYLAC", "EGGER_ALVIC"]),
    );
  });

  it("all unit types present", () => {
    const types = new Set(realResult.prices.map((p) => p.unitType));
    expect(types).toEqual(
      new Set(["base", "upper", "tall", "drawer", "corner_diagonal", "corner_l"]),
    );
  });

  it("add-ons have correct prices", () => {
    const addonMap = new Map(realResult.addons.map((a) => [a.slug, a.price]));
    expect(addonMap.get("تجاليد_علوي")).toBe(500);
    expect(addonMap.get("تجاليد_سفلي")).toBe(800);
    expect(addonMap.get("تجاليد_دولاب")).toBe(2600);
    expect(addonMap.get("مطبقية_استانلس")).toBe(1500);
    expect(addonMap.get("تروللي_استانلس")).toBe(2500);
    expect(addonMap.get("سبت_خضار")).toBe(300);
    expect(addonMap.get("زجاج")).toBe(500);
    expect(addonMap.get("دراع_منطبق_بلوم")).toBe(6500);
    expect(addonMap.get("دولاب_استانلس")).toBe(12000);
    expect(addonMap.get("ليد_لايت")).toBe(300);
    expect(addonMap.get("نقل_ومشال")).toBe(2000);
    expect(addonMap.get("معاينة")).toBe(-1000);
  });

  it("coefficient values match known constants", () => {
    const coeffMap = new Map(
      realResult.coefficients.map((c) => [c.finishCode, c.coefficient]),
    );
    expect(coeffMap.get("HPL")).toBe(0.133);
    expect(coeffMap.get("PVC")).toBe(0.21);
    expect(coeffMap.get("GLOSS_MAX")).toBe(0.25);
    expect(coeffMap.get("POLYLAC")).toBe(0.133);
    expect(coeffMap.get("EGGER_ALVIC")).toBe(0.133);
  });
});

// ── 4. Edge cases ───────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("handles trailing spaces in finish headers", () => {
    const buf = makeSyntheticWorkbook();
    const result = parseRateCard(buf);
    // Should parse without errors and include GLOSS_MAX from "GLOSS MAX "
    const gmax = result.prices.filter((p) => p.finishCode === "GLOSS_MAX");
    expect(gmax.length).toBeGreaterThan(0);
  });

  it("handles text-with-currency cells", () => {
    expect(parseCurrencyCell("7200جنية")).toBe(7200);
    expect(parseCurrencyCell("5900جنية        ")).toBe(5900);
  });

  it("unknown finish in compound label returns null", () => {
    expect(normalizeFinish("خامة مجهولة تماما")).toBeNull();
  });

  it("empty workbook produces empty result", () => {
    const XLSX = require("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([[]]);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.utils.book_append_sheet(wb, ws, "Лист1");
    const buf = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    const result = parseRateCard(buf);
    expect(result.prices.length).toBe(0);
    expect(result.addons.length).toBe(0);
  });
});

// ── 5. Parser structure ─────────────────────────────────────────────────────

describe("parseRateCard structure", () => {
  it("returns ParseResult shape", () => {
    expect(realResult).toHaveProperty("prices");
    expect(realResult).toHaveProperty("addons");
    expect(realResult).toHaveProperty("coefficients");
    expect(realResult).toHaveProperty("conflicts");
    expect(Array.isArray(realResult.prices)).toBe(true);
    expect(Array.isArray(realResult.addons)).toBe(true);
    expect(Array.isArray(realResult.coefficients)).toBe(true);
    expect(Array.isArray(realResult.conflicts)).toBe(true);
  });

  it("each price record has required fields", () => {
    for (const rec of realResult.prices) {
      expect(rec).toHaveProperty("unitType");
      expect(rec).toHaveProperty("finishCode");
      expect(rec).toHaveProperty("widthTier");
      expect(rec).toHaveProperty("price");
      expect(rec).toHaveProperty("isFixed");
      expect(typeof rec.price).toBe("number");
      expect(rec.price).toBeGreaterThan(0);
    }
  });

  it("each addon record has required fields", () => {
    for (const a of realResult.addons) {
      expect(a).toHaveProperty("slug");
      expect(a).toHaveProperty("label");
      expect(a).toHaveProperty("price");
      expect(a).toHaveProperty("category");
      expect(["hardware", "accessory", "fee"]).toContain(a.category);
    }
  });

  it("deduplication keeps first occurrence", () => {
    // Лист1 and Sheet1 have identical prices for the same cells.
    // After dedup, each (unitType, finishCode, widthTier, widthCm) should appear once.
    const keys = realResult.prices.map(
      (p) => `${p.unitType}:${p.finishCode}:${p.widthTier}:${p.isFixed ? "fixed" : p.widthCm}`,
    );
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });
});
