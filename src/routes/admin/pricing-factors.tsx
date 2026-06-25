import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { GenericCrud } from "@/components/admin/GenericCrud";

function PricingFactorsPage() {
  const { t } = useTranslation();
  return (
    <GenericCrud title={t("pricingFactors.title")} subtitle={t("pricingFactors.subtitle")} table="pricing_factors" fields={[
      { key: 'key', label: t("pricingFactors.key") },
      { key: 'label_ar', label: t("pricingFactors.label") },
      { key: 'kind', label: t("pricingFactors.kind"), default: 'custom' },
      { key: 'value_pct', label: t("pricingFactors.pctValue"), type: 'number' },
      { key: 'value_fixed', label: t("pricingFactors.fixedValue"), type: 'number', showInTable: false },
      { key: 'scope', label: t("pricingFactors.scope"), default: 'global' },
    ]} />
  );
}

export const Route = createFileRoute("/admin/pricing-factors")({
  component: PricingFactorsPage,
});
