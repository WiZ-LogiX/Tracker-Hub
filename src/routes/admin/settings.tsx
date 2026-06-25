import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { getTenantSettings, updateTenant } from "@/lib/tenant-settings.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PhotoUploader } from "@/components/photo-uploader";

export const Route = createFileRoute("/admin/settings")({ component: SettingsPage });

type TenantSettings = {
  name?: string | null;
  logo_url?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tax_number?: string | null;
  commercial_registry?: string | null;
  primary_color?: string | null;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function SettingsPage() {
  const { t } = useTranslation();
  const loadSettings = useServerFn(getTenantSettings);
  const saveSettings = useServerFn(updateTenant);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form state
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [commercialRegistry, setCommercialRegistry] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");

  useEffect(() => {
    loadSettings()
      .then((tenant: TenantSettings) => {
        setName(tenant.name ?? "");
        setLogoUrl(tenant.logo_url ?? null);
        setPhone(tenant.phone ?? "");
        setEmail(tenant.email ?? "");
        setAddress(tenant.address ?? "");
        setTaxNumber(tenant.tax_number ?? "");
        setCommercialRegistry(tenant.commercial_registry ?? "");
        setPrimaryColor(tenant.primary_color ?? "");
      })
      .catch(() => toast.error(t("common.loading")))
      .finally(() => setLoading(false));
  }, [loadSettings]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveSettings({
        data: {
          name: name || undefined,
          logoUrl: logoUrl,
          phone: phone || null,
          email: email || null,
          address: address || null,
          taxNumber: taxNumber || null,
          commercialRegistry: commercialRegistry || null,
          primaryColor: primaryColor || null,
        },
      });
      toast.success(t("admin.settings.saved"));
    } catch (e: unknown) {
      toast.error(errorMessage(e) || t("admin.settings.saveFailed"));
    }
    setSaving(false);
  }

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">{t("common.loading")}</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Building2 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">{t("admin.nav.settings")}</h1>
      </div>

      {/* Logo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("admin.settings.companyLogo")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {logoUrl ? (
            <div className="flex items-center gap-4">
              <img src={logoUrl} alt="Logo" className="h-20 w-20 object-contain border rounded" />
              <Button variant="ghost" size="sm" onClick={() => setLogoUrl(null)}>
                {t("admin.settings.removeLogo")}
              </Button>
            </div>
          ) : null}
          <PhotoUploader
            entityType="logos"
            entityId="tenant-logo"
            label={t("admin.settings.uploadLogo")}
            onUploaded={(results) => {
              if (results.length > 0) {
                setLogoUrl(results[0].publicUrl);
              }
            }}
            maxFiles={1}
          />
        </CardContent>
      </Card>

      {/* Company Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("admin.settings.companyInfo")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">{t("admin.settings.companyName")}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="PeleCanon" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("admin.settings.phone")}</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01xxxxxxxxx"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("admin.settings.email")}</label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="info@pelecanon.com"
                dir="ltr"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium">{t("admin.settings.address")}</label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="القاهرة، مصر"
            />
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("admin.settings.taxNumber")}</label>
              <Input
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value)}
                placeholder="123-456-789"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("admin.settings.commercialRegistry")}</label>
              <Input
                value={commercialRegistry}
                onChange={(e) => setCommercialRegistry(e.target.value)}
                placeholder="CR-12345"
                dir="ltr"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium">{t("admin.settings.primaryColor")}</label>
            <div className="flex items-center gap-2">
              <Input
                type="color"
                value={primaryColor || "#1a5276"}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-12 h-8 p-1 cursor-pointer"
              />
              <Input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder="#1a5276"
                className="flex-1"
                dir="ltr"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? t("admin.settings.saving") : t("admin.settings.saveButton")}
      </Button>
    </div>
  );
}
