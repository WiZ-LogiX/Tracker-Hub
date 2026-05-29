import { createFileRoute } from "@tanstack/react-router";
import { GenericCrud } from "@/components/admin/GenericCrud";

export const Route = createFileRoute("/admin/products")({
  component: () => (
    <GenericCrud title="المنتجات" subtitle="كتالوج PeleCanon" table="products" fields={[
      { key: 'code', label: 'الكود' },
      { key: 'name_ar', label: 'الاسم بالعربي' },
      { key: 'name_en', label: 'Name (EN)' },
      { key: 'base_price', label: 'السعر الأساسي', type: 'number' },
      { key: 'labor_pct', label: 'العمالة %', type: 'number', default: 15 },
      { key: 'wastage_pct', label: 'الفاقد %', type: 'number', default: 8 },
      { key: 'overhead_pct', label: 'overhead %', type: 'number', default: 10 },
      { key: 'margin_pct', label: 'هامش الربح %', type: 'number', default: 25 },
      { key: 'description_ar', label: 'الوصف', showInTable: false },
    ]} />
  ),
});
