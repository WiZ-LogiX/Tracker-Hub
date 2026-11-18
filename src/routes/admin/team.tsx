import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  Search,
  Copy,
  RotateCcw,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  Sparkles,
  SlidersHorizontal,
  Save,
  LayoutDashboard,
  TrendingUp,
  FolderKanban,
  ClipboardList,
  Truck,
  Receipt,
  BarChart3,
  Headphones,
  Ticket,
  UserCircle,
  Package,
  Boxes,
  Hammer,
  Users,
  RefreshCcw,
  Bell,
  Settings,
  AlertTriangle,
  Info,
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
  getRoleSummaries,
} from "@/lib/auth.functions";
import { AvatarUploader } from "@/components/admin/AvatarUploader";
import { useAuth } from "@/lib/useAuth";
import {
  APPLICATION_SECTIONS,
  SPECIAL_ACCESS_ITEMS,
  DEFAULT_ROLE_PERMISSIONS,
  type SimpleAccessLevel,
  type SectionMeta,
  type SpecialAccessItem,
} from "@/lib/tenant-context";

export const Route = createFileRoute("/admin/team")({ component: TeamPage });

interface AppUserRow {
  id: string;
  tenant_id: string;
  username: string;
  display_name: string;
  avatar_key: string | null;
  status: "active" | "disabled";
  created_at: string;
  role: string;
}

interface TenantRoleRow {
  slug: string;
  label: string;
  description: string | null;
  built_in?: boolean;
}

interface RoleSummaryData {
  slug: string;
  label: string;
  description: string;
  isBuiltin: boolean;
  assignedUserCount: number;
  accessibleSectionCount: number;
  accessibleSectionNames: string[];
  accessLevelCounts: {
    none: number;
    view: number;
    work: number;
    manage: number;
    special: number;
  };
  permissions: string[];
}

function getSectionIcon(iconName: string) {
  switch (iconName) {
    case "LayoutDashboard":
      return LayoutDashboard;
    case "TrendingUp":
      return TrendingUp;
    case "UserCheck":
      return UserCheck;
    case "FolderKanban":
      return FolderKanban;
    case "ClipboardList":
      return ClipboardList;
    case "Truck":
      return Truck;
    case "Receipt":
      return Receipt;
    case "CheckSquare":
      return CheckSquare;
    case "BarChart3":
      return BarChart3;
    case "Headphones":
      return Headphones;
    case "Ticket":
      return Ticket;
    case "UserCircle":
      return UserCircle;
    case "Package":
      return Package;
    case "Boxes":
      return Boxes;
    case "Hammer":
      return Hammer;
    case "Users":
      return Users;
    case "RefreshCcw":
      return RefreshCcw;
    case "UserCog":
      return UserCog;
    case "Bell":
      return Bell;
    case "Settings":
      return Settings;
    default:
      return Shield;
  }
}

function computeSectionLevel(perms: Set<string>, sec: SectionMeta): SimpleAccessLevel | "custom" {
  const hasView = sec.viewPerms.every((p) => perms.has(p));
  const hasWork = sec.workPerms.every((p) => perms.has(p));
  const hasManage = sec.managePerms.every((p) => perms.has(p));

  const allSecPerms = Array.from(new Set([...sec.viewPerms, ...sec.workPerms, ...sec.managePerms]));
  const anySecPerms = allSecPerms.some((p) => perms.has(p));

  if (!anySecPerms) return "none";
  if (hasManage) return "manage";
  if (hasWork && !sec.managePerms.some((p) => !sec.workPerms.includes(p) && perms.has(p))) return "work";
  if (hasView && !sec.workPerms.some((p) => !sec.viewPerms.includes(p) && perms.has(p))) return "view";
  return "custom";
}

function applySectionLevel(perms: Set<string>, sec: SectionMeta, level: SimpleAccessLevel): Set<string> {
  const updated = new Set(perms);
  const allSecPerms = Array.from(new Set([...sec.viewPerms, ...sec.workPerms, ...sec.managePerms]));
  for (const p of allSecPerms) {
    updated.delete(p);
  }

  if (level === "view") {
    for (const p of sec.viewPerms) updated.add(p);
  } else if (level === "work") {
    for (const p of sec.workPerms) updated.add(p);
  } else if (level === "manage") {
    for (const p of sec.managePerms) updated.add(p);
  }
  return updated;
}

export default function TeamPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const { currentRole, loading: authLoading, hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState<"users" | "profiles" | "roles">("users");

  const [users, setUsers] = useState<AppUserRow[]>([]);
  const [summaries, setSummaries] = useState<RoleSummaryData[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Active Editor Dialog State
  const [editorRole, setEditorRole] = useState<RoleSummaryData | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  // Active User Assignment Dialog State
  const [assignUser, setAssignUser] = useState<AppUserRow | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  const listUsersFn = useServerFn(listAppUsers);
  const getSummariesFn = useServerFn(getRoleSummaries);

  async function refreshData() {
    setLoadingData(true);
    try {
      const [uRes, sRes] = await Promise.all([listUsersFn(), getSummariesFn()]);
      setUsers((uRes.items as AppUserRow[]) ?? []);
      setSummaries((sRes.items as RoleSummaryData[]) ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load team data");
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    refreshData();
  }, []);

  function handleOpenEditor(roleSlug: string) {
    const found = summaries.find((s) => s.slug === roleSlug);
    if (found) {
      setEditorRole(found);
      setEditorOpen(true);
    } else {
      toast.error(isRtl ? "لم يتم العثور على هذا الدور" : "Role not found");
    }
  }

  if (!authLoading && !hasPermission("team.view") && currentRole !== "owner") {
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center p-6 space-y-4">
          <ShieldAlert className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="text-xl font-bold text-destructive">
            {isRtl ? "غير مصرح بالوصول" : "Access Restricted"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isRtl
              ? "إدارة المستخدمين والصلاحيات مقتصرة على الإدارة المعنية وفق الصلاحيات المعتمدة."
              : "User and access management is restricted to authorized administrative accounts."}
          </p>
        </Card>
      </div>
    );
  }

  const customRolesList = summaries.filter((s) => !s.isBuiltin);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <UserCog className="h-8 w-8 text-primary" />
            <span>{isRtl ? "إدارة الفريق والصلاحيات" : "Team & Access Management"}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isRtl
              ? "إدارة حسابات الموظفين، الملفات التعريفية الأساسية، وتعيين الصلاحيات الميدانية بكل سهولة"
              : "Manage employee accounts, predefined profiles, and configure operational permissions seamlessly."}
          </p>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid w-full max-w-xl grid-cols-3 mb-6">
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            <span>{isRtl ? "الموظفون" : "Team Members"}</span>
            <Badge variant="secondary" className="px-1.5 py-0 text-[11px] font-mono">
              {users.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="profiles" className="gap-2">
            <Shield className="h-4 w-4" />
            <span>{isRtl ? "الملفات الأساسية" : "Access Profiles"}</span>
            <Badge variant="secondary" className="px-1.5 py-0 text-[11px] font-mono">
              3
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-2">
            <Key className="h-4 w-4" />
            <span>{isRtl ? "الأدوار المخصصة" : "Custom Roles"}</span>
            <Badge variant="secondary" className="px-1.5 py-0 text-[11px] font-mono">
              {customRolesList.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Users */}
        <TabsContent value="users" className="space-y-4">
          <UsersTabContent
            users={users}
            summaries={summaries}
            loading={loadingData}
            onRefresh={refreshData}
            onAssignAccess={(u) => {
              setAssignUser(u);
              setAssignOpen(true);
            }}
          />
        </TabsContent>

        {/* Tab 2: Predefined Profiles */}
        <TabsContent value="profiles" className="space-y-6">
          <ProfilesTabContent
            summaries={summaries}
            loading={loadingData}
            onRefresh={refreshData}
            onEditAccess={handleOpenEditor}
          />
        </TabsContent>

        {/* Tab 3: Custom Roles */}
        <TabsContent value="roles" className="space-y-6">
          <CustomRolesTabContent
            summaries={summaries}
            loading={loadingData}
            onRefresh={refreshData}
            onEditAccess={handleOpenEditor}
          />
        </TabsContent>
      </Tabs>

      {/* Access Editor Dialog (Universal for any role) */}
      {editorRole && (
        <AccessEditorDialog
          open={editorOpen}
          onClose={() => {
            setEditorOpen(false);
            setEditorRole(null);
          }}
          role={editorRole}
          allRoles={summaries}
          onSaved={async () => {
            await refreshData();
            // Re-sync active editor role summary if still open
            const updated = summaries.find((s) => s.slug === editorRole.slug);
            if (updated) setEditorRole(updated);
          }}
        />
      )}

      {/* Choose Employee Access Dialog */}
      {assignUser && (
        <AssignEmployeeAccessDialog
          open={assignOpen}
          onClose={() => {
            setAssignOpen(false);
            setAssignUser(null);
          }}
          user={assignUser}
          summaries={summaries}
          onSaved={async () => {
            await refreshData();
          }}
          onEditRolePermissions={(slug) => {
            setAssignOpen(false);
            handleOpenEditor(slug);
          }}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   TAB 1: Team Members (UsersTabContent)
   ────────────────────────────────────────────────────────────────────────── */

function UsersTabContent({
  users,
  summaries,
  loading,
  onRefresh,
  onAssignAccess,
}: {
  users: AppUserRow[];
  summaries: RoleSummaryData[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onAssignAccess: (user: AppUserRow) => void;
}) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const { currentRole } = useAuth();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<AppUserRow | null>(null);

  const statusFn = useServerFn(setUserStatus);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        u.display_name.toLowerCase().includes(search.toLowerCase()) ||
        u.username.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" ? true : u.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [users, search, statusFilter]);

  async function handleToggleStatus(u: AppUserRow) {
    const next = u.status === "active" ? "disabled" : "active";
    try {
      await statusFn({ data: { userId: u.id, status: next } });
      toast.success(
        isRtl
          ? `تم ${next === "active" ? "تفعيل" : "تعطيل"} حساب ${u.display_name}`
          : `Account ${next === "active" ? "enabled" : "disabled"}`
      );
      await onRefresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Operation failed");
    }
  }

  function getRoleLabel(slug: string) {
    const s = summaries.find((sm) => sm.slug === slug);
    if (s) return s.label;
    if (slug === "owner") return isRtl ? "المالك (Owner)" : "Owner";
    if (slug === "admin") return isRtl ? "مدير النظام (Admin)" : "Administrator";
    if (slug === "sales") return isRtl ? "مدير مبيعات وتشغيل (Manager)" : "Manager";
    if (slug === "worker") return isRtl ? "فني مهام (Task Worker)" : "Task Worker";
    if (slug === "viewer") return isRtl ? "مشاهد (Viewer)" : "Viewer";
    return slug;
  }

  function getRoleBadgeVariant(slug: string) {
    if (slug === "owner") return "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-300";
    if (slug === "admin") return "bg-purple-500/15 text-purple-800 dark:text-purple-300 border-purple-300";
    if (slug === "sales") return "bg-blue-500/15 text-blue-800 dark:text-blue-300 border-blue-300";
    if (slug === "worker") return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-300";
    return "bg-slate-500/15 text-slate-800 dark:text-slate-300 border-slate-300";
  }

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-3 rounded-xl border">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute top-2.5 start-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={isRtl ? "البحث بالاسم أو البريد..." : "Search by name or email..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ps-9 h-9"
            />
          </div>
          <div className="flex items-center gap-1 border rounded-lg p-0.5 bg-muted/40">
            <Button
              variant={statusFilter === "all" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setStatusFilter("all")}
            >
              {isRtl ? "الكل" : "All"}
            </Button>
            <Button
              variant={statusFilter === "active" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setStatusFilter("active")}
            >
              {isRtl ? "نشط" : "Active"}
            </Button>
            <Button
              variant={statusFilter === "disabled" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setStatusFilter("disabled")}
            >
              {isRtl ? "معطل" : "Disabled"}
            </Button>
          </div>
        </div>

        <Button onClick={() => setCreateDialogOpen(true)} className="gap-2 h-9">
          <Plus className="h-4 w-4" />
          <span>{isRtl ? "إضافة موظف جديد" : "Add Employee"}</span>
        </Button>
      </div>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isRtl ? "الموظف" : "Employee"}</TableHead>
                <TableHead>{isRtl ? "ملف الصلاحيات / الدور" : "Access Profile / Role"}</TableHead>
                <TableHead>{isRtl ? "الحالة" : "Status"}</TableHead>
                <TableHead>{isRtl ? "تاريخ الإضافة" : "Added Date"}</TableHead>
                <TableHead className="text-end">{isRtl ? "الإجراءات" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {loading
                      ? isRtl ? "جاري تحميل بيانات الموظفين..." : "Loading employees..."
                      : isRtl ? "لا توجد نتائج مطابقة" : "No employees found."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((u) => {
                  const isRoleBuiltin = ["owner", "admin", "sales", "worker", "viewer"].includes(u.role);
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                            {u.display_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-sm flex items-center gap-1.5">
                              <span>{u.display_name}</span>
                              {u.role === "owner" && (
                                <Badge variant="outline" className="text-[10px] py-0 px-1 text-amber-600 border-amber-300">
                                  {isRtl ? "المالك" : "Owner"}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">{u.username}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 items-start">
                          <Badge
                            variant="outline"
                            className={`px-2 py-0.5 text-xs font-medium border ${getRoleBadgeVariant(u.role)}`}
                          >
                            {getRoleLabel(u.role)}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {isRoleBuiltin ? (isRtl ? "ملف أساسي" : "Predefined") : (isRtl ? "دور مخصص" : "Custom Role")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {u.status === "active" ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300">
                            {isRtl ? "نشط" : "Active"}
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="opacity-80">
                            {isRtl ? "معطل" : "Disabled"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1.5"
                            onClick={() => onAssignAccess(u)}
                            disabled={u.role === "owner" && currentRole !== "owner"}
                          >
                            <Key className="h-3.5 w-3.5 text-primary" />
                            <span>{isRtl ? "تعديل الصلاحيات" : "Change Access"}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => setEditUser(u)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-8 px-2 text-xs ${u.status === "active" ? "text-destructive hover:bg-destructive/10" : "text-emerald-600"}`}
                            onClick={() => handleToggleStatus(u)}
                            disabled={u.role === "owner"}
                            title={u.role === "owner" ? (isRtl ? "لا يمكن تعطيل حساب المالك" : "Cannot disable owner") : undefined}
                          >
                            <Power className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Employee Dialog */}
      <CreateUserDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        summaries={summaries}
        onCreated={onRefresh}
      />

      {/* Edit Employee Info Dialog */}
      {editUser && (
        <EditUserInfoDialog
          open={!!editUser}
          onClose={() => setEditUser(null)}
          user={editUser}
          onSaved={onRefresh}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   TAB 2: Predefined Access Profiles (ProfilesTabContent)
   ────────────────────────────────────────────────────────────────────────── */

function ProfilesTabContent({
  summaries,
  loading,
  onRefresh,
  onEditAccess,
}: {
  summaries: RoleSummaryData[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onEditAccess: (slug: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const adminSummary = summaries.find((s) => s.slug === "admin");
  const managerSummary = summaries.find((s) => s.slug === "sales");
  const workerSummary = summaries.find((s) => s.slug === "worker");
  const ownerSummary = summaries.find((s) => s.slug === "owner");
  const viewerSummary = summaries.find((s) => s.slug === "viewer");

  const setPermsFn = useServerFn(setRolePermissions);

  async function handleResetToDefaults(roleSlug: "admin" | "sales" | "worker") {
    const defaults = DEFAULT_ROLE_PERMISSIONS[roleSlug] || [];
    const confirmMsg = isRtl
      ? `هل أنت متأكد من رغبتك في استعادة الصلاحيات القياسية الافتراضية لهذا الملف؟ سيتم تطبيق التغييرات فوراً.`
      : `Are you sure you want to restore default factory permissions for this profile?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await setPermsFn({ data: { roleSlug, permissionSlugs: defaults } });
      toast.success(isRtl ? "تمت استعادة الصلاحيات القياسية بنجاح" : "Restored to factory defaults");
      await onRefresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Reset failed");
    }
  }

  return (
    <div className="space-y-6">
      {/* Intro Banner */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3.5">
        <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm space-y-1">
          <p className="font-semibold text-foreground">
            {isRtl
              ? "الملفات التعريفية الأساسية (Predefined Access Profiles)"
              : "Predefined Access Profiles"}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {isRtl
              ? "تغطي هذه الملفات الهيكل القياسي للمنشأة الصناعية، وتتميز بإمكانية تعديل وتخصيص صلاحيات كل ملف بالكامل بما يناسب طبيعة عملكم، وستسري التعديلات فوراً على كافة الموظفين المسند إليهم الملف."
              : "These profiles represent standard manufacturing organization structures. You can customize permissions for any profile freely; adjustments apply immediately to all assigned employees."}
          </p>
        </div>
      </div>

      {/* 3 Dynamic Profile Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Administrator */}
        <ProfileCard
          title={isRtl ? "مسؤول النظام (Administrator)" : "Administrator"}
          subtitle={isRtl ? "صلاحيات إدارية وتشغيلية كاملة" : "Full operational & administrative access"}
          badgeVariant="purple"
          icon={Shield}
          summary={adminSummary}
          onEdit={() => onEditAccess("admin")}
          onReset={() => handleResetToDefaults("admin")}
          isRtl={isRtl}
        />

        {/* Manager */}
        <ProfileCard
          title={isRtl ? "مدير مبيعات وتشغيل (Manager)" : "Operations & Sales Manager"}
          subtitle={isRtl ? "المبيعات والتعاقدات والإشراف التشغيلي" : "Commercial workflows, pipeline, and execution"}
          badgeVariant="blue"
          icon={UserCheck}
          summary={managerSummary}
          onEdit={() => onEditAccess("sales")}
          onReset={() => handleResetToDefaults("sales")}
          isRtl={isRtl}
        />

        {/* Task Worker */}
        <ProfileCard
          title={isRtl ? "فني مهام (Task Worker)" : "Task Worker"}
          subtitle={isRtl ? "مساحة تنفيذ المهام الميدانية والمصنعية" : "Shop-floor and field execution workspace"}
          badgeVariant="emerald"
          icon={CheckSquare}
          summary={workerSummary}
          onEdit={() => onEditAccess("worker")}
          onReset={() => handleResetToDefaults("worker")}
          isRtl={isRtl}
        />
      </div>

      {/* Reserved System Roles Section */}
      <div className="pt-4 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {isRtl ? "الملفات الخاصة بالنظام (System Reserved Roles)" : "System Reserved Roles"}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Owner */}
          <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-500/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2 text-amber-800 dark:text-amber-400">
                  <Shield className="h-5 w-5 text-amber-600" />
                  <span>{isRtl ? "المالك (Owner)" : "Super Administrator (Owner)"}</span>
                </CardTitle>
                <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
                  {isRtl ? "غير قابل للتعديل" : "Immutable"}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                {isRtl
                  ? "المالك الرئيسي لمساحة العمل. يمتلك وصولاً غير مشروط وغير مقيد لكافة بيانات ووظائف النظام دون إمكانية إلغاء أو تقييد صلاحياته برمجياً."
                  : "The tenant account owner with unconditional, immutable full access across all modules."}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground flex items-center justify-between">
              <span>{isRtl ? `المستخدمون المسندون: ${ownerSummary?.assignedUserCount ?? 1}` : `Assigned users: ${ownerSummary?.assignedUserCount ?? 1}`}</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">22 / 22 قسم متاح</span>
            </CardContent>
          </Card>

          {/* Viewer */}
          <Card className="border-slate-200 dark:border-slate-800 bg-slate-500/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2 text-slate-800 dark:text-slate-300">
                  <Eye className="h-5 w-5 text-slate-500" />
                  <span>{isRtl ? "مشاهد تدقيق (Auditor / Viewer)" : "Auditor / Viewer"}</span>
                </CardTitle>
                <Badge variant="outline" className="text-slate-600">
                  {isRtl ? "عرض فقط" : "Read-Only"}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                {isRtl
                  ? "ملف متوافق للاطلاع والتدقيق الخارجي. يمكنه تصفح السجلات والتقارير المصرح بها دون أي صلاحية إنشاء أو تعديل أو حذف."
                  : "Backward-compatible read-only profile for external auditing and read-only inspection."}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground flex items-center justify-between">
              <span>{isRtl ? `المستخدمون المسندون: ${viewerSummary?.assignedUserCount ?? 0}` : `Assigned users: ${viewerSummary?.assignedUserCount ?? 0}`}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onEditAccess("viewer")}
              >
                {isRtl ? "تعديل الصلاحيات" : "Edit Access"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ProfileCard({
  title,
  subtitle,
  badgeVariant,
  icon: Icon,
  summary,
  onEdit,
  onReset,
  isRtl,
}: {
  title: string;
  subtitle: string;
  badgeVariant: "purple" | "blue" | "emerald";
  icon: any;
  summary: RoleSummaryData | undefined;
  onEdit: () => void;
  onReset: () => void;
  isRtl: boolean;
}) {
  const accessibleCount = summary?.accessibleSectionCount ?? 0;
  const userCount = summary?.assignedUserCount ?? 0;
  const sampleSections = summary?.accessibleSectionNames ?? [];

  const borderColors = {
    purple: "border-purple-200 dark:border-purple-900/60 hover:border-purple-400",
    blue: "border-blue-200 dark:border-blue-900/60 hover:border-blue-400",
    emerald: "border-emerald-200 dark:border-emerald-900/60 hover:border-emerald-400",
  };

  const badgeColors = {
    purple: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-200",
    blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200",
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200",
  };

  return (
    <Card className={`transition-all duration-200 flex flex-col justify-between ${borderColors[badgeVariant]}`}>
      <div>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between mb-1">
            <div className="p-2 rounded-lg bg-muted flex items-center justify-center">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <Badge variant="outline" className={`text-xs px-2 py-0.5 font-medium ${badgeColors[badgeVariant]}`}>
              {isRtl ? `${userCount} موظف مسند` : `${userCount} active users`}
            </Badge>
          </div>
          <CardTitle className="text-lg font-bold">{title}</CardTitle>
          <CardDescription className="text-xs line-clamp-2">{subtitle}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 pt-0">
          {/* Section Counter Metric */}
          <div className="p-2.5 rounded-lg bg-muted/50 border flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground">
              {isRtl ? "الأقسام المتاحة للملف:" : "Accessible Sections:"}
            </span>
            <span className="font-mono font-bold text-sm text-foreground">
              {accessibleCount} / 22
            </span>
          </div>

          {/* Sample Sections Tags */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              {isRtl ? "أبرز الأقسام المشمولة:" : "Sample Sections:"}
            </span>
            <div className="flex flex-wrap gap-1 min-h-[48px]">
              {sampleSections.length === 0 ? (
                <span className="text-xs text-muted-foreground italic">
                  {isRtl ? "لا توجد أقسام مفعلة" : "No sections enabled"}
                </span>
              ) : (
                sampleSections.slice(0, 5).map((name, i) => (
                  <Badge key={i} variant="secondary" className="text-[11px] font-normal py-0 px-2">
                    {name}
                  </Badge>
                ))
              )}
              {sampleSections.length > 5 && (
                <Badge variant="outline" className="text-[10px] py-0 px-1 text-muted-foreground">
                  +{sampleSections.length - 5}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </div>

      <CardFooter className="pt-3 border-t flex items-center gap-2 bg-muted/20">
        <Button onClick={onEdit} className="flex-1 h-9 gap-1.5 text-xs font-semibold">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>{isRtl ? "تعديل الصلاحيات" : "Edit Access"}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onReset}
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          title={isRtl ? "استعادة الصلاحيات الافتراضية للملف" : "Reset to factory defaults"}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   TAB 3: Custom Roles (CustomRolesTabContent)
   ────────────────────────────────────────────────────────────────────────── */

function CustomRolesTabContent({
  summaries,
  loading,
  onRefresh,
  onEditAccess,
}: {
  summaries: RoleSummaryData[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onEditAccess: (slug: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [createRoleOpen, setCreateRoleOpen] = useState(false);
  const [editRole, setEditRole] = useState<RoleSummaryData | null>(null);

  const customRoles = summaries.filter((s) => !s.isBuiltin);
  const deleteRoleFn = useServerFn(deleteTenantRole);

  async function handleDeleteRole(role: RoleSummaryData) {
    if (role.assignedUserCount > 0) {
      toast.error(
        isRtl
          ? `لا يمكن حذف هذا الدور لأنه مسند حالياً إلى ${role.assignedUserCount} موظف. يرجى نقل الموظفين لدور آخر أولاً.`
          : `Cannot delete role: ${role.assignedUserCount} users are currently assigned to it.`
      );
      return;
    }

    const confirmMsg = isRtl
      ? `هل أنت متأكد من حذف الدور المخصص "${role.label}" نهائياً؟`
      : `Are you sure you want to permanently delete custom role "${role.label}"?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await deleteRoleFn({ data: { slug: role.slug } });
      toast.success(isRtl ? "تم حذف الدور المخصص بنجاح" : "Role deleted successfully");
      await onRefresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Delete failed");
    }
  }

  return (
    <div className="space-y-4">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-3 rounded-xl border">
        <div>
          <h2 className="text-base font-semibold">
            {isRtl ? "الأدوار المخصصة لمؤسستك" : "Tenant Custom Roles"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {isRtl
              ? "أنشئ أدواراً مخصصة تناسب مسارات عمل مصنعك (مثل: مشرف مستودع، مهندس تصميم، مراقب جودة)"
              : "Create custom roles tailored to your facility operations with dedicated permissions."}
          </p>
        </div>

        <Button onClick={() => setCreateRoleOpen(true)} className="gap-2 h-9">
          <Plus className="h-4 w-4" />
          <span>{isRtl ? "إنشاء دور مخصص جديد" : "Create New Custom Role"}</span>
        </Button>
      </div>

      {/* Custom Roles List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {customRoles.length === 0 ? (
          <div className="col-span-2 text-center py-12 border rounded-xl bg-card text-muted-foreground space-y-3">
            <Key className="h-8 w-8 mx-auto text-muted-foreground/60" />
            <p className="text-sm font-medium">
              {isRtl ? "لم يتم إنشاء أدوار مخصصة حتى الآن" : "No custom roles created yet."}
            </p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {isRtl
                ? "يمكنك إنشاء دور جديد مخصص وتحديد أقسامه وصلاحياته بدقة، وتعيينه لأي موظف."
                : "Create custom roles to meet specific job requirements outside the standard predefined profiles."}
            </p>
            <Button variant="outline" size="sm" onClick={() => setCreateRoleOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              <span>{isRtl ? "إنشاء أول دور مخصص" : "Create First Custom Role"}</span>
            </Button>
          </div>
        ) : (
          customRoles.map((r) => (
            <Card key={r.slug} className="flex flex-col justify-between border hover:border-primary/40 transition-colors">
              <div>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="font-mono text-xs font-semibold">
                      {r.slug}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={r.assignedUserCount > 0 ? "border-primary/40 text-primary" : "text-muted-foreground"}
                    >
                      {isRtl ? `${r.assignedUserCount} موظف مسند` : `${r.assignedUserCount} users`}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg font-bold mt-1">{r.label}</CardTitle>
                  <CardDescription className="text-xs line-clamp-2">
                    {r.description || (isRtl ? "لا يوجد وصف مدخل" : "No description provided.")}
                  </CardDescription>
                </CardHeader>

                <CardContent className="pt-0 space-y-2">
                  <div className="p-2 rounded bg-muted/40 border flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{isRtl ? "الأقسام المتاحة:" : "Accessible Sections:"}</span>
                    <span className="font-mono font-bold text-primary">{r.accessibleSectionCount} / 22</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {r.accessibleSectionNames.slice(0, 4).map((name, idx) => (
                      <Badge key={idx} variant="secondary" className="text-[11px] py-0 px-1.5 font-normal">
                        {name}
                      </Badge>
                    ))}
                    {r.accessibleSectionNames.length > 4 && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1 text-muted-foreground">
                        +{r.accessibleSectionNames.length - 4}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </div>

              <CardFooter className="pt-3 border-t flex items-center justify-between bg-muted/20 gap-2">
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5 flex-1"
                  onClick={() => onEditAccess(r.slug)}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>{isRtl ? "تعديل الصلاحيات" : "Edit Access"}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => setEditRole(r)}
                  title={isRtl ? "تعديل الاسم والوصف" : "Edit Details"}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10"
                  onClick={() => handleDeleteRole(r)}
                  disabled={r.assignedUserCount > 0}
                  title={r.assignedUserCount > 0 ? (isRtl ? "لا يمكن حذف دور مسند إليه موظفون" : "Cannot delete role with assigned users") : undefined}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardFooter>
            </Card>
          ))
        )}
      </div>

      {/* Create Custom Role Dialog */}
      <CreateCustomRoleDialog
        open={createRoleOpen}
        onClose={() => setCreateRoleOpen(false)}
        summaries={summaries}
        onCreated={onRefresh}
      />

      {/* Edit Role Details Dialog */}
      {editRole && (
        <EditRoleDetailsDialog
          open={!!editRole}
          onClose={() => setEditRole(null)}
          role={editRole}
          onSaved={onRefresh}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   THE CORE VISUAL ACCESS EDITOR DIALOG
   ────────────────────────────────────────────────────────────────────────── */

function AccessEditorDialog({
  open,
  onClose,
  role,
  allRoles,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  role: RoleSummaryData;
  allRoles: RoleSummaryData[];
  onSaved: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [perms, setPerms] = useState<Set<string>>(() => new Set(role.permissions));
  const [initialPerms] = useState<Set<string>>(() => new Set(role.permissions));
  const [search, setSearch] = useState("");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [catalogPerms, setCatalogPerms] = useState<{ slug: string; label: string; category: string }[]>([]);

  const setRolePermsFn = useServerFn(setRolePermissions);
  const listPermsFn = useServerFn(listPermissions);

  useEffect(() => {
    (async () => {
      try {
        const res = await listPermsFn();
        setCatalogPerms((res.items as any[]) ?? []);
      } catch (e) {
        // silent
      }
    })();
  }, []);

  const hasUnsavedChanges = useMemo(() => {
    if (perms.size !== initialPerms.size) return true;
    for (const p of perms) {
      if (!initialPerms.has(p)) return true;
    }
    return false;
  }, [perms, initialPerms]);

  // Accessible sections count metric
  const accessibleCount = useMemo(() => {
    return APPLICATION_SECTIONS.filter((sec) => {
      const level = computeSectionLevel(perms, sec);
      return level !== "none";
    }).length;
  }, [perms]);

  // Special permissions count
  const specialActiveCount = useMemo(() => {
    return SPECIAL_ACCESS_ITEMS.filter((sp) => perms.has(sp.slug)).length;
  }, [perms]);

  function handleSetLevel(sec: SectionMeta, level: SimpleAccessLevel) {
    const next = applySectionLevel(perms, sec, level);
    setPerms(next);
  }

  function handleToggleGranularPerm(slug: string) {
    const next = new Set(perms);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setPerms(next);
  }

  function handleQuickClearAll() {
    if (window.confirm(isRtl ? "هل أنت متأكد من تصفير كافة صلاحيات هذا الدور؟" : "Clear all permissions?")) {
      setPerms(new Set());
    }
  }

  function handleQuickSetAllView() {
    const next = new Set<string>();
    for (const sec of APPLICATION_SECTIONS) {
      for (const p of sec.viewPerms) next.add(p);
    }
    setPerms(next);
  }

  function handleCopyFrom(fromSlug: string) {
    const target = allRoles.find((r) => r.slug === fromSlug);
    if (!target) return;
    setPerms(new Set(target.permissions));
    toast.success(
      isRtl ? `تم نسخ الصلاحيات من "${target.label}"` : `Copied permissions from "${target.label}"`
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await setRolePermsFn({
        data: {
          roleSlug: role.slug,
          permissionSlugs: Array.from(perms),
        },
      });
      toast.success(isRtl ? "تم حفظ وتطبيق الصلاحيات بنجاح" : "Permissions saved successfully");
      await onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  }

  const filteredSections = useMemo(() => {
    if (!search.trim()) return APPLICATION_SECTIONS;
    const q = search.toLowerCase();
    return APPLICATION_SECTIONS.filter(
      (sec) =>
        sec.defaultTitle.toLowerCase().includes(q) ||
        sec.defaultDesc.toLowerCase().includes(q) ||
        sec.id.toLowerCase().includes(q)
    );
  }, [search]);

  const coreSections = filteredSections.filter((s) => s.category === "core");
  const catalogSections = filteredSections.filter((s) => s.category === "catalog");
  const systemSections = filteredSections.filter((s) => s.category === "system");

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Sticky Top Toolbar */}
        <div className="p-4 sm:p-5 border-b bg-card/95 backdrop-blur space-y-3 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  <SlidersHorizontal className="h-5 w-5 text-primary" />
                  <span>
                    {isRtl ? `تعديل الصلاحيات: ${role.label}` : `Edit Access: ${role.label}`}
                  </span>
                </DialogTitle>
                <Badge variant="outline" className="font-mono text-xs">
                  {role.slug}
                </Badge>
              </div>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {isRtl
                  ? "حدد مستوى الوصول لكل قسم من الأقسام الـ 22 ثم احفظ التغييرات"
                  : "Select the access level for each of the 22 sections, then save changes."}
              </DialogDescription>
            </div>

            {/* Quick Metrics */}
            <div className="flex items-center gap-2">
              <div className="px-3 py-1 rounded-lg bg-primary/10 border border-primary/20 text-xs flex items-center gap-2">
                <span className="text-muted-foreground">{isRtl ? "الأقسام المتاحة:" : "Accessible:"}</span>
                <span className="font-bold text-primary font-mono">{accessibleCount} / 22</span>
              </div>
              <div className="px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs flex items-center gap-2">
                <span className="text-muted-foreground">{isRtl ? "صلاحيات خاصة:" : "Special:"}</span>
                <span className="font-bold text-amber-700 dark:text-amber-400 font-mono">
                  {specialActiveCount} / {SPECIAL_ACCESS_ITEMS.length}
                </span>
              </div>
            </div>
          </div>

          {/* Active Users Warning Banner */}
          {role.assignedUserCount > 0 && (
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs flex items-center gap-2 text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                {isRtl
                  ? `تنبيه فوري: هذا الملف مسند حالياً إلى ${role.assignedUserCount} موظف. أي تعديل يتم حفظه سينعكس عليهم فوراً بدون الحاجة لتسجيل الخروج.`
                  : `Active Impact: This role is currently assigned to ${role.assignedUserCount} user(s). Changes take effect immediately upon saving.`}
              </span>
            </div>
          )}

          {/* Quick Actions & Search Row */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute top-2.5 start-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={isRtl ? "تصفية الأقسام..." : "Filter sections..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 ps-8 text-xs"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={handleQuickSetAllView}
              >
                {isRtl ? "تعيين الكل كعرض فقط" : "Set All View Only"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs text-destructive hover:bg-destructive/10"
                onClick={handleQuickClearAll}
              >
                {isRtl ? "تصفير الكل" : "Clear All"}
              </Button>

              {/* Copy From Other Role Select */}
              <select
                className="h-8 text-xs border rounded-md px-2 bg-background text-foreground"
                onChange={(e) => {
                  if (e.target.value) {
                    handleCopyFrom(e.target.value);
                    e.target.value = "";
                  }
                }}
                defaultValue=""
              >
                <option value="" disabled>
                  {isRtl ? "نسخ الصلاحيات من..." : "Copy access from..."}
                </option>
                {allRoles
                  .filter((r) => r.slug !== role.slug)
                  .map((r) => (
                    <option key={r.slug} value={r.slug}>
                      {r.label}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>

        {/* Scrollable Sections List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Category 1: Core Operations */}
          {coreSections.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b pb-1.5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <ClipboardList className="h-4 w-4" />
                  <span>{isRtl ? "العمليات الأساسية والتعاقدات (14 قسماً)" : "Core Operations (14 Sections)"}</span>
                </h3>
              </div>
              <div className="space-y-2.5">
                {coreSections.map((sec) => (
                  <SectionRow
                    key={sec.id}
                    sec={sec}
                    perms={perms}
                    isExpanded={!!expandedSections[sec.id]}
                    onToggleExpand={() =>
                      setExpandedSections((prev) => ({ ...prev, [sec.id]: !prev[sec.id] }))
                    }
                    onSetLevel={(lvl) => handleSetLevel(sec, lvl)}
                    onToggleGranularPerm={handleToggleGranularPerm}
                    catalogPerms={catalogPerms}
                    isRtl={isRtl}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Category 2: Catalog & Production */}
          {catalogSections.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-b pb-1.5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <Package className="h-4 w-4" />
                  <span>{isRtl ? "الكتالوج والإنتاج والمستودع (5 أقسام)" : "Catalog & Production (5 Sections)"}</span>
                </h3>
              </div>
              <div className="space-y-2.5">
                {catalogSections.map((sec) => (
                  <SectionRow
                    key={sec.id}
                    sec={sec}
                    perms={perms}
                    isExpanded={!!expandedSections[sec.id]}
                    onToggleExpand={() =>
                      setExpandedSections((prev) => ({ ...prev, [sec.id]: !prev[sec.id] }))
                    }
                    onSetLevel={(lvl) => handleSetLevel(sec, lvl)}
                    onToggleGranularPerm={handleToggleGranularPerm}
                    catalogPerms={catalogPerms}
                    isRtl={isRtl}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Category 3: System & Administration */}
          {systemSections.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-b pb-1.5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <Settings className="h-4 w-4" />
                  <span>{isRtl ? "إدارة النظام والإعدادات (3 أقسام)" : "System & Administration (3 Sections)"}</span>
                </h3>
              </div>
              <div className="space-y-2.5">
                {systemSections.map((sec) => (
                  <SectionRow
                    key={sec.id}
                    sec={sec}
                    perms={perms}
                    isExpanded={!!expandedSections[sec.id]}
                    onToggleExpand={() =>
                      setExpandedSections((prev) => ({ ...prev, [sec.id]: !prev[sec.id] }))
                    }
                    onSetLevel={(lvl) => handleSetLevel(sec, lvl)}
                    onToggleGranularPerm={handleToggleGranularPerm}
                    catalogPerms={catalogPerms}
                    isRtl={isRtl}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Category 4: Special Sensitive Access Section */}
          <div className="space-y-3 pt-4 border-t">
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-600" />
                <h3 className="text-sm font-bold text-amber-900 dark:text-amber-300">
                  {isRtl ? "الصلاحيات الخاصة والحساسة (Special Access)" : "Special Sensitive Access Authorities"}
                </h3>
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-400 mt-1 leading-relaxed">
                {isRtl
                  ? "هذه العمليات تتطلب تفويضاً إدارياً صريحاً ولا تُمنح تلقائياً ضمن المستويات البسيطة (عمل / إدارة)، للحفاظ على سرية الأرباح ومنع الحذف غير المقصود."
                  : "These sensitive authorities require explicit executive toggling and are never silently bundled into basic access levels."}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {SPECIAL_ACCESS_ITEMS.map((item) => {
                const isActive = perms.has(item.slug);
                return (
                  <div
                    key={item.id}
                    onClick={() => handleToggleGranularPerm(item.slug)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none ${
                      isActive
                        ? "bg-amber-500/5 border-amber-400 shadow-sm"
                        : "bg-card border-border hover:bg-muted/30"
                    }`}
                  >
                    <Checkbox
                      checked={isActive}
                      onCheckedChange={() => handleToggleGranularPerm(item.slug)}
                      className="mt-1"
                    />
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">
                          {item.defaultTitle}
                        </span>
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] py-0 text-muted-foreground"
                        >
                          {item.slug}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-normal">
                        {item.defaultDesc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="p-4 border-t bg-card flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {hasUnsavedChanges ? (
              <Badge variant="outline" className="border-amber-400 text-amber-600 flex items-center gap-1.5 text-xs py-1">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                <span>{isRtl ? "يوجد تعديلات غير محفوظة" : "Unsaved changes"}</span>
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">
                {isRtl ? "تمت مطابقة كافة الصلاحيات" : "All changes saved."}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2 px-5 font-semibold">
              <Save className="h-4 w-4" />
              <span>{saving ? (isRtl ? "جاري الحفظ..." : "Saving...") : (isRtl ? "حفظ ملف الصلاحيات" : "Save Access Profile")}</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionRow({
  sec,
  perms,
  isExpanded,
  onToggleExpand,
  onSetLevel,
  onToggleGranularPerm,
  catalogPerms,
  isRtl,
}: {
  sec: SectionMeta;
  perms: Set<string>;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSetLevel: (lvl: SimpleAccessLevel) => void;
  onToggleGranularPerm: (slug: string) => void;
  catalogPerms: { slug: string; label: string; category: string }[];
  isRtl: boolean;
}) {
  const Icon = getSectionIcon(sec.iconName);
  const currentLevel = computeSectionLevel(perms, sec);

  // All granular permissions associated with this section
  const sectionPermSlugs = Array.from(new Set([...sec.viewPerms, ...sec.workPerms, ...sec.managePerms]));

  function getLevelBadge() {
    if (currentLevel === "manage") {
      return (
        <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-300 text-[11px] font-medium">
          {isRtl ? "إدارة كاملة" : "Manage"}
        </Badge>
      );
    }
    if (currentLevel === "work") {
      return (
        <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-300 text-[11px] font-medium">
          {isRtl ? "عمل وتشغيل" : "Work"}
        </Badge>
      );
    }
    if (currentLevel === "view") {
      return (
        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300 text-[11px] font-medium">
          {isRtl ? "عرض فقط" : "View Only"}
        </Badge>
      );
    }
    if (currentLevel === "custom") {
      return (
        <Badge variant="outline" className="border-amber-400 text-amber-600 text-[11px] font-medium">
          {isRtl ? "مخصص" : "Custom"}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-muted-foreground text-[11px]">
        {isRtl ? "محجوب" : "No Access"}
      </Badge>
    );
  }

  return (
    <div className="border rounded-xl bg-card transition-all">
      <div className="p-3 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Section Info */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="p-2 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div className="space-y-0.5 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-foreground">{sec.defaultTitle}</span>
              {getLevelBadge()}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1">{sec.defaultDesc}</p>
          </div>
        </div>

        {/* 4 Access Levels Selector (Segmented Control) */}
        <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg border shrink-0">
          <Button
            type="button"
            variant={currentLevel === "none" ? "secondary" : "ghost"}
            size="sm"
            className={`h-7 px-2.5 text-xs font-medium ${
              currentLevel === "none" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
            }`}
            onClick={() => onSetLevel("none")}
          >
            {isRtl ? "لا وصول" : "No Access"}
          </Button>
          <Button
            type="button"
            variant={currentLevel === "view" ? "secondary" : "ghost"}
            size="sm"
            className={`h-7 px-2.5 text-xs font-medium ${
              currentLevel === "view" ? "bg-background text-emerald-700 dark:text-emerald-300 shadow-xs" : "text-muted-foreground"
            }`}
            onClick={() => onSetLevel("view")}
          >
            {isRtl ? "عرض فقط" : "View"}
          </Button>
          <Button
            type="button"
            variant={currentLevel === "work" ? "secondary" : "ghost"}
            size="sm"
            className={`h-7 px-2.5 text-xs font-medium ${
              currentLevel === "work" ? "bg-background text-blue-700 dark:text-blue-300 shadow-xs" : "text-muted-foreground"
            }`}
            onClick={() => onSetLevel("work")}
          >
            {isRtl ? "عمل" : "Work"}
          </Button>
          <Button
            type="button"
            variant={currentLevel === "manage" ? "secondary" : "ghost"}
            size="sm"
            className={`h-7 px-2.5 text-xs font-medium ${
              currentLevel === "manage" ? "bg-background text-purple-700 dark:text-purple-300 shadow-xs" : "text-muted-foreground"
            }`}
            onClick={() => onSetLevel("manage")}
          >
            {isRtl ? "إدارة كاملة" : "Manage"}
          </Button>
        </div>

        {/* Toggle Expand Accordion */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground shrink-0"
          onClick={onToggleExpand}
          title={isRtl ? "إعدادات متقدمة تفصيلية" : "Advanced Granular Settings"}
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {/* Expandable Granular Permissions Accordion */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t bg-muted/20 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
            <span>{isRtl ? "الصلاحيات البرمجية التفصيلية لهذا القسم:" : "Granular Permissions:"}</span>
            <span>{isRtl ? "تعديل الصلاحيات الفردية يزامن المستوى تلقائياً" : "Syncs bidirectionally"}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {sectionPermSlugs.map((slug) => {
              const isChecked = perms.has(slug);
              const pInfo = catalogPerms.find((cp) => cp.slug === slug);
              return (
                <div
                  key={slug}
                  onClick={() => onToggleGranularPerm(slug)}
                  className={`p-2 rounded-lg border text-xs cursor-pointer flex items-center gap-2 select-none ${
                    isChecked
                      ? "bg-primary/5 border-primary/30 text-foreground"
                      : "bg-background border-border text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => onToggleGranularPerm(slug)}
                  />
                  <div className="truncate flex-1">
                    <span className="font-mono text-[11px] block truncate">{slug}</span>
                    {pInfo?.label && (
                      <span className="text-[10px] text-muted-foreground block truncate">
                        {pInfo.label}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   ASSIGN EMPLOYEE ACCESS DIALOG (Choose Employee Access)
   ────────────────────────────────────────────────────────────────────────── */

function AssignEmployeeAccessDialog({
  open,
  onClose,
  user,
  summaries,
  onSaved,
  onEditRolePermissions,
}: {
  open: boolean;
  onClose: () => void;
  user: AppUserRow;
  summaries: RoleSummaryData[];
  onSaved: () => Promise<void>;
  onEditRolePermissions: (slug: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const { currentRole } = useAuth();

  const [selectedRole, setSelectedRole] = useState<string>(user.role || "worker");
  const [saving, setSaving] = useState(false);

  const updateUserFn = useServerFn(updateAppUser);

  const selectedSummary = summaries.find((s) => s.slug === selectedRole);

  const predefinedProfiles = [
    {
      slug: "admin",
      title: isRtl ? "مسؤول النظام (Administrator)" : "Administrator",
      desc: isRtl
        ? "وصول كامل وشامل لكافة عمليات المصنع والإعدادات والتقارير المالية"
        : "Full administrative access across operations, finances, and settings",
      badge: isRtl ? "إداري شامل" : "Full Admin",
    },
    {
      slug: "sales",
      title: isRtl ? "مدير مبيعات وتشغيل (Manager)" : "Operations & Sales Manager",
      desc: isRtl
        ? "إدارة خط المبيعات وعروض الأسعار والعملاء ومتابعة الإنتاج والتسليم"
        : "Commercial workflows, pipeline management, and operational oversight",
      badge: isRtl ? "إشراف تشغيلي" : "Managerial",
    },
    {
      slug: "worker",
      title: isRtl ? "فني مهام (Task Worker)" : "Task Worker",
      desc: isRtl
        ? "مساحة عمل مخصصة للمصنع والورشة لتنفيذ المهام المسندة وتحديث حالتها"
        : "Dedicated task-execution workspace for factory and site staff",
      badge: isRtl ? "تنفيذ ميداني" : "Field Work",
    },
    {
      slug: "viewer",
      title: isRtl ? "مشاهد (Auditor / Viewer)" : "Viewer",
      desc: isRtl
        ? "صلاحية العرض والاطلاع فقط دون إمكانية التعديل أو الحذف"
        : "Backward-compatible read-only access for auditing",
      badge: isRtl ? "عرض فقط" : "Read-Only",
    },
  ];

  const customRoles = summaries.filter((s) => !s.isBuiltin);

  async function handleSave() {
    if (user.role === "owner" && selectedRole !== "owner" && currentRole !== "owner") {
      toast.error(isRtl ? "لا يمكن تعديل صلاحيات حساب المالك" : "Cannot modify owner role");
      return;
    }

    setSaving(true);
    try {
      await updateUserFn({
        data: {
          userId: user.id,
          role: selectedRole,
        },
      });
      toast.success(isRtl ? "تم تحديث صلاحيات الموظف بنجاح" : "Employee access updated successfully");
      await onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update employee role");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b bg-card space-y-2 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-base">
              {user.display_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">
                {isRtl ? "اختيار وتعيين صلاحيات الموظف" : "Choose Employee Access"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {user.display_name} ({user.username})
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Group 1: Predefined Profiles */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {isRtl ? "الملفات التعريفية الأساسية" : "Predefined Access Profiles"}
              </h4>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {predefinedProfiles.map((p) => {
                const isSelected = selectedRole === p.slug;
                return (
                  <div
                    key={p.slug}
                    onClick={() => setSelectedRole(p.slug)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none ${
                      isSelected
                        ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary/20"
                        : "bg-card hover:bg-muted/30 border-border"
                    }`}
                  >
                    <div className="mt-1">
                      <div
                        className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                          isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground"
                        }`}
                      >
                        {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-background" />}
                      </div>
                    </div>
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-foreground">{p.title}</span>
                        <Badge variant="secondary" className="text-[11px] font-medium">
                          {p.badge}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{p.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Group 2: Custom Roles */}
          {customRoles.length > 0 && (
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-primary" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {isRtl ? "الأدوار المخصصة للمنشأة" : "Tenant Custom Roles"}
                </h4>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {customRoles.map((r) => {
                  const isSelected = selectedRole === r.slug;
                  return (
                    <div
                      key={r.slug}
                      onClick={() => setSelectedRole(r.slug)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none ${
                        isSelected
                          ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary/20"
                          : "bg-card hover:bg-muted/30 border-border"
                      }`}
                    >
                      <div className="mt-1">
                        <div
                          className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                            isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground"
                          }`}
                        >
                          {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-background" />}
                        </div>
                      </div>
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-foreground">{r.label}</span>
                          <Badge variant="outline" className="font-mono text-[11px]">
                            {r.accessibleSectionCount} / 22 قسم
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {r.description || (isRtl ? "دور مخصص تم تكوينه لحسابكم" : "Custom configured role")}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Live Preview Summary Card */}
          {selectedSummary && (
            <div className="p-4 rounded-xl bg-muted/40 border space-y-3 pt-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <SlidersHorizontal className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-xs text-foreground">
                    {isRtl ? "نظرة عامة على الصلاحيات المحددة:" : "Permissions Overview for Selected Role:"}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => onEditRolePermissions(selectedRole)}
                >
                  <Pencil className="h-3 w-3" />
                  <span>{isRtl ? "تعديل صلاحيات هذا الدور" : "Customize Permissions"}</span>
                </Button>
              </div>

              <div className="flex items-center justify-between text-xs p-2 rounded bg-background border">
                <span className="text-muted-foreground">{isRtl ? "الأقسام المتاحة للموظف:" : "Accessible Sections:"}</span>
                <span className="font-bold font-mono text-primary text-sm">
                  {selectedSummary.accessibleSectionCount} / 22 قسم
                </span>
              </div>

              <div className="flex flex-wrap gap-1">
                {selectedSummary.accessibleSectionNames.slice(0, 7).map((name, i) => (
                  <Badge key={i} variant="secondary" className="text-[11px] font-normal py-0 px-2">
                    {name}
                  </Badge>
                ))}
                {selectedSummary.accessibleSectionNames.length > 7 && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1 text-muted-foreground">
                    +{selectedSummary.accessibleSectionNames.length - 7}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-card flex items-center justify-end gap-2 shrink-0">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {isRtl ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={handleSave} disabled={saving} className="px-5 font-semibold gap-2">
            <Check className="h-4 w-4" />
            <span>{saving ? (isRtl ? "جاري الحفظ..." : "Saving...") : (isRtl ? "حفظ وتعيين الصلاحية" : "Save Assignment")}</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   CREATE EMPLOYEE DIALOG
   ────────────────────────────────────────────────────────────────────────── */

function CreateUserDialog({
  open,
  onClose,
  summaries,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  summaries: RoleSummaryData[];
  onCreated: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [form, setForm] = useState({
    username: "",
    displayName: "",
    password: "",
    role: "worker",
  });
  const [submitting, setSubmitting] = useState(false);

  const createFn = useServerFn(createAppUser);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.username || !form.displayName || !form.password) {
      toast.error(isRtl ? "يرجى تعبئة كافة الحقول المطلوبة" : "Please fill all required fields");
      return;
    }

    setSubmitting(true);
    try {
      await createFn({ data: form });
      toast.success(isRtl ? "تم إنشاء حساب الموظف بنجاح" : "Employee account created");
      await onCreated();
      onClose();
      setForm({ username: "", displayName: "", password: "", role: "worker" });
    } catch (err: any) {
      toast.error(err?.message ?? "Creation failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isRtl ? "إضافة موظف جديد" : "Add New Employee"}</DialogTitle>
          <DialogDescription>
            {isRtl
              ? "أنشئ حساباً جديداً للموظف وحدد ملف الصلاحيات المناسب له"
              : "Create a new employee account and assign their access profile."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="displayName">{isRtl ? "الاسم الكامل للموظف" : "Full Name"}</Label>
            <Input
              id="displayName"
              required
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder={isRtl ? "أحمد محمود" : "Ahmed Mahmoud"}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="username">{isRtl ? "البريد الإلكتروني / اسم المستخدم" : "Email / Username"}</Label>
            <Input
              id="username"
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="employee@factory.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">{isRtl ? "كلمة المرور الأولية" : "Initial Password"}</Label>
            <Input
              id="password"
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="roleSelect">{isRtl ? "ملف الصلاحيات / الدور" : "Access Profile / Role"}</Label>
            <select
              id="roleSelect"
              className="w-full h-10 border rounded-md px-3 bg-background text-sm text-foreground"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <optgroup label={isRtl ? "الملفات الأساسية" : "Predefined Profiles"}>
                <option value="worker">{isRtl ? "فني مهام (Task Worker)" : "Task Worker"}</option>
                <option value="sales">{isRtl ? "مدير مبيعات وتشغيل (Manager)" : "Manager"}</option>
                <option value="admin">{isRtl ? "مسؤول النظام (Administrator)" : "Administrator"}</option>
                <option value="viewer">{isRtl ? "مشاهد (Viewer)" : "Viewer"}</option>
              </optgroup>
              {summaries.some((s) => !s.isBuiltin) && (
                <optgroup label={isRtl ? "الأدوار المخصصة" : "Custom Roles"}>
                  {summaries
                    .filter((s) => !s.isBuiltin)
                    .map((r) => (
                      <option key={r.slug} value={r.slug}>
                        {r.label}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="ghost" type="button" onClick={onClose} disabled={submitting}>
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (isRtl ? "جاري الإنشاء..." : "Creating...") : (isRtl ? "إنشاء الموظف" : "Create Employee")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   EDIT EMPLOYEE INFO & PASSWORD DIALOG
   ────────────────────────────────────────────────────────────────────────── */

function EditUserInfoDialog({
  open,
  onClose,
  user,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  user: AppUserRow;
  onSaved: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [displayName, setDisplayName] = useState(user.display_name);
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const updateFn = useServerFn(updateAppUser);
  const resetPassFn = useServerFn(resetUserPassword);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (displayName !== user.display_name) {
        await updateFn({ data: { userId: user.id, displayName } });
      }
      if (newPassword.trim()) {
        await resetPassFn({ data: { userId: user.id, newPassword } });
      }
      toast.success(isRtl ? "تم حفظ البيانات بنجاح" : "Employee details updated");
      await onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isRtl ? "تعديل بيانات الموظف" : "Edit Employee Details"}</DialogTitle>
          <DialogDescription>{user.username}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="editName">{isRtl ? "الاسم الكامل للموظف" : "Full Name"}</Label>
            <Input
              id="editName"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="resetPassword">
              {isRtl ? "تعيين كلمة مرور جديدة (اختياري)" : "New Password (optional)"}
            </Label>
            <Input
              id="resetPassword"
              type="password"
              placeholder={isRtl ? "اترك الحقل فارغاً للإبقاء على الحالية" : "Leave blank to keep current password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button variant="ghost" type="button" onClick={onClose} disabled={submitting}>
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (isRtl ? "جاري الحفظ..." : "Saving...") : (isRtl ? "حفظ التعديلات" : "Save Changes")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   CREATE CUSTOM ROLE DIALOG
   ────────────────────────────────────────────────────────────────────────── */

function CreateCustomRoleDialog({
  open,
  onClose,
  summaries,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  summaries: RoleSummaryData[];
  onCreated: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [copyFrom, setCopyFrom] = useState("worker");
  const [submitting, setSubmitting] = useState(false);

  const createRoleFn = useServerFn(createTenantRole);
  const setPermsFn = useServerFn(setRolePermissions);

  function handleAutoSlug(val: string) {
    setLabel(val);
    const generated = val
      .toLowerCase()
      .trim()
      .replace(/[\s\W-]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (generated && !slug) {
      setSlug(generated);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !slug.trim()) {
      toast.error(isRtl ? "يرجى إدخال اسم الدور والمعرف البرمجي" : "Please provide role label and slug");
      return;
    }

    setSubmitting(true);
    try {
      const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9_]/g, "_");
      await createRoleFn({
        data: {
          slug: cleanSlug,
          label: label.trim(),
          description: description.trim() || null,
        },
      });

      // If user chose to clone permissions from an existing profile
      if (copyFrom) {
        const source = summaries.find((s) => s.slug === copyFrom);
        if (source && source.permissions.length > 0) {
          await setPermsFn({
            data: {
              roleSlug: cleanSlug,
              permissionSlugs: source.permissions,
            },
          });
        }
      }

      toast.success(isRtl ? "تم إنشاء الدور المخصص بنجاح" : "Custom role created successfully");
      await onCreated();
      onClose();
      setLabel("");
      setSlug("");
      setDescription("");
    } catch (e: any) {
      toast.error(e?.message ?? "Role creation failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isRtl ? "إنشاء دور مخصص جديد" : "Create New Custom Role"}</DialogTitle>
          <DialogDescription>
            {isRtl
              ? "أنشئ دوراً وظيفياً مخصصاً لمؤسستك وحدد قالبه المبدئي"
              : "Create a custom job role with dedicated permissions for your tenant."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleCreate} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="roleLabel">{isRtl ? "اسم الدور الوظيفي" : "Role Label"}</Label>
            <Input
              id="roleLabel"
              required
              value={label}
              onChange={(e) => handleAutoSlug(e.target.value)}
              placeholder={isRtl ? "مشرف مستودع الخامات" : "Warehouse Supervisor"}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="roleSlug">{isRtl ? "المعرف البرمجي (Slug - إنجليزي بدون مسافات)" : "Role Identifier (slug)"}</Label>
            <Input
              id="roleSlug"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
              placeholder="warehouse_supervisor"
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="roleDesc">{isRtl ? "وصف مهام الدور" : "Role Description"}</Label>
            <Input
              id="roleDesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isRtl ? "إدارة أذون الصرف والجرد ومتابعة حركة المواد" : "Oversees raw materials and stock adjustments"}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="copyTemplate">{isRtl ? "بدء الصلاحيات من قالب:" : "Initial Permissions Template:"}</Label>
            <select
              id="copyTemplate"
              className="w-full h-10 border rounded-md px-3 bg-background text-sm text-foreground"
              value={copyFrom}
              onChange={(e) => setCopyFrom(e.target.value)}
            >
              <option value="worker">{isRtl ? "فني مهام (Task Worker)" : "Task Worker"}</option>
              <option value="sales">{isRtl ? "مدير مبيعات وتشغيل (Manager)" : "Manager"}</option>
              <option value="admin">{isRtl ? "مسؤول النظام (Administrator)" : "Administrator"}</option>
              <option value="viewer">{isRtl ? "مشاهد (Viewer)" : "Viewer"}</option>
              <option value="">{isRtl ? "تصفير الصلاحيات (فارغ تماماً)" : "Empty (Zero Access)"}</option>
            </select>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="ghost" type="button" onClick={onClose} disabled={submitting}>
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (isRtl ? "جاري الإنشاء..." : "Creating...") : (isRtl ? "إنشاء الدور" : "Create Role")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   EDIT ROLE DETAILS DIALOG
   ────────────────────────────────────────────────────────────────────────── */

function EditRoleDetailsDialog({
  open,
  onClose,
  role,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  role: RoleSummaryData;
  onSaved: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [label, setLabel] = useState(role.label);
  const [description, setDescription] = useState(role.description || "");
  const [submitting, setSubmitting] = useState(false);

  const updateRoleFn = useServerFn(updateTenantRole);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await updateRoleFn({
        data: {
          slug: role.slug,
          label: label.trim(),
          description: description.trim() || null,
        },
      });
      toast.success(isRtl ? "تم حفظ بيانات الدور بنجاح" : "Role details updated");
      await onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isRtl ? "تعديل بيانات الدور المخصص" : "Edit Role Details"}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{role.slug}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="editRoleLabel">{isRtl ? "اسم الدور الوظيفي" : "Role Label"}</Label>
            <Input
              id="editRoleLabel"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="editRoleDesc">{isRtl ? "وصف الدور والمهام" : "Description"}</Label>
            <Input
              id="editRoleDesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button variant="ghost" type="button" onClick={onClose} disabled={submitting}>
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (isRtl ? "جاري الحفظ..." : "Saving...") : (isRtl ? "حفظ التعديلات" : "Save Changes")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
