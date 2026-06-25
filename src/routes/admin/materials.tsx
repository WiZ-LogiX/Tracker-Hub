import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { formatEGP } from "@/lib/pricing";
import { listMaterials, upsertMaterial, deleteMaterial } from "@/lib/catalog.functions";
import { listSuppliers } from "@/lib/catalog.functions";

export const Route = createFileRoute("/admin/materials")({ component: MaterialsPage });

interface MaterialRow {
  id: string;
  name_ar: string;
  name_en: string;
  type: string;
  unit: string;
  price_per_unit: number;
  wastage_pct: number | null;
  supplier_id: string | null;
  country_of_origin: string | null;
  active: boolean;
}

interface Supplier {
  id: string;
  name: string;
}

const blank: MaterialRow = {
  id: "", name_ar: "", name_en: "", type: "wood", unit: "m²",
  price_per_unit: 0, wastage_pct: null, supplier_id: null, country_of_origin: "", active: true,
};

function MaterialsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialRow | null>(null);
  const [form, setForm] = useState<MaterialRow>(blank);

  const listFn = useServerFn(listMaterials);
  const upsertFn = useServerFn(upsertMaterial);
  const deleteFn = useServerFn(deleteMaterial);
  const listSuppliersFn = useServerFn(listSuppliers);

  async function load() {
    try {
      const [m, s] = await Promise.all([
        listFn(),
        listSuppliersFn(),
      ]);
      setRows((m.items as MaterialRow[]) ?? []);
      setSuppliers((s.items as Supplier[]) ?? []);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t("common.loading");
      toast.error(message);
    }
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm(blank); setOpen(true); }
  function openEdit(r: MaterialRow) { setEditing(r); setForm({ ...blank, ...r }); setOpen(true); }

  async function save() {
    if (!form.name_ar) return toast.error(t("materials.nameRequired"));
    try {
      await upsertFn({
        data: {
          id: editing?.id || undefined,
          name_ar: form.name_ar,
          name_en: form.name_en || form.name_ar,
          type: form.type || 'wood',
          unit: form.unit || 'm²',
          price_per_unit: Number(form.price_per_unit),
          wastage_pct: form.wastage_pct == null || form.wastage_pct === undefined ? null : Number(form.wastage_pct),
          supplier_id: form.supplier_id || null,
          country_of_origin: form.country_of_origin || null,
          active: form.active,
        },
      });
      toast.success(t("materials.saved")); setOpen(false); load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t("common.retry");
      toast.error(message);
    }
  }

  async function remove(id: string) {
    if (!confirm(t("common.confirmDelete"))) return;
    try {
      await deleteFn({ data: { id } });
      toast.success(t("materials.deleted"));
      load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t("common.retry");
      toast.error(message);
    }
  }

  function supName(id: string | null | undefined): string {
    if (!id) return '—';
    return suppliers.find(s => s.id === id)?.name ?? '—';
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-serif text-3xl font-bold">{t("materials.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("materials.subtitle")}</p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> {t("common.new")}</Button>
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("materials.nameAr")}</TableHead>
            <TableHead>{t("materials.type")}</TableHead>
            <TableHead>{t("materials.supplier")}</TableHead>
            <TableHead>{t("materials.country")}</TableHead>
            <TableHead>{t("materials.pricePerUnit")}</TableHead>
            <TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("common.noData")}</TableCell></TableRow>}
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name_ar}</TableCell>
                <TableCell>{r.type}</TableCell>
                <TableCell>{supName(r.supplier_id)}</TableCell>
                <TableCell>{r.country_of_origin ?? '—'}</TableCell>
                <TableCell>{formatEGP(Number(r.price_per_unit))} / {r.unit}</TableCell>
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
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? t("materials.edit") : t("materials.title")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("materials.nameAr")}</Label><Input value={form.name_ar} onChange={e => setForm({ ...form, name_ar: e.target.value })} /></div>
              <div><Label>{t("materials.nameEn")}</Label><Input value={form.name_en} onChange={e => setForm({ ...form, name_en: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("materials.type")}</Label><Input value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} placeholder="wood / mdf / metal..." /></div>
              <div><Label>{t("materials.unit")}</Label><Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("materials.pricePerUnit")}</Label><Input type="number" step="0.01" value={form.price_per_unit} onChange={e => setForm({ ...form, price_per_unit: Number(e.target.value) })} /></div>
              <div><Label>{t("materials.wastage")}</Label><Input type="number" step="0.1" placeholder="مثلاً: 8" value={form.wastage_pct ?? ''} onChange={e => setForm({ ...form, wastage_pct: e.target.value === '' ? null : Number(e.target.value) })} /></div>
            </div>
            <div>
              <Label>{t("materials.supplier")}</Label>
              <Select value={form.supplier_id ?? ''} onValueChange={v => setForm({ ...form, supplier_id: v || null })}>
                <SelectTrigger><SelectValue placeholder={t("common.noData")} /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>{t("materials.country")}</Label><Input value={form.country_of_origin ?? ''} onChange={e => setForm({ ...form, country_of_origin: e.target.value })} placeholder="مثلاً: مصر، تركيا، إيطاليا" /></div>
            <Button onClick={save} className="w-full">{t("common.save")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}