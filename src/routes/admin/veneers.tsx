import { createFileRoute } from "@tanstack/react-router";
import { GenericCrud } from "@/components/admin/GenericCrud";

export const Route = createFileRoute("/admin/veneers")({
  component: () => (
    <GenericCrud title="القشرة" subtitle="القشرة الخشبية وأسعارها" table="veneers" fields={[
      { key: 'name_ar', label: 'الاسم بالعربي' },
      { key: 'name_en', label: 'Name (EN)' },
      { key: 'price_per_m2', label: 'السعر / م²', type: 'number' },
    ]} />
  ),
});
