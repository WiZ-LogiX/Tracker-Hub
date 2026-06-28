/**
 * Hierarchy server functions + TreeConfigurator tests.
 *
 * Verifies:
 * - All hierarchy CRUD functions are exported
 * - TreeConfigurator module exports
 * - Feature flag gate in configurator route
 * - i18n key coverage for treeConfigurator
 * - Validation logic (empty sections)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Hierarchy server functions ─────────────────────────────────────────────

describe("hierarchy.functions.ts", () => {
  it("exports all hierarchy CRUD server functions", async () => {
    const mod = await import("@/lib/hierarchy.functions");

    const expectedFunctions = [
      "loadHierarchy",
      "addProduct",
      "updateProduct",
      "deleteProduct",
      "reorderProducts",
      "addSection",
      "updateSection",
      "deleteSection",
      "reorderSections",
      "addUnit",
      "updateUnit",
      "deleteUnit",
      "reorderUnits",
      "addComponent",
      "updateComponent",
      "deleteComponent",
      "reorderComponents",
    ];

    for (const fn of expectedFunctions) {
      expect(mod, `Missing export: ${fn}`).toHaveProperty(fn);
      expect(typeof (mod as any)[fn]).toBe("function");
    }
  });

  it("all server functions use createServerFn pattern", async () => {
    const src = readFileSync(
      resolve("src/lib/hierarchy.functions.ts"),
      "utf-8",
    );

    // Must use createServerFn
    expect(src).toContain("createServerFn");

    // Must use auth + tenant middleware
    expect(src).toContain("requireSupabaseAuth");
    expect(src).toContain("requireTenant");

    // Must use RLS-enforcing context.supabase for writes
    expect(src).toContain("(context as any).supabase");

    // Must filter by tenant_id on all operations
    const tenantFilters = src.match(/\.eq\("tenant_id"/g);
    expect(tenantFilters).toBeDefined();
    expect(tenantFilters!.length).toBeGreaterThanOrEqual(16); // at least 16 queries
  });

  it("CRUD functions cover all 4 hierarchy levels", async () => {
    const src = readFileSync(
      resolve("src/lib/hierarchy.functions.ts"),
      "utf-8",
    );

    // All 4 table names must appear in inserts/updates/deletes
    expect(src).toContain('"quotation_products"');
    expect(src).toContain('"sections"');
    expect(src).toContain('"units"');
    expect(src).toContain('"components"');
  });

  it("loadHierarchy queries all 4 tables in parallel", async () => {
    const src = readFileSync(
      resolve("src/lib/hierarchy.functions.ts"),
      "utf-8",
    );

    expect(src).toContain("Promise.all");
    // Must select from all 4 hierarchy tables
    expect(src).toContain('.from("quotation_products")');
    expect(src).toContain('.from("sections")');
    expect(src).toContain('.from("units")');
    expect(src).toContain('.from("components")');
  });
});

// ── TreeConfigurator component ─────────────────────────────────────────────

describe("TreeConfigurator component", () => {
  it("exports TreeConfigurator from the module", async () => {
    const mod = await import("@/components/quote/TreeConfigurator");
    expect(mod).toHaveProperty("TreeConfigurator");
    expect(typeof mod.TreeConfigurator).toBe("function");
  });

  it("TreeConfigurator is a valid React component", async () => {
    const { TreeConfigurator } = await import("@/components/quote/TreeConfigurator");
    // React components are functions
    expect(typeof TreeConfigurator).toBe("function");
    // Should have a name (named function component)
    expect(TreeConfigurator.name).toBe("TreeConfigurator");
  });
});

// ── Feature flag gate ──────────────────────────────────────────────────────

describe("configurator feature flag gate", () => {
  it("configurator.tsx imports TreeConfigurator via lazy", () => {
    const src = readFileSync(
      resolve("src/routes/admin/quotes/configurator.tsx"),
      "utf-8",
    );

    // Must lazy-load TreeConfigurator
    expect(src).toContain("lazy");
    expect(src).toContain("TreeConfigurator");

    // Must check feature_flags
    expect(src).toContain("feature_flags");
    expect(src).toContain("quotation_builder_v2");

    // Must query tenants table for flags
    expect(src).toContain('.from("tenants")');
    expect(src).toContain("feature_flags");
  });

  it("configurator.tsx has conditional rendering for v2 vs legacy", () => {
    const src = readFileSync(
      resolve("src/routes/admin/quotes/configurator.tsx"),
      "utf-8",
    );

    // Must have a conditional branch for useV2
    expect(src).toContain("useV2");

    // Must show legacy configurator when flag is off
    expect(src).toContain("Flag OFF");

    // Must render TreeConfigurator when flag is on
    expect(src).toContain("<TreeConfigurator");
  });

  it("configurator.tsx shows loading skeleton while flag loads", () => {
    const src = readFileSync(
      resolve("src/routes/admin/quotes/configurator.tsx"),
      "utf-8",
    );

    expect(src).toContain("Skeleton");
    expect(src).toContain("useV2 === null");
  });
});

// ── i18n key coverage ──────────────────────────────────────────────────────

describe("treeConfigurator i18n keys", () => {
  const requiredKeys = [
    "treeConfigurator.subtitle",
    "treeConfigurator.emptyTree",
    "treeConfigurator.save",
    "treeConfigurator.sections",
    "treeConfigurator.units",
    "treeConfigurator.components",
    "treeConfigurator.empty",
    "treeConfigurator.section",
    "treeConfigurator.unit",
    "treeConfigurator.labelPlaceholder",
    "treeConfigurator.addSection",
    "treeConfigurator.addUnit",
    "treeConfigurator.width",
    "treeConfigurator.height",
    "treeConfigurator.depth",
    "treeConfigurator.qty",
    "treeConfigurator.productType.kitchen",
    "treeConfigurator.productType.wardrobe",
    "treeConfigurator.productType.living_room",
    "treeConfigurator.productType.bedroom",
    "treeConfigurator.productType.office",
    "treeConfigurator.productType.bathroom",
    "treeConfigurator.productType.custom",
    "treeConfigurator.kind.material",
    "treeConfigurator.kind.hardware",
    "treeConfigurator.kind.accessory",
    "treeConfigurator.kind.manufacturing",
    "treeConfigurator.productAdded",
    "treeConfigurator.productDeleted",
    "treeConfigurator.sectionAdded",
    "treeConfigurator.sectionDeleted",
    "treeConfigurator.unitAdded",
    "treeConfigurator.unitDeleted",
    "treeConfigurator.componentAdded",
    "treeConfigurator.componentDeleted",
    "treeConfigurator.errorAdd",
    "treeConfigurator.errorUpdate",
    "treeConfigurator.errorDelete",
    "treeConfigurator.errorReorder",
    "treeConfigurator.errorEmptySection",
  ];

  function getNestedValue(obj: any, path: string): unknown {
    return path.split(".").reduce((o, k) => (o && (o as any)[k]) ?? undefined, obj);
  }

  for (const locale of ["en", "ar", "fr"]) {
    it(`has all required keys in ${locale}.json`, () => {
      const content = readFileSync(
        resolve(`src/i18n/locales/${locale}.json`),
        "utf-8",
      );
      const json = JSON.parse(content);

      for (const key of requiredKeys) {
        const val = getNestedValue(json, key);
        expect(val, `Missing key "${key}" in ${locale}.json`).toBeDefined();
        expect(typeof val).toBe("string");
        expect(
          (val as string).length,
          `Key "${key}" in ${locale}.json is empty`,
        ).toBeGreaterThan(0);
      }
    });
  }

  it("all three locales have the same treeConfigurator keys", () => {
    const en = JSON.parse(readFileSync(resolve("src/i18n/locales/en.json"), "utf-8"));
    const ar = JSON.parse(readFileSync(resolve("src/i18n/locales/ar.json"), "utf-8"));
    const fr = JSON.parse(readFileSync(resolve("src/i18n/locales/fr.json"), "utf-8"));

    const enKeys = Object.keys(en.treeConfigurator ?? {}).sort();
    const arKeys = Object.keys(ar.treeConfigurator ?? {}).sort();
    const frKeys = Object.keys(fr.treeConfigurator ?? {}).sort();

    expect(arKeys).toEqual(enKeys);
    expect(frKeys).toEqual(enKeys);
  });
});

// ── Validation logic ───────────────────────────────────────────────────────

describe("hierarchy validation", () => {
  it("schema validates hierarchy table shapes", async () => {
    const schema = await import("@/db/schema");

    // quotation_products table exists
    expect(schema.quotationProducts).toBeDefined();

    // sections table exists
    expect(schema.sections).toBeDefined();

    // units table exists
    expect(schema.units).toBeDefined();

    // components table exists
    expect(schema.components).toBeDefined();
  });

  it("component_kind enum has all 4 kinds", async () => {
    const schema = await import("@/db/schema");
    expect(schema.componentKindEnum).toBeDefined();
    // The enum values are material, hardware, accessory, manufacturing
    const enumValues = schema.componentKindEnum.enumValues;
    expect(enumValues).toContain("material");
    expect(enumValues).toContain("hardware");
    expect(enumValues).toContain("accessory");
    expect(enumValues).toContain("manufacturing");
  });

  it("hierarchy types are exported from schema", async () => {
    const src = readFileSync(resolve("src/db/schema.ts"), "utf-8");

    // Select types (read)
    expect(src).toContain("export type QuotationProduct =");
    expect(src).toContain("export type Section =");
    expect(src).toContain("export type Unit =");
    expect(src).toContain("export type Component =");

    // Insert types (write)
    expect(src).toContain("export type NewQuotationProduct =");
    expect(src).toContain("export type NewSection =");
    expect(src).toContain("export type NewUnit =");
    expect(src).toContain("export type NewComponent =");
  });
});

// ── Empty section validation rule ──────────────────────────────────────────

describe("empty section validation", () => {
  it("TreeConfigurator renders error when section has 0 units", () => {
    // This is a structural test — the validation function is defined in the component
    // and uses t("treeConfigurator.errorEmptySection", { product, section })
    const src = readFileSync(
      resolve("src/components/quote/TreeConfigurator.tsx"),
      "utf-8",
    );

    // Must check for empty sections
    expect(src).toContain("section.units.length === 0");
    expect(src).toContain("errorEmptySection");
  });

  it("configurator route validates before saving (onValidationError)", () => {
    const src = readFileSync(
      resolve("src/routes/admin/quotes/configurator.tsx"),
      "utf-8",
    );

    // The TreeConfigurator must receive onValidationError callback
    expect(src).toContain("onValidationError");
  });
});

// ── UnitEditor component ───────────────────────────────────────────────────

describe("UnitEditor component", () => {
  it("exports UnitEditor component and types", async () => {
    const mod = await import("@/components/quote/UnitEditor");

    expect(mod.UnitEditor).toBeDefined();
    expect(typeof mod.UnitEditor).toBe("function");

    // Exported types
    const src = readFileSync(
      resolve("src/components/quote/UnitEditor.tsx"),
      "utf-8",
    );
    expect(src).toContain("export interface UnitEditorValue");
    expect(src).toContain("export interface UnitEditorProps");
    expect(src).toContain("export type WidthTier");
  });

  it("UnitEditor has unit type select, finish picker, width tier picker", () => {
    const src = readFileSync(
      resolve("src/components/quote/UnitEditor.tsx"),
      "utf-8",
    );

    // Unit type select
    expect(src).toContain("unitType");
    expect(src).toContain("listUnitTypes");

    // Finish picker
    expect(src).toContain("finish");
    expect(src).toContain("selectFinish");

    // Width tier picker
    expect(src).toContain("widthTier");
    expect(src).toContain("selectWidthTier");

    // Width tier options
    expect(src).toContain('"narrow"');
    expect(src).toContain('"standard"');
    expect(src).toContain('"wide"');
    expect(src).toContain('"extra_wide"');
  });

  it("UnitEditor calls resolveBomFn on unit type change", () => {
    const src = readFileSync(
      resolve("src/components/quote/UnitEditor.tsx"),
      "utf-8",
    );

    // Must import and call resolveBomFn
    expect(src).toContain("resolveBomFn");
    expect(src).toContain("runBomAutofill");
  });

  it("UnitEditor validates non-positive dimensions", () => {
    const src = readFileSync(
      resolve("src/components/quote/UnitEditor.tsx"),
      "utf-8",
    );

    // Validation checks
    expect(src).toContain("errorPositiveDims");
    expect(src).toContain("widthMm <= 0");
    expect(src).toContain("heightMm <= 0");
    expect(src).toContain("depthMm <= 0");
  });

  it("UnitEditor validates missing finish and width tier", () => {
    const src = readFileSync(
      resolve("src/components/quote/UnitEditor.tsx"),
      "utf-8",
    );

    expect(src).toContain("errorMissingFinish");
    expect(src).toContain("errorMissingWidthTier");
    expect(src).toContain("errorMissingUnitType");
  });

  it("UnitEditor supports component overrides (qty, remove, reorder, add blank)", () => {
    const src = readFileSync(
      resolve("src/components/quote/UnitEditor.tsx"),
      "utf-8",
    );

    expect(src).toContain("handleComponentQtyChange");
    expect(src).toContain("handleRemoveComponent");
    expect(src).toContain("handleMoveComponent");
    expect(src).toContain("handleAddBlankComponent");
  });

  it("UnitEditor shows BOM autofill preview", () => {
    const src = readFileSync(
      resolve("src/components/quote/UnitEditor.tsx"),
      "utf-8",
    );

    expect(src).toContain("componentPreview");
    expect(src).toContain("autofilling");
    expect(src).toContain("noComponents");
    expect(src).toContain("selectUnitTypeHint");
  });

  it("UnitEditor has i18n keys for all three locales", () => {
    const en = JSON.parse(readFileSync(resolve("src/i18n/locales/en.json"), "utf-8"));
    const ar = JSON.parse(readFileSync(resolve("src/i18n/locales/ar.json"), "utf-8"));
    const fr = JSON.parse(readFileSync(resolve("src/i18n/locales/fr.json"), "utf-8"));

    const requiredKeys = [
      "unitType", "selectUnitType", "noUnitType", "loadingTypes",
      "finish", "selectFinish", "noFinish",
      "widthTier", "selectWidthTier", "noWidthTier",
      "tier.narrow", "tier.standard", "tier.wide", "tier.extra_wide",
      "componentPreview", "autofilling", "noComponents", "selectUnitTypeHint",
      "errorPositiveDims", "errorMissingFinish", "errorMissingWidthTier",
      "errorMissingUnitType", "errorBomAutofill", "errorLoadUnitTypes",
    ];

    for (const key of requiredKeys) {
      const parts = key.split(".");
      let enVal: any = en.unitEditor;
      let arVal: any = ar.unitEditor;
      let frVal: any = fr.unitEditor;
      for (const p of parts) {
        enVal = enVal?.[p];
        arVal = arVal?.[p];
        frVal = frVal?.[p];
      }
      expect(enVal, `en.unitEditor.${key} missing`).toBeDefined();
      expect(arVal, `ar.unitEditor.${key} missing`).toBeDefined();
      expect(frVal, `fr.unitEditor.${key} missing`).toBeDefined();
    }
  });

  it("treeConfigurator has errorLoadUnitTypes key in all locales", () => {
    const en = JSON.parse(readFileSync(resolve("src/i18n/locales/en.json"), "utf-8"));
    const ar = JSON.parse(readFileSync(resolve("src/i18n/locales/ar.json"), "utf-8"));
    const fr = JSON.parse(readFileSync(resolve("src/i18n/locales/fr.json"), "utf-8"));

    expect(en.treeConfigurator.errorLoadUnitTypes).toBeDefined();
    expect(ar.treeConfigurator.errorLoadUnitTypes).toBeDefined();
    expect(fr.treeConfigurator.errorLoadUnitTypes).toBeDefined();
  });
});

// ── Units table schema (finish_id + width_tier columns) ────────────────────

describe("units table finish_id + width_tier columns", () => {
  it("Drizzle schema defines finishId and widthTier on units", () => {
    const src = readFileSync(resolve("src/db/schema.ts"), "utf-8");

    // widthTierEnum defined
    expect(src).toContain('widthTierEnum');
    expect(src).toContain('"width_tier"');
    expect(src).toContain('"narrow"');
    expect(src).toContain('"standard"');
    expect(src).toContain('"wide"');
    expect(src).toContain('"extra_wide"');

    // finishId column on units table
    expect(src).toContain('finishId: uuid("finish_id")');
    expect(src).toContain('widthTier: widthTierEnum("width_tier")');

    // FK reference to catalog_finishes
    expect(src).toContain("references(() => catalogFinishes.id");

    // Index on finish_id
    expect(src).toContain("units_finish_id_idx");
  });

  it("migration creates finish_id and width_tier columns", () => {
    const migration = readFileSync(
      resolve("supabase/migrations/20260626_unit_finish_width_tier.sql"),
      "utf-8",
    );

    expect(migration).toContain("width_tier AS ENUM");
    expect(migration).toContain("finish_id uuid");
    expect(migration).toContain("REFERENCES catalog_finishes");
    expect(migration).toContain("units_finish_id_idx");
  });

  it("hierarchy server functions accept finishId and widthTier", () => {
    const src = readFileSync(
      resolve("src/lib/hierarchy.functions.ts"),
      "utf-8",
    );

    // Zod inputs
    expect(src).toContain('finishId: z.string().uuid().nullable().optional()');
    expect(src).toContain('widthTier: z.enum(["narrow", "standard", "wide", "extra_wide"]).nullable().optional()');

    // addUnit handler
    expect(src).toContain("finish_id: data.finishId");
    expect(src).toContain("width_tier: data.widthTier");

    // updateUnit handler
    expect(src).toContain('if (patch.finishId !== undefined) updates.finish_id = patch.finishId');
    expect(src).toContain('if (patch.widthTier !== undefined) updates.width_tier = patch.widthTier');

    // loadHierarchy query
    expect(src).toContain("finish_id, width_tier");
  });
});
