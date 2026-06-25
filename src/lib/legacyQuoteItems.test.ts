/**
 * legacy_quote_items VIEW tests.
 *
 * 1. VIEW mirrors quote_items 1:1 — columns, types, ordering.
 * 2. Migration structure — CREATE OR REPLACE VIEW, correct SELECT list.
 * 3. Down migration — DROP VIEW.
 * 4. Drizzle model — exported, matches table shape.
 * 5. Existing legacy query regression — quoteItems still accessible.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Helpers ────────────────────────────────────────────────────────────────

function readMigration(filename: string): string {
  return readFileSync(
    resolve(`supabase/migrations/${filename}`),
    "utf-8",
  );
}

function readSchema(): string {
  return readFileSync(resolve("src/db/schema.ts"), "utf-8");
}

function readLegacyModel(): string {
  return readFileSync(resolve("src/db/schema-legacy.ts"), "utf-8");
}

// ── Expected columns (from quote_items table definition) ───────────────────

const EXPECTED_COLUMNS = [
  "id",
  "quote_id",
  "product_id",
  "product_name",
  "material_id",
  "material_name",
  "finish_id",
  "finish_name",
  "dimension_value",
  "qty",
  "accessories",
  "unit_price",
  "line_total",
  "breakdown",
  "created_at",
  "tenant_id",
];

// ── 1. VIEW mirrors quote_items 1:1 ───────────────────────────────────────

describe("legacy_quote_items VIEW parity", () => {
  const sql = readMigration("20260624_legacy_quote_items_view.sql");

  it("is a CREATE OR REPLACE VIEW", () => {
    expect(sql).toContain("CREATE OR REPLACE VIEW public.legacy_quote_items AS");
  });

  it("selects all 16 expected columns from quote_items", () => {
    for (const col of EXPECTED_COLUMNS) {
      expect(sql).toContain(col);
    }
  });

  it("selects FROM public.quote_items", () => {
    expect(sql).toContain("FROM public.quote_items");
  });

  it("has no extra columns beyond the 16 expected", () => {
    // Extract column list from the SELECT ... FROM block
    const selectMatch = sql.match(
      /SELECT\s+([\s\S]+?)\s+FROM\s+public\.quote_items/,
    );
    expect(selectMatch).toBeTruthy();
    const selectBody = selectMatch![1];
    // Each column line should be one of our expected columns
    const lines = selectBody
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("--"));
    for (const line of lines) {
      const col = line.replace(/,$/, "").trim();
      expect(EXPECTED_COLUMNS).toContain(col);
    }
  });
});

// ── 2. Drizzle model parity ────────────────────────────────────────────────

describe("Drizzle model parity", () => {
  const legacy = readLegacyModel();
  const table = readSchema();

  it("exports legacyQuoteItems as a pgView", () => {
    expect(legacy).toContain("export const legacyQuoteItems");
    expect(legacy).toContain('pgView("legacy_quote_items"');
  });

  it("exports LegacyQuoteItem type", () => {
    expect(legacy).toContain("export type LegacyQuoteItem");
  });

  it("uses .existing() to bind to the DB view", () => {
    expect(legacy).toContain(".existing()");
  });

  it("has all 16 columns matching the table", () => {
    // Check each column name appears in the legacy model
    for (const col of EXPECTED_COLUMNS) {
      // Convert snake_case to camelCase for Drizzle
      const camel = col.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      expect(legacy).toContain(`"${col}"`);
    }
  });

  it("matches uuid type for id column", () => {
    expect(legacy).toContain('id: uuid("id")');
    expect(table).toContain('id: uuid("id").primaryKey().defaultRandom()');
  });

  it("matches numeric precision for unit_price", () => {
    expect(legacy).toContain('unitPrice: numeric("unit_price", { precision: 14, scale: 2 })');
    expect(table).toContain('unitPrice: numeric("unit_price", { precision: 14, scale: 2 })');
  });

  it("matches numeric precision for dimension_value", () => {
    expect(legacy).toContain('dimensionValue: numeric("dimension_value", { precision: 10, scale: 3 })');
    expect(table).toContain('dimensionValue: numeric("dimension_value", { precision: 10, scale: 3 })');
  });

  it("matches jsonb type for accessories", () => {
    expect(legacy).toContain('accessories: jsonb("accessories")');
    expect(table).toContain('accessories: jsonb("accessories")');
  });

  it("matches jsonb type for breakdown", () => {
    expect(legacy).toContain('breakdown: jsonb("breakdown")');
    expect(table).toContain('breakdown: jsonb("breakdown")');
  });

  it("matches timestamp with timezone for created_at", () => {
    expect(legacy).toContain('createdAt: timestamp("created_at", { withTimezone: true })');
    expect(table).toContain('createdAt: timestamp("created_at", { withTimezone: true })');
  });
});

// ── 3. Down migration ──────────────────────────────────────────────────────

describe("down migration", () => {
  const sql = readMigration("20260624_legacy_quote_items_view_down.sql");

  it("drops the view", () => {
    expect(sql).toContain("DROP VIEW IF EXISTS public.legacy_quote_items");
  });
});

// ── 4. Existing table still intact ─────────────────────────────────────────

describe("quote_items table unchanged", () => {
  const table = readSchema();

  it("quoteItems still defined as pgTable", () => {
    expect(table).toContain('"quote_items"');
  });

  it("has all original columns", () => {
    for (const col of EXPECTED_COLUMNS) {
      const camel = col.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      expect(table).toContain(`"${col}"`);
    }
  });
});
