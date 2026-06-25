import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TenantContext } from "@/lib/tenant-context";

const UpdateTenantInput = z.object({
  name: z.string().min(1).max(200).optional(),
  logoUrl: z.string().url().max(2048).nullable().optional(),
  primaryColor: z.string().max(20).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  taxNumber: z.string().max(50).nullable().optional(),
  commercialRegistry: z.string().max(100).nullable().optional(),
});

export const updateTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => UpdateTenantInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;

    // Only owner or admin can update tenant settings
    if (ctx.role !== "owner" && ctx.role !== "admin") {
      throw new Error("Only owners or admins can update tenant settings");
    }

    // Build update payload (only include provided fields)
    const payload: Record<string, unknown> = {};
    if (data.name !== undefined) payload.name = data.name;
    if (data.logoUrl !== undefined) payload.logo_url = data.logoUrl;
    if (data.primaryColor !== undefined) payload.primary_color = data.primaryColor;
    if (data.phone !== undefined) payload.phone = data.phone;
    if (data.email !== undefined) payload.email = data.email;
    if (data.address !== undefined) payload.address = data.address;
    if (data.taxNumber !== undefined) payload.tax_number = data.taxNumber;
    if (data.commercialRegistry !== undefined) payload.commercial_registry = data.commercialRegistry;
    payload.updated_at = new Date().toISOString();

    if (Object.keys(payload).length <= 1) {
      throw new Error("No fields to update");
    }

    const { error } = await supabaseAdmin
      .from("tenants")
      .update(payload)
      .eq("id", ctx.tenantId);

    if (error) {
      throw new Error(`Failed to update tenant: ${error.message}`);
    }

    return { ok: true };
  });

export const getTenantSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;

    const { data: tenant, error } = await supabaseAdmin
      .from("tenants")
      .select("*")
      .eq("id", ctx.tenantId)
      .single();

    if (error || !tenant) {
      throw new Error("Tenant not found");
    }

    return tenant;
  });
