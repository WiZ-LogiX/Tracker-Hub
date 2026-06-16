import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("pricing_factors")
      .select("id, key, label_ar, kind, scope, value_pct, value_fixed, active")
      .order("key");
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const upsertPricingFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => PricingFactorRow.parse(d))
  .handler(async ({ data }) => {
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("pricing_factors")
        .update(data)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("pricing_factors")
      .insert(data)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row?.id ?? null };
  });

export const deletePricingFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => IdInput.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("pricing_factors")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });