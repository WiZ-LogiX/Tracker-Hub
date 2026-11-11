import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import {
  listLeads,
  listOpportunities,
  getCRMStats,
  changeOpportunityStage,
} from "@/lib/crm.functions";
import type {
  LeadItem,
  OpportunityItem,
  CRMStats,
  PipelineStage,
} from "@/lib/crm-types";
import { CRMStatsCards } from "@/components/crm/CRMStatsCards";
import { PipelineKanban } from "@/components/crm/PipelineKanban";
import { LeadsTable } from "@/components/crm/LeadsTable";
import { OpportunitiesTable } from "@/components/crm/OpportunitiesTable";
import { OpportunityDetailDrawer } from "@/components/crm/OpportunityDetailDrawer";
import { LeadFormModal } from "@/components/crm/LeadFormModal";
import { ConvertLeadModal } from "@/components/crm/ConvertLeadModal";
import { OpportunityFormModal } from "@/components/crm/OpportunityFormModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Kanban,
  Table as TableIcon,
  Users,
  UserCheck,
  Plus,
  RefreshCcw,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/crm/")({
  component: CRMPage,
});

function CRMPage() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const listLeadsFn = useServerFn(listLeads);
  const listOpportunitiesFn = useServerFn(listOpportunities);
  const getCRMStatsFn = useServerFn(getCRMStats);
  const changeOpportunityStageFn = useServerFn(changeOpportunityStage);

  // Stats State
  const [stats, setStats] = useState<CRMStats>({
    totalPipelineValue: 0,
    openDealsCount: 0,
    wonDealsCount: 0,
    wonDealsValue: 0,
    leadsCount: 0,
    newLeadsCount: 0,
    attentionRequiredCount: 0,
    stageBreakdown: {
      new_lead: { count: 0, value: 0 },
      contacted: { count: 0, value: 0 },
      qualified: { count: 0, value: 0 },
      site_visit: { count: 0, value: 0 },
      design_measurement: { count: 0, value: 0 },
      quotation: { count: 0, value: 0 },
      negotiation: { count: 0, value: 0 },
      won: { count: 0, value: 0 },
      lost: { count: 0, value: 0 },
    },
  });

  // Current View Tab
  const [currentTab, setCurrentTab] = useState<"pipeline" | "opportunities" | "leads" | "my_deals">("pipeline");

  // Kanban & Opportunities State
  const [kanbanOpportunities, setKanbanOpportunities] = useState<OpportunityItem[]>([]);
  const [oppsTableRows, setOppsTableRows] = useState<OpportunityItem[]>([]);
  const [oppsTotalCount, setOppsTotalCount] = useState(0);
  const [oppsPage, setOppsPage] = useState(1);
  const [oppsPageSize] = useState(25);
  const [oppsSearch, setOppsSearch] = useState("");
  const [oppsStageFilter, setOppsStageFilter] = useState("all");
  const [oppsStatusFilter, setOppsStatusFilter] = useState("all");
  const [oppsSort, setOppsSort] = useState("newest");
  const [oppsLoading, setOppsLoading] = useState(false);

  // Leads State
  const [leadsRows, setLeadsRows] = useState<LeadItem[]>([]);
  const [leadsTotalCount, setLeadsTotalCount] = useState(0);
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsPageSize] = useState(25);
  const [leadsSearch, setLeadsSearch] = useState("");
  const [leadsStatusFilter, setLeadsStatusFilter] = useState("all");
  const [leadsSourceFilter, setLeadsSourceFilter] = useState("all");
  const [leadsLoading, setLeadsLoading] = useState(false);

  // Modals & Drawers
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null);
  const [isOppDrawerOpen, setIsOppDrawerOpen] = useState(false);

  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [leadToEdit, setLeadToEdit] = useState<LeadItem | null>(null);

  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [leadToConvert, setLeadToConvert] = useState<LeadItem | null>(null);

  const [isOppModalOpen, setIsOppModalOpen] = useState(false);
  const [oppToEdit, setOppToEdit] = useState<OpportunityItem | null>(null);

  // 1. Fetch Stats
  const loadStats = async () => {
    try {
      const res = await getCRMStatsFn();
      setStats(res);
    } catch {
      // Non-blocking fallback
    }
  };

  // 2. Fetch Kanban Opportunities
  const loadKanban = async () => {
    try {
      const res = await listOpportunitiesFn({
        data: {
          pageSize: 100,
          myOpportunitiesOnly: currentTab === "my_deals",
        },
      });
      setKanbanOpportunities(res.rows);
    } catch {
      setKanbanOpportunities([]);
    }
  };

  // 3. Fetch Table Opportunities
  const loadOpportunitiesTable = async () => {
    setOppsLoading(true);
    try {
      const res = await listOpportunitiesFn({
        data: {
          search: oppsSearch,
          stage: oppsStageFilter as any,
          status: oppsStatusFilter as any,
          sort: oppsSort as any,
          page: oppsPage,
          pageSize: oppsPageSize,
          myOpportunitiesOnly: currentTab === "my_deals",
        },
      });
      setOppsTableRows(res.rows);
      setOppsTotalCount(res.totalCount);
    } catch {
      setOppsTableRows([]);
      setOppsTotalCount(0);
    } finally {
      setOppsLoading(false);
    }
  };

  // 4. Fetch Leads
  const loadLeads = async () => {
    setLeadsLoading(true);
    try {
      const res = await listLeadsFn({
        data: {
          search: leadsSearch,
          status: leadsStatusFilter as any,
          source: leadsSourceFilter as any,
          page: leadsPage,
          pageSize: leadsPageSize,
        },
      });
      setLeadsRows(res.rows);
      setLeadsTotalCount(res.totalCount);
    } catch {
      setLeadsRows([]);
      setLeadsTotalCount(0);
    } finally {
      setLeadsLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (currentTab === "pipeline" || currentTab === "my_deals") {
      loadKanban();
    }
    if (currentTab === "opportunities") {
      loadOpportunitiesTable();
    }
    if (currentTab === "leads") {
      loadLeads();
    }
  }, [
    currentTab,
    oppsPage,
    oppsSearch,
    oppsStageFilter,
    oppsStatusFilter,
    oppsSort,
    leadsPage,
    leadsSearch,
    leadsStatusFilter,
    leadsSourceFilter,
  ]);

  const handleStageChange = async (oppId: string, newStage: PipelineStage, lostReason?: string) => {
    try {
      await changeOpportunityStageFn({
        data: {
          opportunityId: oppId,
          stage: newStage,
          lostReason,
        },
      });
      toast.success(isRtl ? "تم نقل الصفقة للمرحلة الجديدة" : "Stage changed");
      loadStats();
      if (currentTab === "pipeline" || currentTab === "my_deals") {
        loadKanban();
      } else {
        loadOpportunitiesTable();
      }
    } catch (err: any) {
      toast.error(err?.message || (isRtl ? "فشل تغيير المرحلة" : "Failed to change stage"));
    }
  };

  const handleOpenOppDetail = (opp: OpportunityItem) => {
    setSelectedOppId(opp.id);
    setIsOppDrawerOpen(true);
  };

  const handleFilterAttention = () => {
    setCurrentTab("opportunities");
    setOppsStatusFilter("open");
    setOppsSort("next_action_asc");
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <TrendingUp className="h-7 w-7 text-primary" />
            <span>{isRtl ? "إدارة الفرص البيعية والعملاء (CRM)" : "Commercial CRM & Pipeline"}</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {isRtl
              ? "متابعة العملاء المحتملين، وإدارة مسار الصفقات، والربط المباشر مع مقايسات الأسعار وأوامر الإنتاج."
              : "End-to-end customer acquisition: Lead → Customer → Commercial Project → Sales Pipeline → Quotation."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/admin/crm/sales">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
            >
              <UserCheck className="h-3.5 w-3.5" />
              <span>{isRtl ? "مساحة فريق المبيعات والمتابعة" : "Sales Team & Follow-Ups"}</span>
            </Button>
          </Link>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadStats();
              if (currentTab === "pipeline" || currentTab === "my_deals") loadKanban();
              if (currentTab === "opportunities") loadOpportunitiesTable();
              if (currentTab === "leads") loadLeads();
            }}
            className="h-8 text-xs gap-1"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            <span>{isRtl ? "تحديث" : "Refresh"}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLeadToEdit(null);
              setIsLeadModalOpen(true);
            }}
            className="h-8 text-xs gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{isRtl ? "عميل محتمل جديد" : "New Lead"}</span>
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setOppToEdit(null);
              setIsOppModalOpen(true);
            }}
            className="h-8 text-xs gap-1.5 font-semibold bg-primary text-primary-foreground"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{isRtl ? "صفقة / مشروع جديد" : "New Opportunity"}</span>
          </Button>
        </div>
      </div>

      {/* Top CRM Stats Cards */}
      <CRMStatsCards stats={stats} onFilterAttention={handleFilterAttention} />

      {/* Main Views Navigation */}
      <Tabs
        value={currentTab}
        onValueChange={(v) => setCurrentTab(v as any)}
        className="space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-2">
          <TabsList className="bg-muted/60 p-1 h-9">
            <TabsTrigger value="pipeline" className="text-xs gap-1.5 font-semibold">
              <Kanban className="h-3.5 w-3.5" />
              <span>{isRtl ? "مسار المبيعات (Kanban)" : "Sales Pipeline"}</span>
            </TabsTrigger>
            <TabsTrigger value="opportunities" className="text-xs gap-1.5 font-semibold">
              <TableIcon className="h-3.5 w-3.5" />
              <span>{isRtl ? "كل الصفقات" : "All Deals"}</span>
            </TabsTrigger>
            <TabsTrigger value="my_deals" className="text-xs gap-1.5 font-semibold">
              <UserCheck className="h-3.5 w-3.5" />
              <span>{isRtl ? "صفقاتي" : "My Deals"}</span>
            </TabsTrigger>
            <TabsTrigger value="leads" className="text-xs gap-1.5 font-semibold">
              <Users className="h-3.5 w-3.5" />
              <span>{isRtl ? "العملاء المحتملون" : "Leads"} ({stats.leadsCount})</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 1. KANBAN PIPELINE VIEW */}
        <TabsContent value="pipeline" className="space-y-4 m-0">
          <PipelineKanban
            opportunities={kanbanOpportunities}
            onSelectOpportunity={handleOpenOppDetail}
            onStageChange={handleStageChange}
          />
        </TabsContent>

        {/* 2. MY DEALS VIEW */}
        <TabsContent value="my_deals" className="space-y-4 m-0">
          <PipelineKanban
            opportunities={kanbanOpportunities}
            onSelectOpportunity={handleOpenOppDetail}
            onStageChange={handleStageChange}
          />
        </TabsContent>

        {/* 3. OPPORTUNITIES TABLE VIEW */}
        <TabsContent value="opportunities" className="space-y-4 m-0">
          <OpportunitiesTable
            opportunities={oppsTableRows}
            totalCount={oppsTotalCount}
            page={oppsPage}
            pageSize={oppsPageSize}
            search={oppsSearch}
            onSearchChange={(val) => {
              setOppsSearch(val);
              setOppsPage(1);
            }}
            stageFilter={oppsStageFilter}
            onStageFilterChange={(val) => {
              setOppsStageFilter(val);
              setOppsPage(1);
            }}
            statusFilter={oppsStatusFilter}
            onStatusFilterChange={(val) => {
              setOppsStatusFilter(val);
              setOppsPage(1);
            }}
            sort={oppsSort}
            onSortChange={setOppsSort}
            onPageChange={setOppsPage}
            onSelectOpportunity={handleOpenOppDetail}
            onNewOpportunity={() => {
              setOppToEdit(null);
              setIsOppModalOpen(true);
            }}
            onStageChange={handleStageChange}
            isLoading={oppsLoading}
          />
        </TabsContent>

        {/* 4. LEADS TABLE VIEW */}
        <TabsContent value="leads" className="space-y-4 m-0">
          <LeadsTable
            leads={leadsRows}
            totalCount={leadsTotalCount}
            page={leadsPage}
            pageSize={leadsPageSize}
            search={leadsSearch}
            onSearchChange={(val) => {
              setLeadsSearch(val);
              setLeadsPage(1);
            }}
            statusFilter={leadsStatusFilter}
            onStatusFilterChange={(val) => {
              setLeadsStatusFilter(val);
              setLeadsPage(1);
            }}
            sourceFilter={leadsSourceFilter}
            onSourceFilterChange={(val) => {
              setLeadsSourceFilter(val);
              setLeadsPage(1);
            }}
            onPageChange={setLeadsPage}
            onNewLead={() => {
              setLeadToEdit(null);
              setIsLeadModalOpen(true);
            }}
            onEditLead={(lead) => {
              setLeadToEdit(lead);
              setIsLeadModalOpen(true);
            }}
            onConvertLead={(lead) => {
              setLeadToConvert(lead);
              setIsConvertModalOpen(true);
            }}
            isLoading={leadsLoading}
          />
        </TabsContent>
      </Tabs>

      {/* Opportunity Detail Drawer */}
      <OpportunityDetailDrawer
        opportunityId={selectedOppId}
        open={isOppDrawerOpen}
        onOpenChange={setIsOppDrawerOpen}
        onRefresh={() => {
          loadStats();
          if (currentTab === "pipeline" || currentTab === "my_deals") loadKanban();
          if (currentTab === "opportunities") loadOpportunitiesTable();
        }}
      />

      {/* Lead Form Modal */}
      <LeadFormModal
        open={isLeadModalOpen}
        onOpenChange={setIsLeadModalOpen}
        leadToEdit={leadToEdit}
        onSuccess={() => {
          loadStats();
          loadLeads();
        }}
      />

      {/* Convert Lead Modal */}
      <ConvertLeadModal
        open={isConvertModalOpen}
        onOpenChange={setIsConvertModalOpen}
        lead={leadToConvert}
        onSuccess={(res) => {
          loadStats();
          loadLeads();
          loadKanban();
          setSelectedOppId(res.opportunityId);
          setIsOppDrawerOpen(true);
        }}
      />

      {/* Opportunity Form Modal */}
      <OpportunityFormModal
        open={isOppModalOpen}
        onOpenChange={setIsOppModalOpen}
        opportunityToEdit={oppToEdit}
        onSuccess={() => {
          loadStats();
          if (currentTab === "pipeline" || currentTab === "my_deals") loadKanban();
          if (currentTab === "opportunities") loadOpportunitiesTable();
        }}
      />
    </div>
  );
}
