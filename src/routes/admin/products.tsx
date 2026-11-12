import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { GenericCrud } from "@/components/admin/GenericCrud";
import { CommercialCategoriesSettings } from "@/components/settings/CommercialCategoriesSettings";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Package, SlidersHorizontal, Boxes, FileSpreadsheet } from "lucide-react";

const productsSearchSchema = z.object({
  tab: z.enum(["products", "options"]).optional().default("products"),
});

export type ProductsSearchParams = {
  tab?: "products" | "options";
};

export const Route = createFileRoute("/admin/products")({
  validateSearch: (search: Record<string, unknown>): ProductsSearchParams => {
    return productsSearchSchema.parse(search);
  },
  component: ProductsPage,
});

function ProductsPage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const nav = useNavigate();
  const activeTab = search.tab || "products";

  const handleTabChange = (val: string) => {
    nav({
      to: "/admin/products",
      search: { tab: val as "products" | "options" },
      replace: true,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            <span>{t("products.title", "كتالوج المنتجات والتصنيفات")}</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {t("products.subtitle", "إدارة منتجات الكتالوج وتصنيفات المقايسات وخيارات التسعير")}
          </p>
        </div>

        {/* Quick Links to Related Modules */}
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <Link to="/admin/inventory">
              <Boxes className="h-3.5 w-3.5 text-primary" />
              <span>{t("admin.nav.inventory", "المخزون")}</span>
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <Link to="/admin/rate-card">
              <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />
              <span>{t("rateCard.title", "قائمة الأسعار")}</span>
            </Link>
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid grid-cols-2 max-w-md">
          <TabsTrigger value="products" className="gap-2 text-xs">
            <Package className="h-3.5 w-3.5" />
            <span>{t("products.catalogTab", "منتجات الكتالوج")}</span>
          </TabsTrigger>
          <TabsTrigger value="options" className="gap-2 text-xs">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>{t("products.optionsTab", "خيارات وتصنيفات الكتالوج")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-6">
          <GenericCrud
            title={t("products.title")}
            subtitle={t("products.subtitle")}
            table="products"
            fields={[
              { key: 'code', label: t("products.code") },
              { key: 'name_ar', label: t("products.nameAr") },
              { key: 'name_en', label: t("products.nameEn") },
              { key: 'base_price', label: t("products.basePrice"), type: 'number' },
              { key: 'labor_pct', label: t("products.laborPct"), type: 'number', default: 15 },
              { key: 'wastage_pct', label: t("products.wastagePct"), type: 'number', default: 8 },
              { key: 'overhead_pct', label: t("products.overheadPct"), type: 'number', default: 10 },
              { key: 'margin_pct', label: t("products.marginPct"), type: 'number', default: 25 },
              { key: 'description_ar', label: t("products.description"), showInTable: false },
            ]}
          />
        </TabsContent>

        <TabsContent value="options" className="space-y-6">
          <CommercialCategoriesSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
