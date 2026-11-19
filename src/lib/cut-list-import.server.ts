/**
 * Sprint 7A — Workshop-Grade Cut-List Server Engine
 * Server-only database operations for cut list imports, persistence, and revision lock enforcement.
 */

import { db } from "@/db/client.server";
import {
  productionWorkOrders,
  workOrderCutListItems,
  auditLog,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import type { NormalizedCutListRow } from "./cut-list-import.types";

export interface ExecuteImportCutListParams {
  tenantId: string;
  userId?: string | null;
  workOrderId: string;
  mode: "replace" | "append";
  items: NormalizedCutListRow[];
}

export async function executeImportWorkOrderCutList(
  database: any = db,
  params: ExecuteImportCutListParams,
) {
  // 1. Verify work order exists and belongs to tenant
  const [wo] = await database
    .select({
      id: productionWorkOrders.id,
      tenantId: productionWorkOrders.tenantId,
      workOrderNumber: productionWorkOrders.workOrderNumber,
      status: productionWorkOrders.status,
    })
    .from(productionWorkOrders)
    .where(
      and(
        eq(productionWorkOrders.id, params.workOrderId),
        eq(productionWorkOrders.tenantId, params.tenantId),
      ),
    )
    .limit(1);

  if (!wo) {
    throw new Error("Work order not found or access denied");
  }

  // 2. Revision Lock Guard: Reject if work order is beyond draft or ready
  if (wo.status !== "draft" && wo.status !== "ready") {
    throw new Error(
      `Cut list revision is locked because work order status is '${wo.status}'. Cut lists can only be imported or replaced in 'draft' or 'ready' status.`,
    );
  }

  // 3. Strict Server-Side Item Validation
  if (!params.items || params.items.length === 0) {
    throw new Error("No cut list items provided for import");
  }

  for (let i = 0; i < params.items.length; i++) {
    const item = params.items[i];
    if (!item.partName || !item.partName.trim()) {
      throw new Error(`Item ${i + 1}: Part name is required`);
    }
    if (!item.materialName || !item.materialName.trim()) {
      throw new Error(`Item ${i + 1}: Material name is required`);
    }
    const len = Number(item.lengthMm);
    if (isNaN(len) || len <= 0) {
      throw new Error(`Item ${i + 1}: Length must be greater than 0 mm`);
    }
    const width = Number(item.widthMm);
    if (isNaN(width) || width <= 0) {
      throw new Error(`Item ${i + 1}: Width must be greater than 0 mm`);
    }
    const thick = Number(item.thicknessMm);
    if (isNaN(thick) || thick <= 0) {
      throw new Error(`Item ${i + 1}: Thickness must be greater than 0 mm`);
    }
    const qty = Number(item.quantity);
    if (isNaN(qty) || qty <= 0) {
      throw new Error(`Item ${i + 1}: Quantity must be greater than 0`);
    }
  }

  // 4. Atomic Transaction: Replace/Append + Audit Log
  return await database.transaction(async (tx: any) => {
    let startingIndex = 0;

    if (params.mode === "replace") {
      await tx
        .delete(workOrderCutListItems)
        .where(
          and(
            eq(workOrderCutListItems.tenantId, params.tenantId),
            eq(workOrderCutListItems.workOrderId, params.workOrderId),
          ),
        );
    } else {
      const [lastItem] = await tx
        .select({ rowIndex: workOrderCutListItems.rowIndex })
        .from(workOrderCutListItems)
        .where(
          and(
            eq(workOrderCutListItems.tenantId, params.tenantId),
            eq(workOrderCutListItems.workOrderId, params.workOrderId),
          ),
        )
        .orderBy(desc(workOrderCutListItems.rowIndex))
        .limit(1);

      startingIndex = (lastItem?.rowIndex ?? -1) + 1;
    }

    const rowsToInsert = params.items.map((item, idx) => ({
      tenantId: params.tenantId,
      workOrderId: params.workOrderId,
      rowIndex: startingIndex + idx,
      partName: item.partName.trim(),
      unitName: (item.unitName || "Unit").trim(),
      productName: (item.productName || "Custom Product").trim(),
      sectionName: (item.sectionName || "General").trim(),
      materialSku: (item.materialSku || "CUSTOM").trim(),
      materialName: item.materialName.trim(),
      lengthMm: String(item.lengthMm),
      widthMm: String(item.widthMm),
      thicknessMm: String(item.thicknessMm || 18),
      quantity: String(item.quantity || 1),
      unitOfMeasure: item.unitOfMeasure || "pcs",
      edgeTop: item.edgeTop || null,
      edgeBottom: item.edgeBottom || null,
      edgeLeft: item.edgeLeft || null,
      edgeRight: item.edgeRight || null,
      grainDirection: item.grainDirection || "along_length",
      notes: item.notes || null,
      source: "csv_import" as const,
    }));

    const inserted = await tx
      .insert(workOrderCutListItems)
      .values(rowsToInsert)
      .returning();

    // Audit Log Entry
    await tx.insert(auditLog).values({
      tenantId: params.tenantId,
      actorId: params.userId ? (params.userId as any) : null,
      entityType: "work_order",
      entityId: params.workOrderId,
      action: "cut_list_imported",
      details: {
        work_order_number: wo.workOrderNumber,
        mode: params.mode,
        imported_rows_count: inserted.length,
        first_part_sample: inserted[0]?.partName,
      },
    });

    return {
      ok: true,
      workOrderId: params.workOrderId,
      mode: params.mode,
      count: inserted.length,
      items: inserted,
    };
  });
}
