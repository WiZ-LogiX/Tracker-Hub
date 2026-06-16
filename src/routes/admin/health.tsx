import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertOctagon, CheckCircle2, Database } from "lucide-react";
import {
  getTableCounts,
  getMemberships,
  getTenants,
  getAuthUsers,
} from "@/lib/diagnostics-db.functions";

interface TableRow {
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

export const Route = createFileRoute("/admin/health")({ component: HealthPage });

function HealthPage() {
  const fetchCounts = useServerFn(getTableCounts);
  const fetchMemberships = useServerFn(getMemberships);
  const fetchTenants = useServerFn(getTenants);
  const fetchAuthUsers = useServerFn(getAuthUsers);

  const [counts, setCounts] = useState<TableRow[]>([]);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [users, setUsers] = useState<AuthUserRow[]>([]);
  const [errs, setErrs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function probe() {
    setBusy(true);
    setErrs([]);
    const collected: string[] = [];

    try {
      const c = await fetchCounts();
      setCounts(c.rows);
    } catch (e: any) {
      collected.push(`getTableCounts: ${e?.message ?? String(e)}`);
    }
    try {
      const m = await fetchMemberships();
      if (m.error) collected.push(`getMemberships: ${m.error}`);
      setMemberships(m.rows);
    } catch (e: any) {
      collected.push(`getMemberships: ${e?.message ?? String(e)}`);
    }
    try {
      const t = await fetchTenants();
      if (t.error) collected.push(`getTenants: ${t.error}`);
      setTenants(t.rows);
    } catch (e: any) {
      collected.push(`getTenants: ${e?.message ?? String(e)}`);
    }
    try {
      const u = await fetchAuthUsers();
      if (u.error) collected.push(`getAuthUsers: ${u.error}`);
      setUsers(u.rows);
    } catch (e: any) {
      collected.push(`getAuthUsers: ${e?.message ?? String(e)}`);
    }

    setErrs(collected);
    setBusy(false);
  }

  useEffect(() => {
    probe();
  }, []);

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold flex items-center gap-2">
            <Database className="h-7 w-7" /> Data fetch diagnostics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reads via service role — bypasses RLS so you see the real DB state.
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={probe}>
          <RefreshCw className={`h-4 w-4 mr-2 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Loading..." : "Re-probe"}
        </Button>
      </div>

      {errs.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-lg text-destructive flex items-center gap-2">
              <AlertOctagon className="h-5 w-5" /> Errors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-xs space-y-1 font-mono">
              {errs.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Auth users ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No auth.users rows.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 font-medium">Email</th>
                  <th className="py-2 font-medium">UID</th>
                  <th className="py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="py-2">{u.email ?? "—"}</td>
                    <td className="py-2 font-mono text-xs">{u.id}</td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {u.created_at ? new Date(u.created_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tenants ({tenants.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {tenants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tenants exist yet. Auth users will auto-bootstrap a tenant on first sign-in.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 font-medium">Slug</th>
                  <th className="py-2 font-medium">Name</th>
                  <th className="py-2 font-medium">ID</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{t.slug}</td>
                    <td className="py-2">{t.name}</td>
                    <td className="py-2 font-mono text-xs">{t.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Tenant memberships ({memberships.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {memberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              <b>Critical:</b> no tenant_members rows. Auth users can sign in,
              but RLS will hide every business table from them. Re-running
              the bootstrap server fn will create a row for each auth user.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 font-medium">Email</th>
                  <th className="py-2 font-medium">Role</th>
                  <th className="py-2 font-medium">Tenant</th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((m, i) => (
                  <tr key={`${m.user_id}-${m.tenant_id}-${i}`} className="border-b last:border-0">
                    <td className="py-2">{m.email ?? "—"}</td>
                    <td className="py-2">{m.role}</td>
                    <td className="py-2">
                      {m.tenant_slug ? (
                        <>
                          <span className="font-mono text-xs">{m.tenant_slug}</span>
                          <span className="text-muted-foreground"> — {m.tenant_name}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Per-table row counts (service-role view, no RLS)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Numbers here are the <i>real</i> row counts. If a table you
            expect to have data shows <code className="px-1 bg-muted rounded">0</code>,
            the data has not been inserted (or was deleted).
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 font-medium">Table</th>
                <th className="py-2 font-medium">Rows</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {counts.map((r) => (
                <tr key={r.table} className="border-b last:border-0">
                  <td className="py-2 font-mono text-xs">{r.table}</td>
                  <td className="py-2">{r.error ? "—" : r.count}</td>
                  <td className="py-2">
                    {r.error ? (
                      <span className="text-amber-700 inline-flex items-center gap-1">
                        <AlertOctagon className="h-3.5 w-3.5" /> {r.error.slice(0, 80)}
                      </span>
                    ) : r.count === 0 ? (
                      <span className="text-amber-700 inline-flex items-center gap-1">
                        <AlertOctagon className="h-3.5 w-3.5" /> empty
                      </span>
                    ) : (
                      <span className="text-emerald-700 inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> ok
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}