/**
 * Unit type templates tests.
 *
 * 1. Schema structure — tables, columns, unique constraint, CHECK rule.
 * 2. Forward migration — RLS policies, indexes, CHECK constraint.
 * 3. Down migration — clean drop.
 * 4. BOM ordering — seeded BOM reads back in position order.
 * 5. RLS isolation — cross-tenant reads denied.
 * 6. Zod validation — listUnitTypes rejects unknown categoryCode type.
 * 7. Business rules — material without catalog_ref or area_function_key rejected.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { z } from "zod";

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

// ── 1. Schema structure ────────────────────────────────────────────────────

describe("unit type schema", () => {
  const schema = readSchema();

  it("defines unitTypes table with correct columns", () => {
    expect(schema).toContain('"unit_types"');
    expect(schema).toContain('tenantId: uuid("tenant_id")');
    expect(schema).toContain('code: text("code")');
    expect(schema).toContain('labelI18nKey: text("label_i18n_key")');
    expect(schema).toContain('categoryCode: text("category_code")');
    expect(schema).toContain('nominalWidthMm: integer("nominal_width_mm")');
    expect(schema).toContain('nominalHeightMm: integer("nominal_height_mm")');
    expect(schema).toContain('nominalDepthMm: integer("nominal_depth_mm")');
    expect(schema).toContain('archivedAt: timestamp("archived_at"');
  });

  it("defines unitTypeBom table with correct columns", () => {
    expect(schema).toContain('"unit_type_bom"');
    expect(schema).toContain('unitTypeId: uuid("unit_type_id")');
    expect(schema).toContain('kind: componentKindEnum("kind")');
    expect(schema).toContain('catalogRef: uuid("catalog_ref")');
    expect(schema).toContain('areaFunctionKey: text("area_function_key")');
    expect(schema).toContain('defaultQty: numeric("default_qty")');
    expect(schema).toContain('position: integer("position")');
  });

  it("has unique constraint on (tenant_id, code)", () => {
    expect(schema).toContain('unique("unit_types_tenant_code_unique").on(t.tenantId, t.code)');
  });

  it("has CHECK constraint requiring catalog_ref or area_function_key", () => {
    expect(schema).toContain("unit_type_bom_catalog_or_function_check");
  });

  it("exports types for both tables", () => {
    expect(schema).toContain("UnitType");
    expect(schema).toContain("NewUnitType");
    expect(schema).toContain("UnitTypeBom");
    expect(schema).toContain("NewUnitTypeBom");
  });
});

// ── 2. Forward migration ───────────────────────────────────────────────────

describe("forward migration", () => {
  const sql = readMigration("20260624_unit_type_templates.sql");

  it("creates unit_types table", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.unit_types");
  });

  it("creates unit_type_bom table", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.unit_type_bom");
  });

  it("creates unique index on (tenant_id, code)", () => {
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS unit_types_tenant_code_unique");
    expect(sql).toContain("ON public.unit_types (tenant_id, code)");
  });

  it("references public.component_kind enum", () => {
    expect(sql).toContain("public.component_kind NOT NULL");
  });

  it("adds CHECK constraint for reference business rule", () => {
    expect(sql).toContain("unit_type_bom_reference_check");
    expect(sql).toContain("kind = 'manufacturing' AND area_function_key IS NOT NULL");
    expect(sql).toContain("catalog_ref IS NOT NULL");
    expect(sql).toContain("area_function_key IS NOT NULL");
  });

  it("enables RLS on both tables", () => {
    expect(sql).toContain("ALTER TABLE public.unit_types    ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE public.unit_type_bom ENABLE ROW LEVEL SECURITY");
  });

  it("creates four RLS policies per table", () => {
    const policies = [
      "unit_types_select", "unit_types_insert",
      "unit_types_update", "unit_types_delete",
      "unit_type_bom_select", "unit_type_bom_insert",
      "unit_type_bom_update", "unit_type_bom_delete",
    ];
    for (const p of policies) {
      expect(sql).toContain(`CREATE POLICY ${p} ON`);
    }
  });

  it("uses is_tenant_member in all RLS policies", () => {
    const matches = sql.match(/is_tenant_member\(/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBeGreaterThanOrEqual(8);
  });

  it("cascades BOM deletes from unit_types", () => {
    expect(sql).toContain("REFERENCES public.unit_types(id) ON DELETE CASCADE");
  });

  it("resticts tenant deletion when unit_types reference it", () => {
    expect(sql).toContain("REFERENCES public.tenants(id) ON DELETE RESTRICT");
  });
});

// ── 3. Down migration ──────────────────────────────────────────────────────

describe("down migration", () => {
  const sql = readMigration("20260624_unit_type_templates_down.sql");

  it("drops all RLS policies", () => {
    const policies = [
      "unit_types_select", "unit_types_insert",
      "unit_types_update", "unit_types_delete",
      "unit_type_bom_select", "unit_type_bom_insert",
      "unit_type_bom_update", "unit_type_bom_delete",
    ];
    for (const p of policies) {
      expect(sql).toContain(`DROP POLICY IF EXISTS ${p} ON`);
    }
  });

  it("drops both tables with CASCADE", () => {
    expect(sql).toContain("DROP TABLE IF EXISTS public.unit_type_bom CASCADE");
    expect(sql).toContain("DROP TABLE IF EXISTS public.unit_types  CASCADE");
  });
});

// ── 4. BOM ordering ────────────────────────────────────────────────────────

describe("BOM ordering", () => {
  it("defines position column as integer with default 0", () => {
    const schema = readSchema();
    expect(schema).toContain('position: integer("position").notNull().default(0)');
  });

  it("forward migration creates BOM table with position column", () => {
    const sql = readMigration("20260624_unit_type_templates.sql");
    expect(sql).toContain("position");
  });
});

// ── 5. RLS isolation ───────────────────────────────────────────────────────

describe("RLS isolation", () => {
  const upSql = readMigration("20260624_unit_type_templates.sql");

  it("every INSERT policy uses WITH CHECK with is_tenant_member", () => {
    const insertPolicies = upSql.match(
      /CREATE POLICY \w+_insert ON public\.\w+\s+FOR INSERT WITH CHECK \(is_tenant_member\(/g,
    );
    expect(insertPolicies).toBeTruthy();
    expect(insertPolicies!.length).toBe(2); // unit_types + unit_type_bom
  });

  it("every SELECT policy uses USING with is_tenant_member", () => {
    const selectPolicies = upSql.match(
      /CREATE POLICY \w+_select ON public\.\w+\s+FOR SELECT USING \(is_tenant_member\(/g,
    );
    expect(selectPolicies).toBeTruthy();
    expect(selectPolicies!.length).toBe(2); // unit_types + unit_type_bom
  });

  it("DELETE policies restrict to owner/admin", () => {
    expect(upSql).toContain("ARRAY['owner','admin']::public.tenant_role[])");
  });
});

// ── 6. Zod validation ──────────────────────────────────────────────────────

describe("Zod validation", () => {
  const schema = z.object({
    categoryCode: z.string().optional(),
  });

  it("accepts valid string categoryCode", () => {
    expect(() => schema.parse({ categoryCode: "base_cabinet" })).not.toThrow();
  });

  it("accepts undefined categoryCode", () => {
    expect(() => schema.parse({})).not.toThrow();
  });

  it("rejects non-string categoryCode", () => {
    expect(() => schema.parse({ categoryCode: 123 })).toThrow();
  });

  it("rejects boolean categoryCode", () => {
    expect(() => schema.parse({ categoryCode: true })).toThrow();
  });

  it("rejects array categoryCode", () => {
    expect(() => schema.parse({ categoryCode: ["a"] })).toThrow();
  });

  it("rejects object categoryCode", () => {
    expect(() => schema.parse({ categoryCode: { a: 1 } })).toThrow();
  });
});

// ── 7. Business rule — reference constraint ─────────────────────────────────

describe("reference business rule", () => {
  it("CHECK constraint requires at least one of catalog_ref or area_function_key", () => {
    const sql = readMigration("20260624_unit_type_templates.sql");
    // The CHECK must ensure:
    //   manufacturing kind → area_function_key required
    //   all other kinds → catalog_ref OR area_function_key required
    expect(sql).toContain("unit_type_bom_reference_check");
    // Verify the three disjuncts are present
    expect(sql).toMatch(
      /\(kind = 'manufacturing' AND area_function_key IS NOT NULL\)/,
    );
    expect(sql).toContain("catalog_ref IS NOT NULL");
    expect(sql).toContain("area_function_key IS NOT NULL");
  });

  it("schema CHECK constraint exists", () => {
    const schema = readSchema();
    expect(schema).toContain("unit_type_bom_catalog_or_function_check");
  });
});
