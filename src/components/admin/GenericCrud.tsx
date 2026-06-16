import { useEffect, useState } from "react";
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

// Tables the GenericCrud component knows how to render.
//
// IMPORTANT: `tenants` is excluded — it's the system-of-record table for
// tenant identity and tenant membership. Mutations to it have to flow
// through a server fn that re-asserts RLS invariants; allowing direct
// `.from('tenants')` writes from the browser would compromise Phase 2
// invariants. Editing goes through /admin → tenant switcher instead.
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
  "veneers",
  "wastage_rules",
  "workers",
] as const;

type CrudTable = (typeof KNOWN_CRUD_TABLES)[number];

// Fields that the GenericCrud form must NEVER let the user edit. RLS
// populates these on INSERT, and a malicious client overwriting them via
// .update() would compromise tenant isolation.
const PROTECTED_INSERT_FIELDS = ["id", "tenant_id", "created_at", "updated_at"];

function isKnownTable(name: string): name is CrudTable {
  return (KNOWN_CRUD_TABLES as readonly string[]).includes(name);
}

function fromTable(client: typeof supabase, name: string) {
  if (isKnownTable(name)) {
    return client.from(name);
  }
  // Fallback for ad-hoc tables. We can't statically narrow this,
  // and the existing call sites are passing string `table` props.
  return client.from(name as CrudTable);
}

export function GenericCrud({
  title, subtitle, table, fields,
}: {
  title: string; subtitle?: string; table: string; fields: FieldDef[];
}) {
  const { currentTenantId, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<CrudRow[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CrudRow | null>(null);
  const [loading, setLoading] = useState(false);

  const blank = Object.fromEntries(
    fields.map(f => [f.key, f.default ?? (f.type === 'number' ? 0 : '')])
  ) as Record<string, string | number>;

  const [form, setForm] = useState<Record<string, string | number>>(blank);

  // Refuse to load rows until we have a tenant identity — protects RLS reads
  // and prevents the brief window where the user has a session but hasn't
  // picked an active tenant yet.
  useEffect(() => {
    if (authLoading) return;
    if (!currentTenantId) {
      setRows([]);
      return;
    }
    load();
    // Reload if the user switches tenant — RLS now scopes to a different tenant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, currentTenantId, authLoading]);

  async function load() {
    setLoading(true);
    const tbl = fromTable(supabase, table);
    const { data, error } = await tbl
      .select("*")
      // Match every row by anchoring on a UNIX timestamp. PostgREST requires
      // a filter on bulk reads; this never excludes real rows but is less
      // fragile than a "sentinel UUID" workaround. RLS still enforces tenant
      // isolation regardless of the filter, so this is purely cosmetic.
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
      // Strip protected server-managed fields from the form payload. They
      // may have leaked into `fields` from a misconfigured caller, but
      // defense-in-depth: never let the form write them.
      if (PROTECTED_INSERT_FIELDS.includes(f.key)) continue;
      payload[f.key] = form[f.key] ?? (f.type === 'number' ? 0 : "");
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
              // Hide server-managed fields from the user-facing form.
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
