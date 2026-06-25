/**
 * Pricing levers — tenant-scoped read fns for the new pricing tables.
 *
 * tenantPricingFactors, tenantWastageRules, tenantDiscounts, feesCredits
 *
 * SECURITY: Uses `context.supabase` (RLS-enforcing client) instead of
 * `supabaseAdmin`. The app-layer .eq("tenant_id") filter is defence-in-depth.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { setTenantGuc } from "@/lib/tenant";
import type { TenantContext } from "@/lib/tenant-context";

// ── listTenantPricingFactors ────────────────────────────────────────────────

export const listTenantPricingFactors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    const client = (context as any).supabase;
    await setTenantGuc(ctx.tenantId);
    const { data, error } = await client
      .from("tenant_pricing_factors" as any)
      .select("id, tenant_id, factor_key, percent, archived_at, created_at, updated_at")
      .eq("tenant_id", ctx.tenantId)
      .is("archived_at", null)
      .order("factor_key", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ── listTenantWastageRules ─────────────────────────────────────────────────

export const listTenantWastageRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    const client = (context as any).supabase;
    await setTenantGuc(ctx.tenantId);
    const { data, error } = await client
      .from("tenant_wastage_rules" as any)
      .select("id, tenant_id, scope, ref, pct, archived_at, created_at, updated_at")
      .eq("tenant_id", ctx.tenantId)
      .is("archived_at", null)
      .order("scope", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ── listTenantDiscounts ────────────────────────────────────────────────────

export const listTenantDiscounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    const client = (context as any).supabase;
    await setTenantGuc(ctx.tenantId);
    const { data, error } = await client
      .from("tenant_discounts" as any)
      .select("id, tenant_id, code, type, value, max_value, valid_from, valid_to, archived_at, created_at, updated_at")
      .eq("tenant_id", ctx.tenantId)
      .is("archived_at", null)
      .order("code", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ── listFeesCredits ────────────────────────────────────────────────────────

export const listFeesCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .inputValidator((d) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    const client = (context as any).supabase;
    await setTenantGuc(ctx.tenantId);
    const { data, error } = await client
      .from("fees_credits" as any)
      .select("id, tenant_id, code, label_i18n_key, sign, amount, formula_key, archived_at, created_at, updated_at")
      .eq("tenant_id", ctx.tenantId)
      .is("archived_at", null)
      .order("code", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
