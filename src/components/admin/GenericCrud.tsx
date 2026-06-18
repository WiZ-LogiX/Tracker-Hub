"use client";

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  listProductTemplates, upsertProductTemplate, deleteProductTemplate,
  listMaterials, upsertMaterial, deleteMaterial,
  listSuppliers, upsertSupplier, deleteSupplier,
  listFinishes, upsertFinish, deleteFinish,
  listVeneers, upsertVeneer, deleteVeneer,
  listAccessories, upsertAccessory, deleteAccessory,
  listWastageRules, upsertWastageRule, deleteWastageRule,
  listPricingRules, upsertPricingRule, deletePricingRule,
  listWorkers, upsertWorker, deleteWorker,
  listDiscounts, upsertDiscount, deleteDiscount,
} from "@/lib/catalog.functions";
import {
  listPricingFactors,
  upsertPricingFactor,
  deletePricingFactor,
} from "@/lib/pricing-factors.functions";

export interface FieldDef {
  key: string;
  label: string;
  type?: 'text' | 'number';
  default?: string | number;
  showInTable?: boolean;
}

interface CrudRow {
  id: string;
  tenant_id?: string;
  [key: string]: unknown;
}

const KNOWN_CRUD_TABLES = [
  "accessories", "categories", "configurations", "customers", "discounts",
  "finishes", "internal_notes", "material_variants", "materials",
  "notification_log", "notification_templates", "pricing_factors",
  "pricing_rules", "product_templates", "products", "quote_items",
  "quote_requests", "remakes", "suppliers", "veneers", "wastage_rules",
  "workers",
] as const;

type CrudTable = (typeof KNOWN_CRUD_TABLES)[number];

const PROTECTED_INSERT_FIELDS = ["id", "tenant_id", "created_at", "updated_at"];

const TABLES_WITH_BYPASS = new Set<string>([
  "product_templates", "materials", "suppliers", "finishes", "veneers",
  "accessories", "pricing_factors", "wastage_rules", "pricing_rules",
  "workers", "discounts",
]);

function isKnownTable(name: string): name is CrudTable {
  return (KNOWN_CRUD_TABLES as readonly string[]).includes(name);
}

function isBypassTable(name: string): boolean {
  return TABLES_WITH_BYPASS.has(name);
}

function fromTable(client: typeof supabase, name: string) {
  if (isKnownTable(name)) return client.from(name);
  return client.from(name as CrudTable);
}

export function GenericCrud({ title, subtitle, table, fields }: {
  title: string; subtitle?: string; table: string; fields: FieldDef[];
}) {
  const { currentTenantId, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<CrudRow[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CrudRow | null>(null);
  const [loading, setLoading] = useState(false);
  const bypass = isBypassTable(table);

  // Allocates ALL bypass hooks unconditionally so React sees a stable hook
  // count across renders. Earlier versions short-circuited with `?:` which
  // produces inconsistent hooks order once `bypass` flips during the first
  // commit — the symptom is "Invalid hook call" right at the Dialog mount.
  const listProductTemplatesFn = useServerFn(listProductTemplates);
  const upsertProductTemplateFn = useServerFn(upsertProductTemplate);
  const deleteProductTemplateFn = useServerFn(deleteProductTemplate);
  const listMaterialsServerFn = useServerFn(listMaterials);
  const upsertMaterialServerFn = useServerFn(upsertMaterial);
  const deleteMaterialServerFn = useServerFn(deleteMaterial);
  const listSuppliersFn = useServerFn(listSuppliers);
  const upsertSupplierFn = useServerFn(upsertSupplier);
  const deleteSupplierFn = useServerFn(deleteSupplier);
  const listFinishesFn = useServerFn(listFinishes);
  const upsertFinishFn = useServerFn(upsertFinish);
  const deleteFinishFn = useServerFn(deleteFinish);
  const listVeneersFn = useServerFn(listVeneers);
  const upsertVeneerFn = useServerFn(upsertVeneer);
  const deleteVeneerFn = useServerFn(deleteVeneer);
  const listAccessoriesFn = useServerFn(listAccessories);
  const upsertAccessoryFn = useServerFn(upsertAccessory);
  const deleteAccessoryFn = useServerFn(deleteAccessory);
  const listPricingFactorsFn = useServerFn(listPricingFactors);
  const upsertPricingFactorFn = useServerFn(upsertPricingFactor);
  const deletePricingFactorFn = useServerFn(deletePricingFactor);
  const listWastageRulesFn = useServerFn(listWastageRules);
  const upsertWastageRuleFn = useServerFn(upsertWastageRule);
  const deleteWastageRuleFn = useServerFn(deleteWastageRule);
  const listPricingRulesFn = useServerFn(listPricingRules);
  const upsertPricingRuleFn = useServerFn(upsertPricingRule);
  const deletePricingRuleFn = useServerFn(deletePricingRule);
  const listWorkersFn = useServerFn(listWorkers);
  const upsertWorkerFn = useServerFn(upsertWorker);
  const deleteWorkerFn = useServerFn(deleteWorker);
  const listDiscountsFn = useServerFn(listDiscounts);
  const upsertDiscountFn = useServerFn(upsertDiscount);
  const deleteDiscountFn = useServerFn(deleteDiscount);

  const blank = Object.fromEntries(
    fields.map(f => [f.key, f.default ?? (f.type === 'number' ? 0 : '')])
  ) as Record<string, string | number>;

  const [form, setForm] = useState<Record<string, string | number>>(blank);

  useEffect(() => {
    if (authLoading) return;
    if (!currentTenantId) { setRows([]); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, currentTenantId, authLoading]);

  async function load() {
    setLoading(true);

    if (bypass) {
      try {
        const fetchers: Record<string, () => Promise<{ items: any[] }>> = {
          product_templates: () => listProductTemplatesFn(),
          materials: () => listMaterialsServerFn(),
          suppliers: () => listSuppliersFn(),
          finishes: () => listFinishesFn(),
          veneers: () => listVeneersFn(),
          accessories: () => listAccessoriesFn(),
          pricing_factors: () => listPricingFactorsFn(),
          wastage_rules: () => listWastageRulesFn(),
          pricing_rules: () => listPricingRulesFn(),
          workers: () => listWorkersFn(),
          discounts: () => listDiscountsFn(),
        };
        const fetcher = fetchers[table];
        if (!fetcher) throw new Error(`No server-fn fetcher registered for ${table}`);
        const result = await fetcher();
        setRows((result.items as CrudRow[]) ?? []);
      } catch (e: any) {
        toast.error(e?.message ?? "فشل التحميل");
        setRows([]);
      }
      setLoading(false);
      return;
    }

    const tbl = fromTable(supabase, table);
    const { data, error } = await tbl
      .select("*")
      .gt("created_at", "1970-01-01T00:00:00Z")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      setRows([]);
      return;
    }
    setRows((data as CrudRow[]) ?? []);
  }

  function openNew() { setEditing(null); setForm(blank); setOpen(true); }

  function openEdit(r: CrudRow) {
    setEditing(r);
    const next = { ...blank };
    for (const f of fields) {
      const v = r[f.key];
      if (v !== undefined && v !== null) {
        next[f.key] = typeof v === 'number' ? v : String(v);
      }
    }
    setForm(next);
  }

  async function save() {
    if (!currentTenantId) {
      toast.error("لا يوجد فريق نشط — يلزم تسجيل الدخول أولاً");
      return;
    }
    if (!isKnownTable(table)) {
      toast.error("Table not allowed for direct admin CRUD");
      return;
    }
    const payload: Record<string, string | number> = {};
    for (const f of fields) {
      if (PROTECTED_INSERT_FIELDS.includes(f.key)) continue;
      payload[f.key] = form[f.key] ?? (f.type === 'number' ? 0 : "");
    }

    if (bypass) {
      try {
        const upserters: Record<string, (input: any) => Promise<any>> = {
          product_templates: upsertProductTemplateFn,
          materials: upsertMaterialServerFn,
          suppliers: upsertSupplierFn,
          finishes: upsertFinishFn,
          veneers: upsertVeneerFn,
          accessories: upsertAccessoryFn,
          pricing_factors: upsertPricingFactorFn,
          wastage_rules: upsertWastageRuleFn,
          pricing_rules: upsertPricingRuleFn,
          workers: upsertWorkerFn,
          discounts: upsertDiscountFn,
        };
        const upsert = upserters[table];
        if (!upsert) throw new Error(`No server-fn upsert registered for ${table}`);
        await upsert({ ...payload, id: editing?.id });
      } catch (e: any) {
        toast.error(e?.message ?? "فشل الحفظ");
        return;
      }
      toast.success("تم الحفظ");
      setOpen(false);
      load();
      return;
    }

    const tbl = fromTable(supabase, table);
    const { error } = editing
      ? await tbl.update(payload).eq("id", editing.id)
      : await tbl.insert(payload);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    setOpen(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm("تأكيد الحذف؟")) return;
    if (!isKnownTable(table)) return;

    if (bypass) {
      try {
        const deleters: Record<string, (input: any) => Promise<any>> = {
          product_templates: deleteProductTemplateFn,
          materials: deleteMaterialServerFn,
          suppliers: deleteSupplierFn,
          finishes: deleteFinishFn,
          veneers: deleteVeneerFn,
          accessories: deleteAccessoryFn,
          pricing_factors: deletePricingFactorFn,
          wastage_rules: deleteWastageRuleFn,
          pricing_rules: deletePricingRuleFn,
          workers: deleteWorkerFn,
          discounts: deleteDiscountFn,
        };
        const del = deleters[table];
        if (!del) throw new Error(`No server-fn deleter registered for ${table}`);
        await del({ id });
      } catch (e: any) {
        toast.error(e?.message ?? "فشل الحذف");
        return;
      }
      toast.success("تم الحذف");
      load();
      return;
    }

    const { error } = await fromTable(supabase, table).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    load();
  }

  const tableFields = fields.filter(f => f.showInTable !== false);

  if (authLoading) {
    return (
      <Card><CardContent className="p-8 text-center text-muted-foreground">
        ...جاري التحقق من الجلسة
      </CardContent></Card>
    );
  }
  if (!currentTenantId) {
    return (
      <Card><CardContent className="p-8 text-center text-muted-foreground">
        لا يوجد فريق نشط لهذا الحساب. تواصل مع المالك لإضافتك إلى فريق.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-serif text-3xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> جديد</Button>
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            {tableFields.map(f => <TableHead key={f.key}>{f.label}</TableHead>)}
            <TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={tableFields.length + 1} className="text-center py-8 text-muted-foreground">...جاري التحميل</TableCell></TableRow>}
            {!loading && rows.length === 0 && <TableRow><TableCell colSpan={tableFields.length + 1} className="text-center py-8 text-muted-foreground">لا توجد بيانات.</TableCell></TableRow>}
            {!loading && rows.map(r => (
              <TableRow key={r.id}>
                {tableFields.map(f => <TableCell key={f.key}>{String(r[f.key] ?? '—')}</TableCell>)}
                <TableCell className="flex gap-1 justify-end">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "تعديل" : "إضافة جديد"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {fields
              .filter(f => !PROTECTED_INSERT_FIELDS.includes(f.key))
              .map(f => (
                <div key={f.key}>
                  <Label>{f.label}</Label>
                  <Input
                    type={f.type === 'number' ? 'number' : 'text'}
                    value={form[f.key] ?? ''}
                    onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  />
                </div>
              ))}
            <Button onClick={save} className="w-full">حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}