#!/usr/bin/env npx tsx
/**
 * Shadow pricing comparison against real quotes.
 *
 * Connects to Supabase via the postgres pooler, finds all quotes with
 * status "sent" or "accepted", re-runs the v3 pricing engine on each,
 * and prints a summary table.
 *
 * Usage:
 *   npx tsx scripts/shadow-compare.ts [--tenant <id>] [--tolerance <egp>]
 */

import postgres from "postgres";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");

// ── Env ──────────────────────────────────────────────────────────────────────

function loadEnv() {
  try {
    const envPath = resolve(PROJECT_ROOT, ".env");
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env not found or unreadable — rely on env vars already set
  }
}

loadEnv();

const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!DATABASE_URL) {
  console.error("ERROR: Set DATABASE_URL or SUPABASE_DB_URL in .env or environment.");
  process.exit(1);
}

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let filterTenant: string | undefined;
let tolerance = 0.5; // default EGP
let includeAll = false; // include converted/draft quotes too

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--tenant" && args[i + 1]) filterTenant = args[++i];
  if (args[i] === "--tolerance" && args[i + 1]) tolerance = Number(args[++i]);
  if (args[i] === "--all") includeAll = true;
}

// ── DB connection ────────────────────────────────────────────────────────────

const sql = postgres(DATABASE_URL, { max: 5 });

// ── Types ────────────────────────────────────────────────────────────────────

interface QuoteRow {
  id: string;
  tenant_id: string;
  quote_number: string;
  total: number;
  status: string;
}

interface ProductRow {
  id: string;
  product_type_code: string;
  label: string | null;
  position: number;
}

interface SectionRow {
  id: string;
  quotation_product_id: string;
  position: number;
}

interface UnitRow {
  id: string;
  section_id: string;
  width_mm: number;
  height_mm: number;
  depth_mm: number;
  qty: number;
  override_factor_keys: Record<string, number> | null;
}

interface ComponentRow {
  id: string;
  unit_id: string;
  kind: string;
  catalog_id: string | null;
  qty: number;
  unit_of_measure: string;
}

// ── Pricing engine (inline reimplementation to avoid path-alias issues) ─────
//
// We import the pure pricing functions directly from the source files using
// dynamic import with the project's tsconfig paths resolved by tsx.
// If tsx cannot resolve the aliases, we fall back to a lightweight SQL-only
// approach that still gives meaningful results.

type QuoteInput = any;
type CatalogLookup = any;

async function importEngine() {
  // tsx resolves @/* via tsconfig paths when running from the project root.
  try {
    const engine = await import(resolve(PROJECT_ROOT, "src/lib/pricing/engine-v3.ts"));
    return engine;
  } catch {
    return null;
  }
}

// ── Data loaders (SQL) ──────────────────────────────────────────────────────

async function loadQuotes(tenantId?: string, all = false): Promise<QuoteRow[]> {
  const statuses = all
    ? ["draft", "sent", "accepted", "rejected", "expired", "converted"]
    : ["sent", "accepted"];

  if (tenantId) {
    return sql`
      SELECT id, tenant_id, quote_number, total::float AS total, status
      FROM quotes
      WHERE status = ANY(${statuses})
        AND tenant_id = ${tenantId}
      ORDER BY created_at DESC
    `;
  }
  return sql`
    SELECT id, tenant_id, quote_number, total::float AS total, status
    FROM quotes
    WHERE status = ANY(${statuses})
    ORDER BY created_at DESC
  `;
}

async function loadHierarchy(quotationId: string, tenantId: string) {
  const products = await sql`
    SELECT id, product_type_code, label, position
    FROM quotation_products
    WHERE quotation_id = ${quotationId} AND tenant_id = ${tenantId}
    ORDER BY position
  `;
  if (products.length === 0) return null;

  const productIds = products.map((p: ProductRow) => p.id);

  const sections = await sql`
    SELECT id, quotation_product_id, position
    FROM sections
    WHERE quotation_product_id = ANY(${productIds})
      AND tenant_id = ${tenantId}
    ORDER BY position
  `;
  const sectionIds = sections.map((s: SectionRow) => s.id);

  const units = sectionIds.length > 0
    ? await sql`
        SELECT id, section_id, width_mm, height_mm, depth_mm, qty,
               COALESCE(override_factor_keys, '{}')::jsonb AS override_factor_keys
        FROM units
        WHERE section_id = ANY(${sectionIds})
          AND tenant_id = ${tenantId}
      `
    : [];

  const unitIds = units.map((u: UnitRow) => u.id);

  const components = unitIds.length > 0
    ? await sql`
        SELECT id, unit_id, kind, catalog_id, qty, unit_of_measure
        FROM components
        WHERE unit_id = ANY(${unitIds})
          AND tenant_id = ${tenantId}
      `
    : [];

  return { products, sections, units, components };
}

async function loadCatalog(tenantId: string): Promise<CatalogLookup> {
  const [materials, hardware, accessories, mfgOps, factors, wastage, fees] =
    await Promise.all([
      sql`SELECT id, pricing_unit, price_per_unit::float AS price_per_unit,
                 COALESCE(default_wastage_pct, 0)::float AS default_wastage_pct
          FROM catalog_materials
          WHERE tenant_id = ${tenantId} AND archived_at IS NULL`,
      sql`SELECT id, price_per_piece::float AS price_per_piece
          FROM catalog_hardware
          WHERE tenant_id = ${tenantId} AND archived_at IS NULL`,
      sql`SELECT id, price_per_piece::float AS price_per_piece
          FROM catalog_accessories
          WHERE tenant_id = ${tenantId} AND archived_at IS NULL`,
      sql`SELECT id, rate_unit, rate::float AS rate
          FROM catalog_manufacturing_operations
          WHERE tenant_id = ${tenantId} AND archived_at IS NULL`,
      sql`SELECT factor_key, percent::float AS percent
          FROM tenant_pricing_factors
          WHERE tenant_id = ${tenantId} AND archived_at IS NULL`,
      sql`SELECT scope, ref, pct::float AS pct
          FROM tenant_wastage_rules
          WHERE tenant_id = ${tenantId} AND archived_at IS NULL`,
      sql`SELECT code, sign, amount::float AS amount, formula_key
          FROM fees_credits
          WHERE tenant_id = ${tenantId} AND archived_at IS NULL`,
    ]);

  return {
    materials: Object.fromEntries(
      materials.map((m: any) => [
        m.id,
        {
          id: m.id,
          pricingUnit: m.pricing_unit,
          pricePerUnit: m.price_per_unit,
          defaultWastagePct: m.default_wastage_pct,
        },
      ]),
    ),
    hardware: Object.fromEntries(
      hardware.map((h: any) => [h.id, { id: h.id, pricePerPiece: h.price_per_piece }]),
    ),
    accessories: Object.fromEntries(
      accessories.map((a: any) => [a.id, { id: a.id, pricePerPiece: a.price_per_piece }]),
    ),
    manufacturingOps: Object.fromEntries(
      mfgOps.map((o: any) => [o.id, { id: o.id, rateUnit: o.rate_unit, rate: o.rate }]),
    ),
    pricingFactors: factors.map((f: any) => ({
      factorKey: f.factor_key,
      percent: f.percent,
    })),
    wastageRules: wastage.map((w: any) => ({
      scope: w.scope,
      ref: w.ref,
      pct: w.pct,
    })),
    feesCredits: fees.map((fc: any) => ({
      code: fc.code,
      sign: fc.sign as "plus" | "minus",
      amount: fc.amount,
      formulaKey: fc.formula_key,
    })),
  };
}

// ── Build QuoteInput tree from raw DB rows ──────────────────────────────────

function buildTree(
  products: ProductRow[],
  sections: SectionRow[],
  units: UnitRow[],
  components: ComponentRow[],
): QuoteInput {
  const compByUnit = new Map<string, ComponentRow[]>();
  for (const c of components) {
    const list = compByUnit.get(c.unit_id) ?? [];
    list.push(c);
    compByUnit.set(c.unit_id, list);
  }

  return {
    products: products.map((p) => ({
      id: p.id,
      sections: sections
        .filter((s) => s.quotation_product_id === p.id)
        .sort((a, b) => a.position - b.position)
        .map((s) => ({
          id: s.id,
          units: units
            .filter((u) => u.section_id === s.id)
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((u) => ({
              id: u.id,
              unitTypeId: null,
              widthMm: u.width_mm,
              heightMm: u.height_mm,
              depthMm: u.depth_mm,
              qty: u.qty,
              overrideFactorKeys: (u.override_factor_keys as Record<string, number>) ?? {},
              components: (compByUnit.get(u.id) ?? []).map((c) => ({
                id: c.id,
                kind: c.kind as "material" | "hardware" | "accessory" | "manufacturing" | "edge_band",
                catalogId: c.catalog_id,
                qty: Number(c.qty),
                unitOfMeasure: c.unit_of_measure,
              })),
            })),
        })),
    })),
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

interface Result {
  quoteNumber: string;
  tenantId: string;
  status: string;
  legacyTotal: number;
  v3Total: number | null;
  diff: number | null;
  withinTolerance: boolean;
  error?: string;
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║        Pricing Shadow Comparison — Real Quotes             ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log();

  // Try to import the v3 engine
  const engine = await importEngine();
  if (!engine) {
    console.error("ERROR: Could not import engine-v3. Run from the project root:");
    console.error("  cd price-produce-beam-main && npx tsx scripts/shadow-compare.ts");
    process.exit(1);
  }
  const { priceQuote } = engine;

  const quotes = await loadQuotes(filterTenant, includeAll);
  const statusFilter = includeAll ? "all statuses" : "sent/accepted";
  console.log(`Found ${quotes.length} quotes (${statusFilter}).`);
  if (filterTenant) console.log(`  Filtered to tenant: ${filterTenant}`);
  console.log(`  Tolerance: ${tolerance} EGP`);
  console.log();

  if (quotes.length === 0) {
    console.log("No quotes to compare.");
    await sql.end();
    return;
  }

  const results: Result[] = [];
  let processed = 0;

  for (const quote of quotes) {
    processed++;
    const label = `[${processed}/${quotes.length}] ${quote.quote_number}`;

    try {
      const hierarchy = await loadHierarchy(quote.id, quote.tenant_id);
      if (!hierarchy || hierarchy.products.length === 0) {
        results.push({
          quoteNumber: quote.quote_number,
          tenantId: quote.tenant_id.slice(0, 8),
          status: quote.status,
          legacyTotal: quote.total,
          v3Total: null,
          diff: null,
          withinTolerance: false,
          error: "No hierarchy data",
        });
        console.log(`  ${label} — SKIP (no hierarchy)`);
        continue;
      }

      const catalog = await loadCatalog(quote.tenant_id);
      const tree = buildTree(
        hierarchy.products,
        hierarchy.sections,
        hierarchy.units,
        hierarchy.components,
      );

      // Attach discount from quote snapshot if present
      // (the engine expects it on the QuoteInput)

      const result = priceQuote(tree, catalog);
      const v3Total = Number(result.computedPrice);
      const diff = Math.abs(quote.total - v3Total);
      const within = diff <= tolerance;

      results.push({
        quoteNumber: quote.quote_number,
        tenantId: quote.tenant_id.slice(0, 8),
        status: quote.status,
        legacyTotal: quote.total,
        v3Total,
        diff,
        withinTolerance: within,
      });

      const icon = within ? "✓" : "✗";
      console.log(
        `  ${label} — legacy=${quote.total.toFixed(2)} v3=${v3Total.toFixed(2)} diff=${diff.toFixed(2)} [${icon}]`,
      );
    } catch (e: any) {
      results.push({
        quoteNumber: quote.quote_number,
        tenantId: quote.tenant_id.slice(0, 8),
        status: quote.status,
        legacyTotal: quote.total,
        v3Total: null,
        diff: null,
        withinTolerance: false,
        error: e.message ?? String(e),
      });
      console.log(`  ${label} — ERROR: ${e.message ?? e}`);
    }
  }

  // ── Summary table ────────────────────────────────────────────────────────

  console.log();
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("  SUMMARY TABLE");
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log();

  const header = [
    "Quote #".padEnd(22),
    "Status".padEnd(10),
    "Legacy".padStart(14),
    "V3".padStart(14),
    "Diff".padStart(12),
    "OK?".padStart(5),
  ];
  console.log(header.join("  "));
  console.log(header.map((h) => "─".repeat(h.length)).join("  "));

  let withinCount = 0;
  let outsideCount = 0;
  let errorCount = 0;

  for (const r of results) {
    if (r.error) {
      errorCount++;
      const row = [
        r.quoteNumber.padEnd(22),
        r.status.padEnd(10),
        r.legacyTotal.toFixed(2).padStart(14),
        "ERR".padStart(14),
        (r.error.length > 10 ? r.error.slice(0, 10) + "…" : r.error).padStart(12),
        "—".padStart(5),
      ];
      console.log(row.join("  "));
    } else if (r.withinTolerance) {
      withinCount++;
      const row = [
        r.quoteNumber.padEnd(22),
        r.status.padEnd(10),
        r.legacyTotal.toFixed(2).padStart(14),
        r.v3Total!.toFixed(2).padStart(14),
        r.diff!.toFixed(2).padStart(12),
        "✓".padStart(5),
      ];
      console.log(row.join("  "));
    } else {
      outsideCount++;
      const row = [
        r.quoteNumber.padEnd(22),
        r.status.padEnd(10),
        r.legacyTotal.toFixed(2).padStart(14),
        r.v3Total!.toFixed(2).padStart(14),
        r.diff!.toFixed(2).padStart(12),
        "✗".padStart(5),
      ];
      console.log(row.join("  "));
    }
  }

  console.log();
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log(`  Total: ${results.length} | Within tolerance: ${withinCount} | Outside: ${outsideCount} | Errors: ${errorCount}`);
  if (results.length > 0) {
    const matchRate = ((withinCount / (results.length - errorCount)) * 100).toFixed(1);
    console.log(`  Match rate: ${matchRate}% (${withinCount}/${results.length - errorCount} comparable)`);
  }
  console.log("═══════════════════════════════════════════════════════════════════");

  await sql.end();
}

main().catch((e) => {
  console.error("Fatal:", e);
  sql.end();
  process.exit(1);
});
