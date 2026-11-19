import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowRight,
  UserCircle2,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
} from "lucide-react";
import { ensureBootstrapAdmin, login as loginFn } from "@/lib/auth.functions";
import { registerWorkshopTenant } from "@/lib/bootstrap-tenant.functions";
import { useTranslation } from "react-i18next";

const authSearchSchema = z.object({
  returnTo: z.string().optional(),
  tab: z.enum(["signin", "register"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => authSearchSchema.parse(search),
  component: AuthPage,
});

function AuthPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const nav = useNavigate();
  const search = Route.useSearch();
  const [activeTab, setActiveTab] = useState<"signin" | "register">(search?.tab ?? "signin");
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);

  // Sign in form state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Register workshop form state
  const [regWorkshopName, setRegWorkshopName] = useState("");
  const [regOwnerName, setRegOwnerName] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [showOptionalTax, setShowOptionalTax] = useState(false);
  const [regTaxNumber, setRegTaxNumber] = useState("");
  const [regCommercialRegistry, setRegCommercialRegistry] = useState("");
  const [regAddress, setRegAddress] = useState("");

  const loginServer = useServerFn(loginFn);
  const ensureBootstrapAdminServer = useServerFn(ensureBootstrapAdmin);
  const registerWorkshopServer = useServerFn(registerWorkshopTenant);

  // Make sure the default `admin / admin` account exists before the user can attempt to sign in.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureBootstrapAdminServer({ data: undefined as any });
      } catch (e) {
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
      let session = res?.session ?? res?.result?.session;
      let user = res?.user ?? res?.result?.user;
      if (!session || !user) {
        const { data: signIn } = await supabase.auth.signInWithPassword({
          email: `${username.trim().toLowerCase()}@pelecanon.local`,
          password,
        });
        if (!signIn.session || !signIn.user) throw new Error("Invalid credentials");
        session = signIn.session;
        user = signIn.user;
      } else {
        await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem("pelecanon:username", username.trim().toLowerCase());
      }

      toast.success(t("auth.loginSuccess"));
      const userRole = res?.role ?? res?.result?.role ?? res?.profile?.role;
      const defaultDest = userRole === "worker" ? "/admin/tasks" : "/admin";
      let destination = search?.returnTo || defaultDest;
      if (userRole === "worker" && (destination === "/admin" || !destination.startsWith("/admin/tasks"))) {
        destination = "/admin/tasks";
      }
      if (destination.includes("?")) {
        const [path, q] = destination.split("?");
        const p = new URLSearchParams(q);
        const searchObj: Record<string, string> = {};
        p.forEach((v, k) => {
          searchObj[k] = v;
        });
        nav({ to: path as any, search: searchObj as any });
      } else {
        nav({ to: destination as any });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterWorkshop(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result: any = await registerWorkshopServer({
        data: {
          workshopName: regWorkshopName.trim(),
          ownerName: regOwnerName.trim(),
          username: regUsername.trim().toLowerCase(),
          password: regPassword,
          phone: regPhone.trim() || null,
          taxNumber: regTaxNumber.trim() || null,
          commercialRegistry: regCommercialRegistry.trim() || null,
          address: regAddress.trim() || null,
        },
      });

      const resData = result?.result ?? result;
      if (!resData?.ok) {
        throw new Error("Failed to provision workshop. Please check your details.");
      }

      toast.success(
        isRtl
          ? `تم إنشاء وتفعيل ورشة "${resData.tenantName}" بنجاح!`
          : `Workshop "${resData.tenantName}" created and activated successfully!`,
      );

      // Auto sign-in with newly created credentials
      const { data: signInRes, error: signInErr } = await supabase.auth.signInWithPassword({
        email: `${regUsername.trim().toLowerCase()}@pelecanon.local`,
        password: regPassword,
      });

      if (signInErr || !signInRes.session) {
        // Fallback: switch to sign in tab
        setUsername(regUsername.trim().toLowerCase());
        setPassword(regPassword);
        setActiveTab("signin");
        toast.info(isRtl ? "يرجى تسجيل الدخول بحسابك الجديد" : "Please sign in with your new account");
        return;
      }

      await supabase.auth.setSession({
        access_token: signInRes.session.access_token,
        refresh_token: signInRes.session.refresh_token,
      });

      if (typeof window !== "undefined") {
        window.localStorage.setItem("pelecanon:username", regUsername.trim().toLowerCase());
        window.localStorage.setItem("pelecanon:active-tenant", resData.tenantId);
      }

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
      <div className="w-full max-w-lg">
        <Link to="/" className="flex items-center justify-center mb-6">
          <img src="/images/brand-logo.png" alt="PeleCanon" className="h-11 w-auto object-contain dark:hidden" />
          <img src="/images/brand-logo-dark.png" alt="PeleCanon" className="h-11 w-auto object-contain hidden dark:block" />
        </Link>
        <Card className="border border-border/80 shadow-lg">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "signin" | "register")}
            className="w-full"
          >
            <CardHeader className="pb-3 text-center">
              <CardTitle className="text-xl font-bold">{t("auth.title")}</CardTitle>
              <CardDescription className="text-sm mt-1">{t("auth.subtitle")}</CardDescription>

              {/* Mode Switcher Tabs */}
              <TabsList className="grid grid-cols-2 w-full mt-4">
                <TabsTrigger
                  value="signin"
                  onClick={() => setActiveTab("signin")}
                  className="gap-2 text-xs"
                >
                  <UserCircle2 className="h-3.5 w-3.5" />
                  <span>{t("auth.signInTab", "تسجيل الدخول")}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="register"
                  onClick={() => setActiveTab("register")}
                  className="gap-2 text-xs"
                >
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                  <span>{t("auth.createWorkshopTab", "إنشاء ورشة عمل جديدة")}</span>
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent className="pt-2">
              <TabsContent value="signin" className="mt-0">
                <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <Label>{t("auth.username")}</Label>
                  <Input
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
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
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    dir="ltr"
                  />
                </div>
                <Button type="submit" disabled={loading || bootstrapping} className="w-full gap-2">
                  <UserCircle2 className="h-4 w-4" />
                  {loading ? "..." : t("auth.signIn")} <ArrowRight className="h-4 w-4 rtl-flip" />
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register" className="mt-0">
              <form onSubmit={handleRegisterWorkshop} className="space-y-4">
                <div className="p-3 rounded-lg border bg-primary/5 text-xs text-primary space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{t("plans.freeOnboardingPill", "الباقة المجانية — Free Tier")}</span>
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    {t(
                      "plans.freeOnboardingDesc",
                      "تتضمن 3 أعضاء فريق و 25 مقايسة شهرياً مع تهيئة تلقائية لكافة التصنيفات المعمارية.",
                    )}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("auth.workshopName", "اسم الورشة / الشركة")} *</Label>
                    <Input
                      value={regWorkshopName}
                      onChange={(e) => setRegWorkshopName(e.target.value)}
                      required
                      placeholder={isRtl ? "مثال: ورشة الأصيل للأثاث" : "e.g. Atelier Prestige"}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">{t("auth.ownerName", "اسم المالك / المدير المسؤول")} *</Label>
                    <Input
                      value={regOwnerName}
                      onChange={(e) => setRegOwnerName(e.target.value)}
                      required
                      placeholder={isRtl ? "مثال: م. كريم فؤاد" : "e.g. Karim Fouad"}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("auth.adminUsername", "اسم مستخدم المشرف")} *</Label>
                    <Input
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      required
                      placeholder="karim"
                      dir="ltr"
                      autoComplete="username"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">{t("auth.password")} *</Label>
                    <Input
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      required
                      dir="ltr"
                      autoComplete="new-password"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">{t("auth.phone", "رقم الهاتف")} ({t("common.optional", "اختياري")})</Label>
                  <Input
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="01012345678"
                    dir="ltr"
                  />
                </div>

                {/* Collapsible Tax & Commercial Registry Details */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowOptionalTax(!showOptionalTax)}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 font-medium underline underline-offset-2"
                  >
                    <span>{t("auth.businessDetailsOptional", "بيانات السجل التجاري والضريبي (اختياري)")}</span>
                    {showOptionalTax ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>

                  {showOptionalTax && (
                    <div className="mt-3 p-3 border rounded-lg bg-card/60 space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">{t("auth.taxNumber", "البطاقة الضريبية")}</Label>
                          <Input
                            value={regTaxNumber}
                            onChange={(e) => setRegTaxNumber(e.target.value)}
                            placeholder="123-456-789"
                            dir="ltr"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("auth.commercialRegistry", "السجل التجاري")}</Label>
                          <Input
                            value={regCommercialRegistry}
                            onChange={(e) => setRegCommercialRegistry(e.target.value)}
                            placeholder="CR-998877"
                            dir="ltr"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t("auth.address", "عنوان المقر أو المصنع")}</Label>
                        <Input
                          value={regAddress}
                          onChange={(e) => setRegAddress(e.target.value)}
                          placeholder={isRtl ? "المنطقة الصناعية، التجمع الخامس، القاهرة" : "Industrial Zone, New Cairo"}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <Button type="submit" disabled={loading} className="w-full gap-2 mt-2">
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  )}
                  <span>{loading ? "..." : t("auth.registerAndLaunch", "إنشاء وتفعيل ورشة العمل")}</span>
                </Button>
              </form>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
      </div>
    </div>
  );
}
