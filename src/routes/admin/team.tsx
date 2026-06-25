import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Lock, Power, UserCog, Shield, Key, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createAppUser, listAppUsers, resetUserPassword, setUserStatus,
  listTenantRoles, createTenantRole, deleteTenantRole, updateTenantRole,
  listRolePermissions, setRolePermissions, listPermissions,
} from "@/lib/auth.functions";
import { AvatarUploader } from "@/components/admin/AvatarUploader";

export const Route = createFileRoute("/admin/team")({ component: TeamPage });

interface Row {
  id: string; tenant_id: string; username: string; display_name: string;
  avatar_key: string | null; status: "active" | "disabled"; created_at: string;
}
interface RoleRow { slug: string; label: string; description: string | null; built_in?: boolean; }
interface PermRow { slug: string; label: string; category: string; }

function TeamPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("users");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold flex items-center gap-2">
          <UserCog className="h-7 w-7" /> الفريق والصلاحيات
        </h1>
        <p className="text-sm text-muted-foreground mt-1">إدارة المستخدمين والأدوار والصلاحيات</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="users" className="gap-1"><UserCog className="h-4 w-4" /> المستخدمون</TabsTrigger>
          <TabsTrigger value="roles" className="gap-1"><Shield className="h-4 w-4" /> الأدوار</TabsTrigger>
          <TabsTrigger value="permissions" className="gap-1"><Key className="h-4 w-4" /> الصلاحيات</TabsTrigger>
        </TabsList>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="roles"><RolesTab /></TabsContent>
        <TabsContent value="permissions"><PermissionsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ── Users Tab ─────────────────────────────────────────────────── */

function UsersTab() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: "", displayName: "", password: "", role: "viewer" });
  const [resetFor, setResetFor] = useState<Row | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const listFn = useServerFn(listAppUsers);
  const createFn = useServerFn(createAppUser);
  const statusFn = useServerFn(setUserStatus);
  const resetFn = useServerFn(resetUserPassword);
  const listRolesFn = useServerFn(listTenantRoles);

  async function load() {
    setLoading(true);
    try {
      const [r, rl] = await Promise.all([listFn(), listRolesFn()]);
      setRows((r.items as Row[]) ?? []);
      setRoles((rl.items as RoleRow[]) ?? []);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!form.username.trim() || !form.displayName.trim() || !form.password)
      return toast.error("كل الحقول مطلوبة");
    try {
      await createFn({ data: { username: form.username.trim(), displayName: form.displayName.trim(), password: form.password, role: form.role } });
      toast.success("تم إضافة المستخدم");
      setOpen(false);
      setForm({ username: "", displayName: "", password: "", role: "viewer" });
      load();
    } catch (e: any) { toast.error(e?.message ?? "فشل"); }
  }

  async function toggleStatus(r: Row) {
    const next = r.status === "active" ? "disabled" : "active";
    try {
      await statusFn({ data: { userId: r.id, status: next } });
      toast.success(next === "active" ? "تم تفعيل المستخدم" : "تم تعطيل المستخدم");
      load();
    } catch (e: any) { toast.error(e?.message ?? "فشل"); }
  }

  async function resetPwd() {
    if (!resetFor || !newPassword) return toast.error("كلمة المرور مطلوبة");
    try {
      await resetFn({ data: { userId: resetFor.id, newPassword } });
      toast.success("تم تغيير كلمة المرور");
      setResetFor(null); setNewPassword("");
    } catch (e: any) { toast.error(e?.message ?? "فشل"); }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">{t("common.add")}</CardTitle>
          <CardDescription>{t("admin.team.subtitle")}</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setForm({ username: "", displayName: "", password: "", role: "viewer" }); }} className="gap-2">
              <Plus className="h-4 w-4" /> {t("admin.team.newUser")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{t("admin.team.addUser")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{t("admin.team.username")}</Label><Input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} dir="ltr" /></div>
              <div><Label>{t("admin.team.displayName")}</Label><Input value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} /></div>
              <div><Label>{t("admin.team.password")}</Label><Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} dir="ltr" /></div>
              <div>
                <Label>{t("admin.team.role")}</Label>
                <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roles.map(r => <SelectItem key={r.slug} value={r.slug}>{r.label}</SelectItem>)}
                    {roles.length === 0 && ["owner","admin","sales","worker","viewer"].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={save} className="w-full">{t("common.save")}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("admin.team.avatar")}</TableHead><TableHead>{t("admin.team.username")}</TableHead><TableHead>{t("admin.team.displayName")}</TableHead><TableHead>{t("common.status")}</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t("common.loading")}</TableCell></TableRow>}
            {!loading && rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t("admin.team.noUsers")}</TableCell></TableRow>}
            {!loading && rows.map(r => (
              <TableRow key={r.id}>
                <TableCell><AvatarUploader userId={r.id} currentKey={r.avatar_key} size={48} onUpdated={() => load()} /></TableCell>
                <TableCell className="font-mono">{r.username}</TableCell>
                <TableCell>{r.display_name}</TableCell>
                <TableCell><Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status === "active" ? t("admin.team.active") : t("admin.team.disabled")}</Badge></TableCell>
                <TableCell className="flex gap-1 justify-end">
                  <Button size="sm" variant="outline" onClick={() => { setResetFor(r); setNewPassword(""); }} className="gap-1"><Lock className="h-3.5 w-3.5" /> {t("admin.team.resetPassword")}</Button>
                  <Button size="sm" variant={r.status === "active" ? "outline" : "secondary"} onClick={() => toggleStatus(r)} className="gap-1"><Power className="h-3.5 w-3.5" /> {r.status === "active" ? t("admin.team.disable") : t("admin.team.enable")}</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <Dialog open={!!resetFor} onOpenChange={o => !o && setResetFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("admin.team.resetPasswordFor")} {resetFor?.username}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t("admin.team.newPassword")}</Label><Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} dir="ltr" /></div>
            <Button onClick={resetPwd} className="w-full">{t("common.save")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ── Roles Tab ─────────────────────────────────────────────────── */

function RolesTab() {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [formSlug, setFormSlug] = useState("");
  const [formLabel, setFormLabel] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [editFor, setEditFor] = useState<RoleRow | null>(null);

  const listFn = useServerFn(listTenantRoles);
  const createFn = useServerFn(createTenantRole);
  const deleteFn = useServerFn(deleteTenantRole);
  const updateFn = useServerFn(updateTenantRole);

  const builtins = ["owner", "admin", "sales", "worker", "viewer"];

  async function load() {
    setLoading(true);
    try {
      const r = await listFn();
      setRoles((r.items as RoleRow[]) ?? []);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!formSlug.trim() || !formLabel.trim()) return toast.error("الرمز والاسم مطلوبان");
    try {
      await createFn({ data: { slug: formSlug.trim(), label: formLabel.trim(), description: formDesc.trim() || undefined } });
      toast.success("تم إنشاء الدور");
      setOpen(false); setFormSlug(""); setFormLabel(""); setFormDesc(""); load();
    } catch (e: any) { toast.error(e?.message ?? "فشل"); }
  }

  async function saveEdit() {
    if (!editFor || !formLabel.trim()) return toast.error("الاسم مطلوب");
    try {
      await updateFn({ data: { slug: editFor.slug, label: formLabel.trim(), description: formDesc.trim() || undefined } });
      toast.success("تم التحديث");
      setEditFor(null); load();
    } catch (e: any) { toast.error(e?.message ?? "فشل"); }
  }

  async function remove(r: RoleRow) {
    if (!confirm(`حذف الدور "${r.label}"؟`)) return;
    try {
      await deleteFn({ data: { slug: r.slug } });
      toast.success("تم الحذف"); load();
    } catch (e: any) { toast.error(e?.message ?? "فشل"); }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">{t("admin.team.roles")}</CardTitle>
          <CardDescription>{t("admin.team.rolesDescription")}</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> {t("admin.team.newRole")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{t("admin.team.createRole")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{t("admin.team.roleSlug")}</Label><Input value={formSlug} onChange={e => setFormSlug(e.target.value)} dir="ltr" placeholder="مثلاً: quality_checker" /></div>
              <div><Label>{t("admin.team.displayName")}</Label><Input value={formLabel} onChange={e => setFormLabel(e.target.value)} placeholder="مثلاً: مفتاح الجودة" /></div>
              <div><Label>{t("admin.team.description")}</Label><Input value={formDesc} onChange={e => setFormDesc(e.target.value)} /></div>
              <Button onClick={save} className="w-full">{t("common.add")}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("admin.team.roleSlug")}</TableHead><TableHead>{t("admin.team.displayName")}</TableHead><TableHead>{t("admin.team.description")}</TableHead><TableHead>{t("admin.team.type")}</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t("common.loading")}</TableCell></TableRow>}
            {!loading && roles.map(r => (
              <TableRow key={r.slug}>
                <TableCell className="font-mono">{r.slug}</TableCell>
                <TableCell>{r.label}</TableCell>
                <TableCell className="text-muted-foreground">{r.description || "—"}</TableCell>
                <TableCell>
                  <Badge variant={builtins.includes(r.slug) ? "secondary" : "outline"}>
                    {builtins.includes(r.slug) ? t("admin.team.builtin") : t("admin.team.custom")}
                  </Badge>
                </TableCell>
                <TableCell className="flex gap-1 justify-end">
                  <Button size="icon" variant="ghost" onClick={() => { setEditFor(r); setFormLabel(r.label); setFormDesc(r.description ?? ""); }} title="تعديل الاسم">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {!builtins.includes(r.slug) && (
                    <Button size="icon" variant="ghost" onClick={() => remove(r)} title="حذف">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!editFor} onOpenChange={o => !o && setEditFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("admin.team.editRole")}: {editFor?.slug}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t("admin.team.displayName")}</Label><Input value={formLabel} onChange={e => setFormLabel(e.target.value)} /></div>
            <div><Label>{t("admin.team.description")}</Label><Input value={formDesc} onChange={e => setFormDesc(e.target.value)} /></div>
            <Button onClick={saveEdit} className="w-full">{t("common.save")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ── Permissions Tab ───────────────────────────────────────────── */

function PermissionsTab() {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [allPerms, setAllPerms] = useState<PermRow[]>([]);
  const [selectedRole, setSelectedRole] = useState("");
  const [rolePerms, setRolePerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const listRolesFn = useServerFn(listTenantRoles);
  const listPermsFn = useServerFn(listPermissions);
  const listRolePermsFn = useServerFn(listRolePermissions);
  const setRolePermsFn = useServerFn(setRolePermissions);

  async function loadInit() {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([listRolesFn(), listPermsFn()]);
      setRoles((r.items as RoleRow[]) ?? []);
      setAllPerms((p.items as PermRow[]) ?? []);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadInit(); }, []);

  async function loadRolePerms(slug: string) {
    setSelectedRole(slug);
    if (!slug) { setRolePerms([]); return; }
    try {
      const r = await listRolePermsFn({ data: { role: slug } });
      setRolePerms((r.permissions as string[]) ?? []);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  function togglePerm(slug: string) {
    setRolePerms(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
  }

  async function savePerms() {
    if (!selectedRole) return;
    setSaving(true);
    try {
      await setRolePermsFn({ data: { role: selectedRole, permissions: rolePerms } });
      toast.success("تم حفظ الصلاحيات");
    } catch (e: any) { toast.error(e?.message ?? "فشل"); }
    finally { setSaving(false); }
  }

  const categories = [...new Set(allPerms.map(p => p.category))];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("admin.team.rolePermissions")}</CardTitle>
        <CardDescription>{t("admin.team.rolePermissionsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>{t("admin.team.selectRole")}</Label>
          <Select value={selectedRole} onValueChange={loadRolePerms}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {roles.map(r => <SelectItem key={r.slug} value={r.slug}>{r.label} ({r.slug})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {selectedRole && selectedRole !== "owner" && (
          <>
            {categories.map(cat => (
              <div key={cat}>
                <h4 className="text-sm font-medium mb-2 text-muted-foreground">{cat}</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {allPerms.filter(p => p.category === cat).map(p => (
                    <label key={p.slug} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={rolePerms.includes(p.slug)} onCheckedChange={() => togglePerm(p.slug)} />
                      <span>{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <Button onClick={savePerms} disabled={saving} className="w-full">{saving ? t("admin.settings.saving") : t("admin.team.savePermissions")}</Button>
          </>
        )}
        {selectedRole === "owner" && (
          <p className="text-sm text-muted-foreground text-center py-4">{t("admin.team.ownerAllPermissions")}</p>
        )}
      </CardContent>
    </Card>
  );
}
