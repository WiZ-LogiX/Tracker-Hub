import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { setTenantGuc } from "@/lib/tenant";
import type { TenantContext } from "@/lib/tenant-context";

const PricingFactorRow = z.object({
  id: z.string().uuid().optional(),
  key: z.string().min(1),
  label_ar: z.string().min(1),
  kind: z.string().min(1),
  scope: z.string().optional(),
  value_pct: z.number(),
  value_fixed: z.number().optional(),
  active: z.boolean(),
});

const IdInput = z.object({ id: z.string().uuid() });

export const listPricingFactors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    const { data, error } = await supabaseAdmin
      .from("pricing_factors")
      .select("id, key, label_ar, kind, scope, value_pct, value_fixed, active")
      .eq("tenant_id", ctx.tenantId)
      .order("key");
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const upsertPricingFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => PricingFactorRow.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("pricing_factors")
        .update(data)
        .eq("id", data.id)
        .eq("tenant_id", ctx.tenantId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("pricing_factors")
      .insert({ ...data, tenant_id: ctx.tenantId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row?.id ?? null };
  });

export const deletePricingFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context.tenantContext as TenantContext;
    await setTenantGuc(ctx.tenantId);
    const { error } = await supabaseAdmin
      .from("pricing_factors")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", ctx.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
