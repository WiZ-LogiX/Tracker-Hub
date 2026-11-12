import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TenantContext } from "@/lib/tenant-context";
import {
  DEFAULT_COMMERCIAL_CATEGORIES,
  type CommercialProductCategory,
  type CommercialDimensionUnit,
  type CommercialPricingUnit,
} from "@/lib/commercial-quote-types";

const CommercialCategoryInput = z.object({
  id: z.string().optional(),
  code: z.string().min(1).max(50),
  nameAr: z.string().min(1).max(100),
  nameEn: z.string().min(1).max(100),
  defaultDimensionUnit: z.enum(["mm", "cm", "m"]).default("mm"),
  defaultPricingUnit: z.enum(["pcs", "m", "m2", "set", "pair", "lot"]).default("pcs"),
  defaultSpecsTemplateAr: z.string().optional(),
  active: z.boolean().default(true),
});

/**
 * List all commercial product categories configured for the current tenant.
 * Merges tenant-customized categories with the core defaults (Kitchen, Dressing, Door, etc.).
 */
export const listCommercialCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }): Promise<CommercialProductCategory[]> => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId } = ctx;

    try {
      const { data: tenant } = await supabaseAdmin
        .from("tenants")
        .select("feature_flags")
        .eq("id", tenantId)
        .single();

      const flags = (tenant?.feature_flags as Record<string, any>) || {};
      const customCats: CommercialProductCategory[] = flags.commercialCategories || [];

      // If tenant has custom configured categories, return them (ensuring defaults exist if not explicitly defined)
      if (Array.isArray(customCats) && customCats.length > 0) {
        const existingCodes = new Set(customCats.map((c) => c.code));
        const missingDefaults = DEFAULT_COMMERCIAL_CATEGORIES.filter(
          (dc) => !existingCodes.has(dc.code),
        ).map((c) => ({ ...c, active: true }));
        const normalizedCats = customCats.map((c) => {
          // PeleCanon core categories (kitchen, dressing, door) are foundational
          if (c.code === "kitchen" && c.active === false) {
            return { ...c, active: true };
          }
          return c;
        });
        return [...normalizedCats, ...missingDefaults];
      }
    } catch {
      // Fallback to default categories
    }

    return DEFAULT_COMMERCIAL_CATEGORIES.map((c) => ({ ...c, active: true }));
  });

/**
 * Create or update a commercial product category for the current tenant.
 */
export const saveCommercialCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((d: unknown) => CommercialCategoryInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, role } = ctx;

    if (role !== "owner" && role !== "admin") {
      throw new Error("Only owners and admins can configure product categories");
    }

    const { data: tenant, error: fetchErr } = await supabaseAdmin
      .from("tenants")
      .select("feature_flags")
      .eq("id", tenantId)
      .single();

    if (fetchErr || !tenant) {
      throw new Error("Tenant record not found");
    }

    const flags = (tenant.feature_flags as Record<string, any>) || {};
    let customCats: CommercialProductCategory[] = flags.commercialCategories
      ? [...flags.commercialCategories]
      : DEFAULT_COMMERCIAL_CATEGORIES.map((c) => ({ ...c, active: true }));

    const categoryId = data.id || `cat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const categoryToSave: CommercialProductCategory = {
      id: categoryId,
      code: data.code.trim().toLowerCase().replace(/\s+/g, "_"),
      nameAr: data.nameAr.trim(),
      nameEn: data.nameEn.trim(),
      defaultDimensionUnit: data.defaultDimensionUnit as CommercialDimensionUnit,
      defaultPricingUnit: data.defaultPricingUnit as CommercialPricingUnit,
      defaultSpecsTemplateAr: data.defaultSpecsTemplateAr?.trim() || "",
      active: data.active,
    };

    const existingIdx = customCats.findIndex(
      (c) => c.id === categoryId || c.code === categoryToSave.code,
    );

    if (existingIdx >= 0) {
      customCats[existingIdx] = categoryToSave;
    } else {
      customCats.push(categoryToSave);
    }

    const updatedFlags = {
      ...flags,
      commercialCategories: customCats,
    };

    const { error: updateErr } = await supabaseAdmin
      .from("tenants")
      .update({
        feature_flags: updatedFlags,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);

    if (updateErr) {
      throw new Error(`Failed to save commercial category: ${updateErr.message}`);
    }

    return { success: true, category: categoryToSave };
  });

/**
 * Toggle the active/deactivated state of a category.
 */
export const toggleCommercialCategoryActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((d: unknown) =>
    z.object({ categoryId: z.string(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, role } = ctx;

    if (role !== "owner" && role !== "admin") {
      throw new Error("Only owners and admins can configure product categories");
    }

    const { data: tenant, error: fetchErr } = await supabaseAdmin
      .from("tenants")
      .select("feature_flags")
      .eq("id", tenantId)
      .single();

    if (fetchErr || !tenant) {
      throw new Error("Tenant record not found");
    }

    const flags = (tenant.feature_flags as Record<string, any>) || {};
    let customCats: CommercialProductCategory[] = flags.commercialCategories
      ? [...flags.commercialCategories]
      : DEFAULT_COMMERCIAL_CATEGORIES.map((c) => ({ ...c, active: true }));

    customCats = customCats.map((c) =>
      c.id === data.categoryId || c.code === data.categoryId
        ? { ...c, active: data.active }
        : c,
    );

    const updatedFlags = {
      ...flags,
      commercialCategories: customCats,
    };

    const { error: updateErr } = await supabaseAdmin
      .from("tenants")
      .update({
        feature_flags: updatedFlags,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);

    if (updateErr) {
      throw new Error(`Failed to update commercial category: ${updateErr.message}`);
    }

    return { success: true, categoryId: data.categoryId, active: data.active };
  });
