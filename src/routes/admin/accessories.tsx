import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { GenericCrud } from "@/components/admin/GenericCrud";

function AccessoriesPage() {
  const { t } = useTranslation();
  return (
    <GenericCrud title={t("accessories.title")} table="accessories" fields={[
      { key: 'name_ar', label: t("accessories.nameAr") },
      { key: 'name_en', label: t("accessories.nameEn") },
      { key: 'unit_price', label: t("accessories.unitPrice"), type: 'number' },
      { key: 'active', label: t("common.status"), type: 'boolean', default: true },
    ]} />
  );
}

export const Route = createFileRoute("/admin/accessories")({
  component: AccessoriesPage,
});
