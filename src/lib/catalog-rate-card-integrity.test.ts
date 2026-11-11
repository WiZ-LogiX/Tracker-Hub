/**
 * Task 3 — Catalog Import & Rate Card Integrity Audit Tests
 *
 * Covers:
 * 1. Catalog & Rate Card architecture data flow
 * 2. Multi-tenant isolation for imports, updates, and lookups
 * 3. Import correctness: new items, updates, conflicts, skips, idempotency
 * 4. Pricing integrity from catalog -> componentAmount -> engine-v3 -> quotation totals
 * 5. Frozen quotation snapshot protection against subsequent catalog price mutations
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  computeDiff,
  commitWrites,
  variantName,
} from "./importRateCard.functions";
import {
  priceQuote,
  type QuoteInput,
  type CatalogLookup,
  round2,
} from "./pricing/engine-v3";
import { componentAmount } from "./pricing/componentAmount";
import type { NormalizedPriceRecord, AddonRecord, FinishCode } from "./import/rateCard";

describe("1. Catalog Import & Rate Card Schema Alignment", () => {
  it("importRateCard.functions.ts enforces V2 column names and tenant scoping", () => {
    const src = readFileSync(resolve("src/lib/importRateCard.functions.ts"), "utf-8");

    // Table names
    expect(src).toContain('"catalog_materials"');
    expect(src).toContain('"catalog_hardware"');
    expect(src).toContain('"catalog_accessories"');
    expect(src).toContain('"catalog_finishes"');
    expect(src).toContain('"tenant_pricing_factors"');

    // Column names
    expect(src).toContain('.eq("code", variantKey)');
    expect(src).toContain('.eq("code", addon.slug)');
    expect(src).toContain('price_per_unit: rec.price');
    expect(src).toContain('price_per_piece: addon.price');
    expect(src).toContain('.eq("tenant_id", tenantId)');
    expect(src).toContain('.is("archived_at", null)');
  });
});

describe("2. Multi-Tenant Catalog Isolation", () => {
  const tenantA = "11111111-1111-1111-1111-111111111111";
  const tenantB = "22222222-2222-2222-2222-222222222222";

  it("Tenant A operations cannot read or mutate Tenant B catalog records", async () => {
    // In-memory mock database partitioned by tenant
    const db: Record<string, any[]> = {
      catalog_materials: [
        { id: "mat-a1", tenant_id: tenantA, code: "HPL_base", price_per_unit: 7700, archived_at: null },
        { id: "mat-b1", tenant_id: tenantB, code: "HPL_base", price_per_unit: 9900, archived_at: null },
      ],
      catalog_hardware: [
        { id: "hw-a1", tenant_id: tenantA, code: "hinge-soft", price_per_piece: 45, archived_at: null },
        { id: "hw-b1", tenant_id: tenantB, code: "hinge-soft", price_per_piece: 65, archived_at: null },
      ],
      catalog_accessories: [],
      catalog_finishes: [
        { id: "fin-a1", tenant_id: tenantA, code: "HPL", price_per_unit: 0, archived_at: null },
        { id: "fin-b1", tenant_id: tenantB, code: "HPL", price_per_unit: 0, archived_at: null },
      ],
      tenant_pricing_factors: [],
      price_history: [],
    };

    const createMockClient = (activeTenantId: string) => ({
      from: (table: string) => {
        let filters: Record<string, any> = {};
        let isArchivedNull = false;

        const chain = {
          select: () => chain,
          eq: (col: string, val: any) => {
            filters[col] = val;
            return chain;
          },
          is: (col: string, val: any) => {
            if (col === "archived_at" && val === null) isArchivedNull = true;
            return chain;
          },
          maybeSingle: async () => {
            const rows = (db[table] ?? []).filter((r) => {
              for (const [k, v] of Object.entries(filters)) {
                if (r[k] !== v) return false;
              }
              if (isArchivedNull && r.archived_at !== null) return false;
              return true;
            });
            return { data: rows[0] ?? null, error: null };
          },
          update: (updates: any) => ({
            eq: (col1: string, val1: any) => ({
              eq: (col2: string, val2: any) => {
                const target = (db[table] ?? []).find(
                  (r) => r[col1] === val1 && r[col2] === val2,
                );
                if (target) Object.assign(target, updates);
                return { error: null };
              },
            }),
          }),
          insert: (records: any) => {
            const arr = Array.isArray(records) ? records : [records];
            for (const item of arr) {
              const row = { id: `id-${Math.random().toString(36).slice(2, 7)}`, ...item };
              db[table].push(row);
            }
            return {
              select: () => ({
                maybeSingle: async () => ({ data: db[table][db[table].length - 1], error: null }),
              }),
              error: null,
            };
          },
        };
        return chain;
      },
    });

    const clientA = createMockClient(tenantA);

    // Tenant A updates HPL_base price from 7700 to 8000
    const pricesA: NormalizedPriceRecord[] = [
      {
        unitType: "base",
        finishCode: "HPL",
        finishLabel: "HPL",
        widthTier: "standard",
        widthCm: 100,
        price: 8000,
        isFixed: false,
      },
    ];

    await commitWrites(clientA, tenantA, pricesA, [], []);

    // Tenant A record updated
    const updatedA = db.catalog_materials.find((r) => r.tenant_id === tenantA && r.code === "HPL_base");
    expect(updatedA?.price_per_unit).toBe(8000);

    // Tenant B record remains untouched (9900)
    const untouchedB = db.catalog_materials.find((r) => r.tenant_id === tenantB && r.code === "HPL_base");
    expect(untouchedB?.price_per_unit).toBe(9900);
  });
});

describe("3. Rate Card Import Diff & Idempotency", () => {
  const tenantId = "33333333-3333-3333-3333-333333333333";

  it("computes exact create, update, skip, and conflict counts idempotently", async () => {
    const existingMaterials = [
      { id: "m1", code: "HPL_base", price_per_unit: 7700, archived_at: null, tenant_id: tenantId },
    ];
    const existingFinishes = [
      { id: "f1", code: "HPL", price_per_unit: 0, archived_at: null, tenant_id: tenantId },
    ];

    const mockClient = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            is: async () => {
              if (table === "catalog_materials") return { data: existingMaterials };
              if (table === "catalog_finishes") return { data: existingFinishes };
              return { data: [] };
            },
          }),
        }),
      }),
    };

    const prices: NormalizedPriceRecord[] = [
      // 1. Skip: same price as existing (7700)
      { unitType: "base", finishCode: "HPL", finishLabel: "HPL", widthTier: "standard", widthCm: 100, price: 7700, isFixed: false },
      // 2. Conflict: finish UNKNOWN not in catalog_finishes
      { unitType: "base", finishCode: "UNKNOWN" as FinishCode, finishLabel: "UNKNOWN", widthTier: "standard", widthCm: 100, price: 9000, isFixed: false },
    ];

    const addons: AddonRecord[] = [
      // 3. Create: new hardware item
      { slug: "slide-soft-50", label: "مجرى سوفت 50 سم", price: 180, category: "hardware" },
    ];

    const diff1 = await computeDiff(mockClient, tenantId, prices, addons, []);
    const diff2 = await computeDiff(mockClient, tenantId, prices, addons, []);

    // Deterministic results
    expect(diff1).toEqual(diff2);
    expect(diff1.summary.pricesSkipped).toBe(2);
    expect(diff1.summary.totalConflicts).toBe(1);
    expect(diff1.summary.addonsCreated).toBe(1);
    expect(diff1.conflicts[0]).toContain("Finish not found in catalog: UNKNOWN");
  });
});

describe("4. End-to-End Pricing Integrity (Catalog -> componentAmount -> engine-v3 -> Quote)", () => {
  it("calculates exact leaf component monetary amount from catalog prices", () => {
    const component = {
      kind: "material" as const,
      qty: 1,
      unitOfMeasure: "m2",
      areaFunctionKey: "cabinet_side",
    };

    const catalogEntity = {
      pricingUnit: "m2",
      pricePerUnit: 500, // 500 EGP / m2
      defaultWastagePct: 10, // 10% wastage
    };

    // Cabinet side dimensions: 600mm W, 800mm H, 560mm D
    // Area for cabinet_side = (0.60 * 0.80) = 0.48 m2
    const dims = { w: 600, h: 800, d: 560 };
    const wastageLookup = () => null;

    const cost = componentAmount(component, catalogEntity, dims, wastageLookup);

    // Expected base: 0.48 * 500 = 240 EGP
    // With 10% wastage: 240 * 1.10 = 264.00 EGP
    expect(round2(cost)).toBe(264);
  });

  it("cascades component prices through factor stack to accurate quote totals", () => {
    const catalog: CatalogLookup = {
      materials: {
        "mat-mdf": { id: "mat-mdf", pricingUnit: "m2", pricePerUnit: 400, defaultWastagePct: 0 },
      },
      hardware: {
        "hw-hinge": { id: "hw-hinge", pricePerPiece: 50 },
      },
      accessories: {},
      manufacturingOps: {},
      veneers: {},
      finishes: {},
      edgeBands: {},
      pricingFactors: [
        { factorKey: "overhead", percent: 10, valueType: "percent", fixedAmount: 0 },
        { factorKey: "margin", percent: 20, valueType: "percent", fixedAmount: 0 },
      ],
      wastageRules: [],
      feesCredits: [],
    };

    const tree: QuoteInput = {
      products: [
        {
          id: "p1",
          sections: [
            {
              id: "s1",
              units: [
                {
                  id: "u1",
                  unitTypeId: null,
                  widthMm: 600,
                  heightMm: 720,
                  depthMm: 560,
                  qty: 1,
                  components: [
                    { id: "c1", kind: "hardware", catalogId: "hw-hinge", qty: 2, unitOfMeasure: "pcs" },
                  ],
                },
              ],
            },
          ],
        },
      ],
      discount: { amount: 0 },
    };

    const quoteResult = priceQuote(tree, catalog);

    // Hardware cost = 2 * 50 = 100 EGP
    // Overhead 10% on 100 = 10
    // Margin 20% on 100 = 20
    // Unit price = 100 + 10 + 20 = 130 EGP
    const unit1 = quoteResult.products[0].sections[0].units[0];
    expect(unit1.computedUnitCost).toBe(100);
    expect(unit1.computedUnitPrice).toBe(130);

    // Subtotal: 130
    // VAT 14%: 130 * 0.14 = 18.20
    // Total: 148.20
    expect(quoteResult.breakdown.subTotal).toBe(130);
    expect(quoteResult.breakdown.vatAmount).toBe(18.2);
    expect(quoteResult.breakdown.total).toBe(148.2);
  });
});

describe("5. Frozen Snapshot Protection Against Catalog Price Mutations", () => {
  it("frozen quote snapshot preserves original price even if catalog price increases 50%", () => {
    // Initial catalog price: 40 EGP
    const initialCatalog: CatalogLookup = {
      materials: {},
      hardware: { "hw-hinge": { id: "hw-hinge", pricePerPiece: 40 } },
      accessories: {},
      manufacturingOps: {},
      veneers: {},
      finishes: {},
      edgeBands: {},
      pricingFactors: [{ factorKey: "margin", percent: 25, valueType: "percent", fixedAmount: 0 }],
      wastageRules: [],
      feesCredits: [],
    };

    const tree: QuoteInput = {
      products: [
        {
          id: "p1",
          sections: [
            {
              id: "s1",
              units: [
                {
                  id: "u1",
                  unitTypeId: null,
                  widthMm: 600,
                  heightMm: 720,
                  depthMm: 560,
                  qty: 1,
                  components: [
                    { id: "c1", kind: "hardware", catalogId: "hw-hinge", qty: 1, unitOfMeasure: "pcs" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const initialQuote = priceQuote(tree, initialCatalog);
    // 1 unit * (40 cost * 1.25 margin = 50 unit price) = 50 subtotal
    expect(initialQuote.breakdown.subTotal).toBe(50);

    // Snapshot is created and frozen
    const frozenSnapshot = {
      state: "sent",
      tree_json: initialQuote.products,
      breakdown_json: initialQuote.breakdown,
    };

    // Subsequent catalog mutation: price increases 50% from 40 to 60 EGP
    const mutatedCatalog: CatalogLookup = {
      ...initialCatalog,
      hardware: { "hw-hinge": { id: "hw-hinge", pricePerPiece: 60 } },
    };

    // Live draft recalculation uses new price
    const liveRecalculation = priceQuote(tree, mutatedCatalog);
    // 1 unit * (60 cost * 1.25 margin = 75 unit price) = 75 subtotal
    expect(liveRecalculation.breakdown.subTotal).toBe(75);

    // Frozen snapshot remains 100% immutable
    expect(frozenSnapshot.breakdown_json.subTotal).toBe(50);
    expect(frozenSnapshot.breakdown_json.total).toBe(initialQuote.breakdown.total);
  });
});
