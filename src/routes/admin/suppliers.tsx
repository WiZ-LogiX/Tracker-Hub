import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { GenericCrud } from "@/components/admin/GenericCrud";

function SuppliersPage() {
  const { t } = useTranslation();
  return (
    <GenericCrud title={t("suppliers.title")} subtitle={t("suppliers.subtitle")} table="suppliers" fields={[
      { key: 'name', label: t("suppliers.name") },
      { key: 'country', label: t("suppliers.country") },
      { key: 'notes', label: t("suppliers.notes"), showInTable: false },
      { key: 'active', label: t("common.status"), type: 'boolean', default: true },
    ]} />
  );
}

export const Route = createFileRoute("/admin/suppliers")({
  component: SuppliersPage,
});
