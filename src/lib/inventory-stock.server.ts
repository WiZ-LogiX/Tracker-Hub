import { db } from "@/db/client.server";
import {
  stockItems,
  stockAdjustments,
  auditLog,
  appUsers,
} from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  requirePermission,
  forbidWorker,
  type TenantContext,
} from "@/lib/tenant-context";
import type {
  StockItemType,
  StockMovementItem,
  PaginatedStockMovementsResult,
} from "@/lib/inventory-types";

/**
 * Pure execution helper for stock adjustments.
 */
export async function executeStockAdjustment(
  executor: any = db,
  ctx: TenantContext,
  data: {
    stockItemId: string;
    quantityDelta: number;
    reason: string;
    notes?: string | null;
  },
): Promise<{ ok: boolean; newQuantity: number }> {
  requirePermission(ctx, "inventory.adjust");
  const { tenantId, userId } = ctx;

  const result = await executor.transaction(async (tx: any) => {
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
}

/**
 * Pure execution helper for listing global stock movements (audit ledger).
 */
export async function executeListStockMovements(
  executor: any = db,
  ctx: TenantContext,
  data: {
    search?: string;
    itemType?: "all" | "material" | "hardware";
    direction?: "all" | "in" | "out";
    reason?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<PaginatedStockMovementsResult> {
  forbidWorker(ctx, "Stock Movement Audit Ledger");
  requirePermission(ctx, "inventory.view");
  const { tenantId } = ctx;

  const page = Math.max(1, data.page || 1);
  const pageSize = Math.min(100, Math.max(1, data.pageSize || 25));
  const offset = (page - 1) * pageSize;

  const conditions = [
    eq(stockAdjustments.tenantId, tenantId),
    eq(stockItems.tenantId, tenantId),
  ];

  if (data.direction === "in") {
    conditions.push(sql`CAST(${stockAdjustments.quantityDelta} AS numeric) > 0`);
  } else if (data.direction === "out") {
    conditions.push(sql`CAST(${stockAdjustments.quantityDelta} AS numeric) < 0`);
  }

  if (data.itemType && data.itemType !== "all") {
    conditions.push(eq(stockItems.itemType, data.itemType));
  }

  if (data.reason && data.reason !== "all") {
    conditions.push(eq(stockAdjustments.reason, data.reason));
  }

  if (data.search && data.search.trim().length > 0) {
    const q = `%${data.search.trim()}%`;
    conditions.push(
      sql`(${stockItems.sku} ILIKE ${q} OR ${stockItems.name} ILIKE ${q} OR ${stockAdjustments.notes} ILIKE ${q} OR ${stockAdjustments.reason} ILIKE ${q})`,
    );
  }

  // Total Count
  const countRes = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(stockAdjustments)
    .innerJoin(stockItems, eq(stockAdjustments.stockItemId, stockItems.id))
    .where(and(...conditions));

  const total = Number(countRes[0]?.count) || 0;

  // Rows with joined stock item and creator user
  const rows = await executor
    .select({
      id: stockAdjustments.id,
      stockItemId: stockAdjustments.stockItemId,
      quantityDelta: stockAdjustments.quantityDelta,
      previousQuantity: stockAdjustments.previousQuantity,
      newQuantity: stockAdjustments.newQuantity,
      reason: stockAdjustments.reason,
      notes: stockAdjustments.notes,
      createdBy: stockAdjustments.createdBy,
      createdAt: stockAdjustments.createdAt,
      sku: stockItems.sku,
      name: stockItems.name,
      itemType: stockItems.itemType,
      unit: stockItems.unit,
      operatorName: appUsers.displayName,
    })
    .from(stockAdjustments)
    .innerJoin(stockItems, eq(stockAdjustments.stockItemId, stockItems.id))
    .leftJoin(appUsers, eq(stockAdjustments.createdBy, appUsers.id))
    .where(and(...conditions))
    .orderBy(desc(stockAdjustments.createdAt))
    .limit(pageSize)
    .offset(offset);

  const items: StockMovementItem[] = rows.map((r: any) => {
    const delta = Number(r.quantityDelta);
    return {
      id: r.id,
      stockItemId: r.stockItemId,
      sku: r.sku,
      name: r.name,
      itemType: r.itemType as StockItemType,
      unit: r.unit,
      quantityDelta: delta,
      direction: delta >= 0 ? "in" : "out",
      previousQuantity: Number(r.previousQuantity),
      newQuantity: Number(r.newQuantity),
      reason: r.reason,
      notes: r.notes,
      createdBy: r.createdBy,
      operatorName: r.operatorName || null,
      createdAt: typeof r.createdAt === "string" ? r.createdAt : r.createdAt.toISOString(),
    };
  });

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
