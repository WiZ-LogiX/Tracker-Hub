import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import {
  type TenantContext,
  requirePermission,
  forbidWorker,
  hasEffectivePermission,
} from "@/lib/tenant-context";
import type { ExecutiveDashboardData } from "@/lib/dashboard-types";
import { fetchExecutiveDashboardData } from "@/lib/dashboard.server";

const DashboardInput = z.object({}).optional().default({});

export const getExecutiveDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => DashboardInput.parse(input ?? {}))
  .handler(async ({ context }): Promise<ExecutiveDashboardData> => {
    const ctx = context.tenantContext as TenantContext;
    forbidWorker(ctx, "Executive Dashboard");
    requirePermission(ctx, "dashboard.view");
    const canViewFinancials = hasEffectivePermission(ctx, "projects.financials.view");
    return fetchExecutiveDashboardData(ctx.tenantId, { canViewFinancials });
  });
