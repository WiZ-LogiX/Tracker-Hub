import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { GenericCrud } from "@/components/admin/GenericCrud";

function FinishesPage() {
  const { t } = useTranslation();
  return (
    <GenericCrud title={t("finishes.title")} table="finishes" fields={[
      { key: 'name_ar', label: t("finishes.nameAr") },
      { key: 'name_en', label: t("finishes.nameEn") },
      { key: 'price_modifier_pct', label: t("finishes.pctModifier"), type: 'number', default: 0 },
      { key: 'price_modifier_fixed', label: t("finishes.fixedModifier"), type: 'number', default: 0 },
      { key: 'active', label: t("common.status"), type: 'boolean', default: true },
    ]} />
  );
}

export const Route = createFileRoute("/admin/finishes")({
  component: FinishesPage,
});
