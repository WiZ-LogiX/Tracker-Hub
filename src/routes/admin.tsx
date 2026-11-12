import { createFileRoute, Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  FileText,
  ClipboardList,
  Package,
  Ticket,
  LogOut,
  Menu,
  SlidersHorizontal,
  GitBranch,
  Sparkles,
  Bell,
  Users,
  RefreshCcw,
  BarChart3,
  UserCircle,
  FileSpreadsheet,
  Settings,
  Hammer,
  Boxes,
  CheckSquare,
  Receipt,
  Truck,
  TrendingUp,
  UserCheck,
  FolderKanban,
  Headphones,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { NotificationBell } from "@/components/NotificationBell";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

interface NavSection {
  titleKey: string;
  items: {
    to: string;
    labelKey: string;
    icon: any;
    exact?: boolean;
    badge?: string;
  }[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    titleKey: "admin.nav.sectionCore",
    items: [
      { to: "/admin", labelKey: "admin.nav.home", icon: LayoutDashboard, exact: true },
      { to: "/admin/crm", labelKey: "admin.nav.crm", icon: TrendingUp },
      { to: "/admin/crm/sales", labelKey: "admin.nav.salesWorkspace", icon: UserCheck },
      { to: "/admin/quotes", labelKey: "admin.nav.quotes", icon: FileText },
      { to: "/admin/projects", labelKey: "admin.nav.projects", icon: FolderKanban },
      { to: "/admin/orders", labelKey: "admin.nav.orders", icon: ClipboardList },
      { to: "/admin/deliveries", labelKey: "admin.nav.deliveries", icon: Truck },
      { to: "/admin/invoices", labelKey: "admin.nav.invoices", icon: Receipt },
      { to: "/admin/tasks", labelKey: "admin.nav.tasks", icon: CheckSquare },
      { to: "/admin/cost-analysis", labelKey: "admin.nav.costAnalysis", icon: BarChart3 },
      { to: "/admin/crm/analytics", labelKey: "admin.nav.crmAnalytics", icon: BarChart3 },
      { to: "/admin/crm/after-sales", labelKey: "admin.nav.afterSales", icon: Headphones },
      { to: "/admin/discounts", labelKey: "admin.nav.discounts", icon: Ticket },
      { to: "/admin/customers", labelKey: "admin.nav.customers", icon: UserCircle },
    ],
  },
  {
    titleKey: "admin.nav.sectionCatalog",
    items: [
      { to: "/admin/products", labelKey: "admin.nav.products", icon: Package },
      { to: "/admin/inventory", labelKey: "admin.nav.inventory", icon: Boxes },
      { to: "/admin/work-orders", labelKey: "admin.nav.workOrders", icon: Hammer },
      { to: "/admin/workers", labelKey: "admin.nav.workers", icon: Users },
      { to: "/admin/remakes", labelKey: "admin.nav.remakes", icon: RefreshCcw },
    ],
  },
  {
    titleKey: "admin.nav.sectionSystem",
    items: [
      { to: "/admin/team", labelKey: "admin.nav.teamManagement", icon: Users },
      { to: "/admin/notifications", labelKey: "admin.nav.notifications", icon: Bell },
      { to: "/admin/settings", labelKey: "admin.nav.settings", icon: Settings },
    ],
  },
];

const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

function SidebarContent() {
  const loc = useLocation();
  const { signOut, user, currentRole } = useAuth();
  const nav = useNavigate();
  const { t } = useTranslation();

  const isWorker = currentRole === "worker";
  const activeSections: NavSection[] = isWorker
    ? [
        {
          titleKey: "admin.nav.sectionCore",
          items: [
            { to: "/admin/tasks", labelKey: "admin.nav.tasks", icon: CheckSquare },
          ],
        },
      ]
    : NAV_SECTIONS;

  const activeNavItems = activeSections.flatMap((s) => s.items);

  const path = loc.pathname;
  let bestTo: string | null = null;
  for (const item of activeNavItems) {
    const matches = item.exact
      ? path === item.to
      : path === item.to || path.startsWith(item.to + "/");
    if (matches && (!bestTo || item.to.length > bestTo.length)) {
      bestTo = item.to;
    }
  }

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground select-none">
      {/* Brand Header */}
      <div className="px-5 py-5 border-b border-sidebar-border/80 flex items-center justify-between">
        <Link to={isWorker ? "/admin/tasks" : "/"} className="flex flex-col gap-1.5 group py-0.5">
          <img
            src="/images/brand-logo-dark.png"
            alt="PeleCanon"
            className="h-8 sm:h-9 w-auto max-w-[190px] object-contain hover:opacity-90 transition-opacity"
          />
          <div className="text-xs text-sidebar-foreground/70 font-medium tracking-wide">
            {isWorker ? t("tasks.workerWorkspace", "Task Workspace") : t("admin.panel", "Manufacturing SaaS")}
          </div>
        </Link>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
        {activeSections.map((section, idx) => (
          <div key={idx} className="space-y-1">
            <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/65 mb-1.5">
              {t(section.titleKey, section.titleKey === "admin.nav.sectionCore" ? "Core Operations" : section.titleKey === "admin.nav.sectionCatalog" ? "Catalog & Production" : "System & Administration")}
            </div>
            {section.items.map((item) => {
              const active = item.to === bestTo;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                    active
                      ? "bg-primary text-primary-foreground font-medium shadow-sm"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t(item.labelKey as never, item.labelKey)}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        active ? "bg-sidebar/30 text-primary-foreground" : "bg-primary/20 text-primary"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User & Logout Footer */}
      <div className="p-3 border-t border-sidebar-border/80 bg-sidebar-accent/30">
        <div className="px-3 py-1.5 text-xs text-sidebar-foreground/70 truncate font-mono">
          {user?.email}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground text-xs"
          onClick={async () => {
            await signOut();
            nav({ to: "/auth" });
          }}
        >
          <LogOut className="h-3.5 w-3.5" /> {t("common.logout", "Log out")}
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
    currentRole,
    memberships,
    bootstrapping,
    bootstrapError,
    retryBootstrap,
    signOut: doSignOut,
  } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const isWorker = currentRole === "worker";

  useEffect(() => {
    if (!loading && !user && loc.pathname.startsWith("/admin")) {
      const returnUrl = loc.pathname + (loc.searchStr || "");
      const isClean = returnUrl && !returnUrl.startsWith("/auth") && returnUrl !== "/admin";
      nav({
        to: "/auth",
        search: isClean ? ({ returnTo: returnUrl } as any) : undefined,
        replace: true,
      });
    }
  }, [loading, user, nav, loc.pathname, loc.searchStr]);

  useEffect(() => {
    if (!loading && user && isWorker) {
      if (loc.pathname !== "/admin/tasks") {
        nav({ to: "/admin/tasks" });
      }
    }
  }, [loading, user, isWorker, loc.pathname, nav]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div
          className="h-7 w-7 rounded-full border-2 border-primary/30 border-t-primary animate-spin"
          aria-label="loading"
        />
      </div>
    );
  }

  // Only display full-screen bootstrap loader during initial workspace load
  // when memberships have not yet been fetched. Route transitions and background
  // token refreshes must NEVER disrupt or unmount the persistent Admin shell.
  if (bootstrapping && memberships.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="text-center space-y-3">
          <div
            className="h-7 w-7 mx-auto rounded-full border-2 border-primary/30 border-t-primary animate-spin"
            aria-label="loading"
          />
          <p className="text-sm text-muted-foreground font-medium">
            {t("admin.bootstrapping", "Preparing your workspace…")}
          </p>
        </div>
      </div>
    );
  }

  if (isWorker && loc.pathname !== "/admin/tasks") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="text-center space-y-3">
          <div
            className="h-7 w-7 mx-auto rounded-full border-2 border-primary/30 border-t-primary animate-spin"
            aria-label="loading"
          />
          <p className="text-sm text-muted-foreground font-medium">
            {t("tasks.redirectingToTasks", "Redirecting to your task workspace…")}
          </p>
        </div>
      </div>
    );
  }

  if (!isStaff && memberships.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="max-w-md w-full text-center space-y-4 p-6 border rounded-xl bg-card shadow-sm">
          <p className="text-base font-semibold">
            {bootstrapError
              ? (t("admin.bootstrapFailedTitle") ?? "Couldn't prepare your workspace")
              : (t("admin.noTeamTitle") ?? "No team set up yet")}
          </p>
          {bootstrapError ? (
            <pre className="text-xs text-muted-foreground break-words whitespace-pre-wrap text-left bg-muted p-3 rounded">
              {bootstrapError}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("admin.noTeamDesc") ??
                "Your account belongs to no team yet. Click Set up my workspace to create one."}
            </p>
          )}
          <div className="flex gap-2 justify-center pt-2">
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
      <div className="min-h-screen flex items-center justify-center p-4 text-center bg-background">
        <div className="max-w-md p-6 border rounded-xl bg-card shadow-sm space-y-4">
          <p className="text-base font-semibold text-destructive">{t("admin.noAccess", "Access Restricted")}</p>
          <Link to="/">
            <Button variant="outline">{t("common.home", "Home")}</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="hidden md:flex md:w-72 shrink-0 sticky top-0 h-screen z-30 shadow-md border-r rtl:border-r-0 rtl:border-l border-sidebar-border/80">
        <SidebarContent />
      </aside>
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur px-4 md:px-8 py-3 flex items-center gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side={isRtl ? "right" : "left"} className="p-0 w-72">
              <SidebarContent />
            </SheetContent>
          </Sheet>
          <Link to={isWorker ? "/admin/tasks" : "/"} className="md:hidden flex items-center">
            <img src="/images/brand-logo.png" alt="PeleCanon" className="h-7 w-auto object-contain dark:hidden" />
            <img src="/images/brand-logo-dark.png" alt="PeleCanon" className="h-7 w-auto object-contain hidden dark:block" />
          </Link>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <NotificationBell />
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 w-full max-w-[1600px] mx-auto min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}