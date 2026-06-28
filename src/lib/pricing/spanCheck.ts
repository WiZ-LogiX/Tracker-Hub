/**
 * Shelf span-check — validates deflection against acceptable limits.
 *
 * Pure — no DB, no side effects.
 *
 * Reference: furniture-interior-design-consultant/references/structural-span-tables.md
 *
 * Acceptable deflection: L/200, ideally <= 3 mm.
 * Beyond L/150 sag becomes obviously visible.
 *
 * Supported materials (18 mm default thickness):
 *   particle_board / MFC: 600-700 mm max span
 *   MDF:                  600-750 mm max span
 *   plywood:              750-900 mm max span
 *   solid_hardwood:       ~900 mm max span
 *   glass_6mm:            400-500 mm (light load)
 *   glass_8mm:            600-700 mm (light load)
 *   glass_10mm:           ~800 mm (light load)
 *
 * Deflection formula (simply supported, uniform load):
 *   δ = 5 × w × L⁴ / (384 × E × I)
 *   I = b × h³ / 12
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type ShelfMaterial =
  | "particle_board"
  | "mdf"
  | "plywood"
  | "solid_hardwood"
  | "glass_6mm"
  | "glass_8mm"
  | "glass_10mm";

export interface SpanCheckInput {
  /** Shelf span in mm (unsupported clear span between supports). */
  spanMm: number;
  /** Shelf width in mm (front-to-back depth). */
  widthMm: number;
  /** Shelf thickness in mm. Default: 18. */
  thicknessMm?: number;
  /** Material type. Default: "particle_board". */
  material?: ShelfMaterial;
  /** Load per unit length in N/mm. Default: 0.214 (≈15 kg over 700 mm). */
  loadNPerMm?: number;
}

export interface SpanCheckResult {
  /** Computed mid-span deflection in mm. */
  deflectionMm: number;
  /** Maximum acceptable deflection (L/200) in mm. */
  maxDeflectionMm: number;
  /** Whether deflection is within acceptable limits. */
  ok: boolean;
  /** Severity: "ok" | "warning" | "fail". */
  severity: "ok" | "warning" | "fail";
  /** Human-readable message key for i18n. */
  messageKey: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Modulus of elasticity E in N/mm² (MPa). */
const E_MODULUS: Record<ShelfMaterial, number> = {
  particle_board: 2750,   // midpoint of 2500-3000
  mdf: 3350,              // midpoint of 3000-3700
  plywood: 8500,          // midpoint of 7000-10000
  solid_hardwood: 12000,  // midpoint of 10000-14000
  glass_6mm: 70000,
  glass_8mm: 70000,
  glass_10mm: 70000,
};

/** Max practical span in mm for 18 mm thickness (medium-heavy load). */
const MAX_SPAN_MM: Record<ShelfMaterial, number> = {
  particle_board: 650,
  mdf: 675,
  plywood: 825,
  solid_hardwood: 900,
  glass_6mm: 450,
  glass_8mm: 650,
  glass_10mm: 800,
};

/** Default load: ~15 kg spread over 700 mm = 0.214 N/mm. */
const DEFAULT_LOAD = 150 / 700;

// ── Pure functions ─────────────────────────────────────────────────────────

/**
 * Compute second moment of area for a rectangular section.
 * I = b × h³ / 12  (mm⁴)
 */
function secondMomentOfArea(widthMm: number, thicknessMm: number): number {
  return (widthMm * Math.pow(thicknessMm, 3)) / 12;
}

/**
 * Compute mid-span deflection for a simply supported shelf under uniform load.
 * δ = 5 × w × L⁴ / (384 × E × I)
 */
function computeDeflection(
  spanMm: number,
  widthMm: number,
  thicknessMm: number,
  eModulus: number,
  loadNPerMm: number,
): number {
  const I = secondMomentOfArea(widthMm, thicknessMm);
  if (I === 0 || eModulus === 0) return Infinity;
  return (5 * loadNPerMm * Math.pow(spanMm, 4)) / (384 * eModulus * I);
}

/**
 * Check shelf deflection against acceptable limits.
 *
 * @returns SpanCheckResult with deflection, ok flag, and severity.
 */
export function checkShelfSpan(input: SpanCheckInput): SpanCheckResult {
  const {
    spanMm,
    widthMm,
    thicknessMm = 18,
    material = "particle_board",
    loadNPerMm = DEFAULT_LOAD,
  } = input;

  const E = E_MODULUS[material] ?? E_MODULUS.particle_board;
  const deflection = computeDeflection(spanMm, widthMm, thicknessMm, E, loadNPerMm);
  const maxDeflection = spanMm / 200;

  const ok = deflection <= maxDeflection && deflection <= 3;
  const warningThreshold = spanMm / 150;

  let severity: SpanCheckResult["severity"];
  let messageKey: string;

  if (deflection <= maxDeflection && deflection <= 3) {
    severity = "ok";
    messageKey = "spanCheck.ok";
  } else if (deflection <= warningThreshold) {
    severity = "warning";
    messageKey = "spanCheck.warning";
  } else {
    severity = "fail";
    messageKey = "spanCheck.fail";
  }

  return {
    deflectionMm: Math.round(deflection * 100) / 100,
    maxDeflectionMm: Math.round(maxDeflection * 100) / 100,
    ok,
    severity,
    messageKey,
  };
}

/**
 * Get the recommended max span for a given material at default thickness.
 * Useful for UI hints.
 */
export function getMaxSpanMm(material: ShelfMaterial = "particle_board"): number {
  return MAX_SPAN_MM[material] ?? MAX_SPAN_MM.particle_board;
}

/**
 * List all supported shelf materials.
 */
export function listShelfMaterials(): ShelfMaterial[] {
  return Object.keys(MAX_SPAN_MM) as ShelfMaterial[];
}
