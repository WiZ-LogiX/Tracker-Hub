import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
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
import { Plus, Lock, Power, UserCog } from "lucide-react";
import { toast } from "sonner";
import {
  createAppUser,
  listAppUsers,
  resetUserPassword,
  setUserStatus,
  updateUserAvatar,
} from "@/lib/auth.functions";
import { AvatarUploader } from "@/components/admin/AvatarUploader";

export const Route = createFileRoute("/admin/team")({ component: TeamPage });

interface Row {
  id: string;
  tenant_id: string;
  username: string;
  display_name: string;
  avatar_key: string | null;
  status: "active" | "disabled";
  created_at: string;
}

function TeamPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<{
    username: string;
    displayName: string;
    password: string;
    role: "owner" | "admin" | "sales" | "worker" | "viewer";
  }>({ username: "", displayName: "", password: "", role: "viewer" });
  const [resetFor, setResetFor] = useState<Row | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const listFn = useServerFn(listAppUsers);
  const createFn = useServerFn(createAppUser);
  const statusFn = useServerFn(setUserStatus);
  const resetFn = useServerFn(resetUserPassword);

  async function load() {
    setLoading(true);
    try {
      const r = await listFn();
      setRows((r.items as Row[]) ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load team");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setEditing(null);
    setForm({ username: "", displayName: "", password: "", role: "viewer" });
    setOpen(true);
  }

  async function save() {
    if (!form.username.trim() || !form.displayName.trim() || !form.password) {
      return toast.error("كل الحقول مطلوبة");
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
      toast.success("تم إضافة المستخدم");
      setOpen(false);
      setForm({ username: "", displayName: "", password: "", role: "viewer" });
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "فشل إنشاء المستخدم");
    }
  }

  async function toggleStatus(r: Row) {
    const next = r.status === "active" ? "disabled" : "active";
    try {
      await statusFn({ data: { userId: r.id, status: next } });
      toast.success(next === "active" ? "تم تفعيل المستخدم" : "تم تعطيل المستخدم");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "فشل تحديث الحالة");
    }
  }

  async function resetPwd() {
    if (!resetFor) return;
    if (!newPassword) return toast.error("كلمة المرور مطلوبة");
    try {
      await resetFn({ data: { userId: resetFor.id, newPassword } });
      toast.success("تم تغيير كلمة المرور");
      setResetFor(null);
      setNewPassword("");
    } catch (e: any) {
      toast.error(e?.message ?? "فشل");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-serif text-3xl font-bold flex items-center gap-2">
            <UserCog className="h-7 w-7" /> الفريق والمستخدمون
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            أنشئ حسابات للموظفين، عطلها مؤقتاً، أو غيّر كلمات المرور
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="gap-2">
              <Plus className="h-4 w-4" /> إضافة مستخدم
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>إضافة مستخدم جديد</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>اسم المستخدم</Label>
                <Input
                  value={form.username}
                  onChange={e =>
                    setForm({ ...form, username: e.target.value })
                  }
                  dir="ltr"
                  placeholder="مثلاً: ahmed"
                />
              </div>
              <div>
                <Label>الاسم المعروض</Label>
                <Input
                  value={form.displayName}
                  onChange={e =>
                    setForm({ ...form, displayName: e.target.value })
                  }
                  placeholder="مثلاً: أحمد الجيار"
                />
              </div>
              <div>
                <Label>كلمة المرور</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={e =>
                    setForm({ ...form, password: e.target.value })
                  }
                  dir="ltr"
                />
              </div>
              <div>
                <Label>الدور</Label>
                <Select
                  value={form.role}
                  onValueChange={v =>
                    setForm({
                      ...form,
                      role: v as typeof form.role,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="sales">Sales</SelectItem>
                    <SelectItem value="worker">Worker</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={save} className="w-full">
                حفظ
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">الفريق</CardTitle>
          <CardDescription>
            أول مستخدم (admin / admin) هو مالك المساحة — تستطيع إضافة موظفين
            أدوارهم sales / worker / viewer.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الصورة</TableHead>
                <TableHead>المستخدم</TableHead>
                <TableHead>الاسم</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    ...جاري التحميل
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    لا يوجد فريق بعد.
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <AvatarUploader
                        userId={r.id}
                        currentKey={r.avatar_key}
                        size={48}
                        onUpdated={() => load()}
                      />
                    </TableCell>
                    <TableCell className="font-mono">{r.username}</TableCell>
                    <TableCell>{r.display_name}</TableCell>
                    <TableCell>
                      <Badge
                        variant={r.status === "active" ? "default" : "secondary"}
                      >
                        {r.status === "active" ? "نشط" : "معطل"}
                      </Badge>
                    </TableCell>
                    <TableCell className="flex gap-1 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setResetFor(r);
                          setNewPassword("");
                        }}
                        className="gap-1"
                      >
                        <Lock className="h-3.5 w-3.5" />
                        كلمة المرور
                      </Button>
                      <Button
                        size="sm"
                        variant={r.status === "active" ? "outline" : "secondary"}
                        onClick={() => toggleStatus(r)}
                        className="gap-1"
                      >
                        <Power className="h-3.5 w-3.5" />
                        {r.status === "active" ? "تعطيل" : "تفعيل"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Reset password dialog */}
      <Dialog open={!!resetFor} onOpenChange={open => !open && setResetFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إعادة تعيين كلمة المرور لـ {resetFor?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>كلمة المرور الجديدة</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                dir="ltr"
                placeholder="6 أحرف على الأقل"
              />
            </div>
            <Button onClick={resetPwd} className="w-full">
              حفظ كلمة المرور الجديدة
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}