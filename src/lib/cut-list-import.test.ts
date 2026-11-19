import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/db/client.server";
import {
  tenants,
  customers,
  orders,
  productionWorkOrders,
  workOrderCutListItems,
  remakes,
  auditLog,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  parseCutListCsv,
  detectDelimiter,
  parseNumberSafely,
  sanitizeCsvFormula,
  computeCutListSummary,
  autoMapHeaders,
  normalizeGrainDirection,
  normalizeEdgeBanding,
} from "@/lib/cut-list-import.pure";
import { executeImportWorkOrderCutList } from "@/lib/cut-list-import.server";
import { createRemake } from "@/lib/remakes.functions";

describe("Sprint 7A — Workshop-Grade Cut-List CSV Importer & Relational Remake Suite", () => {
  // ── 1. Pure Unit Tests: Delimiter, Encoding, Arabic & Header Auto-Mapping ────

  describe("1. Delimiter Detection & RFC-4180 Parsing", () => {
    it("auto-detects semicolon delimiter and parses quoted cells cleanly", () => {
      const csv = `Part Name;Length;Width;Qty\n"Side Panel; Left";720;560;2\n"Bottom Shelf";864;560;1`;
      const delimiter = detectDelimiter(csv);
      expect(delimiter).toBe(";");

      const result = parseCutListCsv(csv, { sourceUnit: "mm" });
      expect(result.delimiter).toBe(";");
      expect(result.validItems).toHaveLength(2);
      expect(result.validItems[0].partName).toBe("Side Panel; Left");
      expect(result.validItems[0].lengthMm).toBe(720);
      expect(result.validItems[0].widthMm).toBe(560);
      expect(result.validItems[0].quantity).toBe(2);
    });

    it("strips UTF-8 BOM prefix (\\uFEFF) without corrupting the first column header", () => {
      const bomCsv = `\uFEFFPart Name,Material,Length,Width,Qty\nTop Rail,MDF 18mm,864,100,4`;
      const result = parseCutListCsv(bomCsv, { sourceUnit: "mm" });
      expect(result.headers[0]).toBe("Part Name");
      expect(result.columnMap.partName).toBe("Part Name");
      expect(result.validItems[0].partName).toBe("Top Rail");
    });
  });

  describe("2. Bilingual Header Auto-Mapping (English, Arabic, Khazana, PolyBoard, OpenCutList)", () => {
    it("auto-maps English headers accurately", () => {
      const headers = [
        "Part Name",
        "Unit",
        "Material Name",
        "Length (mm)",
        "Width (mm)",
        "Thickness (mm)",
        "Qty",
        "Edge Top",
        "Edge Bottom",
        "Grain",
        "Notes",
      ];
      const mapping = autoMapHeaders(headers);
      expect(mapping.partName).toBe("Part Name");
      expect(mapping.unitName).toBe("Unit");
      expect(mapping.materialName).toBe("Material Name");
      expect(mapping.lengthMm).toBe("Length (mm)");
      expect(mapping.widthMm).toBe("Width (mm)");
      expect(mapping.thicknessMm).toBe("Thickness (mm)");
      expect(mapping.quantity).toBe("Qty");
      expect(mapping.edgeTop).toBe("Edge Top");
      expect(mapping.edgeBottom).toBe("Edge Bottom");
      expect(mapping.grainDirection).toBe("Grain");
      expect(mapping.notes).toBe("Notes");
    });

    it("auto-maps Arabic and Egyptian workshop (Khazana) terminology", () => {
      const headers = [
        "اسم القطعة",
        "الخزانة",
        "الخامة",
        "الطول",
        "العرض",
        "التخنة",
        "الكمية",
        "شريط علوي",
        "شريط سفلي",
        "اتجاه الثمرة",
        "ملاحظات",
      ];
      const mapping = autoMapHeaders(headers);
      expect(mapping.partName).toBe("اسم القطعة");
      expect(mapping.unitName).toBe("الخزانة");
      expect(mapping.materialName).toBe("الخامة");
      expect(mapping.lengthMm).toBe("الطول");
      expect(mapping.widthMm).toBe("العرض");
      expect(mapping.thicknessMm).toBe("التخنة");
      expect(mapping.quantity).toBe("الكمية");
      expect(mapping.edgeTop).toBe("شريط علوي");
      expect(mapping.edgeBottom).toBe("شريط سفلي");
      expect(mapping.grainDirection).toBe("اتجاه الثمرة");
      expect(mapping.notes).toBe("ملاحظات");
    });

    it("auto-maps PolyBoard L1/L2/W1/W2 edge banding headers", () => {
      const headers = ["Piece", "Cabinet", "Board", "Long", "Larg", "Ep", "Count", "L1", "L2", "W1", "W2"];
      const mapping = autoMapHeaders(headers);
      expect(mapping.partName).toBe("Piece");
      expect(mapping.unitName).toBe("Cabinet");
      expect(mapping.materialName).toBe("Board");
      expect(mapping.lengthMm).toBe("Long");
      expect(mapping.widthMm).toBe("Larg");
      expect(mapping.thicknessMm).toBe("Ep");
      expect(mapping.quantity).toBe("Count");
      expect(mapping.edgeTop).toBe("L1");
      expect(mapping.edgeBottom).toBe("L2");
      expect(mapping.edgeLeft).toBe("W1");
      expect(mapping.edgeRight).toBe("W2");
    });
  });

  describe("3. Numerals, Units & Dimension Normalization (cm -> mm)", () => {
    it("converts Arabic-Indic numerals and strips unit suffixes", () => {
      expect(parseNumberSafely("٧٢٠ مم")).toBe(720);
      expect(parseNumberSafely("٥٦٠ cm")).toBe(560);
      expect(parseNumberSafely("١٨,٥")).toBe(18.5);
    });

    it("normalizes dimensions to millimeters when source unit is cm", () => {
      const cmCsv = `Part,Material,Length,Width,Thickness,Qty\nCabinet Side,Oak Veneer,72,56,1.8,2`;
      const parsed = parseCutListCsv(cmCsv, { sourceUnit: "cm" });
      expect(parsed.validItems[0].lengthMm).toBe(720);
      expect(parsed.validItems[0].widthMm).toBe(560);
      expect(parsed.validItems[0].thicknessMm).toBe(18);
      expect(parsed.validItems[0].quantity).toBe(2);
    });

    it("normalizes grain direction and edge banding entries", () => {
      expect(normalizeGrainDirection("along_length")).toBe("along_length");
      expect(normalizeGrainDirection("عرض")).toBe("along_width");
      expect(normalizeGrainDirection("حر")).toBe("can_rotate");
      expect(normalizeGrainDirection("لا يوجد")).toBe("none");

      expect(normalizeEdgeBanding("none")).toBeNull();
      expect(normalizeEdgeBanding("0")).toBeNull();
      expect(normalizeEdgeBanding("-")).toBeNull();
      expect(normalizeEdgeBanding("1mm PVC")).toBe("1mm PVC");
    });
  });

  describe("4. CSV Formula Injection Sanitization", () => {
    it("sanitizes text fields starting with formula operators (=, +, -, @)", () => {
      expect(sanitizeCsvFormula("=SUM(A1:B10)")).toBe("'=SUM(A1:B10)");
      expect(sanitizeCsvFormula("+cmd.exe|' /C calc'!A0")).toBe("'+cmd.exe|' /C calc'!A0");
      expect(sanitizeCsvFormula("@evil_macro")).toBe("'@evil_macro");
      // Standalone numbers are not prepended
      expect(sanitizeCsvFormula("+123.45")).toBe("+123.45");
      expect(sanitizeCsvFormula("Safe Part Name")).toBe("Safe Part Name");
    });
  });

  describe("5. Workshop Sheet & Edge-Banding Math", () => {
    it("calculates exact net area, estimated sheets (15% waste on 1220x2440), and edge banding meters", () => {
      const items = [
        {
          materialName: "MDF 18mm White",
          lengthMm: 720,
          widthMm: 560,
          thicknessMm: 18,
          quantity: 2,
          edgeTop: "1mm PVC",
          edgeBottom: "1mm PVC",
          edgeLeft: null,
          edgeRight: "1mm PVC",
        },
        {
          materialName: "MDF 18mm White",
          lengthMm: 864,
          widthMm: 560,
          thicknessMm: 18,
          quantity: 2,
          edgeTop: null,
          edgeBottom: null,
          edgeLeft: null,
          edgeRight: "1mm PVC",
        },
      ];

      const summary = computeCutListSummary(items, {
        sheetLengthMm: 2440,
        sheetWidthMm: 1220,
        wastePct: 15,
      });

      // Item 1 area: 2 * (0.720 * 0.560) = 0.8064 m²
      // Item 2 area: 2 * (0.864 * 0.560) = 0.96768 m²
      // Total net area: 1.77408 m² (rounded to 1.774 m²)
      expect(summary.totalParts).toBe(4);
      expect(summary.netAreaM2).toBe(1.774);

      // Sheet area: 2.44 * 1.22 = 2.9768 m²
      // Gross area: 1.77408 * 1.15 = 2.040192 m²
      // Sheets needed: Math.ceil(2.040192 / 2.9768) = 1 sheet
      expect(summary.estimatedSheetsTotal).toBe(1);

      // Edge banding linear meters:
      // Item 1: (720 + 720 + 560) * 2 = 2000 * 2 = 4000 mm = 4.0 m
      // Item 2: (560) * 2 = 1120 mm = 1.12 m
      // Total edge banding: 5.12 m -> rounded to 5.1 m
      expect(summary.edgeBandingLinearMeters).toBe(5.1);
      expect(summary.materials).toHaveLength(1);
      expect(summary.materials[0].materialName).toBe("MDF 18mm White");
      expect(summary.materials[0].thicknessMm).toBe(18);
    });
  });

  // ── 2. Server Integration Tests: Persistence, Revision Lock & Remakes ────────

  describe("6. Server Integration: Database Persistence, Revision Lock & Remake Linkage", () => {
    const TEST_TENANT_ID = "00000000-0000-0000-0000-00000000007a";
    let testCustomerId: string;
    let testOrderId: string;
    let testWorkOrderId: string;

    beforeAll(async () => {
      // Setup test tenant
      await db
        .insert(tenants)
        .values({
          id: TEST_TENANT_ID,
          name: "Sprint 7A Test Workshop",
          slug: `test-sprint7a-${Date.now()}`,
        })
        .onConflictDoNothing();

      // Setup customer
      const [c] = await db
        .insert(customers)
        .values({
          tenantId: TEST_TENANT_ID,
          name: "Sprint 7A Cut-List Client",
          phone: "+201009998877",
        })
        .returning({ id: customers.id });
      testCustomerId = c.id;

      // Setup order
      const [ord] = await db
        .insert(orders)
        .values({
          tenantId: TEST_TENANT_ID,
          orderNumber: `ORD-7A-${Date.now().toString().slice(-4)}`,
          customerId: testCustomerId,
          currentStage: "cutting",
          contractDate: "2026-11-19",
        })
        .returning({ id: orders.id });
      testOrderId = ord.id;

      // Setup work order in "ready" status
      const [wo] = await db
        .insert(productionWorkOrders)
        .values({
          tenantId: TEST_TENANT_ID,
          workOrderNumber: `WO-7A-${Date.now().toString().slice(-4)}`,
          orderId: testOrderId,
          status: "ready",
          priority: "high",
        })
        .returning({ id: productionWorkOrders.id });
      testWorkOrderId = wo.id;
    });

    afterAll(async () => {
      // Clean up in reverse dependency order
      await db.delete(remakes).where(eq(remakes.tenantId, TEST_TENANT_ID));
      await db.delete(workOrderCutListItems).where(eq(workOrderCutListItems.tenantId, TEST_TENANT_ID));
      await db.delete(productionWorkOrders).where(eq(productionWorkOrders.tenantId, TEST_TENANT_ID));
      await db.delete(orders).where(eq(orders.tenantId, TEST_TENANT_ID));
      await db.delete(customers).where(eq(customers.tenantId, TEST_TENANT_ID));
      await db.delete(auditLog).where(eq(auditLog.tenantId, TEST_TENANT_ID));
      await db.delete(tenants).where(eq(tenants.id, TEST_TENANT_ID));
    });

    it("imports cut-list items in replace mode into work_order_cut_list_items", async () => {
      const itemsToImport = [
        {
          rowIndex: 0,
          partName: "Side Panel Left",
          unitName: "Base Unit",
          productName: "Kitchen Set",
          sectionName: "Kitchen",
          materialSku: "MAT-MDF-18",
          materialName: "MDF 18mm White Melamine",
          lengthMm: 720,
          widthMm: 560,
          thicknessMm: 18,
          quantity: 2,
          unitOfMeasure: "pcs",
          edgeTop: "1mm PVC",
          edgeBottom: null,
          edgeLeft: null,
          edgeRight: "1mm PVC",
          grainDirection: "along_length" as const,
          notes: "Front edge banded",
          source: "csv_import" as const,
        },
        {
          rowIndex: 1,
          partName: "Bottom Shelf",
          unitName: "Base Unit",
          productName: "Kitchen Set",
          sectionName: "Kitchen",
          materialSku: "MAT-MDF-18",
          materialName: "MDF 18mm White Melamine",
          lengthMm: 864,
          widthMm: 560,
          thicknessMm: 18,
          quantity: 2,
          unitOfMeasure: "pcs",
          edgeTop: null,
          edgeBottom: null,
          edgeLeft: null,
          edgeRight: "1mm PVC",
          grainDirection: "along_length" as const,
          notes: null,
          source: "csv_import" as const,
        },
      ];

      const res = await executeImportWorkOrderCutList(db, {
        tenantId: TEST_TENANT_ID,
        workOrderId: testWorkOrderId,
        mode: "replace",
        items: itemsToImport,
      });

      expect(res.ok).toBe(true);
      expect(res.count).toBe(2);

      // Verify records in DB
      const dbRows = await db
        .select()
        .from(workOrderCutListItems)
        .where(
          and(
            eq(workOrderCutListItems.tenantId, TEST_TENANT_ID),
            eq(workOrderCutListItems.workOrderId, testWorkOrderId),
          ),
        )
        .orderBy(workOrderCutListItems.rowIndex);

      expect(dbRows).toHaveLength(2);
      expect(dbRows[0].partName).toBe("Side Panel Left");
      expect(Number(dbRows[0].lengthMm)).toBe(720);
      expect(Number(dbRows[0].widthMm)).toBe(560);
      expect(dbRows[0].edgeTop).toBe("1mm PVC");
      expect(dbRows[1].partName).toBe("Bottom Shelf");
      expect(Number(dbRows[1].lengthMm)).toBe(864);
    });

    it("appends new rows in append mode without overwriting existing cut-list items", async () => {
      const additionalItem = [
        {
          rowIndex: 0,
          partName: "Top Rail",
          unitName: "Base Unit",
          productName: "Kitchen Set",
          sectionName: "Kitchen",
          materialSku: "MAT-MDF-18",
          materialName: "MDF 18mm White Melamine",
          lengthMm: 864,
          widthMm: 100,
          thicknessMm: 18,
          quantity: 4,
          unitOfMeasure: "pcs",
          edgeTop: null,
          edgeBottom: null,
          edgeLeft: null,
          edgeRight: null,
          grainDirection: "can_rotate" as const,
          notes: null,
          source: "csv_import" as const,
        },
      ];

      const appendRes = await executeImportWorkOrderCutList(db, {
        tenantId: TEST_TENANT_ID,
        workOrderId: testWorkOrderId,
        mode: "append",
        items: additionalItem,
      });

      expect(appendRes.ok).toBe(true);
      expect(appendRes.count).toBe(1);

      const dbRows = await db
        .select()
        .from(workOrderCutListItems)
        .where(
          and(
            eq(workOrderCutListItems.tenantId, TEST_TENANT_ID),
            eq(workOrderCutListItems.workOrderId, testWorkOrderId),
          ),
        )
        .orderBy(workOrderCutListItems.rowIndex);

      expect(dbRows).toHaveLength(3);
      expect(dbRows[2].partName).toBe("Top Rail");
      expect(dbRows[2].rowIndex).toBe(2);
    });

    it("enforces the Revision Lock Guard when work order status is in_progress or completed", async () => {
      // Transition work order status to "in_progress"
      await db
        .update(productionWorkOrders)
        .set({ status: "in_progress" })
        .where(eq(productionWorkOrders.id, testWorkOrderId));

      await expect(
        executeImportWorkOrderCutList(db, {
          tenantId: TEST_TENANT_ID,
          workOrderId: testWorkOrderId,
          mode: "replace",
          items: [
            {
              rowIndex: 0,
              partName: "Late Panel",
              unitName: "Unit",
              productName: "Prod",
              sectionName: "Sec",
              materialSku: "SKU",
              materialName: "MDF",
              lengthMm: 500,
              widthMm: 400,
              thicknessMm: 18,
              quantity: 1,
              unitOfMeasure: "pcs",
              edgeTop: null,
              edgeBottom: null,
              edgeLeft: null,
              edgeRight: null,
              grainDirection: "along_length",
              notes: null,
              source: "csv_import",
            },
          ],
        }),
      ).rejects.toThrow(/Cut list revision is locked because work order status is 'in_progress'/);

      // Revert status back to "ready"
      await db
        .update(productionWorkOrders)
        .set({ status: "ready" })
        .where(eq(productionWorkOrders.id, testWorkOrderId));
    });

    it("links a remake directly to a work_order_cut_list_item via cutListItemId", async () => {
      // Fetch the first cut list item
      const [firstItem] = await db
        .select()
        .from(workOrderCutListItems)
        .where(
          and(
            eq(workOrderCutListItems.tenantId, TEST_TENANT_ID),
            eq(workOrderCutListItems.workOrderId, testWorkOrderId),
          ),
        )
        .limit(1);

      expect(firstItem).toBeDefined();

      // Create remake linked to this specific cut list part
      const [rmk] = await db
        .insert(remakes)
        .values({
          tenantId: TEST_TENANT_ID,
          remakeNumber: `RMK-7A-${Date.now().toString().slice(-4)}`,
          orderId: testOrderId,
          customerId: testCustomerId,
          cutListItemId: firstItem.id,
          reason: `${firstItem.partName} — ${firstItem.lengthMm}×${firstItem.widthMm}×${firstItem.thicknessMm}mm (${firstItem.materialName})`,
          defectDescription: "Corner chipped during saw cut operation",
          status: "reported",
        })
        .returning();

      expect(rmk.cutListItemId).toBe(firstItem.id);

      // Query from DB to verify relational persistence
      const [persistedRmk] = await db
        .select()
        .from(remakes)
        .where(eq(remakes.id, rmk.id));

      expect(persistedRmk.cutListItemId).toBe(firstItem.id);
      expect(persistedRmk.reason).toContain("Side Panel Left");
    });
  });
});
