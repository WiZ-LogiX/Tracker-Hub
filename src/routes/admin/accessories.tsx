import { createFileRoute } from "@tanstack/react-router";
import { GenericCrud } from "@/components/admin/GenericCrud";

export const Route = createFileRoute("/admin/accessories")({
  component: () => (
    <GenericCrud title="الإكسسوارات" table="accessories" fields={[
      { key: 'name_ar', label: 'الاسم بالعربي' },
      { key: 'name_en', label: 'Name (EN)' },
      { key: 'unit_price', label: 'سعر الوحدة', type: 'number' },
    ]} />
  ),
});
