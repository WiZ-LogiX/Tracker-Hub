import { eq, and, asc } from "drizzle-orm";
import { db } from "@/db/client.server";
import { products, categories } from "@/db/schema";
import type { ProductCatalogItem, ProductCategoryOption } from "./products.functions";

export async function listProductsCatalogServer(tenantId: string): Promise<ProductCatalogItem[]> {
  const rows = await db
    .select({
      id: products.id,
      code: products.code,
      nameAr: products.nameAr,
      nameEn: products.nameEn,
      descriptionAr: products.descriptionAr,
      categoryId: products.categoryId,
      categoryNameAr: categories.nameAr,
      categoryNameEn: categories.nameEn,
      basePrice: products.basePrice,
      laborPct: products.laborPct,
      wastagePct: products.wastagePct,
      overheadPct: products.overheadPct,
      marginPct: products.marginPct,
      active: products.active,
      createdAt: products.createdAt,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.tenantId, tenantId))
    .orderBy(asc(categories.nameAr), asc(products.nameAr));

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    nameAr: r.nameAr,
    nameEn: r.nameEn || null,
    descriptionAr: r.descriptionAr || null,
    categoryId: r.categoryId || null,
    categoryNameAr: r.categoryNameAr || null,
    categoryNameEn: r.categoryNameEn || null,
    basePrice: Number(r.basePrice || 0),
    laborPct: Number(r.laborPct || 15),
    wastagePct: Number(r.wastagePct || 8),
    overheadPct: Number(r.overheadPct || 10),
    marginPct: Number(r.marginPct || 25),
    active: Boolean(r.active),
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
  }));
}

export async function listProductCategoriesServer(tenantId: string): Promise<ProductCategoryOption[]> {
  const rows = await db
    .select({
      id: categories.id,
      nameAr: categories.nameAr,
      nameEn: categories.nameEn,
      pricingUnit: categories.pricingUnit,
    })
    .from(categories)
    .where(eq(categories.tenantId, tenantId))
    .orderBy(asc(categories.nameAr));

  return rows;
}

export interface UpsertProductServerInput {
  id?: string;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  categoryId?: string | null;
  basePrice: number;
  laborPct: number;
  wastagePct: number;
  overheadPct: number;
  marginPct: number;
  descriptionAr?: string | null;
  active: boolean;
}

export async function upsertProductCatalogItemServer(tenantId: string, data: UpsertProductServerInput) {
  const values = {
    tenantId,
    code: data.code.trim(),
    nameAr: data.nameAr.trim(),
    nameEn: data.nameEn?.trim() || data.nameAr.trim(),
    descriptionAr: data.descriptionAr?.trim() || null,
    categoryId: data.categoryId || null,
    basePrice: String(data.basePrice),
    laborPct: String(data.laborPct),
    wastagePct: String(data.wastagePct),
    overheadPct: String(data.overheadPct),
    marginPct: String(data.marginPct),
    active: data.active,
  };

  if (data.id) {
    const [updated] = await db
      .update(products)
      .set(values)
      .where(and(eq(products.id, data.id), eq(products.tenantId, tenantId)))
      .returning();

    return { ok: true, product: updated };
  }

  const [inserted] = await db
    .insert(products)
    .values(values)
    .returning();

  return { ok: true, product: inserted };
}

export async function deleteProductCatalogItemServer(tenantId: string, id: string) {
  await db
    .delete(products)
    .where(and(eq(products.id, id), eq(products.tenantId, tenantId)));

  return { ok: true };
}

export interface UpsertCategoryServerInput {
  nameAr: string;
  nameEn: string;
  pricingUnit: string;
}

export async function createProductCategoryServer(tenantId: string, data: UpsertCategoryServerInput) {
  const [inserted] = await db
    .insert(categories)
    .values({
      tenantId,
      nameAr: data.nameAr.trim(),
      nameEn: data.nameEn.trim(),
      pricingUnit: data.pricingUnit,
    })
    .returning();

  return { ok: true, category: inserted };
}
