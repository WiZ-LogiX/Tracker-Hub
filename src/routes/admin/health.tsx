import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertOctagon, CheckCircle2, Database } from "lucide-react";

export const Route = createFileRoute("/admin/health")({ component: HealthPage });

function HealthPage() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [authInfo, setAuthInfo] = useState<{
    uid: string | null;
    email: string | null;
    err: string | null;
  }>({ uid: null, email: null, err: null });

  async function probe() {
    setBusy(true);
    const next: Record<string, number> = {};
    const errs: Record<string, string> = {};

    // Probe auth state first — it determines whether subsequent reads will
    // succeed under RLS.
    try {
      const { data, error } = await supabase.auth.getUser();
      setAuthInfo({
        uid: data?.user?.id ?? null,
        email: data?.user?.email ?? null,
        err: error?.message ?? null,
      });
    } catch (e: any) {
      setAuthInfo({ uid: null, email: null, err: e?.message ?? String(e) });
    }

    const tables = [
      "customers",
      "quotes",
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
    ];

    for (const tbl of tables) {
      try {
        const { count, error } = await supabase
          .from(tbl as any)
          .select("id", { count: "exact", head: true });
        if (error) {
          errs[tbl] = error.message;
          next[tbl] = -1;
        } else {
          next[tbl] = count ?? 0;
        }
      } catch (e: any) {
        errs[tbl] = e?.message ?? String(e);
        next[tbl] = -1;
      }
    }

    setCounts(next);
    setErrs(errs);
    setBusy(false);
  }

  useEffect(() => {
    probe();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="h-6 w-6" /> Data fetch diagnostics
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bypasses useAuth entirely. Reads raw counts via the signed-in
          Supabase session. Errors per-table are listed below.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Auth state</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <div>
            <span className="text-muted-foreground">uid: </span>
            <span className="font-mono text-xs">
              {authInfo.uid ?? "—"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">email: </span>
            {authInfo.email ?? "—"}
          </div>
          {authInfo.err && (
            <div className="text-destructive text-xs">{authInfo.err}</div>
          )}
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={probe}
            disabled={busy}
          >
            {busy ? "Probing..." : "Re-probe"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Per-table row counts (RLS-scoped)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            -1 means the query errored. 0 means RLS hid every row OR the table
            is genuinely empty.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 font-medium">Table</th>
                <th className="py-2 font-medium">Rows (RLS view)</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(counts).map(([tbl, n]) => (
                <tr key={tbl} className="border-b last:border-0">
                  <td className="py-2 font-mono text-xs">{tbl}</td>
                  <td className="py-2">{n}</td>
                  <td className="py-2">
                    {n === -1 ? (
                      <span className="text-amber-700 inline-flex items-center gap-1">
                        <AlertOctagon className="h-3.5 w-3.5" /> error
                      </span>
                    ) : n === 0 ? (
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

          {Object.keys(errs).length > 0 && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 mt-4 space-y-1">
              <div className="font-semibold text-destructive text-xs">
                Errors
              </div>
              <ul className="text-xs space-y-0.5">
                {Object.entries(errs).map(([t, m]) => (
                  <li key={t}>
                    <span className="font-mono">{t}</span>: {m}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}