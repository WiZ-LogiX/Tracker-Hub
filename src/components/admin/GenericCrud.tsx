import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

export interface FieldDef {
  key: string;
  label: string;
  type?: 'text' | 'number';
  default?: string | number;
  showInTable?: boolean;
}

interface CrudRow {
  id: string;
  [key: string]: unknown;
}

// Tables the GenericCrud component knows how to render. This list is
// intentionally broad so we get typed Supabase inserts/updates without
// forcing every consumer to be a perfect union member.
const KNOWN_CRUD_TABLES = [
  "accessories",
  "categories",
  "configurations",
  "customers",
  "discounts",
  "finishes",
  "internal_notes",
  "material_variants",
  "materials",
  "notification_log",
  "notification_templates",
  "pricing_factors",
  "pricing_rules",
  "product_templates",
  "products",
  "quote_items",
  "quote_requests",
  "remakes",
  "suppliers",
  "tenants",
  "veneers",
  "wastage_rules",
  "workers",
] as const;

type CrudTable = (typeof KNOWN_CRUD_TABLES)[number];

function isKnownTable(name: string): name is CrudTable {
  return (KNOWN_CRUD_TABLES as readonly string[]).includes(name);
}

function fromTable(client: typeof supabase, name: string) {
  if (isKnownTable(name)) {
    return client.from(name);
  }
  // Fallback to typed-any for ad-hoc tables. We can't statically narrow this,
  // and the existing call sites are passing string `table` props.
  return client.from(name as CrudTable);
}

function payloadToInsertObject(payload: Record<string, string | number | null>): Record<string, unknown> {
  // Strip null values for insert so DB defaults kick in. Keep numbers as numbers.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    out[k] = v;
  }
  return out;
}

export function GenericCrud({
  title, subtitle, table, fields,
}: {
  title: string; subtitle?: string; table: string; fields: FieldDef[];
}) {
  const [rows, setRows] = useState<CrudRow[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CrudRow | null>(null);

  const blank = Object.fromEntries(
    fields.map(f => [f.key, f.default ?? (f.type === 'number' ? 0 : '')])
  ) as Record<string, string | number>;

  const [form, setForm] = useState<Record<string, string | number>>(blank);

  useEffect(() => { load(); }, [table]);

  async function load() {
    const { data, error } = await fromTable(supabase, table).select('*').order('created_at', { ascending: false });
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
      if (v !== undefined && v !== null) next[f.key] = String(v);
    }
    setForm(next);
  }

  async function save() {
    const payload: Record<string, string | number | null> = {};
    for (const f of fields) {
      const v = form[f.key];
      payload[f.key] = f.type === 'number' ? Number(v) : (v ?? "");
    }
    const insertPayload = payloadToInsertObject(payload);
    const tbl = fromTable(supabase, table);
    const { error } = editing
      ? await tbl.update(insertPayload as any).eq('id', editing.id)
      : await tbl.insert(insertPayload as any);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    setOpen(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm("تأكيد الحذف؟")) return;
    const { error } = await fromTable(supabase, table).delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    load();
  }

  const tableFields = fields.filter(f => f.showInTable !== false);

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
            {rows.length === 0 && <TableRow><TableCell colSpan={tableFields.length + 1} className="text-center py-8 text-muted-foreground">لا توجد بيانات.</TableCell></TableRow>}
            {rows.map(r => (
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
            {fields.map(f => (
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