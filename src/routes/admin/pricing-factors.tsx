import { createFileRoute } from "@tanstack/react-router";
import { GenericCrud } from "@/components/admin/GenericCrud";

export const Route = createFileRoute("/admin/pricing-factors")({
  component: () => (
    <GenericCrud title="عوامل التسعير" subtitle="عوامل قابلة للتعديل (عمالة، هدر، فخامة، استعجال ...)" table="pricing_factors" fields={[
      { key: 'key', label: 'المفتاح' },
      { key: 'label_ar', label: 'الاسم' },
      { key: 'kind', label: 'النوع', default: 'custom' },
      { key: 'value_pct', label: 'النسبة %', type: 'number' },
      { key: 'value_fixed', label: 'مبلغ ثابت', type: 'number', showInTable: false },
      { key: 'scope', label: 'النطاق', default: 'global' },
    ]} />
  ),
});
