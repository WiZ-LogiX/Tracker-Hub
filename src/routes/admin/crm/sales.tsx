import { useState, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getSalesWorkspaceData,
  listSalesMembers,
  assignCRMEntity,
} from "@/lib/crm.functions";
import type {
  SalespersonWorkload,
  SalesWorkspaceKPIs,
  AttentionItem,
  LeadItem,
  OpportunityItem,
} from "@/lib/crm-types";
import { formatEGP } from "@/lib/pricing";
import { SalesWorkloadTable } from "@/components/crm/SalesWorkloadTable";
import { SalesAttentionBoard } from "@/components/crm/SalesAttentionBoard";
import { MySalesView } from "@/components/crm/MySalesView";
import { LogActivityModal } from "@/components/crm/LogActivityModal";
import { ReassignModal } from "@/components/crm/ReassignModal";
import { BulkAssignModal } from "@/components/crm/BulkAssignModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Briefcase,
  AlertTriangle,
  Clock,
  TrendingUp,
  FileText,
  UserCheck,
  CheckCircle2,
  PhoneCall,
  Plus,
  RefreshCcw,
  SlidersHorizontal,
  Search,
  Kanban,
  CheckSquare,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

const salesSearchSchema = z.object({
  repId: z.string().optional(),
  tab: z.enum(["workload", "attention", "my_sales", "assignment"]).optional().default("workload"),
});

export const Route = createFileRoute("/admin/crm/sales")({
  validateSearch: salesSearchSchema,
  component: SalesWorkspacePage,
});

function SalesWorkspacePage() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const search = Route.useSearch();
  const nav = useNavigate();

  const getWorkspaceDataFn = useServerFn(getSalesWorkspaceData);
  const listSalesMembersFn = useServerFn(listSalesMembers);

  const [currentTab, setCurrentTab] = useState<string>(search.tab || "workload");
  const [selectedRepId, setSelectedRepId] = useState<string>(search.repId || "all");
  const [salesMembers, setSalesMembers] = useState<Array<{ id: string; name: string; email: string; role: string }>>([]);

  const fallbackData = {
    kpis: {
      newLeadsCount: 0,
      openOpportunitiesCount: 0,
      pipelineValue: 0,
      dueTodayCount: 0,
      overdueCount: 0,
      quotesAwaitingResponseCount: 0,
      wonCount: 0,
      wonValue: 0,
      lostCount: 0,
    },
    teamWorkload: [] as SalespersonWorkload[],
    attentionItems: [] as AttentionItem[],
    mySales: {
      repId: selectedRepId !== "all" ? selectedRepId : "current-user",
      repName: isRtl ? "مبيعاتي" : "My Account",
      leads: [] as any[],
      opportunities: [] as any[],
      quotes: [] as any[],
      tasks: [] as any[],
      overdueActions: [] as AttentionItem[],
    },
    currentUserId: "current-user",
    currentUserRole: "admin",
  };

  const [data, setData] = useState<{
    kpis: SalesWorkspaceKPIs;
    teamWorkload: SalespersonWorkload[];
    attentionItems: AttentionItem[];
    mySales: any;
    currentUserId: string;
    currentUserRole: string;
  }>(fallbackData);

  const [loading, setLoading] = useState(false);

  // Modals state
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkEntityType, setBulkEntityType] = useState<"opportunity" | "lead">("opportunity");
  const [selectedBulkIds, setSelectedBulkIds] = useState<string[]>([]);
  const [selectedReassignItem, setSelectedReassignItem] = useState<{
    type: "opportunity" | "lead";
    id: string;
    code: string;
    title: string;
    ownerId?: string | null;
  } | null>(null);
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);

  // Assignment tab sub-state
  const [assignSubTab, setAssignSubTab] = useState<"opportunities" | "leads">("opportunities");
  const [assignSearch, setAssignSearch] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getWorkspaceDataFn({
        data: { selectedSalesOwner: selectedRepId },
      });
      setData(res as any);

      // If user is sales rep and repId wasn't passed, default to their own user ID
      if (res.currentUserRole === "sales" && selectedRepId === "all") {
        setSelectedRepId(res.currentUserId);
      }
    } catch {
      // Graceful non-blocking fallback for offline or test mocked environments
      setData((prev) => prev || fallbackData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    listSalesMembersFn()
      .then((m) => setSalesMembers(m || []))
      .catch(() => setSalesMembers([]));
  }, []);

  useEffect(() => {
    loadData();
  }, [selectedRepId]);

  const handleSelectRepFromTable = (repId: string) => {
    setSelectedRepId(repId);
    setCurrentTab("my_sales");
  };

  const handleOpenReassignModal = (
    type: "opportunity" | "lead",
    id: string,
    code: string,
    title: string,
    ownerId?: string | null,
  ) => {
    setSelectedReassignItem({ type, id, code, title, ownerId });
    setIsReassignModalOpen(true);
  };

  const handleToggleBulkSelect = (id: string) => {
    setSelectedBulkIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSelectAllBulk = (ids: string[]) => {
    if (selectedBulkIds.length === ids.length) {
      setSelectedBulkIds([]);
    } else {
      setSelectedBulkIds(ids);
    }
  };

  const isManager = data?.currentUserRole === "owner" || data?.currentUserRole === "admin";

  const kpis = data?.kpis || {
    newLeadsCount: 0,
    openOpportunitiesCount: 0,
    pipelineValue: 0,
    dueTodayCount: 0,
    overdueCount: 0,
    quotesAwaitingResponseCount: 0,
    wonCount: 0,
    wonValue: 0,
    lostCount: 0,
  };

  return (
    <div className="space-y-6 pb-12">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Link to="/admin/crm" className="hover:text-primary transition-colors flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>{isRtl ? "إدارة علاقات العملاء (CRM)" : "CRM"}</span>
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">{isRtl ? "مساحة فريق المبيعات والمتابعة" : "Sales Team & Follow-Ups"}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <UserCheck className="h-7 w-7 text-primary" />
            <span>{isRtl ? "إدارة فريق المبيعات والمتابعة التجارية" : "Sales Team & Follow-Up Operations"}</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {isRtl
              ? "متابعة توزيع الفرص، حمولة مسؤولي المبيعات، التحكم في المواعيد والإجراءات التالية، ومراقبة الصفقات الحرجة."
              : "Capacity management, salesperson workload, follow-up control, deal velocity, and assignment operations."}
          </p>
        </div>

        {/* Header Actions & Rep Selector */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Salesperson Selector (Managers can view any rep or all team) */}
          <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-lg border">
            <span className="text-xs font-medium text-muted-foreground px-1 hidden sm:inline">
              {isRtl ? "المسؤول:" : "Rep:"}
            </span>
            <Select value={selectedRepId} onValueChange={setSelectedRepId}>
              <SelectTrigger className="h-8 text-xs w-[160px] bg-background">
                <SelectValue placeholder={isRtl ? "كل الفريق" : "All Sales Team"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs font-semibold">
                  {isRtl ? "👥 كل فريق المبيعات" : "👥 All Sales Team"}
                </SelectItem>
                {salesMembers.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    {m.name} ({m.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-8 text-xs gap-1"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>{isRtl ? "تحديث" : "Refresh"}</span>
          </Button>

          <Link to="/admin/crm">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <Kanban className="h-3.5 w-3.5 text-primary" />
              <span>{isRtl ? "مسار المبيعات (Kanban)" : "Pipeline Board"}</span>
            </Button>
          </Link>

          <Button
            size="sm"
            onClick={() => setIsLogModalOpen(true)}
            className="h-8 text-xs gap-1.5 shadow-sm"
          >
            <PhoneCall className="h-3.5 w-3.5" />
            <span>{isRtl ? "تسجيل نشاط / متابعة" : "Log Activity"}</span>
          </Button>
        </div>
      </div>

      {/* ── 8 Core Commercial KPIs Grid (No unsupported forecast numbers) ───── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* 1. New Leads */}
        <Card className="border shadow-xs">
          <CardContent className="p-3">
            <span className="text-[11px] text-muted-foreground block font-medium truncate">
              {isRtl ? "عملاء جدد" : "New Leads"}
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-lg font-bold font-mono text-foreground">
                {kpis.newLeadsCount}
              </span>
              <Users className="h-3.5 w-3.5 text-sky-500" />
            </div>
          </CardContent>
        </Card>

        {/* 2. Open Opportunities */}
        <Card className="border shadow-xs">
          <CardContent className="p-3">
            <span className="text-[11px] text-muted-foreground block font-medium truncate">
              {isRtl ? "فرص نشطة" : "Open Deals"}
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-lg font-bold font-mono text-foreground">
                {kpis.openOpportunitiesCount}
              </span>
              <Briefcase className="h-3.5 w-3.5 text-primary" />
            </div>
          </CardContent>
        </Card>

        {/* 3. Pipeline Value */}
        <Card className="border shadow-xs">
          <CardContent className="p-3">
            <span className="text-[11px] text-muted-foreground block font-medium truncate">
              {isRtl ? "قيمة مسار المبيعات" : "Pipeline Value"}
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-sm sm:text-base font-bold font-mono text-foreground truncate">
                {formatEGP(kpis.pipelineValue)}
              </span>
              <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" />
            </div>
          </CardContent>
        </Card>

        {/* 4. Due Today */}
        <Card className="border shadow-xs">
          <CardContent className="p-3">
            <span className="text-[11px] text-muted-foreground block font-medium truncate">
              {isRtl ? "مطلوب اليوم" : "Due Today"}
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400">
                {kpis.dueTodayCount}
              </span>
              <Clock className="h-3.5 w-3.5 text-amber-500" />
            </div>
          </CardContent>
        </Card>

        {/* 5. Overdue */}
        <Card className="border shadow-xs">
          <CardContent className="p-3">
            <span className="text-[11px] text-muted-foreground block font-medium truncate">
              {isRtl ? "متأخرات" : "Overdue"}
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-lg font-bold font-mono text-destructive">
                {kpis.overdueCount}
              </span>
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            </div>
          </CardContent>
        </Card>

        {/* 6. Quotes Awaiting Response */}
        <Card className="border shadow-xs">
          <CardContent className="p-3">
            <span className="text-[11px] text-muted-foreground block font-medium truncate">
              {isRtl ? "عروض بانتظار رد" : "Awaiting Quote"}
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-lg font-bold font-mono text-indigo-600 dark:text-indigo-400">
                {kpis.quotesAwaitingResponseCount}
              </span>
              <FileText className="h-3.5 w-3.5 text-indigo-500" />
            </div>
          </CardContent>
        </Card>

        {/* 7. Won Deals */}
        <Card className="border shadow-xs">
          <CardContent className="p-3">
            <span className="text-[11px] text-muted-foreground block font-medium truncate">
              {isRtl ? "تم الفوز" : "Deals Won"}
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-lg font-bold font-mono text-emerald-600">
                {kpis.wonCount}
              </span>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            </div>
          </CardContent>
        </Card>

        {/* 8. Lost Deals */}
        <Card className="border shadow-xs">
          <CardContent className="p-3">
            <span className="text-[11px] text-muted-foreground block font-medium truncate">
              {isRtl ? "صفقات خاسرة" : "Deals Lost"}
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-lg font-bold font-mono text-muted-foreground">
                {kpis.lostCount}
              </span>
              <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Main Workspace Tabs ──────────────────────────────────────────────── */}
      <Tabs value={currentTab} onValueChange={setCurrentTab} className="space-y-4">
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full h-auto p-1 bg-muted/60">
          <TabsTrigger value="workload" className="text-xs py-2 gap-1.5">
            <Users className="h-3.5 w-3.5" />
            <span>{isRtl ? "حمولة فريق المبيعات" : "Team Workload"}</span>
          </TabsTrigger>

          <TabsTrigger value="attention" className="text-xs py-2 gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <span>{isRtl ? "التحكم بالمتابعات والتنبيهات" : "Follow-Up Control"}</span>
            {data?.attentionItems && data.attentionItems.length > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1 py-0 font-mono ml-1">
                {data.attentionItems.length}
              </Badge>
            )}
          </TabsTrigger>

          <TabsTrigger value="my_sales" className="text-xs py-2 gap-1.5">
            <Briefcase className="h-3.5 w-3.5 text-primary" />
            <span>{isRtl ? "مساحة المسؤول التجاري" : "My Sales Workspace"}</span>
          </TabsTrigger>

          <TabsTrigger value="assignment" className="text-xs py-2 gap-1.5">
            <UserCheck className="h-3.5 w-3.5" />
            <span>{isRtl ? "توزيع وإسناد الصفقات" : "Assignment & Routing"}</span>
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Sales Team Workload ──────────────────────────────────────── */}
        <TabsContent value="workload" className="space-y-4">
          <SalesWorkloadTable
            workloads={data?.teamWorkload || []}
            onSelectRep={handleSelectRepFromTable}
            selectedRepId={selectedRepId}
          />
        </TabsContent>

        {/* ── Tab 2: Follow-Up Control & Attention Items ──────────────────────── */}
        <TabsContent value="attention" className="space-y-4">
          <SalesAttentionBoard
            attentionItems={data?.attentionItems || []}
            onRefresh={loadData}
          />
        </TabsContent>

        {/* ── Tab 3: My Sales View ────────────────────────────────────────────── */}
        <TabsContent value="my_sales" className="space-y-4">
          {data?.mySales ? (
            <MySalesView mySales={data.mySales} onRefresh={loadData} />
          ) : (
            <Card className="border p-8 text-center text-xs text-muted-foreground">
              {isRtl
                ? "اختر مسؤول مبيعات من القائمة أعلاه لعرض صفقاته ومتابعاته الخاصة"
                : "Select a sales representative from the header dropdown to view their dedicated sales dashboard."}
            </Card>
          )}
        </TabsContent>

        {/* ── Tab 4: Assignment & Routing (with Bulk Actions) ──────────────────── */}
        <TabsContent value="assignment" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-primary" />
                    <span>{isRtl ? "مركز توزيع وإسناد الفرص والعملاء" : "Assignment & Lead Routing Center"}</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {isRtl
                      ? "إدارة توزيع العملاء المحتملين والصفقات، وإعادة الإسناد الفردي أو الجماعي بنقرة واحدة"
                      : "Assign or reassign leads and commercial deals individually or in bulk with automatic audit logging."}
                  </CardDescription>
                </div>

                {/* Sub-Tabs: Deals vs Leads */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-muted/60 p-1 rounded-lg border text-xs">
                    <Button
                      size="sm"
                      variant={assignSubTab === "opportunities" ? "default" : "ghost"}
                      onClick={() => {
                        setAssignSubTab("opportunities");
                        setSelectedBulkIds([]);
                      }}
                      className="h-7 text-xs px-2.5"
                    >
                      {isRtl ? "الصفقات / المشاريع" : "Deals"}
                    </Button>
                    <Button
                      size="sm"
                      variant={assignSubTab === "leads" ? "default" : "ghost"}
                      onClick={() => {
                        setAssignSubTab("leads");
                        setSelectedBulkIds([]);
                      }}
                      className="h-7 text-xs px-2.5"
                    >
                      {isRtl ? "العملاء المحتملون" : "Leads"}
                    </Button>
                  </div>

                  {isManager && selectedBulkIds.length > 0 && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setBulkEntityType(assignSubTab === "opportunities" ? "opportunity" : "lead");
                        setIsBulkModalOpen(true);
                      }}
                      className="h-7 text-xs gap-1.5 shadow-sm"
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      <span>
                        {isRtl ? `إسناد جماعي (${selectedBulkIds.length})` : `Bulk Assign (${selectedBulkIds.length})`}
                      </span>
                    </Button>
                  )}
                </div>
              </div>

              {/* Filters row */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t mt-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="h-3.5 w-3.5 absolute top-2.5 left-2.5 rtl:right-2.5 rtl:left-auto text-muted-foreground" />
                  <Input
                    placeholder={isRtl ? "بحث بالاسم أو الكود..." : "Search by code or name..."}
                    value={assignSearch}
                    onChange={(e) => setAssignSearch(e.target.value)}
                    className="h-8 text-xs pl-8 rtl:pr-8 rtl:pl-3"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center space-x-1.5 rtl:space-x-reverse text-xs">
                    <Checkbox
                      id="only-unassigned"
                      checked={onlyUnassigned}
                      onCheckedChange={(checked) => setOnlyUnassigned(Boolean(checked))}
                    />
                    <label htmlFor="only-unassigned" className="text-xs cursor-pointer select-none">
                      {isRtl ? "عرض غير المسند فقط" : "Only Unassigned"}
                    </label>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 text-xs">
                    <TableHead className="w-10 text-center">
                      <Checkbox
                        checked={selectedBulkIds.length > 0}
                        onCheckedChange={() => {
                          const currentItems =
                            assignSubTab === "opportunities"
                              ? (data?.mySales?.opportunities || []).map((o: any) => o.id)
                              : (data?.mySales?.leads || []).map((l: any) => l.id);
                          handleSelectAllBulk(currentItems);
                        }}
                      />
                    </TableHead>
                    <TableHead className="font-semibold">{isRtl ? "الكود والاسم" : "Code & Name"}</TableHead>
                    <TableHead className="font-semibold">{isRtl ? "العميل / التواصل" : "Customer / Contact"}</TableHead>
                    <TableHead className="text-center font-semibold">{isRtl ? "الحالة / المرحلة" : "Status / Stage"}</TableHead>
                    <TableHead className="font-semibold">{isRtl ? "المسؤول الحالي" : "Current Owner"}</TableHead>
                    <TableHead className="text-center font-semibold">{isRtl ? "إجراء" : "Action"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Opportunities Assignment Listing */}
                  {assignSubTab === "opportunities" ? (
                    (data?.attentionItems || [])
                      .filter((item) => {
                        if (onlyUnassigned && item.salesOwnerId) return false;
                        if (assignSearch) {
                          const q = assignSearch.toLowerCase();
                          return (
                            item.code.toLowerCase().includes(q) ||
                            item.title.toLowerCase().includes(q) ||
                            (item.customerName || "").toLowerCase().includes(q)
                          );
                        }
                        return true;
                      })
                      .map((opp) => {
                        const isSelected = selectedBulkIds.includes(opp.id);

                        return (
                          <TableRow key={opp.id} className={`text-xs hover:bg-muted/40 ${isSelected ? "bg-primary/5" : ""}`}>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => handleToggleBulkSelect(opp.id)}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="font-mono font-bold text-foreground">{opp.code}</div>
                              <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                                {opp.title}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-foreground">{opp.customerName || "—"}</div>
                              {opp.customerPhone && (
                                <div className="font-mono text-[11px] text-muted-foreground">
                                  {opp.customerPhone}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {opp.stage || "open"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {opp.salesOwnerName && opp.salesOwnerName !== "Unassigned" ? (
                                <span className="font-medium text-foreground">{opp.salesOwnerName}</span>
                              ) : (
                                <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">
                                  {isRtl ? "غير مسند" : "Unassigned"}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleOpenReassignModal("opportunity", opp.id, opp.code, opp.title, opp.salesOwnerId)
                                }
                                className="h-7 text-xs px-2 gap-1 text-primary border-primary/30"
                              >
                                <UserCheck className="h-3 w-3" />
                                <span>{isRtl ? "إسناد" : "Assign"}</span>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                  ) : (
                    // Leads Assignment Listing
                    (data?.mySales?.leads || [])
                      .filter((l: any) => {
                        if (onlyUnassigned && l.assignedSalesperson) return false;
                        if (assignSearch) {
                          const q = assignSearch.toLowerCase();
                          return (
                            l.leadNumber.toLowerCase().includes(q) ||
                            l.name.toLowerCase().includes(q) ||
                            (l.phone || "").includes(q)
                          );
                        }
                        return true;
                      })
                      .map((lead: any) => {
                        const isSelected = selectedBulkIds.includes(lead.id);

                        return (
                          <TableRow key={lead.id} className={`text-xs hover:bg-muted/40 ${isSelected ? "bg-primary/5" : ""}`}>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => handleToggleBulkSelect(lead.id)}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="font-mono font-bold text-foreground">{lead.leadNumber}</div>
                              <div className="font-medium text-foreground">{lead.name}</div>
                            </TableCell>
                            <TableCell>
                              <div className="font-mono">{lead.phone || "—"}</div>
                              <div className="text-[10px] text-muted-foreground capitalize">{lead.source}</div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="text-[10px] capitalize">
                                {lead.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {lead.assignedSalesperson ? (
                                <span className="font-medium text-foreground">{lead.assignedSalespersonName || "Assigned"}</span>
                              ) : (
                                <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">
                                  {isRtl ? "غير مسند" : "Unassigned"}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleOpenReassignModal("lead", lead.id, lead.leadNumber, lead.name, lead.assignedSalesperson)
                                }
                                className="h-7 text-xs px-2 gap-1 text-primary border-primary/30"
                              >
                                <UserCheck className="h-3 w-3" />
                                <span>{isRtl ? "إسناد" : "Assign"}</span>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Global Modals ────────────────────────────────────────────────────── */}
      {/* 1. Log Activity Modal */}
      <LogActivityModal
        open={isLogModalOpen}
        onOpenChange={setIsLogModalOpen}
        entityType="opportunity"
        entityId={data?.attentionItems?.[0]?.id || "opp-general"}
        entityCode={data?.attentionItems?.[0]?.code || "OPP-001"}
        entityTitle={data?.attentionItems?.[0]?.title || (isRtl ? "متابعة تجارية" : "Commercial Follow-Up")}
        onSuccess={loadData}
      />

      {/* 2. Individual Reassign Modal */}
      {selectedReassignItem && (
        <ReassignModal
          open={isReassignModalOpen}
          onOpenChange={setIsReassignModalOpen}
          entityType={selectedReassignItem.type}
          entityId={selectedReassignItem.id}
          entityCode={selectedReassignItem.code}
          entityTitle={selectedReassignItem.title}
          currentSalesOwnerId={selectedReassignItem.ownerId}
          onSuccess={loadData}
        />
      )}

      {/* 3. Bulk Assign Modal */}
      <BulkAssignModal
        open={isBulkModalOpen}
        onOpenChange={setIsBulkModalOpen}
        entityType={bulkEntityType}
        entityIds={selectedBulkIds}
        onSuccess={() => {
          setSelectedBulkIds([]);
          loadData();
        }}
      />
    </div>
  );
}
