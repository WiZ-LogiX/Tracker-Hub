import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

/**
 * Service-role row counts. RLS does NOT apply — you see the actual DB state.
 *
 * Splits the table list into tenant-scoped (counts rows that should be tenant-
 * filtered) and metadata (tenants, tenant_members, auth.users). It's the same
 * shape as before, but uses the admin client under the hood so the numbers
 * are real.
 */
export const getTableCounts = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ rows: TableRowCount[] }> => {
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

export const getMemberships = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ rows: MembershipRow[]; error: string | null }> => {
    try {
      const { data, error } = await supabaseAdmin
        .from("tenant_members")
        .select("user_id, role, tenant_id, tenants(slug, name), auth:auth.users(email)")
        .order("created_at", { ascending: true });
      if (error) return { rows: [], error: error.message };
      // The embedded `auth` join doesn't actually resolve through PostgREST
      // (auth isn't an exposed FK target), so fall back to a second query
      // for emails.
      const userIds = Array.from(
        new Set((data ?? []).map((r: any) => r.user_id as string).filter(Boolean)),
      );
      const emails: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        for (const u of listData?.users ?? []) {
          emails[u.id] = u.email ?? "—";
        }
      }
      const rows: MembershipRow[] = (data ?? []).map((r: any) => ({
        user_id: r.user_id,
        email: emails[r.user_id] ?? "—",
        tenant_id: r.tenant_id,
        role: r.role,
        tenant_slug: (r.tenants as any)?.slug ?? null,
        tenant_name: (r.tenants as any)?.name ?? null,
      }));
      return { rows, error: null };
    } catch (e: any) {
      return { rows: [], error: e?.message ?? String(e) };
    }
  },
);

export const getTenants = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ rows: TenantRow[]; error: string | null }> => {
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

export const getAuthUsers = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ rows: AuthUserRow[]; error: string | null }> => {
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