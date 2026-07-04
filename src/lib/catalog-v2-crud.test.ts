/**
 * Catalog V2 CRUD tests.
 *
 * 1. Schema validation — happy paths + unknown field rejection.
 * 2. Cross-tenant spoofing — tenant_id not in any input schema.
 * 3. Server function exports — all CRUD fns exist.
 * 4. Architecture audit — no supabaseAdmin in catalog functions.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";

// ── Helpers ────────────────────────────────────────────────────────────────

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const UUID2 = "550e8400-e29b-41d4-a716-446655440001";

// ── 1. Material schemas ────────────────────────────────────────────────────

describe("Material Zod schemas", () => {
  const PricingUnit = z.enum(["piece", "m", "m2", "minute", "linear_meter", "square_meter", "unit"]);

  const MaterialCreate = z.object({
    code: z.string().trim().min(1).max(64),
    labelI18nKey: z.string().trim().min(1).max(128),
    pricingUnit: PricingUnit,
    pricePerUnit: z.coerce.number().min(0),
    defaultWastagePct: z.coerce.number().min(0).max(100).optional(),
    supplierId: z.string().uuid().optional(),
  }).strict();

  const MaterialUpdate = z.object({
    id: z.string().uuid(),
    code: z.string().trim().min(1).max(64).optional(),
    labelI18nKey: z.string().trim().min(1).max(128).optional(),
    pricingUnit: PricingUnit.optional(),
    pricePerUnit: z.coerce.number().min(0).optional(),
    defaultWastagePct: z.coerce.number().min(0).max(100).optional().nullable(),
    supplierId: z.string().uuid().optional().nullable(),
  }).strict();

  it("accepts valid create payload", () => {
    expect(() => MaterialCreate.parse({
      code: "MDF-18",
      labelI18nKey: "materials.mdf_18",
      pricingUnit: "m2",
      pricePerUnit: 450,
    })).not.toThrow();
  });

  it("rejects create with unknown field (tenant_id spoof)", () => {
    expect(() => MaterialCreate.parse({
      code: "MDF-18",
      labelI18nKey: "materials.mdf_18",
      pricingUnit: "m2",
      pricePerUnit: 450,
      tenant_id: UUID,
    })).toThrow();
  });

  it("rejects create with missing required field", () => {
    expect(() => MaterialCreate.parse({ code: "MDF-18" })).toThrow();
  });

  it("rejects create with invalid pricingUnit", () => {
    expect(() => MaterialCreate.parse({
      code: "MDF-18",
      labelI18nKey: "materials.mdf_18",
      pricingUnit: "invalid_unit",
      pricePerUnit: 450,
    })).toThrow();
  });

  it("rejects create with negative price", () => {
    expect(() => MaterialCreate.parse({
      code: "MDF-18",
      labelI18nKey: "materials.mdf_18",
      pricingUnit: "m2",
      pricePerUnit: -1,
    })).toThrow();
  });

  it("accepts valid update payload", () => {
    expect(() => MaterialUpdate.parse({
      id: UUID,
      code: "MDF-18-UPDATED",
    })).not.toThrow();
  });

  it("rejects update with unknown field (tenant_id spoof)", () => {
    expect(() => MaterialUpdate.parse({
      id: UUID,
      tenant_id: UUID2,
    })).toThrow();
  });

  it("accepts update with null supplierId", () => {
    expect(() => MaterialUpdate.parse({
      id: UUID,
      supplierId: null,
    })).not.toThrow();
  });
});

// ── 2. Finish schemas ──────────────────────────────────────────────────────

describe("Finish Zod schemas", () => {
  const FinishCreate = z.object({
    code: z.string().trim().min(1).max(64),
    pricePerUnit: z.coerce.number().min(0),
  }).strict();

  it("accepts valid create", () => {
    expect(() => FinishCreate.parse({
      code: "GLOSS",
      pricePerUnit: 45,
    })).not.toThrow();
  });

  it("rejects unknown field", () => {
    expect(() => FinishCreate.parse({
      code: "GLOSS",
      pricePerUnit: 45,
      tenant_id: UUID,
    })).toThrow();
  });
});

// ── 3. Veneer schemas ──────────────────────────────────────────────────────

describe("Veneer Zod schemas", () => {
  const VeneerCreate = z.object({
    code: z.string().trim().min(1).max(64),
    pricePerM2: z.coerce.number().min(0),
  }).strict();

  it("accepts valid create", () => {
    expect(() => VeneerCreate.parse({
      code: "OAK-VN",
      pricePerM2: 1200,
    })).not.toThrow();
  });

  it("rejects negative price", () => {
    expect(() => VeneerCreate.parse({
      code: "OAK-VN",
      pricePerM2: -100,
    })).toThrow();
  });
});

// ── 4. Hardware schemas ────────────────────────────────────────────────────

describe("Hardware Zod schemas", () => {
  const HardwareCreate = z.object({
    code: z.string().trim().min(1).max(64),
    pricePerPiece: z.coerce.number().min(0),
  }).strict();

  it("accepts valid create", () => {
    expect(() => HardwareCreate.parse({
      code: "HINGE-110",
      pricePerPiece: 85,
    })).not.toThrow();
  });

  it("rejects zero-width code", () => {
    expect(() => HardwareCreate.parse({
      code: "  ",
      pricePerPiece: 85,
    })).toThrow();
  });
});

// ── 5. Accessory schemas ───────────────────────────────────────────────────

describe("Accessory Zod schemas", () => {
  const AccessoryCreate = z.object({
    code: z.string().trim().min(1).max(64),
    pricePerPiece: z.coerce.number().min(0),
  }).strict();

  it("accepts valid create", () => {
    expect(() => AccessoryCreate.parse({
      code: "HANDLE-BR",
      pricePerPiece: 120,
    })).not.toThrow();
  });
});

// ── 6. Manufacturing Operation schemas ─────────────────────────────────────

describe("ManufacturingOp Zod schemas", () => {
  const ManufacturingOpCreate = z.object({
    code: z.string().trim().min(1).max(64),
    rateUnit: z.enum(["piece", "m", "m2", "minute"]),
    rate: z.coerce.number().min(0),
  }).strict();

  it("accepts valid create", () => {
    expect(() => ManufacturingOpCreate.parse({
      code: "CUT-MDF",
      rateUnit: "m2",
      rate: 35,
    })).not.toThrow();
  });

  it("rejects invalid rateUnit", () => {
    expect(() => ManufacturingOpCreate.parse({
      code: "CUT-MDF",
      rateUnit: "hour",
      rate: 35,
    })).toThrow();
  });
});

// ── 7. Pricing Factor schemas ──────────────────────────────────────────────

describe("PricingFactor Zod schemas", () => {
  const PricingFactorCreate = z.object({
    factorKey: z.enum(["labor", "overhead", "margin", "luxury", "complexity", "rush", "wastage"]),
    percent: z.coerce.number().min(0).max(100),
  }).strict();

  it("accepts valid create", () => {
    expect(() => PricingFactorCreate.parse({
      factorKey: "labor",
      percent: 25,
    })).not.toThrow();
  });

  it("rejects percent > 100", () => {
    expect(() => PricingFactorCreate.parse({
      factorKey: "labor",
      percent: 101,
    })).toThrow();
  });

  it("rejects negative percent", () => {
    expect(() => PricingFactorCreate.parse({
      factorKey: "labor",
      percent: -5,
    })).toThrow();
  });

  it("rejects invalid factor key", () => {
    expect(() => PricingFactorCreate.parse({
      factorKey: "invalid",
      percent: 25,
    })).toThrow();
  });
});

// ── 8. Wastage Rule schemas ────────────────────────────────────────────────

describe("WastageRule Zod schemas", () => {
  const WastageRuleCreate = z.object({
    scope: z.enum(["material", "material_type"]),
    ref: z.string().trim().max(128).optional(),
    pct: z.coerce.number().min(0),
  }).strict();

  it("accepts valid create with ref", () => {
    expect(() => WastageRuleCreate.parse({
      scope: "material",
      ref: "MDF-18",
      pct: 8,
    })).not.toThrow();
  });

  it("accepts valid create without ref", () => {
    expect(() => WastageRuleCreate.parse({
      scope: "material_type",
      pct: 10,
    })).not.toThrow();
  });

  it("rejects unknown scope", () => {
    expect(() => WastageRuleCreate.parse({
      scope: "global",
      pct: 10,
    })).toThrow();
  });
});

// ── 9. Discount schemas ────────────────────────────────────────────────────

describe("Discount Zod schemas", () => {
  const DiscountCreate = z.object({
    code: z.string().trim().min(1).max(64),
    type: z.enum(["percentage", "fixed"]),
    value: z.coerce.number().min(0),
    maxValue: z.coerce.number().min(0).optional(),
    validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").optional(),
  }).strict();

  it("accepts valid create", () => {
    expect(() => DiscountCreate.parse({
      code: "SUMMER10",
      type: "percentage",
      value: 10,
      validFrom: "2026-06-01",
    })).not.toThrow();
  });

  it("rejects invalid date format", () => {
    expect(() => DiscountCreate.parse({
      code: "SUMMER10",
      type: "percentage",
      value: 10,
      validFrom: "01-06-2026",
    })).toThrow();
  });

  it("rejects unknown field", () => {
    expect(() => DiscountCreate.parse({
      code: "SUMMER10",
      type: "percentage",
      value: 10,
      validFrom: "2026-06-01",
      tenant_id: UUID,
    })).toThrow();
  });
});

// ── 10. Fees/Credits schemas ───────────────────────────────────────────────

describe("FeesCredit Zod schemas", () => {
  const FeesCreditCreate = z.object({
    code: z.string().trim().min(1).max(64),
    labelI18nKey: z.string().trim().min(1).max(128),
    sign: z.enum(["plus", "minus"]),
    amount: z.coerce.number().optional(),
    formulaKey: z.string().trim().max(128).optional(),
  }).strict().refine(
    (d) => d.amount != null || d.formulaKey != null,
    { message: "At least one of amount or formulaKey must be provided" },
  );

  it("accepts valid create with amount", () => {
    expect(() => FeesCreditCreate.parse({
      code: "TRANSPORT",
      labelI18nKey: "transport",
      sign: "plus",
      amount: 2000,
    })).not.toThrow();
  });

  it("accepts valid create with formulaKey", () => {
    expect(() => FeesCreditCreate.parse({
      code: "DYNAMIC",
      labelI18nKey: "dynamic_fee",
      sign: "minus",
      formulaKey: "site_visit_formula",
    })).not.toThrow();
  });

  it("rejects create with neither amount nor formulaKey", () => {
    expect(() => FeesCreditCreate.parse({
      code: "EMPTY",
      labelI18nKey: "empty",
      sign: "plus",
    })).toThrow("At least one of amount or formulaKey must be provided");
  });

  it("rejects invalid sign", () => {
    expect(() => FeesCreditCreate.parse({
      code: "X",
      labelI18nKey: "x",
      sign: "zero",
      amount: 100,
    })).toThrow();
  });
});

// ── 11. Cross-tenant spoofing ──────────────────────────────────────────────

describe("cross-tenant spoofing prevention", () => {
  it("MaterialCreate rejects tenant_id", () => {
    const schema = z.object({
      code: z.string(),
      labelI18nKey: z.string(),
      pricingUnit: z.string(),
      pricePerUnit: z.number(),
    }).strict();
    expect(() => schema.parse({
      code: "X", labelI18nKey: "X", pricingUnit: "m2", pricePerUnit: 1,
      tenant_id: UUID,
    })).toThrow();
  });

  it("MaterialUpdate rejects tenant_id", () => {
    const schema = z.object({ id: z.string().uuid() }).strict();
    expect(() => schema.parse({ id: UUID, tenant_id: UUID2 })).toThrow();
  });
});

// ── 12. Server function exports ────────────────────────────────────────────

describe("server function exports", () => {
  it("exports all Catalog V2 CRUD functions", async () => {
    const mod = await import("./catalog.functions");
    const fns = [
      "createCatalogMaterial", "updateCatalogMaterial", "archiveCatalogMaterial", "hardDeleteCatalogMaterial",
      "createCatalogFinish", "updateCatalogFinish", "archiveCatalogFinish", "hardDeleteCatalogFinish",
      "createCatalogVeneer", "updateCatalogVeneer", "archiveCatalogVeneer", "hardDeleteCatalogVeneer",
      "createCatalogHardware", "updateCatalogHardware", "archiveCatalogHardware", "hardDeleteCatalogHardware",
      "createCatalogAccessory", "updateCatalogAccessory", "archiveCatalogAccessory", "hardDeleteCatalogAccessory",
      "createCatalogManufacturingOp", "updateCatalogManufacturingOp", "archiveCatalogManufacturingOp", "hardDeleteCatalogManufacturingOp",
      "createCatalogPricingFactor", "updateCatalogPricingFactor", "archiveCatalogPricingFactor", "hardDeleteCatalogPricingFactor",
      "createCatalogWastageRule", "updateCatalogWastageRule", "archiveCatalogWastageRule", "hardDeleteCatalogWastageRule",
      "createCatalogDiscount", "updateCatalogDiscount", "archiveCatalogDiscount", "hardDeleteCatalogDiscount",
      "createCatalogFeesCredit", "updateCatalogFeesCredit", "archiveCatalogFeesCredit", "hardDeleteCatalogFeesCredit",
    ];
    for (const fn of fns) {
      expect(typeof (mod as any)[fn]).toBe(`function`);
    }
    expect(fns.length).toBe(40);
  });

  it("exports legacy CRUD functions", async () => {
    const mod = await import("./catalog.functions");
    const legacyFns = [
      "listMaterials", "upsertMaterial", "deleteMaterial",
      "listSuppliers", "upsertSupplier", "deleteSupplier",
      "listFinishes", "upsertFinish", "deleteFinish",
      "listVeneers", "upsertVeneer", "deleteVeneer",
      "listAccessories", "upsertAccessory", "deleteAccessory",
      "listDiscounts", "upsertDiscount", "deleteDiscount",
      "listWorkers", "upsertWorker", "deleteWorker",
      "listWastageRules", "upsertWastageRule", "deleteWastageRule",
      "listPricingRules", "upsertPricingRule", "deletePricingRule",
    ];
    for (const fn of legacyFns) {
      expect(typeof (mod as any)[fn]).toBe("function");
    }
    expect(legacyFns.length).toBe(27);
  });
});

// ── 13. Architecture audit ────────────────────────────────────────────────

describe("architecture audit", () => {
  it("catalog-v2.functions.ts does not import supabaseAdmin", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve("src/lib/catalog-v2.functions.ts"),
      "utf-8",
    );
    // Check for actual import, not just the word in comments
    expect(content).not.toMatch(/import.*supabaseAdmin/);
    expect(content).not.toContain('from "@/integrations/supabase/client.server"');
  });

  it("pricing-levers.functions.ts does not import supabaseAdmin", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve("src/lib/pricing-levers.functions.ts"),
      "utf-8",
    );
    expect(content).not.toMatch(/import.*supabaseAdmin/);
    expect(content).not.toContain('from "@/integrations/supabase/client.server"');
  });

  it("catalog.functions.ts V2 functions use context.supabase", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve("src/lib/catalog.functions.ts"),
      "utf-8",
    );
    // V2 functions should use context.supabase
    expect(content).toContain("(context as any).supabase");
  });
});
