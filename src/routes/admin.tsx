import { createFileRoute, Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, FileText, Receipt, ClipboardList,
  Package, Layers3, Palette, Wrench, Ticket, LogOut, Menu,
  Truck, Trees, SlidersHorizontal, GitBranch, Sparkles, Bell,
  Users, RefreshCcw, BarChart3, UserCircle, Database, UserCog
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

const NAV = [
  { to: "/admin", labelKey: "admin.nav.home", icon: LayoutDashboard, exact: true },
  { to: "/admin/team", labelKey: "admin.nav.team", icon: UserCog },
  { to: "/admin/quotes", labelKey: "admin.nav.quotes", icon: FileText },
  { to: "/admin/quotes/configurator", labelKey: "admin.nav.configurator", icon: Sparkles },
  { to: "/admin/invoices", labelKey: "admin.nav.invoices", icon: Receipt },
  { to: "/admin/orders", labelKey: "admin.nav.orders", icon: ClipboardList },
  { to: "/admin/customers", labelKey: "admin.nav.customers", icon: UserCircle },
  { to: "/admin/products", labelKey: "admin.nav.products", icon: Package },
  { to: "/admin/materials", labelKey: "admin.nav.materials", icon: Layers3 },
  { to: "/admin/suppliers", labelKey: "admin.nav.suppliers", icon: Truck },
  { to: "/admin/finishes", labelKey: "admin.nav.finishes", icon: Palette },
  { to: "/admin/veneers", labelKey: "admin.nav.veneers", icon: Trees },
  { to: "/admin/accessories", labelKey: "admin.nav.accessories", icon: Wrench },
  { to: "/admin/pricing-factors", labelKey: "admin.nav.pricingFactors", icon: SlidersHorizontal },
  { to: "/admin/wastage-rules", labelKey: "admin.nav.wastageRules", icon: SlidersHorizontal },
  { to: "/admin/pricing-rules", labelKey: "admin.nav.pricingRules", icon: GitBranch },
  { to: "/admin/cost-analysis", labelKey: "admin.nav.costAnalysis", icon: BarChart3 },
  { to: "/admin/discounts", labelKey: "admin.nav.discounts", icon: Ticket },
  { to: "/admin/notifications", labelKey: "admin.nav.notifications", icon: Bell },
  { to: "/admin/workers", labelKey: "admin.nav.workers", icon: Users },
  { to: "/admin/remakes", labelKey: "admin.nav.remakes", icon: RefreshCcw },
  { to: "/admin/seed", labelKey: "admin.nav.seedData", icon: Database },
];

function SidebarContent() {
  const loc = useLocation();
  const { signOut, user } = useAuth();
  const nav = useNavigate();
  const { t } = useTranslation();

  const path = loc.pathname;
  let bestTo: string | null = null;
  for (const item of NAV) {
    const matches = item.exact
      ? path === item.to
      : path === item.to || path.startsWith(item.to + "/");
    if (matches && (!bestTo || item.to.length > bestTo.length)) {
      bestTo = item.to;
    }
  }

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      <div className="px-6 py-6 border-b border-sidebar-border">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-md bg-gold flex items-center justify-center text-gold-foreground font-serif font-bold">
            P
          </div>
          <div>
            <div className="font-serif font-bold text-lg leading-none text-sidebar-foreground">
              PeleCanon
            </div>
            <div className="text-[10px] text-sidebar-foreground/60">{t("admin.panel")}</div>
          </div>
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map(item => {
          const active = item.to === bestTo;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition ${
                active
                  ? "bg-gold text-gold-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{t(item.labelKey as never) ?? item.labelKey}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-sidebar-border">
        <div className="px-3 py-2 text-xs text-sidebar-foreground/60 truncate">
          {user?.email}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          onClick={async () => {
            await signOut();
            nav({ to: "/auth" });
          }}
        >
          <LogOut className="h-4 w-4" /> {t("common.logout")}
        </Button>
      </div>
    </div>
  );
}

function AdminLayout() {
  const {
    user,
    loading,
    isStaff,
    memberships,
    bootstrapping,
    bootstrapError,
    bootstrapAttempted,
    retryBootstrap,
    signOut: doSignOut,
  } = useAuth();
  const nav = useNavigate();
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div
          className="h-6 w-6 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin"
          aria-label="loading"
        />
      </div>
    );
  }

  if (bootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div
            className="h-6 w-6 mx-auto rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin"
            aria-label="loading"
          />
          <p className="text-sm text-muted-foreground">
            {t("admin.bootstrapping") ?? "Preparing your workspace…"}
          </p>
        </div>
      </div>
    );
  }

  if (!isStaff && memberships.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <p className="text-sm font-medium">
            {bootstrapError
              ? (t("admin.bootstrapFailedTitle") ?? "Couldn't prepare your workspace")
              : (t("admin.noTeamTitle") ?? "No team set up yet")}
          </p>
          {bootstrapError ? (
            <pre className="text-xs text-muted-foreground break-words whitespace-pre-wrap text-left bg-muted p-3 rounded">
              {bootstrapError}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("admin.noTeamDesc") ??
                "Your account belongs to no team yet. Click Set up my workspace to create one."}
            </p>
          )}
          <div className="flex gap-2 justify-center">
            <Button onClick={retryBootstrap}>
              {bootstrapError
                ? (t("common.retry") ?? "Retry")
                : (t("admin.setupWorkspace") ?? "Set up my workspace")}
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                await doSignOut();
                nav({ to: "/auth" });
              }}
            >
              {t("common.logout") ?? "Sign out"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 text-center">
        <div>
          <p className="mb-4">{t("admin.noAccess")}</p>
          <Link to="/">
            <Button variant="outline">{t("common.home")}</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      <aside
        className={`hidden md:flex md:w-64 shrink-0 fixed inset-y-0 ${isRtl ? "right-0" : "left-0"}`}
      >
        <SidebarContent />
      </aside>
      <div className={`flex-1 ${isRtl ? "md:mr-64" : "md:ml-64"} flex flex-col min-w-0`}>
        <header className="border-b bg-card px-4 py-3 flex items-center gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side={isRtl ? "right" : "left"} className="p-0 w-72">
              <SidebarContent />
            </SheetContent>
          </Sheet>
          <div className="font-serif font-bold md:hidden">PeleCanon Admin</div>
          <div className="flex-1" />
          <LanguageSwitcher />
          <ThemeToggle />
        </header>
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}