import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import { requireRole, type TenantContext } from "@/lib/tenant-context";

interface TableRowCount {
  table: string;
  count: number;
  error: string | null;
}

interface MembershipRow {
  user_id: string;
  email: string | null;
  tenant_id: string;
  role: string;
  tenant_slug: string | null;
  tenant_name: string | null;
}

interface TenantRow {
  id: string;
  slug: string;
  name: string;
}

interface AuthUserRow {
  id: string;
  email: string | null;
  created_at: string | null;
}

export const getTableCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireRole(ctx, ["owner", "admin"]);

    const tables = [
      "customers",
      "quotes",
      "quote_items",
      "invoices",
      "orders",
      "products",
      "materials",
      "suppliers",
      "finishes",
      "accessories",
      "workers",
      "discounts",
      "pricing_factors",
      "pricing_rules",
      "wastage_rules",
      "notification_log",
      "notification_templates",
      "internal_notes",
      "audit_log",
      "configurations",
      "production_photos",
      "production_logs",
      "production_assignments",
      "qc_inspections",
      "remakes",
      "tenants",
      "tenant_members",
    ];
    const rows: TableRowCount[] = [];
    for (const tbl of tables) {
      try {
        const { count, error } = await supabaseAdmin
          .from(tbl as any)
          .select("id", { count: "exact", head: true });
        rows.push({
          table: tbl,
          count: count ?? 0,
          error: error?.message ?? null,
        });
      } catch (e: any) {
        rows.push({ table: tbl, count: 0, error: e?.message ?? String(e) });
      }
    }
    return { rows };
  },
);

export const getTenants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireRole(ctx, ["owner", "admin"]);

    try {
      const { data, error } = await supabaseAdmin
        .from("tenants")
        .select("id, slug, name")
        .order("created_at", { ascending: true });
      if (error) return { rows: [], error: error.message };
      return { rows: (data as TenantRow[]) ?? [], error: null };
    } catch (e: any) {
      return { rows: [], error: e?.message ?? String(e) };
    }
  },
);

export const getAuthUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireRole(ctx, ["owner", "admin"]);

    try {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      if (error) return { rows: [], error: error.message };
      const rows: AuthUserRow[] = (data?.users ?? []).map((u) => ({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at ?? null,
      }));
      return { rows, error: null };
    } catch (e: any) {
      return { rows: [], error: e?.message ?? String(e) };
    }
  },
);

/**
 * Memberships — joined with tenants via PostgREST's *confirmed* nested
 * select syntax. Email is resolved separately via admin.listUsers (auth is
 * not a publicly exposed schema, so you can't `.select('auth.users(email)')`
 * the way the previous version tried: PostgREST rejects the FK path with
 * "failed to parse select parameter").
 */
export const getMemberships = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenant])
  .handler(async ({ context }) => {
    const ctx = context.tenantContext as TenantContext;
    requireRole(ctx, ["owner", "admin"]);

    try {
      const [{ data: memberships, error: mErr }, { data: users, error: uErr }] =
        await Promise.all([
          supabaseAdmin
            .from("tenant_members")
            .select("user_id, role, tenant_id, tenants(slug, name)")
            .order("created_at", { ascending: true }),
          supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 }),
        ]);
      if (mErr) return { rows: [], error: mErr.message };
      if (uErr) return { rows: [], error: uErr.message };

      const emailById: Record<string, string> = {};
      for (const u of users?.users ?? []) emailById[u.id] = u.email ?? "—";

      const rows: MembershipRow[] = (memberships ?? []).map((m: any) => ({
        user_id: m.user_id,
        email: emailById[m.user_id] ?? "—",
        tenant_id: m.tenant_id,
        role: m.role,
        tenant_slug: (m.tenants as any)?.slug ?? null,
        tenant_name: (m.tenants as any)?.name ?? null,
      }));
      return { rows, error: null };
    } catch (e: any) {
      return { rows: [], error: e?.message ?? String(e) };
    }
  },
);