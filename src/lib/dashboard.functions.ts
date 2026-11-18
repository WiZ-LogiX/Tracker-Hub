import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { type TenantContext, requirePermission } from "@/lib/tenant-context";
import type { ExecutiveDashboardData } from "@/lib/dashboard-types";
import { fetchExecutiveDashboardData } from "@/lib/dashboard.server";

const DashboardInput = z.object({}).optional().default({});

export const getExecutiveDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => DashboardInput.parse(input ?? {}))
  .handler(async ({ context }): Promise<ExecutiveDashboardData> => {
    const ctx = context.tenantContext as TenantContext;
    requirePermission(ctx, "dashboard.view");
    return fetchExecutiveDashboardData(ctx.tenantId);
  });
