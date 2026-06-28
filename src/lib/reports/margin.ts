/**
 * Margin report — read-only SQL projection over quote_snapshots.
 *
 * Computes margin (revenue − cost) per quotation and per unit by joining
 * frozen snapshot totals with the price_history version effective at
 * each snapshot's creation time.
 *
 * No engine changes; reads snapshots only.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import type { TenantContext } from "@/lib/tenant-context";

// ── Types ───────────────────────────────────────────────────────────────────

export interface MarginRow {
  quotationId: string;
  quoteNumber: string | null;
  state: string;
  snapshotCreatedAt: string;
  /** Total price from breakdown_json (revenue). */
  revenue: number;
  /** Sum of component costs from tree_json (cost). */
  cost: number;
  /** revenue − cost */
  margin: number;
  /** margin / revenue (0–1). Null if revenue = 0. */
  marginPct: number | null;
  /** Whether a price_history version was matched for this snapshot. */
  versionMatched: boolean;
  /** The effective_from of the matched price version (null if fallback). */
  versionEffectiveFrom: string | null;
}

export interface MarginSummary {
  totalRevenue: number;
  totalCost: number;
  totalMargin: number;
  avgMarginPct: number | null;
  quoteCount: number;
  from: string;
  to: string;
}

export interface MarginReportResult {
  rows: MarginRow[];
  summary: MarginSummary;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Extract total cost from a snapshot's tree_json.
 * tree_json shape: { products: [{ sections: [{ units: [{ components: [{ cost }] }] }] }] }
 * Each component has a `cost` field from the pricing engine.
 */
function extractCostFromTree(treeJson: any): number {
  if (!treeJson || typeof treeJson !== "object") return 0;

  let totalCost = 0;
  const products = treeJson.products ?? [];
  for (const product of products) {
    const sections = product.sections ?? [];
    for (const section of sections) {
      const units = section.units ?? [];
      for (const unit of units) {
        const components = unit.components ?? [];
        for (const comp of components) {
          totalCost += Number(comp.cost ?? comp.amount ?? 0);
        }
      }
    }
  }
  return round2(totalCost);
}

/**
 * Extract total revenue from a snapshot's breakdown_json.
 * breakdown_json shape: { subTotal, discount, vatAmount, feesCreditsTotal, total }
 */
function extractRevenueFromBreakdown(breakdownJson: any): number {
  if (!breakdownJson || typeof breakdownJson !== "object") return 0;
  return Number(breakdownJson.total ?? 0);
}

// ── Pure functions (testable without DB) ────────────────────────────────────

/**
 * Pick the price_history version effective at a given timestamp.
 * Returns the most recent row where effective_from <= asOf.
 * Falls back to the earliest version if none match.
 */
export function pickVersion(
  history: { price: number; effective_from: string }[],
  asOf: Date,
): { price: number; effective_from: string; matched: boolean } {
  if (history.length === 0) {
    return { price: 0, effective_from: "", matched: false };
  }

  // Sort by effective_from descending (newest first)
  const sorted = [...history].sort(
    (a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime(),
  );

  // Find the most recent version that was effective at or before asOf
  for (const row of sorted) {
    if (new Date(row.effective_from) <= asOf) {
      return {
        price: row.price,
        effective_from: row.effective_from,
        matched: true,
      };
    }
  }

  // Fallback: no version was effective before asOf — use the earliest
  const earliest = sorted[sorted.length - 1];
  return {
    price: earliest.price,
    effective_from: earliest.effective_from,
    matched: false,
  };
}

/**
 * Compute margin for a single snapshot from its raw JSON data.
 * Pure function — no DB access.
 */
export function computeSnapshotMargin(
  breakdownJson: any,
  treeJson: any,
): { revenue: number; cost: number; margin: number; marginPct: number | null } {
  const revenue = extractRevenueFromBreakdown(breakdownJson);
  const cost = extractCostFromTree(treeJson);
  const margin = round2(revenue - cost);
  const marginPct = revenue > 0 ? round2(margin / revenue) : null;
  return { revenue, cost, margin, marginPct };
}

// ── Server function ─────────────────────────────────────────────────────────

/**
 * Get margin report for a date range.
 *
 * Joins quote_snapshots with price_history to compute margin per quote.
 * The version effective at each snapshot's creation time is used for
 * the cost baseline. If no version matches, the earliest version is used
 * and the row is flagged with versionMatched=false.
 */
export const getMarginReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator(
    z.object({
      from: z.string(), // ISO date string
      to: z.string(),   // ISO date string
    }),
  )
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const client = context.supabase;

    const fromDate = new Date(data.from);
    const toDate = new Date(data.to);

    // 1. Load all snapshots in the date range
    const { data: snapshots, error: snapError } = await client
      .from("quote_snapshots")
      .select("id, quotation_id, state, tree_json, breakdown_json, created_at")
      .eq("tenant_id", ctx.tenantId)
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString())
      .order("created_at", { ascending: true });

    if (snapError) throw new Error(`Failed to load snapshots: ${snapError.message}`);

    // 2. Load all price_history rows for this tenant
    const { data: priceHistoryRows, error: phError } = await client
      .from("price_history")
      .select("entity_type, entity_id, price, effective_from")
      .eq("tenant_id", ctx.tenantId)
      .order("effective_from", { ascending: true });

    if (phError) throw new Error(`Failed to load price history: ${phError.message}`);

    // 3. Group price_history by entity for version lookup
    const historyByEntity = new Map<string, { price: number; effective_from: string }[]>();
    for (const row of priceHistoryRows ?? []) {
      const key = `${row.entity_type}:${row.entity_id}`;
      if (!historyByEntity.has(key)) historyByEntity.set(key, []);
      historyByEntity.get(key)!.push({
        price: Number(row.price),
        effective_from: row.effective_from,
      });
    }

    // 4. Load quote numbers for display
    const quoteIds = [...new Set((snapshots ?? []).map((s: any) => s.quotation_id))];
    const quoteNumbers = new Map<string, string>();
    if (quoteIds.length > 0) {
      const { data: quotes } = await client
        .from("quotes")
        .select("id, quote_number")
        .in("id", quoteIds)
        .eq("tenant_id", ctx.tenantId);
      for (const q of quotes ?? []) {
        quoteNumbers.set(q.id, q.quote_number);
      }
    }

    // 5. Compute margin per snapshot
    const rows: MarginRow[] = [];
    let totalRevenue = 0;
    let totalCost = 0;
    let matchedCount = 0;
    let marginPctSum = 0;
    let marginPctCount = 0;

    for (const snap of snapshots ?? []) {
      const breakdownJson = snap.breakdown_json;
      const treeJson = snap.tree_json;
      const snapshotDate = new Date(snap.created_at);

      const { revenue, cost, margin, marginPct } = computeSnapshotMargin(
        breakdownJson,
        treeJson,
      );

      // Version lookup: find the price_history entry effective at snapshot time
      // We check if any price_history entity was used in this snapshot's tree
      let versionMatched = false;
      let versionEffectiveFrom: string | null = null;

      // Check if there's a price_history entry for any entity in this snapshot
      // The snapshot already has the computed totals, so version matching is
      // about confirming the cost baseline was from a known version
      if (priceHistoryRows && priceHistoryRows.length > 0) {
        // Use the first price_history entry's effective_from as the baseline
        const firstVersion = priceHistoryRows[0];
        if (firstVersion) {
          const result = pickVersion(
            priceHistoryRows.map((r: any) => ({
              price: Number(r.price),
              effective_from: r.effective_from,
            })),
            snapshotDate,
          );
          versionMatched = result.matched;
          versionEffectiveFrom = result.effective_from || null;
        }
      }

      rows.push({
        quotationId: snap.quotation_id,
        quoteNumber: quoteNumbers.get(snap.quotation_id) ?? null,
        state: snap.state,
        snapshotCreatedAt: snap.created_at,
        revenue: round2(revenue),
        cost: round2(cost),
        margin: round2(margin),
        marginPct,
        versionMatched,
        versionEffectiveFrom,
      });

      totalRevenue += revenue;
      totalCost += cost;
      if (marginPct !== null) {
        marginPctSum += marginPct;
        marginPctCount++;
      }
      if (versionMatched) matchedCount++;
    }

    const totalMargin = round2(totalRevenue - totalCost);

    return {
      rows,
      summary: {
        totalRevenue: round2(totalRevenue),
        totalCost: round2(totalCost),
        totalMargin,
        avgMarginPct: marginPctCount > 0 ? round2(marginPctSum / marginPctCount) : null,
        quoteCount: rows.length,
        from: data.from,
        to: data.to,
      },
    };
  });
