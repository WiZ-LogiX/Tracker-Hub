import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus,
  Lock,
  Power,
  UserCog,
  Shield,
  Key,
  Pencil,
  Trash2,
  ShieldAlert,
  CheckSquare,
  UserCheck,
  Briefcase,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  createAppUser,
  listAppUsers,
  resetUserPassword,
  setUserStatus,
  updateAppUser,
  listTenantRoles,
  createTenantRole,
  deleteTenantRole,
  updateTenantRole,
  listRolePermissions,
  setRolePermissions,
  listPermissions,
} from "@/lib/auth.functions";
import { AvatarUploader } from "@/components/admin/AvatarUploader";
import { useAuth } from "@/lib/useAuth";

export const Route = createFileRoute("/admin/team")({ component: TeamPage });

interface Row {
  id: string;
  tenant_id: string;
  username: string;
  display_name: string;
  avatar_key: string | null;
  status: "active" | "disabled";
  created_at: string;
  role: string;
}

interface RoleRow {
  slug: string;
  label: string;
  description: string | null;
  built_in?: boolean;
}

interface PermRow {
  slug: string;
  label: string;
  category: string;
}

function TeamPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const { currentRole, loading } = useAuth();
  const [tab, setTab] = useState("users");

  if (!loading && currentRole && !["owner", "admin"].includes(currentRole)) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center p-6 space-y-4">
          <ShieldAlert className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="text-xl font-bold text-destructive">
            {isRtl ? "غير مصرح بالوصول" : "Access Denied"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isRtl
              ? "إدارة المستخدمين والصلاحيات مقتصرة على مديري النظام فقط."
              : "User and access management is restricted to system administrators only."}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold flex items-center gap-2">
          <UserCog className="h-7 w-7 text-primary" /> {t("admin.nav.team", "الفريق والمستخدمون")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("admin.team.subtitle", "إدارة المستخدمين وملفات الصلاحيات والمهام")}
        </p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="users" className="gap-1.5">
            <UserCog className="h-4 w-4" /> {t("admin.team.users", "المستخدمون")}
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-1.5">
            <Shield className="h-4 w-4" /> {t("admin.team.roles", "الأدوار والملفات التعريفية")}
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-1.5">
            <Key className="h-4 w-4" /> {t("admin.team.rolePermissions", "مصفوفة الصلاحيات")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="roles">
          <RolesTab />
        </TabsContent>
        <TabsContent value="permissions">
          <PermissionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ── Role Badge Helper ─────────────────────────────────────────── */

function RoleBadge({ role, isRtl }: { role: string; isRtl: boolean }) {
  switch (role) {
    case "owner":
    case "admin":
      return (
        <Badge className="bg-purple-500/15 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800 flex items-center gap-1 font-medium w-fit">
          <Shield className="h-3 w-3" />
          {isRtl ? "مدير النظام (Admin)" : "Administrator"}
        </Badge>
      );
    case "sales":
      return (
        <Badge className="bg-blue-500/15 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800 flex items-center gap-1 font-medium w-fit">
          <UserCheck className="h-3 w-3" />
          {isRtl ? "مشرف عمليات (Manager)" : "Manager"}
        </Badge>
      );
    case "worker":
      return (
        <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center gap-1 font-medium w-fit">
          <CheckSquare className="h-3 w-3" />
          {isRtl ? "فني مهام (Task Worker)" : "Task Worker"}
        </Badge>
      );
    case "viewer":
      return (
        <Badge variant="outline" className="text-muted-foreground w-fit">
          {isRtl ? "مشاهد (Viewer)" : "Viewer"}
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="w-fit">
          {role}
        </Badge>
      );
  }
}

/* ── Users Tab ─────────────────────────────────────────────────── */

function UsersTab() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [rows, setRows] = useState<Row[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    username: "",
    displayName: "",
    password: "",
    role: "worker",
  });

  const [editFor, setEditFor] = useState<Row | null>(null);
  const [editForm, setEditForm] = useState({
    displayName: "",
    role: "worker",
    status: "active" as "active" | "disabled",
  });

  const [resetFor, setResetFor] = useState<Row | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const listFn = useServerFn(listAppUsers);
  const createFn = useServerFn(createAppUser);
  const updateFn = useServerFn(updateAppUser);
  const statusFn = useServerFn(setUserStatus);
  const resetFn = useServerFn(resetUserPassword);
  const listRolesFn = useServerFn(listTenantRoles);

  async function load() {
    setLoading(true);
    try {
      const [r, rl] = await Promise.all([listFn(), listRolesFn()]);
      setRows((r.items as Row[]) ?? []);
      setRoles((rl.items as RoleRow[]) ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!form.username.trim() || !form.displayName.trim() || !form.password) {
      return toast.error(isRtl ? "جميع الحقول مطلوبة" : "All fields are required");
    }
    try {
      await createFn({
        data: {
          username: form.username.trim(),
          displayName: form.displayName.trim(),
          password: form.password,
          role: form.role,
        },
      });
      toast.success(isRtl ? "تمت إضافة المستخدم بنجاح" : "User created successfully");
      setOpen(false);
      setForm({ username: "", displayName: "", password: "", role: "worker" });
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  async function saveEdit() {
    if (!editFor) return;
    if (!editForm.displayName.trim()) {
      return toast.error(isRtl ? "الاسم المعروض مطلوب" : "Display name is required");
    }
    try {
      await updateFn({
        data: {
          userId: editFor.id,
          displayName: editForm.displayName.trim(),
          role: editForm.role,
          status: editForm.status,
        },
      });
      toast.success(isRtl ? "تم تحديث بيانات المستخدم" : "User updated successfully");
      setEditFor(null);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  async function toggleStatus(r: Row) {
    const next = r.status === "active" ? "disabled" : "active";
    try {
      await statusFn({ data: { userId: r.id, status: next } });
      toast.success(
        next === "active"
          ? isRtl
            ? "تم تفعيل المستخدم"
            : "User enabled"
          : isRtl
            ? "تم تعطيل المستخدم"
            : "User disabled",
      );
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  async function resetPwd() {
    if (!resetFor || !newPassword) {
      return toast.error(isRtl ? "كلمة المرور مطلوبة" : "Password is required");
    }
    try {
      await resetFn({ data: { userId: resetFor.id, newPassword } });
      toast.success(isRtl ? "تم تغيير كلمة المرور بنجاح" : "Password reset successfully");
      setResetFor(null);
      setNewPassword("");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">{t("admin.team.users", "المستخدمون")}</CardTitle>
          <CardDescription>
            {t("admin.team.subtitle", "إدارة موظفي الفريق وملفات الصلاحيات والوصول")}
          </CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={() => {
                setForm({ username: "", displayName: "", password: "", role: "worker" });
              }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" /> {t("admin.team.newUser", "مستخدم جديد")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("admin.team.addUser", "إضافة مستخدم جديد")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label htmlFor="create-display-name">{t("admin.team.displayName", "الاسم المعروض")}</Label>
                <Input
                  id="create-display-name"
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  placeholder={isRtl ? "مثلاً: أحمد محمود" : "e.g. John Doe"}
                />
              </div>
              <div>
                <Label htmlFor="create-username">{t("admin.team.username", "اسم المستخدم")}</Label>
                <Input
                  id="create-username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  dir="ltr"
                  placeholder="e.g. ahmed.worker"
                />
              </div>
              <div>
                <Label htmlFor="create-password">{t("admin.team.password", "كلمة المرور")}</Label>
                <Input
                  id="create-password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  dir="ltr"
                />
              </div>
              <div>
                <Label>{t("admin.team.accessProfile", "الملف التعريفي للصلاحيات")}</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">
                      🛡️ {isRtl ? "مدير النظام (Administrator) — صلاحية كاملة" : "Administrator — Full Access"}
                    </SelectItem>
                    <SelectItem value="sales">
                      💼 {isRtl ? "مشرف عمليات (Manager) — إدارة العمليات والمهام" : "Manager — Operations & Tasks"}
                    </SelectItem>
                    <SelectItem value="worker">
                      📋 {isRtl ? "فني مهام (Task Worker) — إدارة المهام فقط" : "Task Worker — Task Management Only"}
                    </SelectItem>
                    {roles
                      .filter((r) => !["owner", "admin", "sales", "worker", "viewer"].includes(r.slug))
                      .map((r) => (
                        <SelectItem key={r.slug} value={r.slug}>
                          {r.label} ({r.slug})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Informative notice for Task Worker */}
              {form.role === "worker" && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>{isRtl ? "صلاحيات فني المهام (Task Worker)" : "Task Worker Notice"}</span>
                  </div>
                  <p className="leading-relaxed">
                    {isRtl
                      ? "يمتلك فني المهام صلاحية الوصول إلى إدارة المهام فقط (لوحة مهامي وتفاصيل المهام المسندة إليه). ولا يمكنه الوصول إلى عروض الأسعار، إدارة العملاء، السجلات المالية، المخزون، أو إعدادات النظام."
                      : "Task Workers have access to Task Management only (My Tasks workspace and assigned task details). They cannot access CRM, quotations, financial records, inventory, or system settings."}
                  </p>
                </div>
              )}

              <Button onClick={save} className="w-full">
                {t("common.save", "حفظ")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">{t("admin.team.avatar", "الصورة")}</TableHead>
              <TableHead>{t("admin.team.displayName", "الاسم المعروض")}</TableHead>
              <TableHead>{t("admin.team.username", "اسم المستخدم")}</TableHead>
              <TableHead>{t("admin.team.accessProfile", "الملف التعريفي")}</TableHead>
              <TableHead>{t("common.status", "الحالة")}</TableHead>
              <TableHead className="text-end">{t("common.actions", "الإجراءات")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {t("common.loading", "جارٍ التحميل...")}
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {t("admin.team.noUsers", "لا يوجد مستخدمون بعد.")}
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <AvatarUploader
                      userId={r.id}
                      currentKey={r.avatar_key}
                      size={40}
                      onUpdated={() => load()}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{r.display_name}</TableCell>
                  <TableCell className="font-mono text-xs">{r.username}</TableCell>
                  <TableCell>
                    <RoleBadge role={r.role} isRtl={isRtl} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "active" ? "default" : "secondary"}>
                      {r.status === "active"
                        ? t("admin.team.active", "نشط")
                        : t("admin.team.disabled", "معطل")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1.5 justify-end items-center">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditFor(r);
                          setEditForm({
                            displayName: r.display_name,
                            role: r.role || "worker",
                            status: r.status,
                          });
                        }}
                        className="gap-1 h-8"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>{t("common.edit", "تعديل")}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setResetFor(r);
                          setNewPassword("");
                        }}
                        className="gap-1 h-8"
                      >
                        <Lock className="h-3.5 w-3.5" />
                        <span>{t("admin.team.resetPassword", "كلمة المرور")}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant={r.status === "active" ? "outline" : "secondary"}
                        onClick={() => toggleStatus(r)}
                        className="gap-1 h-8"
                      >
                        <Power className="h-3.5 w-3.5" />
                        <span>
                          {r.status === "active"
                            ? t("admin.team.disable", "تعطيل")
                            : t("admin.team.enable", "تفعيل")}
                        </span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent>

      {/* Edit User Dialog */}
      <Dialog open={!!editFor} onOpenChange={(o) => !o && setEditFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("admin.team.editUser", "تعديل المستخدم")}: {editFor?.username}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label htmlFor="edit-display-name">{t("admin.team.displayName", "الاسم المعروض")}</Label>
              <Input
                id="edit-display-name"
                value={editForm.displayName}
                onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("admin.team.accessProfile", "الملف التعريفي للصلاحيات")}</Label>
              <Select
                value={editForm.role}
                onValueChange={(v) => setEditForm({ ...editForm, role: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    🛡️ {isRtl ? "مدير النظام (Administrator) — صلاحية كاملة" : "Administrator — Full Access"}
                  </SelectItem>
                  <SelectItem value="sales">
                    💼 {isRtl ? "مشرف عمليات (Manager) — إدارة العمليات والمهام" : "Manager — Operations & Tasks"}
                  </SelectItem>
                  <SelectItem value="worker">
                    📋 {isRtl ? "فني مهام (Task Worker) — إدارة المهام فقط" : "Task Worker — Task Management Only"}
                  </SelectItem>
                  {roles
                    .filter((r) => !["owner", "admin", "sales", "worker", "viewer"].includes(r.slug))
                    .map((r) => (
                      <SelectItem key={r.slug} value={r.slug}>
                        {r.label} ({r.slug})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Informative notice for Task Worker */}
            {editForm.role === "worker" && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>{isRtl ? "صلاحيات فني المهام (Task Worker)" : "Task Worker Notice"}</span>
                </div>
                <p className="leading-relaxed">
                  {isRtl
                    ? "يمتلك فني المهام صلاحية الوصول إلى إدارة المهام فقط (لوحة مهامي وتفاصيل المهام المسندة إليه). ولا يمكنه الوصول إلى عروض الأسعار، إدارة العملاء، السجلات المالية، المخزون، أو إعدادات النظام."
                    : "Task Workers have access to Task Management only (My Tasks workspace and assigned task details). They cannot access CRM, quotations, financial records, inventory, or system settings."}
                </p>
              </div>
            )}

            <div>
              <Label>{t("common.status", "حالة الحساب")}</Label>
              <Select
                value={editForm.status}
                onValueChange={(v: "active" | "disabled") =>
                  setEditForm({ ...editForm, status: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">
                    {isRtl ? "نشط (مسموح بالدخول)" : "Active (Access Allowed)"}
                  </SelectItem>
                  <SelectItem value="disabled">
                    {isRtl ? "معطل (محظور الدخول فوراً)" : "Disabled (Access Revoked)"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={saveEdit} className="w-full">
              {t("common.save", "حفظ التغييرات")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetFor} onOpenChange={(o) => !o && setResetFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("admin.team.resetPasswordFor", "إعادة تعيين كلمة المرور لـ")}: {resetFor?.username}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>{t("admin.team.newPassword", "كلمة المرور الجديدة")}</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                dir="ltr"
              />
            </div>
            <Button onClick={resetPwd} className="w-full">
              {t("common.save", "حفظ")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ── Roles Tab ─────────────────────────────────────────────────── */

function RolesTab() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

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
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!formSlug.trim() || !formLabel.trim()) {
      return toast.error(isRtl ? "الرمز والاسم مطلوبان" : "Slug and label are required");
    }
    try {
      await createFn({
        data: {
          slug: formSlug.trim(),
          label: formLabel.trim(),
          description: formDesc.trim() || undefined,
        },
      });
      toast.success(isRtl ? "تم إنشاء الدور بنجاح" : "Role created successfully");
      setOpen(false);
      setFormSlug("");
      setFormLabel("");
      setFormDesc("");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  async function saveEdit() {
    if (!editFor || !formLabel.trim()) {
      return toast.error(isRtl ? "الاسم مطلوب" : "Label is required");
    }
    try {
      await updateFn({
        data: {
          slug: editFor.slug,
          label: formLabel.trim(),
          description: formDesc.trim() || undefined,
        },
      });
      toast.success(isRtl ? "تم تحديث الدور بنجاح" : "Role updated successfully");
      setEditFor(null);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  async function remove(r: RoleRow) {
    if (builtins.includes(r.slug)) {
      return toast.error(
        isRtl
          ? "لا يمكن حذف الأدوار الأساسية للنظام"
          : "Protected system profiles cannot be deleted",
      );
    }
    if (!confirm(isRtl ? `هل أنت متأكد من حذف الدور "${r.label}"؟` : `Delete role "${r.label}"?`)) {
      return;
    }
    try {
      await deleteFn({ data: { slug: r.slug } });
      toast.success(isRtl ? "تم الحذف بنجاح" : "Role deleted successfully");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Section: Three Predefined Access Profiles */}
      <div>
        <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          {t("admin.team.predefinedProfiles", "الملفات التعريفية الأساسية للنظام (Predefined Access Profiles)")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Administrator Profile Card */}
          <Card className="border-purple-200 dark:border-purple-900 bg-purple-50/30 dark:bg-purple-950/20 shadow-none">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Badge className="bg-purple-600 text-white text-[10px]">
                  {t("admin.team.protectedSystemRole", "نظام أساسي محمي")}
                </Badge>
                <Shield className="h-5 w-5 text-purple-600" />
              </div>
              <CardTitle className="text-base mt-2">
                {isRtl ? "مدير النظام (Administrator)" : "Administrator"}
              </CardTitle>
              <CardDescription className="text-xs">
                {isRtl
                  ? "صلاحية شاملة على كافة أقسام النظام والماليات والمستخدمين"
                  : "Full authorized access across all ERP modules and settings"}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground pt-0 space-y-2">
              <div className="font-semibold text-foreground">
                {isRtl ? "الوحدات المتاحة:" : "Allowed Modules:"}
              </div>
              <div className="leading-relaxed">
                {isRtl
                  ? "الرئيسية، CRM، عروض الأسعار، الفواتير، المخزون، أوامر العمل، التوصيل، إدارة الفريق والصلاحيات، إعدادات النظام."
                  : "Dashboard, CRM, Quotes, Invoices, Inventory, Orders, Deliveries, Team & Roles, System Settings."}
              </div>
            </CardContent>
          </Card>

          {/* Manager Profile Card */}
          <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-950/20 shadow-none">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Badge className="bg-blue-600 text-white text-[10px]">
                  {t("admin.team.operationalProfile", "ملف تشغيلي")}
                </Badge>
                <UserCheck className="h-5 w-5 text-blue-600" />
              </div>
              <CardTitle className="text-base mt-2">
                {isRtl ? "مشرف عمليات (Manager)" : "Manager"}
              </CardTitle>
              <CardDescription className="text-xs">
                {isRtl
                  ? "إدارة العمليات الميدانية والإنتاج والمهام والعملاء"
                  : "Operational oversight, orders, production, deliveries, and task assignment"}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground pt-0 space-y-2">
              <div className="font-semibold text-foreground">
                {isRtl ? "الوحدات المتاحة:" : "Allowed Modules:"}
              </div>
              <div className="leading-relaxed">
                {isRtl
                  ? "أوامر الإنتاج، أوامر التشغيل، الشحن والتسليم، خدمات ما بعد البيع، المخزون، CRM، وتعيين ومتابعة المهام."
                  : "Production Orders, Work Orders, Deliveries, After-Sales, Inventory, CRM, and Task Management."}
              </div>
            </CardContent>
          </Card>

          {/* Task Worker Profile Card */}
          <Card className="border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/20 shadow-none">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Badge className="bg-amber-600 text-white text-[10px]">
                  {t("admin.team.taskOnlyProfile", "مهام فقط")}
                </Badge>
                <CheckSquare className="h-5 w-5 text-amber-600" />
              </div>
              <CardTitle className="text-base mt-2">
                {isRtl ? "فني مهام (Task Worker)" : "Task Worker"}
              </CardTitle>
              <CardDescription className="text-xs">
                {isRtl
                  ? "الوصول محصور حصرياً في مساحة المهام المسندة وتحديث حالتها"
                  : "Strictly scoped to assigned task workspace and status updates"}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground pt-0 space-y-2">
              <div className="font-semibold text-foreground">
                {isRtl ? "الوحدات المتاحة:" : "Allowed Modules:"}
              </div>
              <div className="leading-relaxed">
                {isRtl
                  ? "إدارة المهام (/admin/tasks)، مهامي، تفاصيل المهمة وسياقها، الملاحظات والمرفقات، والإشعارات فقط."
                  : "Task Management (/admin/tasks), My Tasks, task details & contextual codes, notes & attachments, notifications."}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom Section: All Roles Directory */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">
              {t("admin.team.allRoles", "سجل الأدوار والصلاحيات")}
            </CardTitle>
            <CardDescription>
              {t(
                "admin.team.rolesDescription",
                "الأدوار الأساسية للنظام محمية من التعديل العشوائي أو الحذف",
              )}
            </CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" /> {t("admin.team.newRole", "دور جديد")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{t("admin.team.createRole", "إنشاء دور جديد")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>{t("admin.team.roleSlug", "الرمز البرمجي للدور")}</Label>
                  <Input
                    value={formSlug}
                    onChange={(e) => setFormSlug(e.target.value)}
                    dir="ltr"
                    placeholder="e.g. quality_inspector"
                  />
                </div>
                <div>
                  <Label>{t("admin.team.displayName", "الاسم المعروض")}</Label>
                  <Input
                    value={formLabel}
                    onChange={(e) => setFormLabel(e.target.value)}
                    placeholder={isRtl ? "مثلاً: مفتش الجودة" : "e.g. Quality Inspector"}
                  />
                </div>
                <div>
                  <Label>{t("admin.team.description", "الوصف")}</Label>
                  <Input
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    placeholder={isRtl ? "وصف مختصر للمسؤوليات" : "Brief description"}
                  />
                </div>
                <Button onClick={save} className="w-full">
                  {t("common.add", "إضافة")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.team.roleSlug", "الرمز")}</TableHead>
                <TableHead>{t("admin.team.displayName", "الاسم")}</TableHead>
                <TableHead>{t("admin.team.description", "الوصف")}</TableHead>
                <TableHead>{t("admin.team.type", "النوع")}</TableHead>
                <TableHead className="text-end">{t("common.actions", "الإجراءات")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {t("common.loading", "جارٍ التحميل...")}
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                roles.map((r) => {
                  const isBuiltin = builtins.includes(r.slug);
                  return (
                    <TableRow key={r.slug}>
                      <TableCell className="font-mono text-xs">{r.slug}</TableCell>
                      <TableCell className="font-medium">{r.label}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {r.description || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isBuiltin ? "secondary" : "outline"} className="text-xs">
                          {isBuiltin
                            ? t("admin.team.protectedSystemRole", "نظام أساسي محمي")
                            : t("admin.team.custom", "مخصص")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end items-center">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditFor(r);
                              setFormLabel(r.label);
                              setFormDesc(r.description ?? "");
                            }}
                            title={isRtl ? "تعديل الاسم والوصف" : "Edit label and description"}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {!isBuiltin ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => remove(r)}
                              title={isRtl ? "حذف الدور" : "Delete role"}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          ) : (
                            <span
                              className="text-[10px] text-muted-foreground px-2 py-1 select-none"
                              title={t("admin.team.cannotDeleteBuiltin", "لا يمكن حذف الأدوار الأساسية")}
                            >
                              {isRtl ? "محمي" : "Protected"}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </CardContent>

        <Dialog open={!!editFor} onOpenChange={(o) => !o && setEditFor(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {t("admin.team.editRole", "تعديل الدور")}: {editFor?.slug}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>{t("admin.team.displayName", "الاسم المعروض")}</Label>
                <Input
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                />
              </div>
              <div>
                <Label>{t("admin.team.description", "الوصف")}</Label>
                <Input
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                />
              </div>
              <Button onClick={saveEdit} className="w-full">
                {t("common.save", "حفظ")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </Card>
    </div>
  );
}

/* ── Permissions Tab ───────────────────────────────────────────── */

function PermissionsTab() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [allPerms, setAllPerms] = useState<PermRow[]>([]);
  const [selectedRole, setSelectedRole] = useState("sales");
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
      const loadedRoles = (r.items as RoleRow[]) ?? [];
      setRoles(loadedRoles);
      setAllPerms((p.items as PermRow[]) ?? []);
      if (loadedRoles.length > 0) {
        // Default select 'sales' or the first available non-owner role
        const initial = loadedRoles.find((ro) => ro.slug === "sales")?.slug || loadedRoles[0].slug;
        loadRolePerms(initial);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInit();
  }, []);

  async function loadRolePerms(slug: string) {
    setSelectedRole(slug);
    if (!slug) {
      setRolePerms([]);
      return;
    }
    try {
      const r = await listRolePermsFn({ data: { role: slug } });
      setRolePerms((r.permissions as string[]) ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  function togglePerm(slug: string) {
    setRolePerms((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  async function savePerms() {
    if (!selectedRole || selectedRole === "owner") return;
    setSaving(true);
    try {
      await setRolePermsFn({ data: { role: selectedRole, permissions: rolePerms } });
      toast.success(isRtl ? "تم حفظ الصلاحيات بنجاح" : "Permissions saved successfully");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  // Group raw permissions into 3 clear operational categories
  function getLogicalGroup(category: string): {
    title: string;
    description: string;
  } {
    if (["team", "seed", "pricing", "cost-analysis", "discounts"].includes(category)) {
      return {
        title: isRtl ? "إدارة النظام والبيانات الأساسية" : "System Administration",
        description: isRtl
          ? "إعدادات الشركة، الفريق، التسعير، والتحليلات المالية"
          : "System configuration, team, pricing, and financial analysis",
      };
    }
    if (
      [
        "orders",
        "remakes",
        "workers",
        "customers",
        "products",
        "materials",
        "suppliers",
        "finishes",
        "veneers",
        "accessories",
        "quotes",
        "invoices",
      ].includes(category)
    ) {
      return {
        title: isRtl ? "الإشراف والعمليات التشغيلية" : "Operational & Task Oversight",
        description: isRtl
          ? "الإنتاج، الكتالوج، أوامر العمل، عروض الأسعار، والعملاء"
          : "Production, catalog, work orders, quotations, and customers",
      };
    }
    return {
      title: isRtl ? "تنفيذ المهام والملاحظات الميدانية" : "Task Execution & Field Work",
      description: isRtl
        ? "متابعة المهام، إرسال الملاحظات، المرفقات، والإشعارات"
        : "Task execution, progress notes, attachments, and notifications",
    };
  }

  const rawCategories = [...new Set(allPerms.map((p) => p.category))];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {t("admin.team.rolePermissions", "صلاحيات الأدوار")}
        </CardTitle>
        <CardDescription>
          {t(
            "admin.team.rolePermissionsDescription",
            "عرض وتخصيص الصلاحيات لكل دور تشغيلي — المالك والمدير يمتلكان صلاحيات شاملة تلقائياً",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="max-w-sm">
          <Label>{t("admin.team.selectRole", "اختر الدور للتحقق أو التعديل")}</Label>
          <Select value={selectedRole} onValueChange={loadRolePerms}>
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.slug} value={r.slug}>
                  {r.label} ({r.slug})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Worker Role Explanation Notice */}
        {selectedRole === "worker" && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-2 text-amber-900 dark:text-amber-200">
            <div className="font-semibold flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-amber-600" />
              <span>{isRtl ? "ملف فني المهام (Task Worker)" : "Task Worker Access Profile"}</span>
            </div>
            <p className="text-sm leading-relaxed">
              {isRtl
                ? "فني المهام مصمم حصرياً للعاملين والفنيين الذين يحتاجون إلى تسجيل الدخول ومتابعة مهامهم المباشرة وتحديث حالاتها وإضافة الملاحظات وإرفاق صور الإنجاز. هذا الدور محمي ومحظور برمجياً من الوصول إلى أي أقسام إدارية أو مالية أو عروض أسعار."
                : "The Task Worker profile is strictly tailored for field workers who only need to log in, view assigned tasks, update task status, add progress notes, and upload completion photos. This role is strictly forbidden from accessing CRM, invoices, inventory, or system settings."}
            </p>
          </div>
        )}

        {/* Owner / Admin Notice */}
        {(selectedRole === "owner" || selectedRole === "admin") && (
          <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-4 space-y-2 text-purple-900 dark:text-purple-200">
            <div className="font-semibold flex items-center gap-2">
              <Shield className="h-5 w-5 text-purple-600" />
              <span>
                {isRtl
                  ? "ملف مدير النظام / المالك (Administrator / Owner)"
                  : "Administrator / Owner Profile"}
              </span>
            </div>
            <p className="text-sm leading-relaxed">
              {isRtl
                ? "يمتلك مدير النظام والمالك صلاحيات كاملة وتلقائية على جميع شاشات ووظائف الـ ERP وإدارة المستخدمين والماليات. لا يتطلب تكوين صلاحيات فردية."
                : "The Administrator / Owner profiles inherit full system authority across all ERP modules, user management, and settings automatically."}
            </p>
          </div>
        )}

        {/* Customizable Permission Categories for Manager or Custom Roles */}
        {selectedRole && selectedRole !== "owner" && selectedRole !== "admin" && (
          <div className="space-y-6 pt-2">
            {rawCategories.map((cat) => {
              const groupInfo = getLogicalGroup(cat);
              const permsInCat = allPerms.filter((p) => p.category === cat);
              return (
                <div key={cat} className="border rounded-lg p-4 bg-card">
                  <div className="mb-3">
                    <h4 className="text-sm font-semibold flex items-center gap-1.5">
                      <span className="font-mono text-xs text-muted-foreground">[{cat}]</span>
                      <span>{groupInfo.title}</span>
                    </h4>
                    <p className="text-xs text-muted-foreground">{groupInfo.description}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {permsInCat.map((p) => {
                      const checked = rolePerms.includes(p.slug);
                      return (
                        <label
                          key={p.slug}
                          className={`flex items-start gap-2.5 p-2 rounded-md border text-xs cursor-pointer transition-colors ${
                            checked
                              ? "bg-primary/5 border-primary/30"
                              : "border-border/60 hover:bg-muted/50"
                          }`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => togglePerm(p.slug)}
                            className="mt-0.5"
                          />
                          <div className="min-w-0">
                            <div className="font-medium truncate">{p.label}</div>
                            <div className="font-mono text-[10px] text-muted-foreground truncate">
                              {p.slug}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <Button onClick={savePerms} disabled={saving} className="w-full">
              {saving
                ? t("admin.settings.saving", "جاري الحفظ...")
                : t("admin.team.savePermissions", "حفظ الصلاحيات")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
