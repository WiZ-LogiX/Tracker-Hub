import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listMaterials, listWastageRules, upsertWastageRule, deleteWastageRule } from "@/lib/materials.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/wastage-rules")({ component: WastageRulesPage });

function WastageRulesPage() {
  const [materials, setMaterials] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);

  const listMaterialsFn = useServerFn(listMaterials);
  const listRulesFn = useServerFn(listWastageRules);
  const saveRuleFn = useServerFn(upsertWastageRule);
  const deleteRuleFn = useServerFn(deleteWastageRule);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [{ items: mats }, { items: rls }] = await Promise.all([
        listMaterialsFn(),
        listRulesFn(),
      ]);
      setMaterials(mats ?? []);
      setRules(rls ?? []);
    } catch (e: any) {
      toast.error(e?.message || "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRule.material_id) return toast.error("اختر الخامة");

    try {
      await saveRuleFn({ data: editingRule });
      toast.success(editingRule.id ? "تم التحديث" : "تمت الإضافة");
      setShowForm(false);
      setEditingRule(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || "فشل الحفظ");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("تأكيد الحذف؟")) return;
    try {
      await deleteRuleFn({ data: { id } });
      toast.success("تم الحذف");
      load();
    } catch (e: any) {
      toast.error(e?.message || "فشل الحذف");
    }
  }

  function openNew() {
    setEditingRule({
      material_id: "",
      material_type: "wood",
      min_dimension: 0,
      max_dimension: null,
      wastage_pct: 8,
      active: true,
    });
    setShowForm(true);
  }

  function openEdit(rule: any) {
    setEditingRule({ ...rule });
    setShowForm(true);
  }

  const getMaterialName = (id: string) => materials.find(m => m.id === id)?.name_ar || "—";

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold">قواعد الهدر</h1>
          <p className="text-sm text-muted-foreground mt-1">
            تحديد نسبة الهدر حسب الخامة ونطاق الأبعاد
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> قاعدة جديدة
        </Button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-lg">
              {editingRule?.id ? "تعديل قاعدة" : "قاعدة هدر جديدة"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="grid md:grid-cols-6 gap-3 items-end">
              <div className="md:col-span-2">
                <Label>الخامة *</Label>
                <Select
                  value={editingRule?.material_id || ""}
                  onValueChange={v => setEditingRule({ ...editingRule, material_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الخامة" />
                  </SelectTrigger>
                  <SelectContent>
                    {materials.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name_ar}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>نوع الخامة</Label>
                <Input
                  value={editingRule?.material_type || "wood"}
                  onChange={e => setEditingRule({ ...editingRule, material_type: e.target.value })}
                />
              </div>
              <div>
                <Label>الحد الأدنى (م²) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={editingRule?.min_dimension || 0}
                  onChange={e => setEditingRule({ ...editingRule, min_dimension: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>الحد الأقصى (م²)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={editingRule?.max_dimension || ""}
                  onChange={e => setEditingRule({ ...editingRule, max_dimension: e.target.value ? Number(e.target.value) : null })}
                  placeholder="غير محدود"
                />
              </div>
              <div>
                <Label>نسبة الهدر % *</Label>
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={editingRule?.wastage_pct || 0}
                  onChange={e => setEditingRule({ ...editingRule, wastage_pct: Number(e.target.value) })}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="gap-2">
                  <Save className="h-4 w-4" /> حفظ
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading && <p className="text-center py-8">جارٍ التحميل...</p>}

      {!loading && rules.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            لا توجد قواعد هدر بعد. اضغط "قاعدة جديدة" للبدء.
          </CardContent>
        </Card>
      )}

      {/* Rules table */}
      {!loading && rules.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الخامة</TableHead>
                  <TableHead>نوع الخامة</TableHead>
                  <TableHead>الحد الأدنى (م²)</TableHead>
                  <TableHead>الحد الأقصى (م²)</TableHead>
                  <TableHead>نسبة الهدر %</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map(rule => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">
                      {getMaterialName(rule.material_id)}
                    </TableCell>
                    <TableCell>{rule.material_type}</TableCell>
                    <TableCell>{rule.min_dimension}</TableCell>
                    <TableCell>{rule.max_dimension ?? "∞"}</TableCell>
                    <TableCell className="font-bold">{rule.wastage_pct}%</TableCell>
                    <TableCell>
                      <Badge variant={rule.active ? "default" : "secondary"}>
                        {rule.active ? "نشط" : "متوقف"}
                      </Badge>
                    </TableCell>
                    <TableCell className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(rule)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(rule.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}