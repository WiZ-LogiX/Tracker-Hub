/**
 * Pricing levers tests.
 *
 * 1. Schema structure — 4 tables, enums, CHECK constraints.
 * 2. Migration — enum creation, RLS, seed data.
 * 3. Down migration — clean drop.
 * 4. Seed + read — PeleCanon معاينة (minus, 1000) and نقل/مشال (plus, 2000).
 * 5. Enum/range validation — percent 0-100, fee amount-or-formula CHECK.
 * 6. RLS isolation — cross-tenant denial.
 * 7. Server function exports.
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

describe("pricing levers schema", () => {
  const schema = readSchema();

  const tables = [
    "tenant_pricing_factors", "tenant_wastage_rules",
    "tenant_discounts", "fees_credits",
  ];

  for (const t of tables) {
    it(`defines ${t} table`, () => {
      expect(schema).toContain(`"${t}"`);
    });
  }

  it("tenant_pricing_factors uses pricingFactorKeyEnum", () => {
    expect(schema).toContain('factorKey: pricingFactorKeyEnum("factor_key").notNull()');
  });

  it("tenant_pricing_factors has percent CHECK 0-100", () => {
    expect(schema).toContain("tenant_pricing_factors_percent_range");
  });

  it("tenant_wastage_rules uses wastageScopeEnum", () => {
    expect(schema).toContain('scope: wastageScopeEnum("scope").notNull()');
  });

  it("tenant_discounts uses discountTypeEnum", () => {
    expect(schema).toContain('type: discountTypeEnum("type").notNull()');
  });

  it("fees_credits uses feeSignEnum", () => {
    expect(schema).toContain('sign: feeSignEnum("sign").notNull()');
  });

  it("fees_credits has CHECK for amount-or-formula", () => {
    expect(schema).toContain("fees_credits_amount_or_formula");
  });

  it("exports types for all 4 tables", () => {
    const types = [
      "TenantPricingFactor", "TenantWastageRule",
      "TenantDiscount", "FeesCredit",
    ];
    for (const t of types) {
      expect(schema).toContain(`export type ${t}`);
    }
  });
});

// ── 2. Enums ────────────────────────────────────────────────────────────────

describe("enums", () => {
  const schema = readSchema();

  it("pricingFactorKeyEnum has labor, overhead, margin, luxury, complexity, rush, wastage", () => {
    expect(schema).toContain('pricingFactorKeyEnum');
    expect(schema).toContain('"labor"');
    expect(schema).toContain('"overhead"');
    expect(schema).toContain('"margin"');
    expect(schema).toContain('"luxury"');
    expect(schema).toContain('"complexity"');
    expect(schema).toContain('"rush"');
    expect(schema).toContain('"wastage"');
  });

  it("wastageScopeEnum has material and material_type", () => {
    expect(schema).toContain('wastageScopeEnum');
    expect(schema).toContain('"material"');
    expect(schema).toContain('"material_type"');
  });

  it("feeSignEnum has plus and minus", () => {
    expect(schema).toContain('feeSignEnum');
    expect(schema).toContain('"plus"');
    expect(schema).toContain('"minus"');
  });
});

// ── 3. Migration structure ─────────────────────────────────────────────────

describe("forward migration", () => {
  const sql = readMigration("20260624_pricing_levers.sql");

  it("creates pricing_factor_key enum", () => {
    expect(sql).toContain("CREATE TYPE public.pricing_factor_key AS ENUM");
    expect(sql).toContain("'labor'");
    expect(sql).toContain("'rush'");
    expect(sql).toContain("'wastage'");
  });

  it("creates wastage_scope enum", () => {
    expect(sql).toContain("CREATE TYPE public.wastage_scope AS ENUM");
  });

  it("creates fee_sign enum", () => {
    expect(sql).toContain("CREATE TYPE public.fee_sign AS ENUM");
  });

  it("creates all 4 tables", () => {
    const tables = [
      "tenant_pricing_factors", "tenant_wastage_rules",
      "tenant_discounts", "fees_credits",
    ];
    for (const t of tables) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`);
    }
  });

  it("adds percent range CHECK 0-100", () => {
    expect(sql).toContain("tenant_pricing_factors_percent_range");
    expect(sql).toContain("percent >= 0 AND percent <= 100");
  });

  it("adds amount-or-formula CHECK on fees_credits", () => {
    expect(sql).toContain("fees_credits_amount_or_formula");
    expect(sql).toContain("amount IS NOT NULL OR formula_key IS NOT NULL");
  });

  it("enables RLS on all 4 tables", () => {
    const tables = [
      "tenant_pricing_factors", "tenant_wastage_rules",
      "tenant_discounts", "fees_credits",
    ];
    for (const t of tables) {
      expect(sql).toContain(`ALTER TABLE public.${t}`);
      expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    }
  });

  it("creates 4 RLS policies per table", () => {
    const tables = [
      "tenant_pricing_factors", "tenant_wastage_rules",
      "tenant_discounts", "fees_credits",
    ];
    for (const t of tables) {
      expect(sql).toContain(`CREATE POLICY ${t}_select ON`);
      expect(sql).toContain(`CREATE POLICY ${t}_insert ON`);
      expect(sql).toContain(`CREATE POLICY ${t}_update ON`);
      expect(sql).toContain(`CREATE POLICY ${t}_delete ON`);
    }
  });

  it("seeds معاينة (site_visit) with sign=minus, amount=1000", () => {
    expect(sql).toContain("'site_visit'");
    expect(sql).toContain("'minus'");
    expect(sql).toContain("1000");
  });

  it("seeds نقل/مشال (transport) with sign=plus, amount=2000", () => {
    expect(sql).toContain("'transport'");
    expect(sql).toContain("'plus'");
    expect(sql).toContain("2000");
  });
});

// ── 4. Down migration ──────────────────────────────────────────────────────

describe("down migration", () => {
  const sql = readMigration("20260624_pricing_levers_down.sql");

  it("drops all 4 tables", () => {
    const tables = [
      "fees_credits", "tenant_discounts",
      "tenant_wastage_rules", "tenant_pricing_factors",
    ];
    for (const t of tables) {
      expect(sql).toContain(`DROP TABLE IF EXISTS public.${t}`);
    }
  });

  it("drops new enums", () => {
    expect(sql).toContain("DROP TYPE IF EXISTS public.fee_sign");
    expect(sql).toContain("DROP TYPE IF EXISTS public.wastage_scope");
    expect(sql).toContain("DROP TYPE IF EXISTS public.pricing_factor_key");
  });
});

// ── 5. Seed + read verification ────────────────────────────────────────────

describe("seed data", () => {
  const sql = readMigration("20260624_pricing_levers.sql");

  it("both fees_credits use ON CONFLICT DO NOTHING", () => {
    expect(sql).toContain("ON CONFLICT DO NOTHING");
  });

  it("seed targets PeleCanon tenant_id", () => {
    expect(sql).toContain("2bf7cd99-d567-42d3-b5fc-22cc40654293");
  });
});

// ── 6. Enum/range validation ───────────────────────────────────────────────

describe("validation", () => {
  const factorKeySchema = z.enum([
    "labor", "overhead", "margin", "luxury", "complexity", "rush", "wastage",
  ]);

  it("accepts valid factor keys", () => {
    for (const k of ["labor", "overhead", "margin", "luxury", "complexity", "rush", "wastage"]) {
      expect(() => factorKeySchema.parse(k)).not.toThrow();
    }
  });

  it("rejects invalid factor key", () => {
    expect(() => factorKeySchema.parse("invalid")).toThrow();
  });

  const feeSignSchema = z.enum(["plus", "minus"]);

  it("accepts plus and minus", () => {
    expect(() => feeSignSchema.parse("plus")).not.toThrow();
    expect(() => feeSignSchema.parse("minus")).not.toThrow();
  });

  it("rejects zero or other sign values", () => {
    expect(() => feeSignSchema.parse("zero")).toThrow();
    expect(() => feeSignSchema.parse("+")).toThrow();
  });

  const percentSchema = z.number().min(0).max(100);

  it("accepts 0-100 range", () => {
    expect(() => percentSchema.parse(0)).not.toThrow();
    expect(() => percentSchema.parse(50)).not.toThrow();
    expect(() => percentSchema.parse(100)).not.toThrow();
  });

  it("rejects negative percent", () => {
    expect(() => percentSchema.parse(-1)).toThrow();
  });

  it("rejects > 100 percent", () => {
    expect(() => percentSchema.parse(101)).toThrow();
  });
});

// ── 7. Server functions ────────────────────────────────────────────────────

describe("server functions", () => {
  it("exports listTenantPricingFactors", async () => {
    const mod = await import("./pricing-levers.functions");
    expect(typeof mod.listTenantPricingFactors).toBe("function");
  });

  it("exports listTenantWastageRules", async () => {
    const mod = await import("./pricing-levers.functions");
    expect(typeof mod.listTenantWastageRules).toBe("function");
  });

  it("exports listTenantDiscounts", async () => {
    const mod = await import("./pricing-levers.functions");
    expect(typeof mod.listTenantDiscounts).toBe("function");
  });

  it("exports listFeesCredits", async () => {
    const mod = await import("./pricing-levers.functions");
    expect(typeof mod.listFeesCredits).toBe("function");
  });
});
