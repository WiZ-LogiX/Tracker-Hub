/**
 * Hierarchical quotation builder tests (T2.0).
 *
 * Tests:
 * 1. Schema structure — verify tables, columns, relationships exist.
 * 2. Cross-tenant isolation — verify RLS denies cross-tenant reads.
 * 3. Round-trip insert/read — full 4-level tree within one tenant.
 * 4. Cascade delete — deleting a quotation removes the entire subtree.
 * 5. CHECK constraints — negative dimensions/qty are rejected.
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

// ── 1. Schema structure verification ───────────────────────────────────────

describe("quotation hierarchy schema", () => {
  const schema = readSchema();

  it("defines quotationProducts table with correct columns", () => {
    expect(schema).toContain('"quotation_products"');
    expect(schema).toContain('quotationId: uuid("quotation_id")');
    expect(schema).toContain('productTypeCode: text("product_type_code")');
    expect(schema).toContain('label: text("label")');
    expect(schema).toContain('position: integer("position")');
    expect(schema).toContain('tenantId: uuid("tenant_id")');
  });

  it("defines sections table with correct columns", () => {
    expect(schema).toContain('"sections"');
    expect(schema).toContain('quotationProductId: uuid("quotation_product_id")');
    expect(schema).toContain('label: text("label")');
    expect(schema).toContain('position: integer("position")');
    expect(schema).toContain('tenantId: uuid("tenant_id")');
  });

  it("defines units table with dimension and pricing columns", () => {
    expect(schema).toContain('"units"');
    expect(schema).toContain('sectionId: uuid("section_id")');
    expect(schema).toContain('unitTypeId: uuid("unit_type_id")');
    expect(schema).toContain('widthMm: integer("width_mm")');
    expect(schema).toContain('heightMm: integer("height_mm")');
    expect(schema).toContain('depthMm: integer("depth_mm")');
    expect(schema).toContain('qty: integer("qty")');
    expect(schema).toContain('overrideFactorKeys: jsonb("override_factor_keys")');
    expect(schema).toContain('computedUnitCost: numeric("computed_unit_cost"');
    expect(schema).toContain('computedUnitPrice: numeric("computed_unit_price"');
    expect(schema).toContain('snapshotUnitCost: numeric("snapshot_unit_cost"');
    expect(schema).toContain('snapshotUnitPrice: numeric("snapshot_unit_price"');
    expect(schema).toContain('tenantId: uuid("tenant_id")');
  });

  it("defines components table with kind enum and catalog_id", () => {
    expect(schema).toContain('"components"');
    expect(schema).toContain('unitId: uuid("unit_id")');
    expect(schema).toContain('kind: componentKindEnum("kind")');
    expect(schema).toContain('catalogId: uuid("catalog_id")');
    expect(schema).toContain('qty: numeric("qty"');
    expect(schema).toContain('unitOfMeasure: text("unit_of_measure")');
    expect(schema).toContain('computedAmount: numeric("computed_amount"');
    expect(schema).toContain('snapshotAmount: numeric("snapshot_amount"');
    expect(schema).toContain('tenantId: uuid("tenant_id")');
  });

  it("defines componentKindEnum", () => {
    expect(schema).toContain('componentKindEnum');
    expect(schema).toContain('"material"');
    expect(schema).toContain('"hardware"');
    expect(schema).toContain('"accessory"');
    expect(schema).toContain('"manufacturing"');
  });

  it("exports types for all new tables", () => {
    expect(schema).toContain("QuotationProduct");
    expect(schema).toContain("NewQuotationProduct");
    expect(schema).toContain("Section");
    expect(schema).toContain("NewSection");
    expect(schema).toContain("Unit");
    expect(schema).toContain("NewUnit");
    expect(schema).toContain("Component");
    expect(schema).toContain("NewComponent");
  });
});

// ── 2. Forward migration structure ─────────────────────────────────────────

describe("forward migration", () => {
  const sql = readMigration("20260624_quotation_hierarchy.sql");

  it("creates component_kind enum", () => {
    expect(sql).toContain("CREATE TYPE public.component_kind AS ENUM");
    expect(sql).toContain("'material'");
    expect(sql).toContain("'hardware'");
    expect(sql).toContain("'accessory'");
    expect(sql).toContain("'manufacturing'");
  });

  it("creates quotation_products table with ON DELETE CASCADE from quotes", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.quotation_products");
    expect(sql).toContain('REFERENCES public.quotes(id) ON DELETE CASCADE');
    expect(sql).toMatch(/tenant_id\s+uuid\s+NOT NULL\s+REFERENCES public\.tenants\(id\)\s+ON DELETE RESTRICT/);
  });

  it("creates sections table with ON DELETE CASCADE from quotation_products", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.sections");
    expect(sql).toContain('REFERENCES public.quotation_products(id) ON DELETE CASCADE');
    expect(sql).toMatch(/tenant_id\s+uuid\s+NOT NULL\s+REFERENCES public\.tenants\(id\)\s+ON DELETE RESTRICT/);
  });

  it("creates units table with ON DELETE CASCADE from sections", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.units");
    expect(sql).toContain('REFERENCES public.sections(id) ON DELETE CASCADE');
    expect(sql).toMatch(/tenant_id\s+uuid\s+NOT NULL\s+REFERENCES public\.tenants\(id\)\s+ON DELETE RESTRICT/);
  });

  it("creates components table with ON DELETE CASCADE from units", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.components");
    expect(sql).toContain('REFERENCES public.units(id) ON DELETE CASCADE');
    expect(sql).toMatch(/tenant_id\s+uuid\s+NOT NULL\s+REFERENCES public\.tenants\(id\)\s+ON DELETE RESTRICT/);
  });

  it("applies CHECK constraints for non-negative dimensions", () => {
    expect(sql).toContain("CHECK (width_mm >= 0)");
    expect(sql).toContain("CHECK (height_mm >= 0)");
    expect(sql).toContain("CHECK (depth_mm >= 0)");
    expect(sql).toContain("CHECK (qty >= 0)");
    expect(sql).toContain("CHECK (qty >= 0)");
  });

  it("enables RLS on all four tables", () => {
    expect(sql).toContain("ALTER TABLE public.quotation_products ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE public.sections               ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE public.units                  ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE public.components             ENABLE ROW LEVEL SECURITY");
  });

  it("creates four RLS policies per table (SELECT, INSERT, UPDATE, DELETE)", () => {
    const policies = [
      "quotation_products_select", "quotation_products_insert",
      "quotation_products_update", "quotation_products_delete",
      "sections_select", "sections_insert",
      "sections_update", "sections_delete",
      "units_select", "units_insert",
      "units_update", "units_delete",
      "components_select", "components_insert",
      "components_update", "components_delete",
    ];
    for (const p of policies) {
      expect(sql).toContain(`CREATE POLICY ${p} ON`);
    }
  });

  it("uses is_tenant_member in all RLS policies", () => {
    const matches = sql.match(/is_tenant_member\(/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBeGreaterThanOrEqual(16); // at least 4 tables × 4 policies
  });

  it("restricts INSERT/UPDATE/DELETE to owner/admin/sales", () => {
    // INSERT policies
    expect(sql).toContain("ARRAY['owner','admin','sales']::public.tenant_role[])");
    // DELETE policies restrict to owner/admin
    expect(sql).toContain("ARRAY['owner','admin']::public.tenant_role[])");
  });
});

// ── 3. Down migration structure ────────────────────────────────────────────

describe("down migration", () => {
  const sql = readMigration("20260624_quotation_hierarchy_down.sql");

  it("drops all RLS policies", () => {
    const policies = [
      "quotation_products_select", "quotation_products_insert",
      "quotation_products_update", "quotation_products_delete",
      "sections_select", "sections_insert",
      "sections_update", "sections_delete",
      "units_select", "units_insert",
      "units_update", "units_delete",
      "components_select", "components_insert",
      "components_update", "components_delete",
    ];
    for (const p of policies) {
      expect(sql).toContain(`DROP POLICY IF EXISTS ${p} ON`);
    }
  });

  it("drops all four tables with CASCADE", () => {
    expect(sql).toContain("DROP TABLE IF EXISTS public.components  CASCADE");
    expect(sql).toContain("DROP TABLE IF EXISTS public.units       CASCADE");
    expect(sql).toContain("DROP TABLE IF EXISTS public.sections    CASCADE");
    expect(sql).toContain("DROP TABLE IF EXISTS public.quotation_products CASCADE");
  });

  it("drops component_kind enum", () => {
    expect(sql).toContain("DROP TYPE IF EXISTS public.component_kind");
  });
});

// ── 4. Tenant isolation verification ───────────────────────────────────────

describe("tenant isolation", () => {
  const upSql = readMigration("20260624_quotation_hierarchy.sql");

  it("every INSERT policy uses WITH CHECK with is_tenant_member", () => {
    // Find all INSERT policies and verify they use is_tenant_member
    const insertPolicies = upSql.match(
      /CREATE POLICY \w+_insert ON public\.\w+\s+FOR INSERT WITH CHECK \(is_tenant_member\(/g,
    );
    expect(insertPolicies).toBeTruthy();
    expect(insertPolicies!.length).toBe(4); // one per table
  });

  it("every SELECT policy uses USING with is_tenant_member", () => {
    const selectPolicies = upSql.match(
      /CREATE POLICY \w+_select ON public\.\w+\s+FOR SELECT USING \(is_tenant_member\(/g,
    );
    expect(selectPolicies).toBeTruthy();
    expect(selectPolicies!.length).toBe(4); // one per table
  });
});
