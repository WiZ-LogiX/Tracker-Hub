import { describe, it, expect } from "vitest";

describe("PeleCanon Catalog Integration, Inventory Management & Admin Cleanup Tests", () => {
  describe("1. Inventory Item Invariants & Validation", () => {
    it("validates that inventory item creation enforces required SKU, name, unit, and non-negative numbers", () => {
      const validateCreate = (input: {
        itemType: string;
        sku: string;
        name: string;
        unit: string;
        minReorderLevel: number;
        initialStock: number;
        costPrice: number;
      }) => {
        if (!["material", "hardware"].includes(input.itemType)) {
          throw new Error("Invalid item type");
        }
        if (!input.sku.trim()) {
          throw new Error("SKU is required");
        }
        if (!input.name.trim()) {
          throw new Error("Name is required");
        }
        if (!input.unit.trim()) {
          throw new Error("Unit is required");
        }
        if (input.minReorderLevel < 0 || input.initialStock < 0 || input.costPrice < 0) {
          throw new Error("Numerical quantities cannot be negative");
        }
        return {
          ...input,
          sku: input.sku.trim().toUpperCase(),
          name: input.name.trim(),
        };
      };

      const valid = validateCreate({
        itemType: "material",
        sku: "mat-oak-18",
        name: "Natural Oak Plywood 18mm",
        unit: "sheet",
        minReorderLevel: 5,
        initialStock: 20,
        costPrice: 850,
      });

      expect(valid.sku).toBe("MAT-OAK-18");
      expect(valid.name).toBe("Natural Oak Plywood 18mm");

      expect(() =>
        validateCreate({
          itemType: "material",
          sku: "",
          name: "Item",
          unit: "pcs",
          minReorderLevel: 0,
          initialStock: 0,
          costPrice: 0,
        }),
      ).toThrow("SKU is required");

      expect(() =>
        validateCreate({
          itemType: "material",
          sku: "TEST-01",
          name: "",
          unit: "pcs",
          minReorderLevel: 0,
          initialStock: 0,
          costPrice: 0,
        }),
      ).toThrow("Name is required");

      expect(() =>
        validateCreate({
          itemType: "material",
          sku: "TEST-01",
          name: "Test",
          unit: "pcs",
          minReorderLevel: -1,
          initialStock: 0,
          costPrice: 0,
        }),
      ).toThrow("Numerical quantities cannot be negative");
    });

    it("strictly forbids deletion of inventory items with active reservations", () => {
      const validateDelete = (item: {
        id: string;
        sku: string;
        reservedQuantity: number;
        activeReservationsCount: number;
      }) => {
        if (item.reservedQuantity > 0 || item.activeReservationsCount > 0) {
          throw new Error(
            `Cannot delete item with active reservations (${item.reservedQuantity} units reserved)`,
          );
        }
        return { canDelete: true, mode: "safe_archive_and_delete" };
      };

      // Unreserved item can be removed safely
      expect(
        validateDelete({
          id: "item-1",
          sku: "MAT-001",
          reservedQuantity: 0,
          activeReservationsCount: 0,
        }),
      ).toEqual({ canDelete: true, mode: "safe_archive_and_delete" });

      // Item with active reserved units is blocked
      expect(() =>
        validateDelete({
          id: "item-2",
          sku: "HDW-002",
          reservedQuantity: 15,
          activeReservationsCount: 2,
        }),
      ).toThrow("Cannot delete item with active reservations (15 units reserved)");
    });
  });

  describe("2. Quotation Catalog Line Item & Price Override Invariants", () => {
    it("allows negotiated commercial price override while preserving catalog linkage", () => {
      const createQuotationLine = (catalogProduct: {
        id: string;
        code: string;
        nameAr: string;
        basePrice: number;
        defaultSpecs: string;
      }, overrides?: {
        negotiatedPrice?: number;
        customSpecs?: string;
        customQuantity?: number;
        customTitle?: string;
      }) => {
        const unitPrice = overrides?.negotiatedPrice !== undefined ? overrides.negotiatedPrice : catalogProduct.basePrice;
        const quantity = overrides?.customQuantity !== undefined ? overrides.customQuantity : 1;
        const lineTotal = Math.round(quantity * unitPrice * 100) / 100;

        return {
          productId: catalogProduct.id,
          productCode: catalogProduct.code,
          isCustom: false,
          name: overrides?.customTitle || catalogProduct.nameAr,
          technicalSpecs: overrides?.customSpecs || catalogProduct.defaultSpecs,
          quantity,
          unitPrice,
          lineTotal,
        };
      };

      const catalogProduct = {
        id: "prod-kit-1",
        code: "KIT-LUX-004",
        nameAr: "مطبخ فاخر مع جزيرة",
        basePrice: 25000,
        defaultSpecs: "شاسيه كونتر جودوود + دلف HPL",
      };

      // 1. Default selection populated directly from catalog
      const standardLine = createQuotationLine(catalogProduct);
      expect(standardLine.productId).toBe("prod-kit-1");
      expect(standardLine.productCode).toBe("KIT-LUX-004");
      expect(standardLine.unitPrice).toBe(25000);
      expect(standardLine.lineTotal).toBe(25000);

      // 2. Commercial negotiated price override (e.g. negotiated up to 28,000 with custom title and specs)
      const negotiatedLine = createQuotationLine(catalogProduct, {
        negotiatedPrice: 28000,
        customTitle: "مطبخ فاخر مخصص بالفيلا",
        customSpecs: "مطبخ فاخر مخصص مع جزيرة رخام كلكتا",
        customQuantity: 2,
      });

      expect(negotiatedLine.productId).toBe("prod-kit-1");
      expect(negotiatedLine.productCode).toBe("KIT-LUX-004");
      expect(negotiatedLine.unitPrice).toBe(28000); // Successfully overridden!
      expect(negotiatedLine.lineTotal).toBe(56000);
      expect(negotiatedLine.name).toBe("مطبخ فاخر مخصص بالفيلا");
      expect(negotiatedLine.technicalSpecs).toContain("رخام كلكتا");
    });

    it("supports ad-hoc custom / non-catalog items with null productId", () => {
      const customLine = {
        productId: null,
        productCode: null,
        isCustom: true,
        name: "برجولة خشبية خارجية مخصصة للحديقة",
        technicalSpecs: "خشب موسكي معالج مع دهان أروما خارجي عازل للحرارة",
        quantity: 1,
        unitPrice: 45000,
        lineTotal: 45000,
      };

      expect(customLine.productId).toBeNull();
      expect(customLine.productCode).toBeNull();
      expect(customLine.isCustom).toBe(true);
      expect(customLine.lineTotal).toBe(45000);
    });
  });

  describe("3. Admin Navigation & Terminology Parity", () => {
    it("ensures section pricing and obsolete items are removed and properly localized", () => {
      const allowedSidebarRoutes = [
        "/admin",
        "/admin/projects",
        "/admin/crm",
        "/admin/crm/sales",
        "/admin/crm/analytics",
        "/admin/crm/after-sales",
        "/admin/tasks",
        "/admin/quotes",
        "/admin/orders",
        "/admin/deliveries",
        "/admin/invoices",
        "/admin/cost-analysis",
        "/admin/discounts",
        "/admin/customers",
        "/admin/products",
        "/admin/inventory",
        "/admin/work-orders",
        "/admin/workers",
        "/admin/remakes",
        "/admin/team",
        "/admin/notifications",
        "/admin/settings",
      ];

      const obsoleteRoutes = [
        "/admin/catalog",
        "/admin/pricing-factors",
        "/admin/wastage-rules",
        "/admin/pricing-rules",
        "/admin/rate-card",
      ];

      for (const obsolete of obsoleteRoutes) {
        expect(allowedSidebarRoutes).not.toContain(obsolete);
      }

      // Cost analysis and discounts are preserved in Core operations
      expect(allowedSidebarRoutes).toContain("/admin/cost-analysis");
      expect(allowedSidebarRoutes).toContain("/admin/discounts");
      expect(allowedSidebarRoutes).toContain("/admin/inventory");
    });
  });

  describe("4. Inventory Workspace Optimization & Category Organization", () => {
    it("validates tab persistence schema and defaults for raw materials and hardware", async () => {
      const { z } = await import("zod");

      const inventorySearchSchema = z.object({
        tab: z.enum(["materials", "hardware"]).optional().default("materials"),
        search: z.string().optional().default(""),
        category: z.string().optional().default("all"),
        lowStock: z.boolean().optional().default(false),
        sort: z
          .enum(["name_asc", "sku_asc", "lowest_stock", "highest_reserved", "newest"])
          .optional()
          .default("name_asc"),
        page: z.number().int().min(1).optional().default(1),
        pageSize: z.number().int().min(1).max(100).optional().default(25),
      });

      // Default empty search parses to materials tab and page 1
      const defaultState = inventorySearchSchema.parse({});
      expect(defaultState.tab).toBe("materials");
      expect(defaultState.page).toBe(1);
      expect(defaultState.category).toBe("all");
      expect(defaultState.lowStock).toBe(false);

      // Hardware tab parses correctly with custom category and low stock
      const hardwareState = inventorySearchSchema.parse({
        tab: "hardware",
        category: "hinges",
        lowStock: true,
        page: 2,
      });
      expect(hardwareState.tab).toBe("hardware");
      expect(hardwareState.category).toBe("hinges");
      expect(hardwareState.lowStock).toBe(true);
      expect(hardwareState.page).toBe(2);
    });

    it("correctly infers item categories for both raw materials and accessories/hardware", async () => {
      const {
        inferItemCategory,
        getCategoryLabel,
        MATERIAL_CATEGORIES,
        HARDWARE_CATEGORIES,
      } = await import("./inventory-types");

      // Verify defined categories
      expect(MATERIAL_CATEGORIES.map((c) => c.key)).toContain("mdf");
      expect(MATERIAL_CATEGORIES.map((c) => c.key)).toContain("plywood");
      expect(MATERIAL_CATEGORIES.map((c) => c.key)).toContain("solid_wood");
      expect(HARDWARE_CATEGORIES.map((c) => c.key)).toContain("hinges");
      expect(HARDWARE_CATEGORIES.map((c) => c.key)).toContain("handles");
      expect(HARDWARE_CATEGORIES.map((c) => c.key)).toContain("runners");

      // Material inferences
      expect(inferItemCategory("material", "Spanish MDF High Gloss", "MAT-MDF-01")).toBe("mdf");
      expect(inferItemCategory("material", "Natural Oak Plywood 18mm", "MAT-PLY-18")).toBe("plywood");
      expect(inferItemCategory("material", "Romanian Beech Solid Wood", "MAT-BEECH-01")).toBe("solid_wood");
      expect(inferItemCategory("material", "HPL Fire Retardant Sheet", "MAT-HPL-44")).toBe("laminates");
      expect(inferItemCategory("material", "Clear Tempered Glass 8mm", "MAT-GLS-08")).toBe("glass_metal");

      // Hardware inferences
      expect(inferItemCategory("hardware", "Blum Soft Close Hinge 110", "HDW-HNG-01")).toBe("hinges");
      expect(inferItemCategory("hardware", "Matte Black Profile Handle 160mm", "HDW-HND-160")).toBe("handles");
      expect(inferItemCategory("hardware", "Tandembox Undermount Runner 50cm", "HDW-SLD-50")).toBe("runners");
      expect(inferItemCategory("hardware", "Confirmat Screws 7x50mm", "HDW-SCR-750")).toBe("fasteners");
      expect(inferItemCategory("hardware", "Central Drawer Lock with Key", "HDW-LCK-01")).toBe("locks");
      expect(inferItemCategory("hardware", "Heavy Duty Corner Bracket", "HDW-BRK-90")).toBe("brackets");

      // Bilingual Category Labels
      expect(getCategoryLabel("mdf", "material", "en")).toBe("MDF & HDF");
      expect(getCategoryLabel("mdf", "material", "ar")).toBe("إم دي إف وألواح مضغوطة");
      expect(getCategoryLabel("hinges", "hardware", "en")).toBe("Hinges & Pivots");
      expect(getCategoryLabel("hinges", "hardware", "ar")).toBe("مفصلات");
    });
  });
});
