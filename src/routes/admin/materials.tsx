import { createFileRoute } from "@tanstack/react-router";
import { GenericCrud } from "@/components/admin/GenericCrud";

export const Route = createFileRoute("/admin/materials")({
  component: () => (
    <GenericCrud title="الخامات" table="materials" fields={[
      { key: 'name_ar', label: 'الاسم بالعربي' },
      { key: 'name_en', label: 'Name (EN)' },
      { key: 'type', label: 'النوع', default: 'wood' },
      { key: 'price_per_unit', label: 'السعر', type: 'number' },
      { key: 'unit', label: 'الوحدة', default: 'm²' },
    ]} />
  ),
});
