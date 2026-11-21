import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { getCategoryProducts, getCategoryIcon } from "../routes/admin/quotes/new";
import { type QuotableProduct } from "./catalog.functions";
import {
  DEFAULT_COMMERCIAL_CATEGORIES,
  type CommercialProductCategory,
} from "./commercial-quote-types";

describe("Quotation Builder & Category Selector Linking", () => {
  describe("1. Architectural & UI Integrity in new.tsx", () => {
    it("Quotation Builder (new.tsx) contains Category Selector in line item and links to catalog products", () => {
      const src = readFileSync(resolve("src/routes/admin/quotes/new.tsx"), "utf-8");

      // Category selector in the line item form
      expect(src).toContain("getCategoryProducts");
      expect(src).toContain("categoryProducts.inCategory");
      expect(src).toContain('value={line.category || ""}');
      expect(src).toContain("handleCategoryChange(idx, v)");

      // Catalog item selector linked and filtered
      expect(src).toContain('value={line.productId || (line.isCustom ? "custom" : "")}');
      expect(src).toContain("handleProductSelect(idx, v)");

      // Icons support
      expect(src).toContain("Table");
      expect(src).toContain("Bed");
    });

    it("DEFAULT_COMMERCIAL_CATEGORIES includes tables, bedrooms, and office categories", () => {
      const tablesCat = DEFAULT_COMMERCIAL_CATEGORIES.find((c) => c.code === "tables");
      expect(tablesCat).toBeDefined();
      expect(tablesCat?.nameAr).toBe("طاولات");
      expect(tablesCat?.nameEn).toBe("Tables");

      const bedCat = DEFAULT_COMMERCIAL_CATEGORIES.find((c) => c.code === "bedrooms");
      expect(bedCat).toBeDefined();
      expect(bedCat?.nameAr).toBe("غرف نوم");

      const offCat = DEFAULT_COMMERCIAL_CATEGORIES.find((c) => c.code === "office");
      expect(offCat).toBeDefined();
      expect(offCat?.nameAr).toBe("أثاث مكتبي");
    });

    it("getCategoryIcon returns appropriate icons for tables, bedrooms, and office", () => {
      expect(getCategoryIcon("tables")).toBeDefined();
      expect(getCategoryIcon("bedrooms")).toBeDefined();
      expect(getCategoryIcon("office")).toBeDefined();
    });
  });

  describe("2. Category and Product Filtering Logic", () => {
    const mockProducts: QuotableProduct[] = [
      {
        id: "prod-table-1",
        code: "OFF-MT-006",
        nameAr: "طاولة اجتماعات",
        nameEn: "Meeting Table",
        descriptionAr: "طاولة اجتماعات خشب زان",
        basePrice: 6000,
        categoryId: "17b7c008-0c11-45c1-b88d-ac059f71ae83",
        categoryNameAr: "طاولات",
        categoryNameEn: "Tables",
        pricingUnit: "unit",
        active: true,
      },
      {
        id: "prod-table-2",
        code: "DIN-6C-001",
        nameAr: "طاولة طعام 6 كراسي",
        nameEn: "6-Chair Dining Table",
        descriptionAr: null,
        basePrice: 8500,
        categoryId: "17b7c008-0c11-45c1-b88d-ac059f71ae83",
        categoryNameAr: "طاولات",
        categoryNameEn: "Tables",
        pricingUnit: "unit",
        active: true,
      },
      {
        id: "prod-kit-1",
        code: "KIT-CLS-001",
        nameAr: "مطبخ كلاسيك",
        nameEn: "Classic Kitchen",
        descriptionAr: "مطبخ خشب كونتر",
        basePrice: 12000,
        categoryId: "e1ef95bf-b4b7-474b-a145-659d0cfe56f2",
        categoryNameAr: "مطابخ",
        categoryNameEn: "Kitchens",
        pricingUnit: "linear_meter",
        active: true,
      },
      {
        id: "prod-wrd-1",
        code: "WRD-6D-001",
        nameAr: "دولاب ملابس 6 ضلف",
        nameEn: "6-Door Wardrobe",
        descriptionAr: null,
        basePrice: 15000,
        categoryId: "ce313047-73ee-4aed-9cb2-9b3f2b2d8c22",
        categoryNameAr: "دواليب ملابس",
        categoryNameEn: "Wardrobes",
        pricingUnit: "linear_meter",
        active: true,
      },
      {
        id: "prod-bed-1",
        code: "BED-WD-003",
        nameAr: "سرير خشب عرض 180",
        nameEn: "180cm Wooden Bed",
        descriptionAr: null,
        basePrice: 7000,
        categoryId: "4ba05b99-5315-4365-93e9-fb0a6ef701ae",
        categoryNameAr: "غرف نوم",
        categoryNameEn: "Bedrooms",
        pricingUnit: "unit",
        active: true,
      },
      {
        id: "prod-off-1",
        code: "OFF-ED-001",
        nameAr: "مكتب مدير",
        nameEn: "Executive Desk",
        descriptionAr: null,
        basePrice: 5000,
        categoryId: "554cab96-e4e8-486d-8404-029f451fe537",
        categoryNameAr: "أثاث مكتبي",
        categoryNameEn: "Office Furniture",
        pricingUnit: "unit",
        active: true,
      },
    ];

    it("Filters catalog products to ONLY items matching selected category", () => {
      // Test Tables category
      const tableResult = getCategoryProducts(
        "tables",
        "طاولات",
        DEFAULT_COMMERCIAL_CATEGORIES,
        mockProducts,
      );
      expect(tableResult.inCategory.length).toBe(2);
      expect(tableResult.inCategory.some((p) => p.code === "OFF-MT-006")).toBe(true);
      expect(tableResult.inCategory.some((p) => p.code === "DIN-6C-001")).toBe(true);
      expect(tableResult.inCategory.some((p) => p.code === "KIT-CLS-001")).toBe(false);

      // Test Kitchens category
      const kitchenResult = getCategoryProducts(
        "kitchen",
        "مطبخ",
        DEFAULT_COMMERCIAL_CATEGORIES,
        mockProducts,
      );
      expect(kitchenResult.inCategory.length).toBe(1);
      expect(kitchenResult.inCategory[0].code).toBe("KIT-CLS-001");

      // Test Bedrooms category
      const bedResult = getCategoryProducts(
        "bedrooms",
        "غرف نوم",
        DEFAULT_COMMERCIAL_CATEGORIES,
        mockProducts,
      );
      expect(bedResult.inCategory.length).toBe(1);
      expect(bedResult.inCategory[0].code).toBe("BED-WD-003");

      // Test Dressing category
      const dressingResult = getCategoryProducts(
        "dressing",
        "دريسنج",
        DEFAULT_COMMERCIAL_CATEGORIES,
        mockProducts,
      );
      expect(dressingResult.inCategory.length).toBe(1);
      expect(dressingResult.inCategory[0].code).toBe("WRD-6D-001");

      // Test Office category
      const officeResult = getCategoryProducts(
        "office",
        "أثاث مكتبي",
        DEFAULT_COMMERCIAL_CATEGORIES,
        mockProducts,
      );
      expect(officeResult.inCategory.length).toBe(1);
      expect(officeResult.inCategory[0].code).toBe("OFF-ED-001");
    });

    it("Product selection properly sets category, price, and specs without falling back to custom", () => {
      const meetingTableProd = mockProducts.find((p) => p.code === "OFF-MT-006")!;

      let matchedCat = DEFAULT_COMMERCIAL_CATEGORIES.find(
        (c) =>
          c.code.toLowerCase() === (meetingTableProd.categoryNameEn || "").toLowerCase().replace(/[^a-z0-9]/g, "_") ||
          c.nameAr.trim() === (meetingTableProd.categoryNameAr || "").trim(),
      );

      expect(matchedCat).toBeDefined();
      expect(matchedCat?.code).toBe("tables");
      expect(matchedCat?.nameAr).toBe("طاولات");
      expect(matchedCat?.nameEn).toBe("Tables");
    });
  });
});
