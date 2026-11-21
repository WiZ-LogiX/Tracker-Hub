import { describe, it, expect, afterAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  listProductsCatalogServer,
  listProductCategoriesServer,
  upsertProductCatalogItemServer,
  deleteProductCatalogItemServer,
  createProductCategoryServer,
} from "./products.server";
import { db } from "@/db/client.server";
import { products, categories } from "@/db/schema";
import { eq, and } from "drizzle-orm";

describe("Products Catalog & Category Classification Integration", () => {
  const TENANT_ID = "2bf7cd99-d567-42d3-b5fc-22cc40654293";
  const TEST_PRODUCT_CODE = "TEST-CAT-ITEM-999";
  let createdProductId: string | null = null;
  let createdCategoryId: string | null = null;

  afterAll(async () => {
    // Cleanup test artifacts
    try {
      if (createdProductId) {
        await db.delete(products).where(eq(products.id, createdProductId));
      }
      if (createdCategoryId) {
        await db.delete(categories).where(eq(categories.id, createdCategoryId));
      }
    } catch {}
  });

  describe("1. Architectural & Client Bundle Safety", () => {
    it("ProductsPage uses ProductsCatalogManager and retains Options tab architecture", () => {
      const routeSrc = readFileSync(
        resolve("src/routes/admin/products.tsx"),
        "utf-8",
      );

      // Must import ProductsCatalogManager
      expect(routeSrc).toContain("ProductsCatalogManager");
      // Must NOT use GenericCrud
      expect(routeSrc).not.toContain("GenericCrud");
      // Must retain tabs: products & options
      expect(routeSrc).toContain('TabsTrigger value="products"');
      expect(routeSrc).toContain('TabsTrigger value="options"');
      expect(routeSrc).toContain('TabsContent value="options"');
      expect(routeSrc).toContain("CommercialCategoriesSettings");
      // Must retain tab search param schema
      expect(routeSrc).toContain('tab: z.enum(["products", "options"])');
    });

    it("products.functions.ts has ZERO top-level server DB imports (Bundle Leak Prevention)", () => {
      const fnSrc = readFileSync(
        resolve("src/lib/products.functions.ts"),
        "utf-8",
      );

      // Top level should NOT import drizzle or client.server
      expect(fnSrc).not.toMatch(/^import .* from ["']drizzle-orm["'];/m);
      expect(fnSrc).not.toMatch(/^import .* from ["']@\/db\/client\.server["'];/m);
      expect(fnSrc).not.toMatch(/^import .* from ["']@\/db\/schema["'];/m);

      // Must dynamically import ./products.server inside handlers
      expect(fnSrc).toContain('import("./products.server")');
    });

    it("ProductsCatalogManager UI component provides category filtering and assignment dropdown", () => {
      const compSrc = readFileSync(
        resolve("src/components/products/ProductsCatalogManager.tsx"),
        "utf-8",
      );

      // Must have category pill tabs / buttons
      expect(compSrc).toContain("selectedCategoryFilter");
      expect(compSrc).toContain("categoryCounts");

      // Must have category classification Select in Dialog
      expect(compSrc).toContain("Select value={categoryId}");
      expect(compSrc).toContain("SelectContent");
      expect(compSrc).toContain("newCatNameAr");
    });
  });

  describe("2. Database Query & Classification Linking", () => {
    it("listProductCategoriesServer returns tenant categories including Tables", async () => {
      const cats = await listProductCategoriesServer(TENANT_ID);
      expect(cats.length).toBeGreaterThan(0);

      const tableCat = cats.find((c) => c.nameAr === "طاولات" || c.nameEn.toLowerCase() === "tables");
      expect(tableCat).toBeDefined();
      expect(tableCat?.id).toBeDefined();
    });

    it("listProductsCatalogServer returns products with joined category information", async () => {
      const catalog = await listProductsCatalogServer(TENANT_ID);
      expect(catalog.length).toBeGreaterThan(0);

      // Check that items have category fields
      const classifiedItem = catalog.find((p) => p.categoryId !== null);
      expect(classifiedItem).toBeDefined();
      expect(classifiedItem?.categoryNameAr).toBeDefined();

      // Specifically verify Meeting Table (OFF-MT-006) is linked to Tables (طاولات)
      const meetingTable = catalog.find((p) => p.code === "OFF-MT-006");
      expect(meetingTable).toBeDefined();
      expect(meetingTable?.nameAr).toBe("طاولة اجتماعات");
      expect(meetingTable?.categoryNameAr).toBe("طاولات");
      expect(meetingTable?.categoryNameEn).toBe("Tables");
    });

    it("upsertProductCatalogItemServer links and updates product category", async () => {
      const cats = await listProductCategoriesServer(TENANT_ID);
      const tableCat = cats.find((c) => c.nameAr === "طاولات");
      expect(tableCat).toBeDefined();

      // Create a test product linked to Tables category
      const res = await upsertProductCatalogItemServer(TENANT_ID, {
        code: TEST_PRODUCT_CODE,
        nameAr: "طاولة اختبار تنفيذية",
        nameEn: "Executive Test Table",
        categoryId: tableCat!.id,
        basePrice: 7500,
        laborPct: 15,
        wastagePct: 8,
        overheadPct: 10,
        marginPct: 25,
        descriptionAr: "طاولة خشب زان للاختبار",
        active: true,
      });

      expect(res.ok).toBe(true);
      expect(res.product).toBeDefined();
      createdProductId = res.product.id;

      // Verify that listProductsCatalogServer now shows this item linked to Tables
      const catalog = await listProductsCatalogServer(TENANT_ID);
      const testItem = catalog.find((p) => p.id === createdProductId);
      expect(testItem).toBeDefined();
      expect(testItem?.code).toBe(TEST_PRODUCT_CODE);
      expect(testItem?.categoryId).toBe(tableCat!.id);
      expect(testItem?.categoryNameAr).toBe("طاولات");

      // Now reclassify to a different category or null
      await upsertProductCatalogItemServer(TENANT_ID, {
        id: createdProductId,
        code: TEST_PRODUCT_CODE,
        nameAr: "طاولة اختبار تنفيذية (معدلة)",
        categoryId: null,
        basePrice: 8000,
        laborPct: 15,
        wastagePct: 8,
        overheadPct: 10,
        marginPct: 25,
        active: true,
      });

      const catalogAfter = await listProductsCatalogServer(TENANT_ID);
      const testItemAfter = catalogAfter.find((p) => p.id === createdProductId);
      expect(testItemAfter?.categoryId).toBeNull();
      expect(testItemAfter?.categoryNameAr).toBeNull();
    });

    it("deleteProductCatalogItemServer deletes item cleanly", async () => {
      if (!createdProductId) return;

      const delRes = await deleteProductCatalogItemServer(TENANT_ID, createdProductId);
      expect(delRes.ok).toBe(true);

      const catalog = await listProductsCatalogServer(TENANT_ID);
      const found = catalog.find((p) => p.id === createdProductId);
      expect(found).toBeUndefined();
      createdProductId = null;
    });

    it("createProductCategoryServer creates a new classification category", async () => {
      const res = await createProductCategoryServer(TENANT_ID, {
        nameAr: "تصنيف تجريبي مخصص",
        nameEn: "Custom Test Category",
        pricingUnit: "unit",
      });

      expect(res.ok).toBe(true);
      expect(res.category).toBeDefined();
      createdCategoryId = res.category.id;

      const cats = await listProductCategoriesServer(TENANT_ID);
      const createdCat = cats.find((c) => c.id === createdCategoryId);
      expect(createdCat).toBeDefined();
      expect(createdCat?.nameAr).toBe("تصنيف تجريبي مخصص");
    });
  });
});
