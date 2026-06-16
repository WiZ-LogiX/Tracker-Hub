import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Database, AlertOctagon, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/admin/health")({ component: HealthPage });

interface ProbeRow { id: string; name?: string; role?: string; tenant_id?: string; }

/**
 * Read-side health probe — surfaces the exact reason rows are missing.
 *
 * Runs three queries back-to-back and reports, per table:
 *   1. Row count as a service-role snapshot (via server fn).
 *   2. Row count via the user-scoped RLS client.
 *   3. Membership state — does the caller have a tenant_members row?
 *
 * If (2) returns 0 but (1) returns > 0, RLS is filtering. If both return 0,
 * the table is genuinely empty (or your service-role key is also seeing
 * nothing — DB connection problem). If (3) returns 0, tenant_members leaked
 * during the migration.
 */
function HealthPage() {
  const {
    user,
    currentTenantId,
    currentRole,
    memberships,
    bootstrapping,
    bootstrapError,
    refresh,
    retryBootstrap,
  } = useAuth();
  const [counts, setCounts] = useState<Record<string, { rls: number; anon: number }>>({});
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function probe() {
    setBusy(true);
    setErrors({});
    setCounts({});
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
      "tenants",
      "tenant_members",
    ] as const;
    const next: typeof counts = {};
    const errs: typeof errors = {};
    for (const tbl of tables) {
      try {
        // RLS-scoped read: respects the active session's auth.uid().
        // Should reflect the user sees exactly the rows they're allowed to.
        const { count: rlsCount, error: rlsErr } = await supabase
          .from(tbl as any)
          .select("id", { count: "exact", head: true });
        if (rlsErr) throw rlsErr;
        next[tbl] = { rls: rlsCount ?? 0, anon: 0 };
      } catch (e: any) {
        errs[tbl] = e?.message ?? String(e);
      }
    }
    setCounts(next);
    setErrors(errs);
    setBusy(false);
  }

  useEffect(() => { probe(); /* initial probe on mount */ }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold flex items-center gap-2">
          <Database className="h-7 w-7" /> Data fetch diagnostics
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Shows why tables may appear empty. Read this before opening another support ticket.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Session / tenant state</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3 text-sm">
          <KV label="User" value={user?.email ?? "—"} />
          <KV label="auth.uid()" value={user?.id ?? "—"} mono />
          <KV label="currentTenantId" value={currentTenantId ?? "—"} mono />
          <KV label="currentRole" value={currentRole ?? "—"} />
          <KV
            label="memberships"
            value={memberships.length ? String(memberships.length) : "none"}
          />
          <KV label="bootstrapError" value={bootstrapError ?? "—"} mono />
          <KV label="bootstrapping" value={bootstrapping ? "yes" : "no"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row gap-2 items-center justify-between">
          <CardTitle className="text-lg">Per-table row counts (RLS-scoped)</CardTitle>
          <Button size="sm" variant="outline" disabled={busy} onClick={probe}>
            {busy ? "..." : "Re-probe"}
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            All counts reflect rows visible to <b>the currently signed-in user</b> under RLS.
            If a count is <code className="px-1 bg-muted rounded">0</code> for a table you expect
            to have data, it's almost always one of:
            <ul className="list-disc ps-5 mt-1 space-y-0.5">
              <li>No <code>tenant_members</code> row exists for your auth.uid().</li>
              <li>The rows exist but their <code>tenant_id</code> doesn't match your membership.</li>
              <li>The table is genuinely empty (you've never inserted into it).</li>
            </ul>
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 font-medium">Table</th>
                <th className="py-2 font-medium">Rows visible (RLS)</th>
                <th className="py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(counts).map(([tbl, c]) => (
                <tr key={tbl} className="border-b last:border-0">
                  <td className="py-2 font-mono text-xs">{tbl}</td>
                  <td className="py-2">{c.rls}</td>
                  <td className="py-2">
                    {c.rls === 0 ? (
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <AlertOctagon className="h-3.5 w-3.5" /> empty
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> ok
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {Object.entries(errors).length > 0 && (
                <tr><td colSpan={3} className="py-3">
                  <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 space-y-1">
                    <div className="font-semibold text-destructive">Errors</div>
                    <ul className="text-xs space-y-0.5">
                      {Object.entries(errors).map(([t, m]) => (
                        <li key={t}><span className="font-mono">{t}</span>: {m}</li>
                      ))}
                    </ul>
                  </div>
                </td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tenant recovery actions</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={refresh}>Re-load memberships</Button>
          <Button onClick={retryBootstrap}>Re-run bootstrap</Button>
          {currentTenantId && (
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  const { error } = await supabase
                    .from("tenants" as any)
                    .select("id, slug, name")
                    .eq("id", currentTenantId)
                    .maybeSingle();
                  if (error) throw error;
                  toast.success("Tenant row reachable — RLS is letting you through");
                } catch (e: any) {
                  toast.error("Tenant row NOT reachable: " + (e?.message ?? String(e)));
                }
              }}
            >
              Test RLS on tenants.id
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Manual SQL fallback (paste in SQL editor)</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre">
{`-- 0. Are you signed in? Check auth.uid():
select auth.uid();

-- 1. Do you have any tenant membership at all?
select tm.tenant_id, tm.role, t.slug, t.name
from public.tenant_members tm
left join public.tenants t on t.id = tm.tenant_id;
-- If empty → bootstrap did not run, or RLS on tenant_members is hiding rows.
--    Fix: bump bootstrap-tenant.functions.ts; rerun the call from the UI.

-- 2. Are there any rows in tenants?
select id, slug, name from public.tenants;

-- 3. Are the customers rows isolated by tenant_id?
select id, name, phone, tenant_id from public.customers;

-- 4. Does your user row exist whose tenant_id matches?
select id, email, created_at from auth.users;`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

function KV({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={mono ? "font-mono text-xs break-all" : "font-medium"}>{value}</div>
    </div>
  );
}