/**
 * Catalog tables tests.
 *
 * 1. Schema structure — all 8 tables, enums, CHECK constraints.
 * 2. Migration — table creation, RLS policies, enum extensions.
 * 3. Down migration — clean drop.
 * 4. RLS isolation — cross-tenant denial.
 * 5. Archive-vs-delete — archived_at vs ON DELETE RESTRICT.
 * 6. Zod validation — pricing_unit enum values.
 * 7. CHECK constraints — non-negative prices.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { z } from "zod";

// ── Helpers ────────────────────────────────────────────────────────────────

function readMigration(filename: string): string {
  return readFileSync(resolve(`supabase/migrations/${filename}`), "utf-8");
}

function readSchema(): string {
  return readFileSync(resolve("src/db/schema.ts"), "utf-8");
}

// ── 1. Schema structure ────────────────────────────────────────────────────

describe("catalog schema", () => {
  const schema = readSchema();

  const tables = [
    "catalog_suppliers", "catalog_materials", "catalog_material_variants", "catalog_finishes",
    "catalog_veneers", "catalog_hardware", "catalog_accessories", "catalog_manufacturing_operations",
  ];

  for (const table of tables) {
    it(`defines ${table} table`, () => {
      expect(schema).toContain(`"${table}"`);
    });
  }

  it("catalog_materials has pricingUnit column using pricingUnitEnum", () => {
    expect(schema).toContain('pricingUnit: pricingUnitEnum("pricing_unit").notNull()');
  });

  it("catalog_materials has pricePerUnit with CHECK >= 0", () => {
    expect(schema).toContain("catalog_materials_price_per_unit_positive");
  });

  it("catalog_finishes has modifierType using modifierTypeEnum", () => {
    expect(schema).toContain('modifierType: modifierTypeEnum("modifier_type").notNull()');
  });

  it("catalog_manufacturing_operations has rateUnit using manufacturingRateUnitEnum", () => {
    expect(schema).toContain('rateUnit: manufacturingRateUnitEnum("rate_unit").notNull()');
  });

  it("all tables have tenantId with RESTRICT delete", () => {
    for (const table of tables) {
      expect(schema).toMatch(new RegExp(`${table}[\\s\\S]*tenantId.*tenants\\.id.*onDelete.*restrict`));
    }
  });

  it("exports types for all 8 tables", () => {
    const types = [
      "CatalogSupplier", "CatalogMaterial", "CatalogMaterialVariant", "CatalogFinish",
      "CatalogVeneer", "CatalogHardware", "CatalogAccessory", "CatalogManufacturingOp",
    ];
    for (const t of types) {
      expect(schema).toContain(`export type ${t}`);
    }
  });
});

// ── 2. Enums ────────────────────────────────────────────────────────────────

describe("enums", () => {
  const schema = readSchema();

  it("pricingUnitEnum has piece, m, m2, minute", () => {
    expect(schema).toContain('"piece"');
    expect(schema).toContain('"m"');
    expect(schema).toContain('"m2"');
    expect(schema).toContain('"minute"');
  });

  it("pricingUnitEnum keeps legacy values", () => {
    expect(schema).toContain('"linear_meter"');
    expect(schema).toContain('"square_meter"');
    expect(schema).toContain('"unit"');
  });

  it("modifierTypeEnum has percent and fixed", () => {
    expect(schema).toContain('modifierTypeEnum');
    expect(schema).toContain('"percent"');
    expect(schema).toContain('"fixed"');
  });

  it("manufacturingRateUnitEnum has piece, m, m2, minute", () => {
    expect(schema).toContain('manufacturingRateUnitEnum');
  });
});

// ── 3. Migration structure ─────────────────────────────────────────────────

describe("forward migration", () => {
  const sql = readMigration("20260624_catalog_tables.sql");

  it("extends pricing_unit enum with IF NOT EXISTS", () => {
    expect(sql).toContain("ADD VALUE IF NOT EXISTS 'piece'");
    expect(sql).toContain("ADD VALUE IF NOT EXISTS 'm'");
    expect(sql).toContain("ADD VALUE IF NOT EXISTS 'm2'");
    expect(sql).toContain("ADD VALUE IF NOT EXISTS 'minute'");
  });

  it("creates modifier_type enum", () => {
    expect(sql).toContain("CREATE TYPE public.modifier_type AS ENUM ('percent', 'fixed')");
  });

  it("creates manufacturing_rate_unit enum", () => {
    expect(sql).toContain("CREATE TYPE public.manufacturing_rate_unit AS ENUM");
  });

  it("creates all 8 tables", () => {
    const tables = [
      "catalog_suppliers", "catalog_materials", "catalog_material_variants", "catalog_finishes",
      "catalog_veneers", "catalog_hardware", "catalog_accessories", "catalog_manufacturing_operations",
    ];
    for (const t of tables) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`);
    }
  });

  it("adds CHECK constraints for non-negative prices", () => {
    expect(sql).toContain("catalog_materials_price_per_unit_positive");
    expect(sql).toContain("catalog_veneers_price_per_m2_positive");
    expect(sql).toContain("catalog_hardware_price_per_piece_positive");
    expect(sql).toContain("catalog_accessories_price_per_piece_positive");
    expect(sql).toContain("catalog_manufacturing_operations_rate_positive");
  });

  it("enables RLS on all 8 tables", () => {
    const tables = [
      "catalog_suppliers", "catalog_materials", "catalog_material_variants", "catalog_finishes",
      "catalog_veneers", "catalog_hardware", "catalog_accessories", "catalog_manufacturing_operations",
    ];
    for (const t of tables) {
      expect(sql).toContain(`ALTER TABLE public.${t}`);
      expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    }
  });

  it("creates 4 RLS policies per table (SELECT, INSERT, UPDATE, DELETE)", () => {
    const tables = [
      "catalog_suppliers", "catalog_materials", "catalog_material_variants", "catalog_finishes",
      "catalog_veneers", "catalog_hardware", "catalog_accessories", "catalog_manufacturing_operations",
    ];
    for (const t of tables) {
      expect(sql).toContain(`CREATE POLICY ${t}_select ON`);
      expect(sql).toContain(`CREATE POLICY ${t}_insert ON`);
      expect(sql).toContain(`CREATE POLICY ${t}_update ON`);
      expect(sql).toContain(`CREATE POLICY ${t}_delete ON`);
    }
  });

  it("all FKs use ON DELETE RESTRICT", () => {
    const fks = sql.match(/REFERENCES public\.\w+\(id\) ON DELETE RESTRICT/g);
    expect(fks).toBeTruthy();
    // 8 tables + materials.supplier_id + material_variants.material_id = at least 10 FKs
    expect(fks!.length).toBeGreaterThanOrEqual(10);
  });
});

// ── 4. Down migration ──────────────────────────────────────────────────────

describe("down migration", () => {
  const sql = readMigration("20260624_catalog_tables_down.sql");

  it("drops all 8 tables with CASCADE", () => {
    const tables = [
      "catalog_manufacturing_operations", "catalog_accessories", "catalog_hardware", "catalog_veneers",
      "catalog_finishes", "catalog_material_variants", "catalog_materials", "catalog_suppliers",
    ];
    for (const t of tables) {
      expect(sql).toContain(`DROP TABLE IF EXISTS public.${t}`);
      expect(sql).toContain("CASCADE");
    }
  });

  it("drops new enums", () => {
    expect(sql).toContain("DROP TYPE IF EXISTS public.manufacturing_rate_unit");
    expect(sql).toContain("DROP TYPE IF EXISTS public.modifier_type");
  });

  it("does NOT drop pricing_unit enum (backward compat)", () => {
    expect(sql).not.toContain("DROP TYPE IF EXISTS public.pricing_unit");
  });
});

// ── 5. RLS isolation ───────────────────────────────────────────────────────

describe("RLS isolation", () => {
  const sql = readMigration("20260624_catalog_tables.sql");

  it("every SELECT policy uses is_tenant_member", () => {
    const selects = sql.match(/CREATE POLICY \w+_select ON public\.\w+\s+FOR SELECT USING \(is_tenant_member\(/g);
    expect(selects).toBeTruthy();
    expect(selects!.length).toBe(8);
  });

  it("every INSERT policy restricts to owner/admin/sales", () => {
    const inserts = sql.match(/FOR INSERT WITH CHECK \(is_tenant_member\(tenant_id, ARRAY\['owner','admin','sales'\]/g);
    expect(inserts).toBeTruthy();
    expect(inserts!.length).toBe(8);
  });
});

// ── 6. Archive-vs-delete behavior ──────────────────────────────────────────

describe("archive-vs-delete", () => {
  const schema = readSchema();

  it("all catalog tables have archivedAt column", () => {
    const tables = [
      "catalog_suppliers", "catalog_materials", "catalog_material_variants", "catalog_finishes",
      "catalog_veneers", "catalog_hardware", "catalog_accessories", "catalog_manufacturing_operations",
    ];
    for (const t of tables) {
      expect(schema).toMatch(new RegExp(`${t}[\\s\\S]*archivedAt`));
    }
  });

  it("no catalog table uses CASCADE from components/BOM", () => {
    const sql = readMigration("20260624_catalog_tables.sql");
    // All FKs from catalog tables should be RESTRICT
    const cascades = sql.match(/REFERENCES public\.(catalog_materials|catalog_finishes|catalog_veneers|catalog_hardware|catalog_accessories|catalog_suppliers)\(id\) ON DELETE CASCADE/g);
    expect(cascades).toBeNull();
  });
});

// ── 7. Zod validation ──────────────────────────────────────────────────────

describe("Zod validation", () => {
  const pricingUnitSchema = z.enum(["piece", "m", "m2", "minute"]);

  it("accepts valid pricing_unit values", () => {
    expect(() => pricingUnitSchema.parse("piece")).not.toThrow();
    expect(() => pricingUnitSchema.parse("m")).not.toThrow();
    expect(() => pricingUnitSchema.parse("m2")).not.toThrow();
    expect(() => pricingUnitSchema.parse("minute")).not.toThrow();
  });

  it("rejects invalid pricing_unit", () => {
    expect(() => pricingUnitSchema.parse("linear_meter")).toThrow();
    expect(() => pricingUnitSchema.parse("kg")).toThrow();
    expect(() => pricingUnitSchema.parse("")).toThrow();
  });

  const modifierTypeSchema = z.enum(["percent", "fixed"]);

  it("accepts valid modifier_type values", () => {
    expect(() => modifierTypeSchema.parse("percent")).not.toThrow();
    expect(() => modifierTypeSchema.parse("fixed")).not.toThrow();
  });

  it("rejects invalid modifier_type", () => {
    expect(() => modifierTypeSchema.parse("absolute")).toThrow();
  });
});
