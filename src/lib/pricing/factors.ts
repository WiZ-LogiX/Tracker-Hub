/**
 * Pricing factors — locked factor order, discount, VAT, and signed fees/credits.
 *
 * All functions are pure — no DB, no side effects.
 * All monetary outputs go through round2().
 *
 * Factor order is INVARIANT regardless of input order:
 *   subtotal → labor → overhead → complexity → rush → margin → luxury → packaging
 *
 * Per-unit: each factor reads from tenant pricing_factors,
 *           overridable per-unit via override_factor_keys.
 *
 * Quote roll-up:
 *   subTotal    = sum(product.computedPrice)
 *   discount    = min(discountAmount, subTotal)  — clamped, never negative
 *   vatBase     = subTotal - discount
 *   vatAmount   = vatBase × 0.14
 *   feesTotal   = Σ signed(fees_credits)
 *   total       = vatBase + vatAmount + feesTotal
 */

import { round2 } from "./engine-v3";

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Locked factor order — invariant regardless of input.
 *
 * "packaging" covers box, foam, edge protectors, and wrap.
 * It is the last per-unit factor before quote-level roll-up.
 */
export const FACTOR_ORDER = [
  "subtotal",
  "labor",
  "overhead",
  "complexity",
  "rush",
  "margin",
  "luxury",
  "packaging",
  "site_visit",
  "transport",
] as const;

export type FactorKey = (typeof FACTOR_ORDER)[number];

/** Egyptian VAT rate — 14%. */
export const VAT_RATE = 0.14;

// ── Per-unit factor application ──────────────────────────────────────────────

export interface PricingFactor {
  factorKey: string;
  percent: number;
  /** "percent" = baseCost × (percent/100), "fixed" = flat EGP amount added. */
  valueType?: "percent" | "fixed";
  /** Fixed EGP amount (used when valueType = "fixed"). */
  fixedAmount?: number;
}

export interface UnitFactorLine {
  factorKey: string;
  percent: number;
  amount: number;
  /** How this line was computed. */
  valueType: "percent" | "fixed";
}

export interface UnitFactorResult {
  /** Raw component cost before any factors. */
  baseCost: number;
  /** Final price after all factors applied in locked order. */
  finalPrice: number;
  /** Per-factor breakdown lines (only non-zero). */
  lines: UnitFactorLine[];
}

/**
 * Apply pricing factors to a unit's base cost in locked order.
 *
 * For each factor in FACTOR_ORDER:
 *   1. Look up the tenant factor from `tenantFactors` (by factorKey).
 *   2. If the unit has an override for this key, use the override as a percent.
 *   3. Compute amount based on valueType:
 *      - "percent": baseCost × (percent / 100)
 *      - "fixed":   fixedAmount (flat EGP)
 *   4. Add amount to running price.
 *
 * Factors not present in either tenantFactors or overrides are skipped (0% / 0 EGP).
 * The order is ALWAYS the same — input order is irrelevant.
 */
export function applyUnitFactors(
  baseCost: number,
  tenantFactors: PricingFactor[],
  overrideFactorKeys?: Record<string, number>,
): UnitFactorResult {
  // Build tenant factor map (key → factor)
  const tenantMap = new Map<string, PricingFactor>();
  for (const f of tenantFactors) {
    tenantMap.set(f.factorKey, f);
  }

  let runningPrice = baseCost;
  const lines: UnitFactorLine[] = [];

  for (const key of FACTOR_ORDER) {
    const tenant = tenantMap.get(key);
    const hasOverride = overrideFactorKeys !== undefined && key in overrideFactorKeys;
    const overridePct = overrideFactorKeys?.[key];

    // Resolve effective factor
    let valueType: "percent" | "fixed" = tenant?.valueType ?? "percent";
    let percent = 0;
    let fixedAmount = 0;

    if (hasOverride) {
      if (overridePct === 0) continue; // explicit 0 override = skip factor
      // Override always treated as percent (overrides the tenant percent)
      valueType = "percent";
      percent = overridePct!;
    } else if (tenant) {
      percent = tenant.percent;
      fixedAmount = tenant.fixedAmount ?? 0;
    }

    // Compute amount
    let amount: number;
    if (valueType === "fixed") {
      amount = round2(fixedAmount);
    } else {
      amount = round2(baseCost * (percent / 100));
    }

    if (amount === 0) continue;

    runningPrice += amount;
    lines.push({ factorKey: key, percent, amount, valueType });
  }

  return {
    baseCost,
    finalPrice: round2(runningPrice),
    lines,
  };
}

// ── Discount ─────────────────────────────────────────────────────────────────

export interface DiscountInput {
  /** Discount amount from the quotation (absolute value). */
  amount: number;
  /** Maximum discount allowed (from discount code or policy). null = no cap. */
  maxValue: number | null;
}

export interface DiscountResult {
  /** Effective discount applied (clamped to subTotal). */
  applied: number;
  /** Whether the discount was clamped. */
  clamped: boolean;
}

/**
 * Compute effective discount, clamped to subTotal (no negative base).
 */
export function applyDiscount(subTotal: number, discount: DiscountInput): DiscountResult {
  if (discount.amount <= 0) {
    return { applied: 0, clamped: false };
  }

  let effective = discount.amount;

  // Cap by maxValue if set
  if (discount.maxValue !== null && discount.maxValue !== undefined) {
    effective = Math.min(effective, discount.maxValue);
  }

  // Clamp to subTotal — never allow negative base
  const clamped = effective > subTotal;
  effective = clamped ? subTotal : effective;

  return { applied: round2(effective), clamped };
}

// ── Quote-level breakdown ────────────────────────────────────────────────────

export interface FeesCreditEntry {
  code: string;
  sign: "plus" | "minus";
  amount: number | null;
  formulaKey: string | null;
}

export interface QuoteBreakdown {
  /** Sum of all product prices (before factors at quote level). */
  subTotal: number;
  /** Effective discount applied. */
  discount: number;
  /** VAT base = subTotal - discount. */
  vatBase: number;
  /** VAT amount = vatBase × 0.14. */
  vatAmount: number;
  /** Signed sum of all fees and credits. */
  feesCreditsTotal: number;
  /** Grand total = vatBase + vatAmount + feesCreditsTotal. */
  total: number;
  /** Per-fee/credit breakdown lines. */
  feesCreditsLines: Array<{
    code: string;
    sign: "plus" | "minus";
    amount: number;
    signedAmount: number;
  }>;
}

/**
 * Compute the full quotation-level breakdown with audit trail.
 *
 * Order of operations:
 *   1. subTotal = Σ product.computedPrice
 *   2. discount = clamp(discountAmount, 0, subTotal)
 *   3. vatBase = subTotal - discount
 *   4. vatAmount = vatBase × VAT_RATE
 *   5. feesCreditsTotal = Σ signed(amount)
 *   6. total = vatBase + vatAmount + feesCreditsTotal
 */
export function computeQuoteBreakdown(
  subTotal: number,
  discount: DiscountInput,
  feesCredits: FeesCreditEntry[],
): QuoteBreakdown {
  const { applied: discountApplied } = applyDiscount(subTotal, discount);

  const vatBase = round2(subTotal - discountApplied);
  const vatAmount = round2(vatBase * VAT_RATE);

  // Process fees/credits — signed, amount=0 is valid (not an error)
  const feesCreditsLines: QuoteBreakdown["feesCreditsLines"] = [];
  let feesCreditsTotal = 0;

  for (const fc of feesCredits) {
    const amount = fc.amount ?? 0;
    const signedAmount = round2(fc.sign === "plus" ? amount : -amount);
    feesCreditsTotal += signedAmount;

    feesCreditsLines.push({
      code: fc.code,
      sign: fc.sign,
      amount: round2(amount),
      signedAmount,
    });
  }

  feesCreditsTotal = round2(feesCreditsTotal);

  const total = round2(vatBase + vatAmount + feesCreditsTotal);

  return {
    subTotal: round2(subTotal),
    discount: discountApplied,
    vatBase,
    vatAmount,
    feesCreditsTotal,
    total,
    feesCreditsLines,
  };
}
