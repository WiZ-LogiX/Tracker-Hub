import { createFileRoute } from "@tanstack/react-router";
import { GenericCrud } from "@/components/admin/GenericCrud";

export const Route = createFileRoute("/admin/discounts")({
  component: () => (
    <GenericCrud title="الخصومات" subtitle="كوبونات الخصم" table="discounts" fields={[
      { key: 'code', label: 'الكود' },
      { key: 'type', label: 'النوع (percentage / fixed)', default: 'percentage' },
      { key: 'value', label: 'القيمة', type: 'number' },
      { key: 'max_value', label: 'الحد الأقصى', type: 'number' },
      { key: 'max_uses', label: 'أقصى استخدام', type: 'number' },
    ]} />
  ),
});
