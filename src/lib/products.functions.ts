import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import type { TenantContext } from "@/lib/tenant-context";

export interface ProductCatalogItem {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  descriptionAr: string | null;
  categoryId: string | null;
  categoryNameAr: string | null;
  categoryNameEn: string | null;
  basePrice: number;
  laborPct: number;
  wastagePct: number;
  overheadPct: number;
  marginPct: number;
  active: boolean;
  createdAt: string;
}

export interface ProductCategoryOption {
  id: string;
  nameAr: string;
  nameEn: string;
  pricingUnit: string;
}

/**
 * List all products for the current tenant with linked category details.
 */
export const listProductsCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }): Promise<ProductCatalogItem[]> => {
    const ctx = context.tenantContext as TenantContext;
    const { listProductsCatalogServer } = await import("./products.server");
    return listProductsCatalogServer(ctx.tenantId);
  });

/**
 * List all product categories/classifications for the tenant.
 */
export const listProductCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }): Promise<ProductCategoryOption[]> => {
    const ctx = context.tenantContext as TenantContext;
    const { listProductCategoriesServer } = await import("./products.server");
    return listProductCategoriesServer(ctx.tenantId);
  });

const UpsertProductInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(50),
  nameAr: z.string().min(1).max(255),
  nameEn: z.string().max(255).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  basePrice: z.number().min(0).default(0),
  laborPct: z.number().min(0).max(100).default(15),
  wastagePct: z.number().min(0).max(100).default(8),
  overheadPct: z.number().min(0).max(100).default(10),
  marginPct: z.number().min(0).max(100).default(25),
  descriptionAr: z.string().optional().nullable(),
  active: z.boolean().default(true),
});

/**
 * Upsert product catalog item and assign category/classification.
 */
export const upsertProductCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((d: unknown) => UpsertProductInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { upsertProductCatalogItemServer } = await import("./products.server");
    return upsertProductCatalogItemServer(ctx.tenantId, data);
  });

const DeleteProductInput = z.object({
  id: z.string().uuid(),
});

/**
 * Delete a product catalog item.
 */
export const deleteProductCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((d: unknown) => DeleteProductInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { deleteProductCatalogItemServer } = await import("./products.server");
    return deleteProductCatalogItemServer(ctx.tenantId, data.id);
  });

const UpsertCategoryInput = z.object({
  nameAr: z.string().min(1).max(100),
  nameEn: z.string().min(1).max(100),
  pricingUnit: z.string().min(1).default("unit"),
});

/**
 * Quick create a new category/classification.
 */
export const createProductCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((d: unknown) => UpsertCategoryInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { createProductCategoryServer } = await import("./products.server");
    return createProductCategoryServer(ctx.tenantId, data);
  });
