import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowRight, UserCircle2 } from "lucide-react";
import { ensureBootstrapAdmin, login as loginFn } from "@/lib/auth.functions";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/auth")({ component: AuthPage });

function AuthPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [bootstrapping, setBootstrapping] = useState(true);

  const loginServer = useServerFn(loginFn);
  const ensureBootstrapAdminServer = useServerFn(ensureBootstrapAdmin);

  // Make sure the default `admin / admin` account exists before the user can attempt to sign in.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureBootstrapAdminServer({ data: undefined as any });
      } catch (e) {
        // Non-fatal — the login below may still succeed if the admin user already exists.
        console.warn("[auth] ensureBootstrapAdmin failed", e);
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res: any = await loginServer({
        data: { username: username.trim(), password },
      });
      // The straightforward case: a session came back.
      let session = res?.session ?? res?.result?.session;
      let user = res?.user ?? res?.result?.user;
      if (!session || !user) {
        // Some pipelines wrap the handler payload — fall back to a client-side sign-in if needed.
        const { data: signIn } = await supabase.auth.signInWithPassword({
          email: `${username.trim().toLowerCase()}@pelecanon.local`,
          password,
        });
        if (!signIn.session || !signIn.user) throw new Error("Invalid credentials");
        session = signIn.session;
        user = signIn.user;
      } else {
        // Persist the session on the client so onAuthStateChange fires and the AdminLayout's gate kicks in.
        await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
      }

      // Persist a small profile snapshot so the bootstrap reducer treats it as a fresh login.
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          "pelecanon:username",
          username.trim().toLowerCase(),
        );
      }

      toast.success(t("auth.loginSuccess"));
      nav({ to: "/admin" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 justify-center mb-6">
          <div className="h-10 w-10 rounded-md gradient-emerald flex items-center justify-center text-gold font-serif font-bold">P</div>
          <span className="font-serif text-2xl font-bold">PeleCanon</span>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle className="text-center font-serif">{t("auth.title")}</CardTitle>
            <p className="text-sm text-muted-foreground text-center mt-1">{t("auth.subtitle")}</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignIn} className="space-y-4 mt-4">
              <div>
                <Label>{t("auth.username")}</Label>
                <Input
                  autoComplete="username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  placeholder="admin"
                  dir="ltr"
                />
              </div>
              <div>
                <Label>{t("auth.password")}</Label>
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  dir="ltr"
                />
              </div>
              <Button type="submit" disabled={loading || bootstrapping} className="w-full gap-2">
                <UserCircle2 className="h-4 w-4" />
                {loading ? "..." : t("auth.signIn")} <ArrowRight className="h-4 w-4 rtl-flip" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}