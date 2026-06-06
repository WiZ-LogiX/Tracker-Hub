import { createFileRoute } from "@tanstack/react-router";
import { GenericCrud } from "@/components/admin/GenericCrud";

export const Route = createFileRoute("/admin/suppliers")({
  component: () => (
    <GenericCrud title="الموردون" subtitle="إدارة موردي الخامات" table="suppliers" fields={[
      { key: 'name', label: 'الاسم' },
      { key: 'country', label: 'بلد المنشأ' },
      { key: 'notes', label: 'ملاحظات', showInTable: false },
    ]} />
  ),
});
