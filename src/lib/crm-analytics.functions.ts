import { createServerFn } from "@tanstack/react-start";
import { and, eq, gte, inArray, lte, sql, desc, asc } from "drizzle-orm";
import { db } from "@/db/client.server";
import {
  leads,
  opportunities,
  quotes,
  orders,
  customers,
  serviceCases,
  remakes,
  tenantMembers,
  appUsers,
} from "@/db/schema";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenant } from "@/integrations/supabase/tenant-middleware";
import type { TenantContext } from "@/lib/tenant-context";
import {
  CrmAnalyticsInput,
  resolveDateRange,
  canViewCrmAnalytics,
  type CrmAnalyticsDashboardData,
  type LeadSourcePerformanceMetric,
  type PipelineStageMetric,
  type QuoteConversionAnalytics,
  type LostReasonDistributionMetric,
  type SalesOwnerPerformanceMetric,
  type CustomerIntelligenceMetric,
  type AfterSalesAnalyticsMetric,
  type CrmAnalyticsSummaryKpis,
} from "@/lib/crm-analytics-types";
import {
  PIPELINE_STAGES,
  LEAD_SOURCES,
  LOST_REASONS,
  type PipelineStage,
  type LeadSource,
} from "@/lib/crm-types";

import {
  calculateRate,
  formatLostReasonLabel,
  formatSourceLabel,
} from "@/lib/crm-analytics.pure";

export {
  calculateRate,
  formatLostReasonLabel,
  formatSourceLabel,
};

// ── Server Function: getCrmAnalytics ─────────────────────────────────────────

export const getCrmAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenant])
  .validator((input: unknown) => CrmAnalyticsInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<CrmAnalyticsDashboardData> => {
    const ctx = context.tenantContext as TenantContext;
    const { tenantId, role } = ctx;

    if (!canViewCrmAnalytics(role)) {
      throw new Error("Forbidden: your role does not have access to commercial analytics");
    }

    const dateRange = resolveDateRange(data.timeWindow, data.startDate, data.endDate);
    const startTs = new Date(dateRange.startDate);
    const endTs = new Date(dateRange.endDate);
    const now = new Date();

    // Default empty structures
    let rawLeads: any[] = [];
    let rawOpportunities: any[] = [];
    let rawQuotes: any[] = [];
    let rawCustomers: any[] = [];
    let rawOrders: any[] = [];
    let rawCases: any[] = [];
    let rawRemakes: any[] = [];
    let rawTeamMembers: any[] = [];

    // ── 1. Ingest Leads Data ──────────────────────────────────────────────────
    try {
      const leadConditions = [
        eq(leads.tenantId, tenantId),
        gte(leads.createdAt, startTs),
        lte(leads.createdAt, endTs),
      ];
      if (data.salesOwnerId) {
        leadConditions.push(eq(leads.assignedSalesperson, data.salesOwnerId));
      }

      rawLeads = await db
        .select({
          id: leads.id,
          source: leads.source,
          status: leads.status,
          assignedSalesperson: leads.assignedSalesperson,
          convertedCustomerId: leads.convertedCustomerId,
          convertedOpportunityId: leads.convertedOpportunityId,
          createdAt: leads.createdAt,
        })
        .from(leads)
        .where(and(...leadConditions));
    } catch (err: any) {
      if (err?.code !== "42P01") console.warn("[crm-analytics] leads query fallback:", err?.message);
    }

    // ── 2. Ingest Opportunities Data ──────────────────────────────────────────
    try {
      const oppConditions = [
        eq(opportunities.tenantId, tenantId),
        gte(opportunities.createdAt, startTs),
        lte(opportunities.createdAt, endTs),
      ];
      if (data.salesOwnerId) {
        oppConditions.push(eq(opportunities.salesOwner, data.salesOwnerId));
      }

      rawOpportunities = await db
        .select({
          id: opportunities.id,
          leadId: opportunities.leadId,
          customerId: opportunities.customerId,
          salesOwner: opportunities.salesOwner,
          stage: opportunities.stage,
          source: opportunities.source,
          status: opportunities.status,
          value: opportunities.value,
          lostReason: opportunities.lostReason,
          nextAction: opportunities.nextAction,
          nextActionDate: opportunities.nextActionDate,
          createdAt: opportunities.createdAt,
        })
        .from(opportunities)
        .where(and(...oppConditions));
    } catch (err: any) {
      if (err?.code !== "42P01") console.warn("[crm-analytics] opportunities query fallback:", err?.message);
    }

    // ── 3. Ingest Quotes Data ─────────────────────────────────────────────────
    try {
      const quoteConditions = [
        eq(quotes.tenantId, tenantId),
        gte(quotes.createdAt, startTs),
        lte(quotes.createdAt, endTs),
      ];

      rawQuotes = await db
        .select({
          id: quotes.id,
          status: quotes.status,
          total: quotes.total,
          opportunityId: sql<string | null>`(${quotes.snapshot}->>'opportunityId')`.as("opportunity_id"),
          createdBy: quotes.createdBy,
          createdAt: quotes.createdAt,
        })
        .from(quotes)
        .where(and(...quoteConditions));
    } catch (err: any) {
      if (err?.code !== "42P01") console.warn("[crm-analytics] quotes query fallback:", err?.message);
    }

    // ── 4. Ingest Team Members ────────────────────────────────────────────────
    try {
      rawTeamMembers = await db
        .select({
          id: appUsers.id,
          displayName: appUsers.displayName,
          username: appUsers.username,
          role: tenantMembers.role,
        })
        .from(tenantMembers)
        .innerJoin(appUsers, eq(tenantMembers.userId, appUsers.id))
        .where(
          and(
            eq(tenantMembers.tenantId, tenantId),
            inArray(tenantMembers.role, ["owner", "admin", "sales"]),
          ),
        )
        .orderBy(asc(appUsers.displayName));
    } catch (err: any) {
      if (err?.code !== "42P01") console.warn("[crm-analytics] team members fallback:", err?.message);
    }

    // ── 5. Ingest Customers & Orders Data ─────────────────────────────────────
    try {
      rawCustomers = await db
        .select({
          id: customers.id,
          createdAt: customers.createdAt,
        })
        .from(customers)
        .where(eq(customers.tenantId, tenantId));

      rawOrders = await db
        .select({
          id: orders.id,
          customerId: orders.customerId,
          currentStage: orders.currentStage,
          deliveredAt: orders.deliveredAt,
          total: orders.total,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(eq(orders.tenantId, tenantId));
    } catch (err: any) {
      if (err?.code !== "42P01") console.warn("[crm-analytics] customers/orders fallback:", err?.message);
    }

    // ── 6. Ingest After-Sales Data ────────────────────────────────────────────
    try {
      rawCases = await db
        .select({
          id: serviceCases.id,
          type: serviceCases.type,
          status: serviceCases.status,
          createdAt: serviceCases.createdAt,
        })
        .from(serviceCases)
        .where(
          and(
            eq(serviceCases.tenantId, tenantId),
            gte(serviceCases.createdAt, startTs),
            lte(serviceCases.createdAt, endTs),
          ),
        );
    } catch (err: any) {
      if (err?.code !== "42P01") console.warn("[crm-analytics] service_cases fallback:", err?.message);
    }

    try {
      rawRemakes = await db
        .select({
          id: remakes.id,
          createdAt: remakes.createdAt,
        })
        .from(remakes)
        .where(
          and(
            eq(remakes.tenantId, tenantId),
            gte(remakes.createdAt, startTs),
            lte(remakes.createdAt, endTs),
          ),
        );
    } catch (err: any) {
      if (err?.code !== "42P01") console.warn("[crm-analytics] remakes fallback:", err?.message);
    }

    // ── Aggregation Logic ─────────────────────────────────────────────────────

    // A. Leads Aggregates
    const totalLeads = rawLeads.length;
    const leadsByStatus: Record<string, number> = {
      new: 0,
      contacted: 0,
      qualified: 0,
      unqualified: 0,
      converted: 0,
      lost: 0,
    };
    for (const l of rawLeads) {
      const s = l.status || "new";
      leadsByStatus[s] = (leadsByStatus[s] || 0) + 1;
    }

    const convertedLeadsCount = leadsByStatus.converted || 0;
    const leadConversionRate = calculateRate(convertedLeadsCount, totalLeads);

    // B. Leads by Source
    const sourceMap = new Map<string, {
      leadsCount: number;
      qualifiedCount: number;
      opportunitiesCount: number;
      wonCount: number;
      lostCount: number;
    }>();

    // Initialize all canonical sources
    for (const src of LEAD_SOURCES) {
      sourceMap.set(src.value, {
        leadsCount: 0,
        qualifiedCount: 0,
        opportunitiesCount: 0,
        wonCount: 0,
        lostCount: 0,
      });
    }

    for (const l of rawLeads) {
      const src = l.source || "other";
      if (!sourceMap.has(src)) {
        sourceMap.set(src, { leadsCount: 0, qualifiedCount: 0, opportunitiesCount: 0, wonCount: 0, lostCount: 0 });
      }
      const item = sourceMap.get(src)!;
      item.leadsCount += 1;
      if (l.status === "qualified" || l.status === "converted") {
        item.qualifiedCount += 1;
      }
      if (l.convertedOpportunityId) {
        item.opportunitiesCount += 1;
      }
    }

    for (const opp of rawOpportunities) {
      const src = opp.source || "other";
      if (!sourceMap.has(src)) {
        sourceMap.set(src, { leadsCount: 0, qualifiedCount: 0, opportunitiesCount: 0, wonCount: 0, lostCount: 0 });
      }
      const item = sourceMap.get(src)!;
      // If lead was not in rawLeads or opportunity came direct
      if (opp.stage === "won" || opp.status === "won") {
        item.wonCount += 1;
      } else if (opp.stage === "lost" || opp.status === "lost") {
        item.lostCount += 1;
      }
    }

    const leadsBySource: LeadSourcePerformanceMetric[] = Array.from(sourceMap.entries()).map(([sourceKey, val]) => {
      const { label, labelAr } = formatSourceLabel(sourceKey);
      return {
        source: sourceKey,
        sourceLabel: label,
        sourceLabelAr: labelAr,
        leadsCount: val.leadsCount,
        qualifiedCount: val.qualifiedCount,
        opportunitiesCount: val.opportunitiesCount,
        wonCount: val.wonCount,
        lostCount: val.lostCount,
        conversionRate: calculateRate(val.wonCount, val.leadsCount > 0 ? val.leadsCount : val.opportunitiesCount),
      };
    });

    // C. Pipeline by Stage (9 stages)
    const totalPipelineValue = rawOpportunities.reduce((acc, o) => {
      if (o.status === "open") return acc + (Number(o.value) || 0);
      return acc;
    }, 0);

    const openOpportunitiesCount = rawOpportunities.filter((o) => o.status === "open").length;

    const pipelineStages: PipelineStageMetric[] = PIPELINE_STAGES.map((stageItem) => {
      const stageKey = stageItem.id;
      const matching = rawOpportunities.filter((o) => o.stage === stageKey);
      const stageValue = matching.reduce((acc, o) => acc + (Number(o.value) || 0), 0);
      const stalledCount = matching.filter((o) => {
        if (o.status !== "open") return false;
        if (!o.nextAction || o.nextAction.trim() === "") return true;
        if (o.nextActionDate && new Date(o.nextActionDate) < now) return true;
        return false;
      }).length;

      return {
        stage: stageKey,
        stageLabel: stageItem.name,
        stageLabelAr: stageItem.nameAr || stageItem.name,
        count: matching.length,
        totalValue: stageValue,
        percentageOfPipeline: calculateRate(stageValue, totalPipelineValue),
        stalledCount,
      };
    });

    // D. Deals Won & Lost
    const wonDeals = rawOpportunities.filter((o) => o.stage === "won" || o.status === "won");
    const lostDeals = rawOpportunities.filter((o) => o.stage === "lost" || o.status === "lost");
    const dealsWonCount = wonDeals.length;
    const dealsWonValue = wonDeals.reduce((acc, o) => acc + (Number(o.value) || 0), 0);
    const dealsLostCount = lostDeals.length;
    const dealsLostValue = lostDeals.reduce((acc, o) => acc + (Number(o.value) || 0), 0);
    const winRate = calculateRate(dealsWonCount, dealsWonCount + dealsLostCount);

    // E. Lost Reasons Distribution (Factual only, no inferring)
    const lostReasonMap = new Map<string, { count: number; totalValue: number }>();
    for (const lostOpp of lostDeals) {
      const reasonKey = lostOpp.lostReason && lostOpp.lostReason.trim() !== "" ? lostOpp.lostReason.trim() : "unspecified";
      const current = lostReasonMap.get(reasonKey) || { count: 0, totalValue: 0 };
      current.count += 1;
      current.totalValue += Number(lostOpp.value) || 0;
      lostReasonMap.set(reasonKey, current);
    }

    const lostReasons: LostReasonDistributionMetric[] = Array.from(lostReasonMap.entries())
      .map(([reasonKey, val]) => {
        const { label, labelAr } = formatLostReasonLabel(reasonKey);
        return {
          reason: reasonKey,
          reasonLabel: label,
          reasonLabelAr: labelAr,
          count: val.count,
          totalValue: val.totalValue,
          percentage: calculateRate(val.count, dealsLostCount),
        };
      })
      .sort((a, b) => b.count - a.count);

    // F. Quote Conversion Metrics
    let quotesCreatedCount = rawQuotes.length;
    let quotesCreatedValue = 0;
    let quotesSentCount = 0;
    let quotesSentValue = 0;
    let quotesAcceptedCount = 0;
    let quotesAcceptedValue = 0;
    let quotesRejectedCount = 0;
    let quotesRejectedValue = 0;
    let quotesDraftCount = 0;
    let quotesDraftValue = 0;

    for (const q of rawQuotes) {
      const total = Number(q.total) || 0;
      quotesCreatedValue += total;

      if (q.status === "accepted") {
        quotesAcceptedCount += 1;
        quotesAcceptedValue += total;
      } else if (q.status === "rejected") {
        quotesRejectedCount += 1;
        quotesRejectedValue += total;
      } else if (q.status === "sent") {
        quotesSentCount += 1;
        quotesSentValue += total;
      } else if (q.status === "draft") {
        quotesDraftCount += 1;
        quotesDraftValue += total;
      }
    }

    const quoteMetrics: QuoteConversionAnalytics = {
      createdCount: quotesCreatedCount,
      createdValue: quotesCreatedValue,
      sentCount: quotesSentCount,
      sentValue: quotesSentValue,
      acceptedCount: quotesAcceptedCount,
      acceptedValue: quotesAcceptedValue,
      rejectedCount: quotesRejectedCount,
      rejectedValue: quotesRejectedValue,
      draftCount: quotesDraftCount,
      draftValue: quotesDraftValue,
      conversionRate: calculateRate(quotesAcceptedCount, quotesAcceptedCount + quotesRejectedCount),
      acceptanceRateOfSent: calculateRate(quotesAcceptedCount, quotesSentCount + quotesAcceptedCount + quotesRejectedCount),
    };

    // G. Sales Owners Objective Performance Table
    const salesOwners: SalesOwnerPerformanceMetric[] = rawTeamMembers.map((member) => {
      const ownerLeads = rawLeads.filter((l) => l.assignedSalesperson === member.id);
      const ownerOpps = rawOpportunities.filter((o) => o.salesOwner === member.id);
      const ownerOpenOpps = ownerOpps.filter((o) => o.status === "open");
      const ownerWon = ownerOpps.filter((o) => o.stage === "won" || o.status === "won");
      const ownerLost = ownerOpps.filter((o) => o.stage === "lost" || o.status === "lost");
      const ownerQuotes = rawQuotes.filter((q) => q.createdBy === member.id);

      const openVal = ownerOpenOpps.reduce((acc, o) => acc + (Number(o.value) || 0), 0);
      const wonVal = ownerWon.reduce((acc, o) => acc + (Number(o.value) || 0), 0);
      const quotesVal = ownerQuotes.reduce((acc, q) => acc + (Number(q.total) || 0), 0);

      return {
        ownerId: member.id,
        ownerName: member.displayName || member.username || "Team Member",
        leadsCount: ownerLeads.length,
        opportunitiesCount: ownerOpps.length,
        openOpportunitiesCount: ownerOpenOpps.length,
        openPipelineValue: openVal,
        wonCount: ownerWon.length,
        wonValue: wonVal,
        lostCount: ownerLost.length,
        quotesCount: ownerQuotes.length,
        quotesValue: quotesVal,
        winRate: calculateRate(ownerWon.length, ownerWon.length + ownerLost.length),
      };
    });

    // H. Customer Intelligence & Repeat Business
    const totalCustomers = rawCustomers.length;
    const newCustomersCount = rawCustomers.filter((c) => {
      if (!c.createdAt) return false;
      const cd = new Date(c.createdAt);
      return cd >= startTs && cd <= endTs;
    }).length;

    // A returning customer is one with >1 order or repeated deals
    const customerOrderCountMap = new Map<string, number>();
    for (const o of rawOrders) {
      if (o.customerId) {
        customerOrderCountMap.set(o.customerId, (customerOrderCountMap.get(o.customerId) || 0) + 1);
      }
    }
    const returningCustomersCount = Array.from(customerOrderCountMap.values()).filter((c) => c > 1).length;
    const repeatCustomerRate = calculateRate(returningCustomersCount, totalCustomers);

    const activeProjectsCount = rawOrders.filter((o) => {
      const stage = o.currentStage?.toLowerCase() || "";
      return !["delivered", "completed", "cancelled"].includes(stage) && !o.deliveredAt;
    }).length;

    const completedProjectsCount = rawOrders.filter((o) => {
      const stage = o.currentStage?.toLowerCase() || "";
      return ["delivered", "completed"].includes(stage) || !!o.deliveredAt;
    }).length;

    const customersMetrics: CustomerIntelligenceMetric = {
      totalCustomers,
      newCustomersCount,
      returningCustomersCount,
      repeatCustomerRate,
      activeProjectsCount,
      completedProjectsCount,
    };

    // I. After-Sales & Quality Metrics
    const openCases = rawCases.filter((c) =>
      ["new", "under_review", "assigned", "in_progress", "waiting_customer"].includes(c.status),
    ).length;
    const warrantyCases = rawCases.filter((c) => c.type === "warranty").length;
    const complaintsCases = rawCases.filter((c) => c.type === "complaint").length;
    const serviceMaintenanceCases = rawCases.filter((c) => ["service", "maintenance"].includes(c.type)).length;
    const resolvedCases = rawCases.filter((c) => ["resolved", "closed"].includes(c.status)).length;

    const afterSales: AfterSalesAnalyticsMetric = {
      totalCases: rawCases.length,
      openCases,
      warrantyCases,
      complaintsCases,
      serviceMaintenanceCases,
      resolvedCases,
      remakesCount: rawRemakes.length,
    };

    // J. Summary KPIs
    const summary: CrmAnalyticsSummaryKpis = {
      totalLeads,
      leadConversionRate,
      openOpportunitiesCount,
      totalPipelineValue,
      dealsWonCount,
      dealsWonValue,
      dealsLostCount,
      dealsLostValue,
      winRate,
      quoteConversionRate: quoteMetrics.conversionRate,
      acceptedQuotesValue: quotesAcceptedValue,
      repeatCustomerRate,
      openCasesCount: openCases,
      remakesCount: rawRemakes.length,
    };

    return {
      dateRange,
      summary,
      leadsBySource,
      leadsByStatus,
      pipelineStages,
      quotes: quoteMetrics,
      lostReasons,
      salesOwners,
      customers: customersMetrics,
      afterSales,
    };
  });
