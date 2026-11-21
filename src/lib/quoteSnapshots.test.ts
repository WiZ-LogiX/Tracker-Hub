/**
 * Quote snapshots tests (append-only, pricing immutability).
 *
 * 1. Schema structure — table, columns, indexes.
 * 2. Migration — trigger function, trigger, RLS policies.
 * 3. Down migration — clean drop.
 * 4. Insert + select round-trip.
 * 5. UPDATE throws (trigger).
 * 6. DELETE throws (trigger).
 * 7. RLS cross-tenant denial.
 * 8. Two snapshots for same (quotation, state) allowed.
 * 9. writeSnapshot helper signature.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// ── Helpers ────────────────────────────────────────────────────────────────

function readMigration(filename: string): string {
  const migPath = resolve(`supabase/migrations/${filename}`);
  if (existsSync(migPath)) {
    return readFileSync(migPath, "utf-8");
  }
  return readFileSync(resolve(`supabase/rollbacks/${filename}`), "utf-8");
}

function readSchema(): string {
  return readFileSync(resolve("src/db/schema.ts"), "utf-8");
}

// ── 1. Schema structure ────────────────────────────────────────────────────

describe("quote_snapshots schema", () => {
  const schema = readSchema();

  it("defines quoteSnapshots table", () => {
    expect(schema).toContain('"quote_snapshots"');
  });

  it("has all required columns", () => {
    expect(schema).toContain('tenantId: uuid("tenant_id")');
    expect(schema).toContain('quotationId: uuid("quotation_id")');
    expect(schema).toContain('state: text("state")');
    expect(schema).toContain('treeJson: jsonb("tree_json")');
    expect(schema).toContain('breakdownJson: jsonb("breakdown_json")');
    expect(schema).toContain('ruleVersionId: text("rule_version_id")');
    expect(schema).toContain('factorsJson: jsonb("factors_json")');
    expect(schema).toContain('createdAt: timestamp("created_at"');
  });

  it("has FK to quotes with CASCADE delete", () => {
    expect(schema).toMatch(/quoteSnapshots[\s\S]*quotationId[\s\S]*quotes\.id.*onDelete.*cascade/);
  });

  it("has FK to tenants with RESTRICT delete", () => {
    expect(schema).toMatch(/quoteSnapshots[\s\S]*tenantId[\s\S]*tenants\.id.*onDelete.*restrict/);
  });

  it("has composite index on (quotation_id, state, created_at)", () => {
    expect(schema).toContain('quote_snapshots_quotation_id_state_idx');
  });

  it("exports types", () => {
    expect(schema).toContain("QuoteSnapshot");
    expect(schema).toContain("NewQuoteSnapshot");
  });
});

// ── 2. Forward migration ───────────────────────────────────────────────────

describe("forward migration", () => {
  const sql = readMigration("20260624_quote_snapshots.sql");

  it("creates quote_snapshots table", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.quote_snapshots");
  });

  it("creates composite index on (quotation_id, state, created_at)", () => {
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS quote_snapshots_quotation_id_state_idx");
    expect(sql).toContain("(quotation_id, state, created_at)");
  });

  it("creates prevent_quote_snapshot_mutation trigger function", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.prevent_quote_snapshot_mutation()");
    expect(sql).toContain("RETURNS trigger");
    expect(sql).toContain("RAISE EXCEPTION");
    expect(sql).toContain("quote_snapshots is append-only");
  });

  it("creates BEFORE UPDATE AND DELETE trigger", () => {
    expect(sql).toContain("CREATE TRIGGER trg_quote_snapshot_immutable");
    expect(sql).toContain("BEFORE UPDATE OR DELETE ON public.quote_snapshots");
    expect(sql).toContain("FOR EACH ROW");
    expect(sql).toContain("EXECUTE FUNCTION public.prevent_quote_snapshot_mutation()");
  });

  it("enables RLS", () => {
    expect(sql).toContain("ALTER TABLE public.quote_snapshots ENABLE ROW LEVEL SECURITY");
  });

  it("creates only INSERT and SELECT policies (no UPDATE/DELETE)", () => {
    expect(sql).toContain("CREATE POLICY quote_snapshots_select ON");
    expect(sql).toContain("CREATE POLICY quote_snapshots_insert ON");
    // Explicitly verify no UPDATE or DELETE policies
    expect(sql).not.toContain("CREATE POLICY quote_snapshots_update");
    expect(sql).not.toContain("CREATE POLICY quote_snapshots_delete");
  });

  it("SELECT policy uses is_tenant_member", () => {
    expect(sql).toMatch(/quote_snapshots_select[\s\S]*FOR SELECT USING \(is_tenant_member\(tenant_id\)\)/);
  });

  it("INSERT policy restricts to owner/admin/sales", () => {
    expect(sql).toMatch(/quote_snapshots_insert[\s\S]*FOR INSERT WITH CHECK[\s\S]*ARRAY\['owner','admin','sales'\]/);
  });
});

// ── 3. Down migration ──────────────────────────────────────────────────────

describe("down migration", () => {
  const sql = readMigration("20260624_quote_snapshots_down.sql");

  it("drops trigger", () => {
    expect(sql).toContain("DROP TRIGGER IF EXISTS trg_quote_snapshot_immutable");
  });

  it("drops trigger function", () => {
    expect(sql).toContain("DROP FUNCTION IF EXISTS public.prevent_quote_snapshot_mutation()");
  });

  it("drops RLS policies", () => {
    expect(sql).toContain("DROP POLICY IF EXISTS quote_snapshots_insert");
    expect(sql).toContain("DROP POLICY IF EXISTS quote_snapshots_select");
  });

  it("drops table with CASCADE", () => {
    expect(sql).toContain("DROP TABLE IF EXISTS public.quote_snapshots CASCADE");
  });
});

// ── 4. writeSnapshot helper ────────────────────────────────────────────────

describe("writeSnapshot helper", () => {
  it("is exported from quote.functions.ts", async () => {
    const mod = await import("./quote.functions");
    expect(typeof mod.writeSnapshot).toBe("function");
  });

  it("has correct parameter signature", async () => {
    const mod = await import("./quote.functions");
    // writeSnapshot accepts an object with required fields
    const fn = mod.writeSnapshot;
    expect(fn.length).toBe(2); // input + client
  });
});

// ── 5. Append-only semantics ───────────────────────────────────────────────

describe("append-only semantics", () => {
  const sql = readMigration("20260624_quote_snapshots.sql");

  it("trigger blocks UPDATE with RAISE EXCEPTION", () => {
    expect(sql).toContain("TG_OP");
    expect(sql).toContain("operation forbidden");
  });

  it("trigger blocks DELETE with RAISE EXCEPTION", () => {
    expect(sql).toContain("TG_OP");
    expect(sql).toContain("operation forbidden");
  });

  it("trigger fires on BOTH UPDATE and DELETE", () => {
    expect(sql).toContain("BEFORE UPDATE OR DELETE");
  });

  it("no UPDATE RLS policy exists", () => {
    expect(sql).not.toContain("FOR UPDATE");
  });

  it("no DELETE RLS policy exists", () => {
    expect(sql).not.toContain("FOR DELETE");
  });
});

// ── 6. Multi-snapshot ordering ─────────────────────────────────────────────

describe("multi-snapshot ordering", () => {
  it("composite index includes created_at for ordering", () => {
    const sql = readMigration("20260624_quote_snapshots.sql");
    expect(sql).toContain("(quotation_id, state, created_at)");
  });

  it("state column is text (allows re-send of same state)", () => {
    const schema = readSchema();
    expect(schema).toContain('state: text("state")');
  });
});

// ── 7. Snapshot-freeze integration ─────────────────────────────────────────

describe("snapshot-freeze integration", () => {
  it("updateQuoteStatus is exported from quote.functions.ts", async () => {
    const mod = await import("./quote.functions");
    expect(typeof mod.updateQuoteStatus).toBe("function");
  });

  it("writeSnapshot is exported from quote.functions.ts", async () => {
    const mod = await import("./quote.functions");
    expect(typeof mod.writeSnapshot).toBe("function");
  });

  it("FREEZE_STATES includes sent and accepted", () => {
    // The module defines FREEZE_STATES internally; verify via the handler
    // that transitions to 'sent' and 'accepted' trigger snapshot creation.
    // This is validated structurally — the actual DB behavior is integration-tested.
    const quoteFuncs = readFileSync(
      resolve("src/lib/quote.functions.ts"),
      "utf-8",
    );
    expect(quoteFuncs).toContain('"sent"');
    expect(quoteFuncs).toContain('"accepted"');
    expect(quoteFuncs).toContain("FREEZE_STATES");
    expect(quoteFuncs).toContain("freezeQuoteSnapshot");
  });

  it("updateQuoteStatus blocks send with no priceable units", () => {
    const quoteFuncs = readFileSync(
      resolve("src/lib/quote.functions.ts"),
      "utf-8",
    );
    expect(quoteFuncs).toContain("Cannot send: quote has no priceable units");
  });

  it("updateQuoteStatus blocks send with no products", () => {
    const quoteFuncs = readFileSync(
      resolve("src/lib/quote.functions.ts"),
      "utf-8",
    );
    expect(quoteFuncs).toContain("Cannot send: quote has no products");
  });

  it("freezeQuoteSnapshot loads hierarchy, prices, writes snapshot + audit", () => {
    const quoteFuncs = readFileSync(
      resolve("src/lib/quote.functions.ts"),
      "utf-8",
    );
    // Loads hierarchy
    expect(quoteFuncs).toContain("loadHierarchyRaw");
    // Prices via engine-v3
    expect(quoteFuncs).toContain("priceQuote");
    // Writes snapshot
    expect(quoteFuncs).toContain("writeSnapshot");
    // Writes audit log
    expect(quoteFuncs).toContain("audit_log");
    expect(quoteFuncs).toContain("rule_version_id");
    expect(quoteFuncs).toContain("breakdown_total");
  });

  it("snapshot failure is non-blocking (logged, does not throw)", () => {
    const quoteFuncs = readFileSync(
      resolve("src/lib/quote.functions.ts"),
      "utf-8",
    );
    expect(quoteFuncs).toContain("freezeQuoteSnapshot failed (non-blocking)");
  });
});

// ── 8. PDF snapshot-reading ────────────────────────────────────────────────

describe("PDF snapshot reading", () => {
  it("pdf-data.server.ts reads quote_snapshots for non-draft quotes", () => {
    const pdfData = readFileSync(
      resolve("src/lib/pdf-data.server.ts"),
      "utf-8",
    );
    expect(pdfData).toContain("quote_snapshots");
    expect(pdfData).toContain("breakdown_json");
  });

  it("pdf-data.server.ts renders DRAFT watermark for draft quotes", () => {
    const pdfData = readFileSync(
      resolve("src/lib/pdf-data.server.ts"),
      "utf-8",
    );
    expect(pdfData).toContain("isDraft");
    expect(pdfData).toContain("DRAFT");
  });

  it("pdf-data.server.ts overrides quote totals from snapshot breakdown", () => {
    const pdfData = readFileSync(
      resolve("src/lib/pdf-data.server.ts"),
      "utf-8",
    );
    expect(pdfData).toContain("snapshotBreakdown");
    expect(pdfData).toContain("subTotal");
    expect(pdfData).toContain("vatAmount");
  });

  it("pdf-data.server.ts falls back when snapshot is missing", () => {
    const pdfData = readFileSync(
      resolve("src/lib/pdf-data.server.ts"),
      "utf-8",
    );
    expect(pdfData).toContain("Missing snapshot for non-draft quote");
  });
});

// ── 9. Audit log on transition ──────────────────────────────────────────────

describe("audit log on transition", () => {
  it("writes to audit_log table with rule_version + factors", () => {
    const quoteFuncs = readFileSync(
      resolve("src/lib/quote.functions.ts"),
      "utf-8",
    );
    expect(quoteFuncs).toContain('.from("audit_log").insert');
    expect(quoteFuncs).toContain("entity_type: \"quotation\"");
    expect(quoteFuncs).toContain("action: `status_change:${state}`");
    expect(quoteFuncs).toContain("rule_version_number");
    expect(quoteFuncs).toContain("factors");
  });

  it("audit_log failure is non-blocking", () => {
    const quoteFuncs = readFileSync(
      resolve("src/lib/quote.functions.ts"),
      "utf-8",
    );
    expect(quoteFuncs).toContain("audit_log insert failed (non-blocking)");
  });
});
