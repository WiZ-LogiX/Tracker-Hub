import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { GenericCrud } from "@/components/admin/GenericCrud";

function VeneersPage() {
  const { t } = useTranslation();
  return (
    <GenericCrud title={t("veneers.title")} subtitle="القشرة الخشبية وأسعارها" table="veneers" fields={[
      { key: 'name_ar', label: t("veneers.nameAr") },
      { key: 'name_en', label: t("veneers.nameEn") },
      { key: 'price_per_m2', label: t("veneers.pricePerM2"), type: 'number' },
      { key: 'active', label: t("common.status"), type: 'boolean', default: true },
    ]} />
  );
}

export const Route = createFileRoute("/admin/veneers")({
  component: VeneersPage,
});
