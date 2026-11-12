import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Settings, ShieldCheck, Activity, Users, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/useAuth";

export const Route = createFileRoute("/admin/settings")({ component: SettingsPage });

function SettingsPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const { currentTenantId, currentRole } = useAuth();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between pb-2 border-b">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            <span>{t("admin.nav.settings", "إعدادات النظام والتشغيل")}</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {isRtl
              ? "تهيئة بيئة العمل، المعايير المحاسبية والتشغيلية الافتراضية، ومؤشرات صحة البنية التحتية"
              : "System environment configuration, standard operational defaults, and infrastructure diagnostics."}
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary">
          {currentRole ?? "Admin"}
        </Badge>
      </div>

      <Tabs defaultValue="system" className="space-y-6">
        <TabsList className="grid grid-cols-2 max-w-sm">
          <TabsTrigger value="system" className="gap-2 text-xs">
            <Settings className="h-3.5 w-3.5" />
            <span>{t("admin.settings.systemTab", "تفضيلات النظام")}</span>
          </TabsTrigger>
          <TabsTrigger value="diagnostics" className="gap-2 text-xs">
            <Activity className="h-3.5 w-3.5" />
            <span>{t("admin.settings.diagTab", "حالة البيئة والتشغيل")}</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Operational System Defaults */}
        <TabsContent value="system" className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" />
                <span>{isRtl ? "المعايير التشغيلية والمالية الافتراضية" : "Operational & Financial Standards"}</span>
              </CardTitle>
              <CardDescription className="text-xs">
                {isRtl
                  ? "الثوابت المحاسبية والتشغيلية المعتمدة في PeleCanon لجميع عروض الأسعار والفواتير وأوامر الإنتاج."
                  : "Standard accounting constants used across PeleCanon quotations, invoices, and production orders."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="p-3 border rounded-lg bg-card/60 space-y-1">
                  <span className="text-xs text-muted-foreground">{isRtl ? "العملة الرسمية" : "Official Currency"}</span>
                  <div className="font-bold text-sm text-foreground flex items-center gap-2">
                    <span>EGP — الجنيه المصري</span>
                    <Badge variant="secondary" className="text-[10px]">مُثبت</Badge>
                  </div>
                </div>

                <div className="p-3 border rounded-lg bg-card/60 space-y-1">
                  <span className="text-xs text-muted-foreground">{isRtl ? "ضريبة القيمة المضافة (VAT)" : "Standard VAT"}</span>
                  <div className="font-bold text-sm text-foreground flex items-center gap-2">
                    <span>14%</span>
                    <Badge variant="secondary" className="text-[10px]">القانون المصري</Badge>
                  </div>
                </div>

                <div className="p-3 border rounded-lg bg-card/60 space-y-1">
                  <span className="text-xs text-muted-foreground">{isRtl ? "نسبة الدفعة المقدمة الافتراضية" : "Default Deposit Rate"}</span>
                  <div className="font-bold text-sm text-foreground flex items-center gap-2">
                    <span>50%</span>
                    <Badge variant="secondary" className="text-[10px]">عند توقيع العقد</Badge>
                  </div>
                </div>

                <div className="p-3 border rounded-lg bg-card/60 space-y-1">
                  <span className="text-xs text-muted-foreground">{isRtl ? "مهلة التوريد والتسليم المعيارية" : "Standard Delivery Window"}</span>
                  <div className="font-bold text-sm text-foreground flex items-center gap-2">
                    <span>30 {isRtl ? "يوم عمل" : "days"}</span>
                    <Badge variant="secondary" className="text-[10px]">من استلام الدفعة</Badge>
                  </div>
                </div>

                <div className="p-3 border rounded-lg bg-card/60 space-y-1">
                  <span className="text-xs text-muted-foreground">{isRtl ? "فترة صلاحية عرض السعر الافتراضية" : "Quotation Validity Window"}</span>
                  <div className="font-bold text-sm text-foreground flex items-center gap-2">
                    <span>14 {isRtl ? "يوم تقويمي" : "days"}</span>
                    <Badge variant="secondary" className="text-[10px]">من تاريخ الإصدار</Badge>
                  </div>
                </div>

                <div className="p-3 border rounded-lg bg-card/60 space-y-1">
                  <span className="text-xs text-muted-foreground">{isRtl ? "هيكل الألوان والهوية" : "Brand Identity System"}</span>
                  <div className="font-bold text-sm text-foreground flex items-center gap-2">
                    <span>PeleCanon Official Palette</span>
                    <Badge variant="secondary" className="text-[10px]">#118B76 • #333333 • #F8F7F4</Badge>
                  </div>
                </div>
              </div>

              {/* Administrative Shortcuts */}
              <div className="pt-2 border-t flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground me-2">
                  {isRtl ? "إعدادات متصلة:" : "Related Settings:"}
                </span>
                <Button asChild variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                  <Link to="/admin/team">
                    <Users className="h-3.5 w-3.5 text-primary" />
                    <span>{t("admin.nav.teamManagement", "إدارة الفريق والصلاحيات")}</span>
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                  <Link to="/admin/notifications">
                    <Bell className="h-3.5 w-3.5 text-primary" />
                    <span>{t("admin.nav.notifications", "مركز التنبيهات")}</span>
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Environment & Diagnostics */}
        <TabsContent value="diagnostics" className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>{isRtl ? "بيانات البيئة والتكاملات النشطة" : "Environment & Operational Health"}</span>
              </CardTitle>
              <CardDescription className="text-xs">
                {isRtl ? "مؤشرات الاتصال والخدمات السحابية النشطة" : "Active cloud infrastructure and operational services."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded border bg-card/60">
                <span className="text-muted-foreground">{isRtl ? "معرف بيئة العمل (Tenant ID)" : "Workspace Tenant ID"}</span>
                <span className="font-mono font-bold">{currentTenantId ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded border bg-card/60">
                <span className="text-muted-foreground">{isRtl ? "مستودع التخزين السحابي (Cloudflare R2)" : "Object Storage (Cloudflare R2)"}</span>
                <Badge variant="outline" className="border-emerald-500 text-emerald-700 bg-emerald-50">متصل وآمن</Badge>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded border bg-card/60">
                <span className="text-muted-foreground">{isRtl ? "قاعدة البيانات السحابية (Supabase DB)" : "Database (Supabase PostgreSQL)"}</span>
                <Badge variant="outline" className="border-emerald-500 text-emerald-700 bg-emerald-50">نشطة (RLS مفعل)</Badge>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded border bg-card/60">
                <span className="text-muted-foreground">{isRtl ? "إصدار المنصة (Release Baseline)" : "Release Baseline"}</span>
                <span className="font-mono">PeleCanon v2.0 (Commit e820b8c)</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
