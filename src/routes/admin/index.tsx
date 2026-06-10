import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export default function AdminDashboard() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-background">
      {/* Main content area */}
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-sidebar rounded-r-lg border-r p-4">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-md bg-gold flex items-center justify-center text-gold-foreground font-serif font-bold">P</div>
            <div>
              <div className="font-serif text-xl font-bold">{t("admin.panel")}</div>
              <div className="text-sm text-sidebar-foreground">{t("admin.dashboard")}</div>
            </div>
          </div>

          {/* Navigation links */}
          <nav className="space-y-2 mt-6">
            <Link
              to="/admin"
              className="flex items-center gap-2 rounded-md bg-gold text-gold-foreground hover:bg-gold/90 px-3 py-2 text-sm"
            >
              <Icon name="home" className="h-4 w-4 rtl-flip" />
              {t("admin.nav.dashboard")}
            </Link>
            <Link
              to="/admin/quotes"
              className="flex items-center gap-2 rounded-md hover:bg-sidebar-accent hover:text-sidebar-foreground px-3 py-2 text-sm"
            >
              <Icon name="file-text" className="h-4 w-4" />
              {t("admin.nav.quotes")}
            </Link>
            <Link
              to="/admin/invoices"
              className="flex items-center gap-2 rounded-md hover:bg-sidebar-accent hover:text-sidebar-foreground px-3 py-2 text-sm"
            >
              <Icon name="receipt" className="h-4 w-4" />
              {t("admin.nav.invoices")}
            </Link>
            {/* add more nav links as needed */}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 px-6 py-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-serif">
                {t("admin.dashboardTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="rounded-lg bg-card p-4">
                  <Icon name="speedometer" className="h-6 w-6 text-primary" />
                  <div className="ml-3 text-lg text-primary">{t("admin.dashboardSubtitle")}</div>
                </div>
                <div className="rounded-lg bg-card p-4">
                  <Icon name="users" className="h-6 w-6 text-secondary" />
                  <div className="ml-3 text-lg text-secondary">{t("admin.dashboardSubtitle2")}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>

      {/* Language & Theme controls */}
      <div className="fixed top-4 top-8 md:top-8 right-4 flex gap-2">
        <Link to="/admin/langSwitcher"><Button variant="ghost" size="sm">العربي</Button></Link>
        <Link to="/admin/themeToggle"><Button variant="ghost" size="sm">{t("common.theme")}</Button></Link>
      </div>
    </div>
  );
}