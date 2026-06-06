import { createFileRoute } from "@tanstack/react-router";
import { GenericCrud } from "@/components/admin/GenericCrud";

export const Route = createFileRoute("/admin/finishes")({
  component: () => (
    <GenericCrud title="التشطيبات" table="finishes" fields={[
      { key: 'name_ar', label: 'الاسم بالعربي' },
      { key: 'name_en', label: 'Name (EN)' },
      { key: 'price_modifier_pct', label: 'نسبة الزيادة %', type: 'number', default: 0 },
      { key: 'price_modifier_fixed', label: 'مبلغ ثابت', type: 'number', default: 0 },
    ]} />
  ),
});
