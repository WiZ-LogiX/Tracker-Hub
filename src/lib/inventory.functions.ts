import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { db } from "@/db/client.server";
import {
  stockItems,
  stockReservations,
  stockAdjustments,
  catalogMaterials,
  catalogHardware,
  orders,
  quotes,
  quoteSnapshots,
  auditLog,
} from "@/db/schema";
import { eq, and, desc, sql, inArray, isNull } from "drizzle-orm";
import { type TenantContext, forbidWorker } from "@/lib/tenant-context";
import {
  inferItemCategory,
  type StockItem,
  type StockItemType,
  type StockReservationItem,
  type StockAdjustmentRecord,
  type OrderMaterialRequirementItem,
  type OrderMaterialReadinessSummary,
  type MaterialReadiness,
  type PaginatedStockResult,
  type StockKpis,
} from "@/lib/inventory-types";

// ── Validation Schemas ──────────────────────────────────────────────────────

const ListStockInput = z
  .object({
    search: z.string().optional(),
    type: z.string().optional().default("all"),
    category: z.string().optional().default("all"),
    lowStockOnly: z.boolean().optional().default(false),
    sort: z
      .enum(["newest", "sku_asc", "name_asc", "lowest_stock", "highest_reserved"])
      .optional()
      .default("name_asc"),
    page: z.number().int().min(1).optional().default(1),
    pageSize: z.number().int().min(1).max(100).optional().default(25),
  })
  .optional()
  .default({});

const GetStockItemInput = z.object({
  stockItemId: z.string().uuid(),
});

const AdjustStockInput = z.object({
  stockItemId: z.string().uuid(),
  quantityDelta: z.number(),
  reason: z.string().trim().min(1, "Reason is required"),
  notes: z.string().trim().optional().nullable(),
});

const OrderIdInput = z.object({
  orderId: z.string().uuid(),
});

// ── Helper: Synchronize Catalog Items into Stock Items (Lazy Init) ─────────

async function ensureCatalogItemsInStock(tenantId: string): Promise<void> {
  const [materials, hardware, existingStock] = await Promise.all([
    db
      .select()
      .from(catalogMaterials)
      .where(and(eq(catalogMaterials.tenantId, tenantId), isNull(catalogMaterials.archivedAt))),
    db
      .select()
      .from(catalogHardware)
      .where(and(eq(catalogHardware.tenantId, tenantId), isNull(catalogHardware.archivedAt))),
    db
      .select({ catalogItemId: stockItems.catalogItemId })
      .from(stockItems)
      .where(eq(stockItems.tenantId, tenantId)),
  ]);

  const existingSet = new Set(existingStock.map((s) => s.catalogItemId));
  const newStockInserts: any[] = [];

  for (const m of materials) {
    if (!existingSet.has(m.id)) {
      newStockInserts.push({
        tenantId,
        catalogItemId: m.id,
        itemType: "material",
        sku: m.code || `MAT-${m.id.slice(0, 8).toUpperCase()}`,
        name: m.labelI18nKey || m.code || "Material",
        unit: m.pricingUnit || "sheet",
        physicalQuantity: "0",
        reservedQuantity: "0",
        minReorderLevel: "5",
      });
      existingSet.add(m.id);
    }
  }

  for (const h of hardware) {
    if (!existingSet.has(h.id)) {
      newStockInserts.push({
        tenantId,
        catalogItemId: h.id,
        itemType: "hardware",
        sku: h.code || `HDW-${h.id.slice(0, 8).toUpperCase()}`,
        name: h.code || "Hardware",
        unit: "pcs",
        physicalQuantity: "0",
        reservedQuantity: "0",
        minReorderLevel: "20",
      });
      existingSet.add(h.id);
    }
  }

  if (newStockInserts.length > 0) {
    await db.insert(stockItems).values(newStockInserts).onConflictDoNothing();
  }
}

function getCategoryCondition(category?: string, itemType?: string) {
  if (!category || category === "all") return null;

  if (itemType === "material") {
    switch (category) {
      case "mdf":
        return sql`(${stockItems.name} ILIKE '%mdf%' OR ${stockItems.name} ILIKE '%hdf%' OR ${stockItems.sku} ILIKE '%mdf%' OR ${stockItems.sku} ILIKE '%hdf%' OR ${stockItems.name} ILIKE '%مضغوط%' OR ${stockItems.name} ILIKE '%ام دي اف%' OR ${stockItems.name} ILIKE '%إم دي إف%')`;
      case "plywood":
        return sql`(${stockItems.name} ILIKE '%ply%' OR ${stockItems.name} ILIKE '%counter%' OR ${stockItems.name} ILIKE '%blockboard%' OR ${stockItems.sku} ILIKE '%ply%' OR ${stockItems.name} ILIKE '%كونتر%' OR ${stockItems.name} ILIKE '%ابلكاج%' OR ${stockItems.name} ILIKE '%أبلكاج%')`;
      case "solid_wood":
        return sql`(${stockItems.name} ILIKE '%oak%' OR ${stockItems.name} ILIKE '%beech%' OR ${stockItems.name} ILIKE '%ash%' OR ${stockItems.name} ILIKE '%pine%' OR ${stockItems.name} ILIKE '%walnut%' OR ${stockItems.name} ILIKE '%wood%' OR ${stockItems.sku} ILIKE '%oak%' OR ${stockItems.name} ILIKE '%زان%' OR ${stockItems.name} ILIKE '%ارو%' OR ${stockItems.name} ILIKE '%أرو%' OR ${stockItems.name} ILIKE '%سويد%' OR ${stockItems.name} ILIKE '%طبيعي%')`;
      case "laminates":
        return sql`(${stockItems.name} ILIKE '%hpl%' OR ${stockItems.name} ILIKE '%laminate%' OR ${stockItems.name} ILIKE '%veneer%' OR ${stockItems.name} ILIKE '%melamine%' OR ${stockItems.sku} ILIKE '%hpl%' OR ${stockItems.sku} ILIKE '%lam%' OR ${stockItems.name} ILIKE '%فورميكا%' OR ${stockItems.name} ILIKE '%قشرة%' OR ${stockItems.name} ILIKE '%ميلامين%')`;
      case "glass_metal":
        return sql`(${stockItems.name} ILIKE '%glass%' OR ${stockItems.name} ILIKE '%profile%' OR ${stockItems.name} ILIKE '%metal%' OR ${stockItems.name} ILIKE '%alu%' OR ${stockItems.sku} ILIKE '%gls%' OR ${stockItems.name} ILIKE '%زجاج%' OR ${stockItems.name} ILIKE '%قطاع%' OR ${stockItems.name} ILIKE '%الومنيوم%')`;
      case "other":
        return sql`NOT (${stockItems.name} ILIKE '%mdf%' OR ${stockItems.name} ILIKE '%ply%' OR ${stockItems.name} ILIKE '%oak%' OR ${stockItems.name} ILIKE '%beech%' OR ${stockItems.name} ILIKE '%hpl%' OR ${stockItems.name} ILIKE '%laminate%' OR ${stockItems.name} ILIKE '%veneer%' OR ${stockItems.name} ILIKE '%glass%' OR ${stockItems.name} ILIKE '%profile%')`;
      default:
        return null;
    }
  } else if (itemType === "hardware") {
    switch (category) {
      case "hinges":
        return sql`(${stockItems.name} ILIKE '%hinge%' OR ${stockItems.name} ILIKE '%pivot%' OR ${stockItems.sku} ILIKE '%hinge%' OR ${stockItems.sku} ILIKE '%hng%' OR ${stockItems.name} ILIKE '%مفصل%')`;
      case "handles":
        return sql`(${stockItems.name} ILIKE '%handle%' OR ${stockItems.name} ILIKE '%knob%' OR ${stockItems.name} ILIKE '%pull%' OR ${stockItems.sku} ILIKE '%hnd%' OR ${stockItems.sku} ILIKE '%handle%' OR ${stockItems.name} ILIKE '%مقبض%' OR ${stockItems.name} ILIKE '%اوكر%' OR ${stockItems.name} ILIKE '%أوكر%')`;
      case "runners":
        return sql`(${stockItems.name} ILIKE '%runner%' OR ${stockItems.name} ILIKE '%slide%' OR ${stockItems.name} ILIKE '%rail%' OR ${stockItems.sku} ILIKE '%run%' OR ${stockItems.sku} ILIKE '%slid%' OR ${stockItems.name} ILIKE '%مجرى%' OR ${stockItems.name} ILIKE '%سكة%')`;
      case "fasteners":
        return sql`(${stockItems.name} ILIKE '%screw%' OR ${stockItems.name} ILIKE '%bolt%' OR ${stockItems.name} ILIKE '%nut%' OR ${stockItems.name} ILIKE '%anchor%' OR ${stockItems.name} ILIKE '%fastener%' OR ${stockItems.sku} ILIKE '%scr%' OR ${stockItems.name} ILIKE '%مسمار%' OR ${stockItems.name} ILIKE '%خابور%')`;
      case "locks":
        return sql`(${stockItems.name} ILIKE '%lock%' OR ${stockItems.name} ILIKE '%latch%' OR ${stockItems.name} ILIKE '%catch%' OR ${stockItems.sku} ILIKE '%lck%' OR ${stockItems.sku} ILIKE '%lock%' OR ${stockItems.name} ILIKE '%كالون%' OR ${stockItems.name} ILIKE '%قفل%')`;
      case "brackets":
        return sql`(${stockItems.name} ILIKE '%bracket%' OR ${stockItems.name} ILIKE '%support%' OR ${stockItems.name} ILIKE '%leg%' OR ${stockItems.name} ILIKE '%corner%' OR ${stockItems.sku} ILIKE '%brk%' OR ${stockItems.name} ILIKE '%زاوية%' OR ${stockItems.name} ILIKE '%حامل%' OR ${stockItems.name} ILIKE '%رجل%')`;
      case "other":
        return sql`NOT (${stockItems.name} ILIKE '%hinge%' OR ${stockItems.name} ILIKE '%handle%' OR ${stockItems.name} ILIKE '%runner%' OR ${stockItems.name} ILIKE '%slide%' OR ${stockItems.name} ILIKE '%screw%' OR ${stockItems.name} ILIKE '%lock%' OR ${stockItems.name} ILIKE '%bracket%')`;
      default:
        return null;
    }
  }
  return null;
}

// ── Server Functions ────────────────────────────────────────────────────────

/**
 * List inventory items with search, filters, pagination, and KPI metrics.
 */
export const listStock = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => ListStockInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<PaginatedStockResult> => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Inventory Management");
    const { tenantId } = ctx;

    // Ensure catalog items are represented in stock items
    await ensureCatalogItemsInStock(tenantId);

    const conditions = [eq(stockItems.tenantId, tenantId)];

    if (data.type && data.type !== "all") {
      conditions.push(eq(stockItems.itemType, data.type));
    }

    const categoryCond = getCategoryCondition(data.category, data.type);
    if (categoryCond) {
      conditions.push(categoryCond);
    }

    if (data.lowStockOnly) {
      conditions.push(sql`(${stockItems.physicalQuantity} - ${stockItems.reservedQuantity}) <= ${stockItems.minReorderLevel}`);
    }

    if (data.search && data.search.trim().length > 0) {
      const q = `%${data.search.trim()}%`;
      conditions.push(
        sql`(${stockItems.sku} ILIKE ${q} OR ${stockItems.name} ILIKE ${q})`,
      );
    }

    const page = Math.max(1, data.page || 1);
    const pageSize = Math.min(100, Math.max(1, data.pageSize || 25));
    const offset = (page - 1) * pageSize;

    let orderByClause = sql`${stockItems.name} ASC`;
    if (data.sort === "newest") {
      orderByClause = desc(stockItems.createdAt);
    } else if (data.sort === "sku_asc") {
      orderByClause = sql`${stockItems.sku} ASC`;
    } else if (data.sort === "lowest_stock") {
      orderByClause = sql`(${stockItems.physicalQuantity} - ${stockItems.reservedQuantity}) ASC`;
    } else if (data.sort === "highest_reserved") {
      orderByClause = desc(stockItems.reservedQuantity);
    }

    // 1. KPI Aggregates
    const allTenantStock = await db
      .select({
        itemType: stockItems.itemType,
        physical: stockItems.physicalQuantity,
        reserved: stockItems.reservedQuantity,
        minReorder: stockItems.minReorderLevel,
      })
      .from(stockItems)
      .where(eq(stockItems.tenantId, tenantId));

    let materialsCount = 0;
    let hardwareCount = 0;
    let lowStockCount = 0;
    let totalReservedUnits = 0;
    let materialsLowStockCount = 0;
    let hardwareLowStockCount = 0;
    let materialsTotalStock = 0;
    let hardwareTotalStock = 0;
    let materialsReservedUnits = 0;
    let hardwareReservedUnits = 0;

    for (const item of allTenantStock) {
      const physical = Number(item.physical || 0);
      const reserved = Number(item.reserved || 0);
      const free = physical - reserved;
      const isLow = free <= Number(item.minReorder || 0);

      if (item.itemType === "material") {
        materialsCount++;
        materialsTotalStock += physical;
        materialsReservedUnits += reserved;
        if (isLow) materialsLowStockCount++;
      }
      if (item.itemType === "hardware") {
        hardwareCount++;
        hardwareTotalStock += physical;
        hardwareReservedUnits += reserved;
        if (isLow) hardwareLowStockCount++;
      }
      if (isLow) lowStockCount++;
      totalReservedUnits += reserved;
    }

    const kpis: StockKpis = {
      totalItems: allTenantStock.length,
      materialsCount,
      hardwareCount,
      lowStockCount,
      totalReservedUnits: Math.round(totalReservedUnits * 100) / 100,
      materialsLowStockCount,
      hardwareLowStockCount,
      materialsTotalStock: Math.round(materialsTotalStock * 100) / 100,
      hardwareTotalStock: Math.round(hardwareTotalStock * 100) / 100,
      materialsReservedUnits: Math.round(materialsReservedUnits * 100) / 100,
      hardwareReservedUnits: Math.round(hardwareReservedUnits * 100) / 100,
    };

    // 2. Filtered Count
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(stockItems)
      .where(and(...conditions));

    const totalCount = Number(countRow?.count || 0);
    const totalPages = Math.ceil(totalCount / pageSize) || 1;

    if (totalCount === 0) {
      return {
        rows: [],
        totalCount: 0,
        page,
        pageSize,
        totalPages: 1,
        kpis,
      };
    }

    // 3. Paginated Rows
    const rowsRaw = await db
      .select()
      .from(stockItems)
      .where(and(...conditions))
      .orderBy(orderByClause)
      .limit(pageSize)
      .offset(offset);

    const rows: StockItem[] = rowsRaw.map((s) => {
      const physical = Number(s.physicalQuantity || 0);
      const reserved = Number(s.reservedQuantity || 0);
      return {
        id: s.id,
        tenantId: s.tenantId,
        catalogItemId: s.catalogItemId,
        itemType: s.itemType as StockItemType,
        category: inferItemCategory(s.itemType as StockItemType, s.name, s.sku),
        sku: s.sku,
        name: s.name,
        unit: s.unit,
        physicalQuantity: physical,
        reservedQuantity: reserved,
        freeQuantity: Math.max(0, physical - reserved),
        minReorderLevel: Number(s.minReorderLevel || 0),
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      };
    });

    return {
      rows,
      totalCount,
      page,
      pageSize,
      totalPages,
      kpis,
    };
  });

/**
 * Get detailed information and adjustment history for a stock item.
 */
export const getStockItem = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => GetStockItemInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Inventory Management");
    const { tenantId } = ctx;

    const [item] = await db
      .select()
      .from(stockItems)
      .where(and(eq(stockItems.id, data.stockItemId), eq(stockItems.tenantId, tenantId)))
      .limit(1);

    if (!item) {
      throw new Error("Stock item not found or access denied");
    }

    const [adjustments, reservations] = await Promise.all([
      db
        .select()
        .from(stockAdjustments)
        .where(and(eq(stockAdjustments.stockItemId, item.id), eq(stockAdjustments.tenantId, tenantId)))
        .orderBy(desc(stockAdjustments.createdAt))
        .limit(20),
      db
        .select({
          id: stockReservations.id,
          orderId: stockReservations.orderId,
          orderNumber: orders.orderNumber,
          quantity: stockReservations.quantity,
          unit: stockReservations.unit,
          status: stockReservations.status,
          createdAt: stockReservations.createdAt,
        })
        .from(stockReservations)
        .leftJoin(orders, eq(stockReservations.orderId, orders.id))
        .where(
          and(
            eq(stockReservations.stockItemId, item.id),
            eq(stockReservations.tenantId, tenantId),
            eq(stockReservations.status, "reserved"),
          ),
        )
        .orderBy(desc(stockReservations.createdAt)),
    ]);

    const physical = Number(item.physicalQuantity || 0);
    const reserved = Number(item.reservedQuantity || 0);

    let costPrice: number | undefined = undefined;
    if (item.itemType === "material") {
      const [mat] = await db
        .select({ price: catalogMaterials.pricePerUnit })
        .from(catalogMaterials)
        .where(and(eq(catalogMaterials.id, item.catalogItemId), eq(catalogMaterials.tenantId, tenantId)))
        .limit(1);
      if (mat?.price) costPrice = Number(mat.price);
    } else if (item.itemType === "hardware") {
      const [hdw] = await db
        .select({ price: catalogHardware.pricePerPiece })
        .from(catalogHardware)
        .where(and(eq(catalogHardware.id, item.catalogItemId), eq(catalogHardware.tenantId, tenantId)))
        .limit(1);
      if (hdw?.price) costPrice = Number(hdw.price);
    }

    return {
      item: {
        id: item.id,
        tenantId: item.tenantId,
        catalogItemId: item.catalogItemId,
        itemType: item.itemType as StockItemType,
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        physicalQuantity: physical,
        reservedQuantity: reserved,
        freeQuantity: Math.max(0, physical - reserved),
        minReorderLevel: Number(item.minReorderLevel || 0),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      },
      costPrice,
      adjustments: adjustments.map((a) => ({
        id: a.id,
        quantityDelta: Number(a.quantityDelta),
        previousQuantity: Number(a.previousQuantity),
        newQuantity: Number(a.newQuantity),
        reason: a.reason,
        notes: a.notes,
        createdAt: a.createdAt,
      })),
      reservations: reservations.map((r) => ({
        id: r.id,
        orderId: r.orderId,
        orderNumber: r.orderNumber || "—",
        quantity: Number(r.quantity),
        unit: r.unit,
        status: r.status,
        createdAt: r.createdAt,
      })),
    };
  });

/**
 * Adjust stock quantity with reason and audit log tracking.
 */
export const adjustStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => AdjustStockInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; newQuantity: number }> => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Inventory Management");
    const { tenantId, userId, role } = ctx;

    if (role === "viewer") {
      throw new Error("Forbidden: viewers cannot adjust inventory stock");
    }

    const result = await db.transaction(async (tx) => {
      // Row lock the stock item
      const [item] = await tx
        .select()
        .from(stockItems)
        .where(and(eq(stockItems.id, data.stockItemId), eq(stockItems.tenantId, tenantId)))
        .for("update")
        .limit(1);

      if (!item) {
        throw new Error("Stock item not found or access denied");
      }

      const prevQty = Number(item.physicalQuantity || 0);
      const reservedQty = Number(item.reservedQuantity || 0);
      const newQty = prevQty + data.quantityDelta;

      if (newQty < 0) {
        throw new Error(`Invalid stock adjustment: physical stock cannot be negative (would be ${newQty})`);
      }

      if (newQty < reservedQty) {
        throw new Error(
          `Invalid stock adjustment: physical stock (${newQty}) cannot be lower than active reserved quantity (${reservedQty})`,
        );
      }

      await tx
        .update(stockItems)
        .set({
          physicalQuantity: String(newQty),
          updatedAt: new Date(),
        })
        .where(and(eq(stockItems.id, item.id), eq(stockItems.tenantId, tenantId)));

      await tx.insert(stockAdjustments).values({
        tenantId,
        stockItemId: item.id,
        quantityDelta: String(data.quantityDelta),
        previousQuantity: String(prevQty),
        newQuantity: String(newQty),
        reason: data.reason,
        notes: data.notes || null,
        createdBy: userId ? (userId as any) : null,
      });

      await tx.insert(auditLog).values({
        tenantId,
        actorId: userId ? (userId as any) : null,
        entityType: "inventory",
        entityId: item.id,
        action: "stock_adjusted",
        details: {
          stock_item_id: item.id,
          sku: item.sku,
          name: item.name,
          quantity_delta: data.quantityDelta,
          previous_quantity: prevQty,
          new_quantity: newQty,
          reason: data.reason,
          notes: data.notes || null,
        },
      });

      return { ok: true, newQuantity: newQty };
    });

    return result;
  });

// ── CRUD Operations for Inventory Items ─────────────────────────────────────

const CreateInventoryItemInput = z.object({
  itemType: z.enum(["material", "hardware"]),
  name: z.string().trim().min(1, "Item name is required"),
  sku: z.string().trim().min(1, "SKU is required"),
  unit: z.string().trim().min(1, "Unit is required"),
  minReorderLevel: z.number().min(0).default(5),
  initialStock: z.number().min(0).default(0),
  costPrice: z.number().min(0).default(0),
  notes: z.string().trim().optional().nullable(),
});

export const createInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => CreateInventoryItemInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Inventory Management");
    const { tenantId, userId, role } = ctx;

    if (role === "viewer") {
      throw new Error("Forbidden: viewers cannot add inventory items");
    }

    const skuUpper = data.sku.trim().toUpperCase();

    // Check SKU uniqueness in tenant
    const [existing] = await db
      .select({ id: stockItems.id })
      .from(stockItems)
      .where(and(eq(stockItems.tenantId, tenantId), sql`upper(${stockItems.sku}) = ${skuUpper}`))
      .limit(1);

    if (existing) {
      throw new Error(`Item with SKU "${skuUpper}" already exists`);
    }

    return await db.transaction(async (tx) => {
      let catalogItemId: string;

      if (data.itemType === "material") {
        const validUnits = ["sheet", "m2", "linear_meter", "edge_meter", "unit", "job"];
        const pUnit = validUnits.includes(data.unit) ? (data.unit as any) : "sheet";

        const [catMat] = await tx
          .insert(catalogMaterials)
          .values({
            tenantId,
            code: skuUpper,
            labelI18nKey: data.name.trim(),
            pricingUnit: pUnit,
            pricePerUnit: String(data.costPrice || 0),
            defaultWastagePct: "5",
          })
          .returning({ id: catalogMaterials.id });
        catalogItemId = catMat.id;
      } else {
        const [catHdw] = await tx
          .insert(catalogHardware)
          .values({
            tenantId,
            code: skuUpper,
            pricePerPiece: String(data.costPrice || 0),
          })
          .returning({ id: catalogHardware.id });
        catalogItemId = catHdw.id;
      }

      const [newStockItem] = await tx
        .insert(stockItems)
        .values({
          tenantId,
          catalogItemId,
          itemType: data.itemType,
          sku: skuUpper,
          name: data.name.trim(),
          unit: data.unit.trim(),
          physicalQuantity: String(data.initialStock || 0),
          reservedQuantity: "0",
          minReorderLevel: String(data.minReorderLevel || 0),
        })
        .returning();

      if (data.initialStock > 0) {
        await tx.insert(stockAdjustments).values({
          tenantId,
          stockItemId: newStockItem.id,
          quantityDelta: String(data.initialStock),
          previousQuantity: "0",
          newQuantity: String(data.initialStock),
          reason: "initial_setup",
          notes: data.notes || "Initial physical stock setup",
          createdBy: userId ? (userId as any) : null,
        });
      }

      await tx.insert(auditLog).values({
        tenantId,
        actorId: userId ? (userId as any) : null,
        entityType: "inventory",
        entityId: newStockItem.id,
        action: "item_created",
        details: {
          sku: skuUpper,
          name: data.name.trim(),
          itemType: data.itemType,
          unit: data.unit.trim(),
          initialStock: data.initialStock,
          costPrice: data.costPrice,
        },
      });

      return { ok: true, item: newStockItem };
    });
  });

const UpdateInventoryItemInput = z.object({
  stockItemId: z.string().uuid(),
  name: z.string().trim().min(1, "Item name is required"),
  sku: z.string().trim().min(1, "SKU is required"),
  unit: z.string().trim().min(1, "Unit is required"),
  minReorderLevel: z.number().min(0),
  costPrice: z.number().min(0).optional(),
});

export const updateInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => UpdateInventoryItemInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Inventory Management");
    const { tenantId, userId, role } = ctx;

    if (role === "viewer") {
      throw new Error("Forbidden: viewers cannot edit inventory items");
    }

    const skuUpper = data.sku.trim().toUpperCase();

    return await db.transaction(async (tx) => {
      const [item] = await tx
        .select()
        .from(stockItems)
        .where(and(eq(stockItems.id, data.stockItemId), eq(stockItems.tenantId, tenantId)))
        .for("update")
        .limit(1);

      if (!item) {
        throw new Error("Stock item not found or access denied");
      }

      if (skuUpper !== item.sku.toUpperCase()) {
        const [existing] = await tx
          .select({ id: stockItems.id })
          .from(stockItems)
          .where(
            and(
              eq(stockItems.tenantId, tenantId),
              sql`upper(${stockItems.sku}) = ${skuUpper}`,
              sql`${stockItems.id} != ${item.id}`,
            ),
          )
          .limit(1);

        if (existing) {
          throw new Error(`Another item with SKU "${skuUpper}" already exists`);
        }
      }

      await tx
        .update(stockItems)
        .set({
          sku: skuUpper,
          name: data.name.trim(),
          unit: data.unit.trim(),
          minReorderLevel: String(data.minReorderLevel),
          updatedAt: new Date(),
        })
        .where(and(eq(stockItems.id, item.id), eq(stockItems.tenantId, tenantId)));

      if (item.itemType === "material") {
        await tx
          .update(catalogMaterials)
          .set({
            code: skuUpper,
            labelI18nKey: data.name.trim(),
            ...(data.costPrice !== undefined ? { pricePerUnit: String(data.costPrice) } : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(catalogMaterials.id, item.catalogItemId), eq(catalogMaterials.tenantId, tenantId)));
      } else if (item.itemType === "hardware") {
        await tx
          .update(catalogHardware)
          .set({
            code: skuUpper,
            ...(data.costPrice !== undefined ? { pricePerPiece: String(data.costPrice) } : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(catalogHardware.id, item.catalogItemId), eq(catalogHardware.tenantId, tenantId)));
      }

      await tx.insert(auditLog).values({
        tenantId,
        actorId: userId ? (userId as any) : null,
        entityType: "inventory",
        entityId: item.id,
        action: "item_updated",
        details: {
          previousSku: item.sku,
          newSku: skuUpper,
          previousName: item.name,
          newName: data.name.trim(),
          unit: data.unit.trim(),
          minReorderLevel: data.minReorderLevel,
          costPrice: data.costPrice,
        },
      });

      return { ok: true };
    });
  });

const DeleteInventoryItemInput = z.object({
  stockItemId: z.string().uuid(),
});

export const deleteInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => DeleteInventoryItemInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Inventory Management");
    const { tenantId, userId, role } = ctx;

    if (role === "viewer") {
      throw new Error("Forbidden: viewers cannot delete inventory items");
    }

    return await db.transaction(async (tx) => {
      const [item] = await tx
        .select()
        .from(stockItems)
        .where(and(eq(stockItems.id, data.stockItemId), eq(stockItems.tenantId, tenantId)))
        .for("update")
        .limit(1);

      if (!item) {
        throw new Error("Stock item not found or access denied");
      }

      const reservedQty = Number(item.reservedQuantity || 0);
      if (reservedQty > 0) {
        throw new Error(`Cannot delete item with active reservations (${reservedQty} units reserved)`);
      }

      const activeRes = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(stockReservations)
        .where(
          and(
            eq(stockReservations.stockItemId, item.id),
            eq(stockReservations.tenantId, tenantId),
            eq(stockReservations.status, "reserved"),
          ),
        );

      if (Number(activeRes[0]?.count || 0) > 0) {
        throw new Error("Cannot delete item with active reservations");
      }

      // Safe archive backing catalog record so lazy init never resurrects it
      if (item.itemType === "material") {
        await tx
          .update(catalogMaterials)
          .set({ archivedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(catalogMaterials.id, item.catalogItemId), eq(catalogMaterials.tenantId, tenantId)));
      } else if (item.itemType === "hardware") {
        await tx
          .update(catalogHardware)
          .set({ archivedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(catalogHardware.id, item.catalogItemId), eq(catalogHardware.tenantId, tenantId)));
      }

      // Delete from stockItems
      await tx
        .delete(stockItems)
        .where(and(eq(stockItems.id, item.id), eq(stockItems.tenantId, tenantId)));

      await tx.insert(auditLog).values({
        tenantId,
        actorId: userId ? (userId as any) : null,
        entityType: "inventory",
        entityId: item.id,
        action: "item_deleted",
        details: {
          sku: item.sku,
          name: item.name,
          itemType: item.itemType,
        },
      });

      return { ok: true, deleted: true };
    });
  });

/**
 * Extract physical raw-material and hardware requirements from V2 Quotation snapshot.
 */
export const getOrderMaterialRequirements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => OrderIdInput.parse(input))
  .handler(async ({ data, context }): Promise<OrderMaterialReadinessSummary> => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId } = ctx;

    // Ensure catalog is synced
    await ensureCatalogItemsInStock(tenantId);

    // 1. Fetch Order and Quote Snapshot
    const [orderRow] = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        quoteId: orders.quoteId,
      })
      .from(orders)
      .where(and(eq(orders.id, data.orderId), eq(orders.tenantId, tenantId)))
      .limit(1);

    if (!orderRow) {
      throw new Error("Order not found or access denied");
    }

    let snapshotData: any = null;
    if (orderRow.quoteId) {
      const [snap] = await db
        .select()
        .from(quoteSnapshots)
        .where(and(eq(quoteSnapshots.quotationId, orderRow.quoteId), eq(quoteSnapshots.tenantId, tenantId)))
        .limit(1);

      if (snap && snap.treeJson) {
        snapshotData = snap.treeJson;
      } else {
        const [q] = await db
          .select({ snapshot: quotes.snapshot })
          .from(quotes)
          .where(and(eq(quotes.id, orderRow.quoteId), eq(quotes.tenantId, tenantId)))
          .limit(1);
        snapshotData = q?.snapshot;
      }
    }

    // 2. Parse tree components (materials and hardware)
    const tree = snapshotData?.tree?.products || snapshotData?.products || [];
    const aggregatedNeeds = new Map<
      string,
      {
        catalogId: string;
        itemType: StockItemType;
        requiredQty: number;
        unit: string;
      }
    >();

    for (const prod of tree) {
      for (const sec of prod.sections || []) {
        for (const unit of sec.units || []) {
          const uQty = Number(unit.qty || 1);
          for (const comp of unit.components || []) {
            const kind = comp.kind;
            if (kind !== "material" && kind !== "hardware") continue;

            const catalogId = comp.catalogId || comp.catalog_id;
            if (!catalogId) continue;

            const cQty = Number(comp.qty || 0) * uQty;
            if (cQty <= 0) continue;

            const unitOfMeasure = comp.unitOfMeasure || comp.unit_of_measure || (kind === "material" ? "sheet" : "pcs");
            const key = `${catalogId}:${kind}`;

            const existing = aggregatedNeeds.get(key);
            if (existing) {
              existing.requiredQty += cQty;
            } else {
              aggregatedNeeds.set(key, {
                catalogId,
                itemType: kind as StockItemType,
                requiredQty: cQty,
                unit: unitOfMeasure,
              });
            }
          }
        }
      }
    }

    // 3. Fetch matching stock items and existing reservations for this order
    const catalogIds = Array.from(aggregatedNeeds.values()).map((n) => n.catalogId);
    const [matchingStock, existingReservations] = await Promise.all([
      catalogIds.length > 0
        ? db
            .select()
            .from(stockItems)
            .where(and(eq(stockItems.tenantId, tenantId), inArray(stockItems.catalogItemId, catalogIds)))
        : Promise.resolve([]),
      db
        .select()
        .from(stockReservations)
        .where(
          and(
            eq(stockReservations.tenantId, tenantId),
            eq(stockReservations.orderId, orderRow.id),
            eq(stockReservations.status, "reserved"),
          ),
        ),
    ]);

    const stockMap = new Map<string, typeof matchingStock[0]>();
    for (const s of matchingStock) {
      stockMap.set(`${s.catalogItemId}:${s.itemType}`, s);
    }

    const reservedForOrderMap = new Map<string, number>();
    for (const r of existingReservations) {
      const current = reservedForOrderMap.get(r.stockItemId) || 0;
      reservedForOrderMap.set(r.stockItemId, current + Number(r.quantity || 0));
    }

    // 4. Construct Requirement List and Calculate Readiness
    let fullyAvailableItems = 0;
    let reservedItems = 0;
    let shortageItems = 0;

    const requirements: OrderMaterialRequirementItem[] = [];

    for (const need of aggregatedNeeds.values()) {
      const stock = stockMap.get(`${need.catalogId}:${need.itemType}`);
      const physical = stock ? Number(stock.physicalQuantity || 0) : 0;
      const totalReserved = stock ? Number(stock.reservedQuantity || 0) : 0;
      const free = Math.max(0, physical - totalReserved);
      const reservedForThis = stock ? (reservedForOrderMap.get(stock.id) || 0) : 0;

      const requiredQty = Math.round(need.requiredQty * 1000) / 1000;
      const effectiveAvailable = free + reservedForThis;
      const shortage = Math.max(0, Math.round((requiredQty - effectiveAvailable) * 1000) / 1000);

      let status: "available" | "reserved" | "shortage" = "available";
      if (reservedForThis >= requiredQty) {
        status = "reserved";
        reservedItems++;
      } else if (shortage > 0) {
        status = "shortage";
        shortageItems++;
      } else {
        status = "available";
        fullyAvailableItems++;
      }

      requirements.push({
        catalogItemId: need.catalogId,
        itemType: need.itemType,
        sku: stock?.sku || `ITEM-${need.catalogId.slice(0, 8)}`,
        name: stock?.name || (need.itemType === "material" ? "Raw Board Material" : "Hardware Component"),
        unit: need.unit,
        requiredQuantity: requiredQty,
        physicalQuantity: physical,
        reservedQuantity: totalReserved,
        freeQuantity: free,
        reservedForThisOrder: reservedForThis,
        shortage,
        status,
      });
    }

    let readiness: MaterialReadiness = "READY";
    if (shortageItems > 0 && (fullyAvailableItems > 0 || reservedItems > 0)) {
      readiness = "PARTIAL";
    } else if (shortageItems > 0) {
      readiness = "BLOCKED";
    }

    return {
      orderId: orderRow.id,
      orderNumber: orderRow.orderNumber,
      readiness,
      totalRequiredItems: requirements.length,
      fullyAvailableItems,
      reservedItems,
      shortageItems,
      requirements,
    };
  });

/**
 * Atomically reserve required materials for an order.
 */
export const reserveOrderMaterials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => OrderIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, userId, role } = ctx;

    if (role === "viewer") {
      throw new Error("Forbidden: viewers cannot reserve stock materials");
    }

    // Get current requirements
    const reqs = await getOrderMaterialRequirements({ data: { orderId: data.orderId } });

    if (reqs.requirements.length === 0) {
      return { ok: true, message: "No physical materials required for this order" };
    }

    // Check if already fully reserved (idempotency guard)
    const isAlreadyFullyReserved = reqs.requirements.every((r) => r.reservedForThisOrder >= r.requiredQuantity);
    if (isAlreadyFullyReserved) {
      return { ok: true, message: "Order materials are already fully reserved", readiness: "READY" };
    }

    // Execute atomic reservation in transaction
    const result = await db.transaction(async (tx) => {
      const catalogIds = reqs.requirements.map((r) => r.catalogItemId);

      // Row-lock matching stock items
      const lockedStock = await tx
        .select()
        .from(stockItems)
        .where(and(eq(stockItems.tenantId, tenantId), inArray(stockItems.catalogItemId, catalogIds)))
        .for("update");

      const stockMap = new Map<string, typeof lockedStock[0]>();
      for (const s of lockedStock) {
        stockMap.set(`${s.catalogItemId}:${s.itemType}`, s);
      }

      // Check existing reservations inside transaction
      const existingReservations = await tx
        .select()
        .from(stockReservations)
        .where(
          and(
            eq(stockReservations.tenantId, tenantId),
            eq(stockReservations.orderId, data.orderId),
            eq(stockReservations.status, "reserved"),
          ),
        );

      const reservedMap = new Map<string, number>();
      for (const r of existingReservations) {
        const cur = reservedMap.get(r.stockItemId) || 0;
        reservedMap.set(r.stockItemId, cur + Number(r.quantity));
      }

      // Verify availability for all items
      for (const req of reqs.requirements) {
        const stock = stockMap.get(`${req.catalogItemId}:${req.itemType}`);
        if (!stock) {
          throw new Error(`Stock record not found for ${req.name} (${req.sku})`);
        }

        const physical = Number(stock.physicalQuantity || 0);
        const totalReserved = Number(stock.reservedQuantity || 0);
        const free = Math.max(0, physical - totalReserved);
        const alreadyReserved = reservedMap.get(stock.id) || 0;

        const deltaNeeded = Math.max(0, req.requiredQuantity - alreadyReserved);
        if (deltaNeeded > free) {
          throw new Error(
            `Insufficient stock for ${req.name} (${req.sku}): required ${deltaNeeded} ${req.unit}, available ${free} ${req.unit}`,
          );
        }
      }

      // Perform reservations
      const reservationInserts: any[] = [];
      for (const req of reqs.requirements) {
        const stock = stockMap.get(`${req.catalogItemId}:${req.itemType}`)!;
        const alreadyReserved = reservedMap.get(stock.id) || 0;
        const deltaNeeded = Math.max(0, req.requiredQuantity - alreadyReserved);

        if (deltaNeeded > 0) {
          const newReserved = Number(stock.reservedQuantity || 0) + deltaNeeded;
          await tx
            .update(stockItems)
            .set({ reservedQuantity: String(newReserved), updatedAt: new Date() })
            .where(eq(stockItems.id, stock.id));

          reservationInserts.push({
            tenantId,
            stockItemId: stock.id,
            orderId: data.orderId,
            quantity: String(deltaNeeded),
            unit: req.unit,
            status: "reserved",
          });
        }
      }

      if (reservationInserts.length > 0) {
        await tx.insert(stockReservations).values(reservationInserts);
      }

      await tx.insert(auditLog).values({
        tenantId,
        actorId: userId ? (userId as any) : null,
        entityType: "inventory",
        entityId: data.orderId,
        action: "material_reservation_created",
        details: {
          order_id: data.orderId,
          order_number: reqs.orderNumber,
          reserved_items_count: reservationInserts.length,
        },
      });

      return { ok: true, message: "Materials reserved successfully", readiness: "READY" };
    });

    return result;
  });

/**
 * Release active material reservations for an order.
 */
export const releaseOrderReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => OrderIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, userId, role } = ctx;

    if (role === "viewer") {
      throw new Error("Forbidden: viewers cannot release stock reservations");
    }

    const result = await db.transaction(async (tx) => {
      const activeRes = await tx
        .select()
        .from(stockReservations)
        .where(
          and(
            eq(stockReservations.tenantId, tenantId),
            eq(stockReservations.orderId, data.orderId),
            eq(stockReservations.status, "reserved"),
          ),
        );

      if (activeRes.length === 0) {
        return { ok: true, message: "No active reservations to release" };
      }

      for (const res of activeRes) {
        const [stock] = await tx
          .select()
          .from(stockItems)
          .where(eq(stockItems.id, res.stockItemId))
          .for("update")
          .limit(1);

        if (stock) {
          const newReserved = Math.max(0, Number(stock.reservedQuantity || 0) - Number(res.quantity || 0));
          await tx
            .update(stockItems)
            .set({ reservedQuantity: String(newReserved), updatedAt: new Date() })
            .where(eq(stockItems.id, stock.id));
        }

        await tx
          .update(stockReservations)
          .set({ status: "released", releasedAt: new Date() })
          .where(eq(stockReservations.id, res.id));
      }

      await tx.insert(auditLog).values({
        tenantId,
        actorId: userId ? (userId as any) : null,
        entityType: "inventory",
        entityId: data.orderId,
        action: "material_reservation_released",
        details: {
          order_id: data.orderId,
          released_count: activeRes.length,
        },
      });

      return { ok: true, message: "Reservations released successfully" };
    });

    return result;
  });
