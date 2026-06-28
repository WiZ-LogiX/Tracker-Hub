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
] as const;

export type FactorKey = (typeof FACTOR_ORDER)[number];

/** Egyptian VAT rate — 14%. */
export const VAT_RATE = 0.14;

// ── Per-unit factor application ──────────────────────────────────────────────

export interface PricingFactor {
  factorKey: string;
  percent: number;
}

export interface UnitFactorLine {
  factorKey: string;
  percent: number;
  amount: number;
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
 *   1. Look up the tenant percent from `tenantFactors` (by factorKey).
 *   2. If the unit has an override for this key, use the override instead.
 *   3. Compute amount = baseCost × (percent / 100).
 *   4. Add amount to running price.
 *
 * Factors not present in either tenantFactors or overrides are skipped (0%).
 * The order is ALWAYS the same — input order is irrelevant.
 */
export function applyUnitFactors(
  baseCost: number,
  tenantFactors: PricingFactor[],
  overrideFactorKeys?: Record<string, number>,
): UnitFactorResult {
  // Build tenant factor map (key → percent)
  const tenantMap = new Map<string, number>();
  for (const f of tenantFactors) {
    tenantMap.set(f.factorKey, f.percent);
  }

  let runningPrice = baseCost;
  const lines: UnitFactorLine[] = [];

  for (const key of FACTOR_ORDER) {
    // Resolve percent: override wins over tenant factor
    const overridePct = overrideFactorKeys?.[key];
    const pct = overridePct ?? tenantMap.get(key) ?? 0;

    if (pct === 0) continue;

    // Each factor is a percentage of the base cost (additive, not compounding).
    // Order is locked for audit trail; math is commutative but the sequence
    // in the breakdown is always the same.
    const amount = round2(baseCost * (pct / 100));
    if (amount === 0) continue;

    runningPrice += amount;
    lines.push({ factorKey: key, percent: pct, amount });
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
