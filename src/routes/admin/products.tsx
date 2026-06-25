import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { GenericCrud } from "@/components/admin/GenericCrud";

function ProductsPage() {
  const { t } = useTranslation();
  return (
    <GenericCrud title={t("products.title")} subtitle={t("products.subtitle")} table="products" fields={[
      { key: 'code', label: t("products.code") },
      { key: 'name_ar', label: t("products.nameAr") },
      { key: 'name_en', label: t("products.nameEn") },
      { key: 'base_price', label: t("products.basePrice"), type: 'number' },
      { key: 'labor_pct', label: t("products.laborPct"), type: 'number', default: 15 },
      { key: 'wastage_pct', label: t("products.wastagePct"), type: 'number', default: 8 },
      { key: 'overhead_pct', label: t("products.overheadPct"), type: 'number', default: 10 },
      { key: 'margin_pct', label: t("products.marginPct"), type: 'number', default: 25 },
      { key: 'description_ar', label: t("products.description"), showInTable: false },
    ]} />
  );
}

export const Route = createFileRoute("/admin/products")({
  component: ProductsPage,
});
