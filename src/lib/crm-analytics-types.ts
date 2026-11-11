import { z } from "zod";
import type { LeadSource, PipelineStage, LostReasonKey } from "@/lib/crm-types";

export type TimeWindow = "today" | "this_week" | "this_month" | "this_quarter" | "custom";

export const TIME_WINDOW_OPTIONS: { value: TimeWindow; label: string; labelAr: string }[] = [
  { value: "today", label: "Today", labelAr: "اليوم" },
  { value: "this_week", label: "This Week", labelAr: "هذا الأسبوع" },
  { value: "this_month", label: "This Month", labelAr: "هذا الشهر" },
  { value: "this_quarter", label: "This Quarter", labelAr: "هذا الربع" },
  { value: "custom", label: "Custom Range", labelAr: "فترة مخصصة" },
];

export const CrmAnalyticsInput = z.object({
  timeWindow: z.enum(["today", "this_week", "this_month", "this_quarter", "custom"]).default("this_month"),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  salesOwnerId: z.string().uuid().optional().nullable(),
});

export type CrmAnalyticsInputType = z.infer<typeof CrmAnalyticsInput>;

export interface ResolvedDateRange {
  startDate: string; // ISO string
  endDate: string; // ISO string
  timeWindow: TimeWindow;
  label: string;
  labelAr: string;
}

/**
 * Resolves date boundaries for analytical aggregation without time-drift.
 */
export function resolveDateRange(
  window: TimeWindow,
  customStart?: string | null,
  customEnd?: string | null,
  referenceDate: Date = new Date(),
): ResolvedDateRange {
  const now = new Date(referenceDate);

  if (window === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      timeWindow: "today",
      label: "Today",
      labelAr: "اليوم",
    };
  }

  if (window === "this_week") {
    // Week starting on Saturday/Sunday (Egyptian standard Sunday: 0)
    const day = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - day);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      timeWindow: "this_week",
      label: "This Week",
      labelAr: "هذا الأسبوع",
    };
  }

  if (window === "this_quarter") {
    const currentMonth = now.getMonth();
    const quarterStartMonth = Math.floor(currentMonth / 3) * 3;
    const start = new Date(now.getFullYear(), quarterStartMonth, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), quarterStartMonth + 3, 0, 23, 59, 59, 999);
    const qNum = Math.floor(currentMonth / 3) + 1;

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      timeWindow: "this_quarter",
      label: `Q${qNum} ${now.getFullYear()}`,
      labelAr: `الربع ${qNum} - ${now.getFullYear()}`,
    };
  }

  if (window === "custom" && customStart && customEnd) {
    const [sY, sM, sD] = customStart.includes("-")
      ? customStart.slice(0, 10).split("-").map(Number)
      : [now.getFullYear(), now.getMonth() + 1, now.getDate()];
    const start = new Date(sY, sM - 1, sD, 0, 0, 0, 0);

    const [eY, eM, eD] = customEnd.includes("-")
      ? customEnd.slice(0, 10).split("-").map(Number)
      : [now.getFullYear(), now.getMonth() + 1, now.getDate()];
    const end = new Date(eY, eM - 1, eD, 23, 59, 59, 999);

    const sStr = customStart.slice(0, 10);
    const eStr = customEnd.slice(0, 10);
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      timeWindow: "custom",
      label: `${sStr} to ${eStr}`,
      labelAr: `من ${sStr} إلى ${eStr}`,
    };
  }

  // Default: this_month
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const monthName = now.toLocaleString("en-US", { month: "short" });

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    timeWindow: "this_month",
    label: `${monthName} ${now.getFullYear()}`,
    labelAr: `شهر ${now.getMonth() + 1} - ${now.getFullYear()}`,
  };
}

export interface LeadSourcePerformanceMetric {
  source: string;
  sourceLabel: string;
  sourceLabelAr: string;
  leadsCount: number;
  qualifiedCount: number;
  opportunitiesCount: number;
  wonCount: number;
  lostCount: number;
  conversionRate: number; // (wonCount / leadsCount) * 100
}

export interface PipelineStageMetric {
  stage: PipelineStage;
  stageLabel: string;
  stageLabelAr: string;
  count: number;
  totalValue: number;
  percentageOfPipeline: number;
  stalledCount: number; // Active deals with no next action or overdue action
}

export interface QuoteConversionAnalytics {
  createdCount: number;
  createdValue: number;
  sentCount: number;
  sentValue: number;
  acceptedCount: number;
  acceptedValue: number;
  rejectedCount: number;
  rejectedValue: number;
  draftCount: number;
  draftValue: number;
  conversionRate: number; // accepted / (accepted + rejected) * 100
  acceptanceRateOfSent: number; // accepted / sent * 100
}

export interface LostReasonDistributionMetric {
  reason: string;
  reasonLabel: string;
  reasonLabelAr: string;
  count: number;
  totalValue: number;
  percentage: number;
}

export interface SalesOwnerPerformanceMetric {
  ownerId: string;
  ownerName: string;
  leadsCount: number;
  opportunitiesCount: number;
  openOpportunitiesCount: number;
  openPipelineValue: number;
  wonCount: number;
  wonValue: number;
  lostCount: number;
  quotesCount: number;
  quotesValue: number;
  winRate: number; // wonCount / (wonCount + lostCount) * 100
}

export interface CustomerIntelligenceMetric {
  totalCustomers: number;
  newCustomersCount: number;
  returningCustomersCount: number;
  repeatCustomerRate: number; // returning / total * 100
  activeProjectsCount: number;
  completedProjectsCount: number;
}

export interface AfterSalesAnalyticsMetric {
  totalCases: number;
  openCases: number;
  warrantyCases: number;
  complaintsCases: number;
  serviceMaintenanceCases: number;
  resolvedCases: number;
  remakesCount: number;
}

export interface CrmAnalyticsSummaryKpis {
  totalLeads: number;
  leadConversionRate: number;
  openOpportunitiesCount: number;
  totalPipelineValue: number;
  dealsWonCount: number;
  dealsWonValue: number;
  dealsLostCount: number;
  dealsLostValue: number;
  winRate: number;
  quoteConversionRate: number;
  acceptedQuotesValue: number;
  repeatCustomerRate: number;
  openCasesCount: number;
  remakesCount: number;
}

export interface CrmAnalyticsDashboardData {
  dateRange: ResolvedDateRange;
  summary: CrmAnalyticsSummaryKpis;
  leadsBySource: LeadSourcePerformanceMetric[];
  leadsByStatus: Record<string, number>;
  pipelineStages: PipelineStageMetric[];
  quotes: QuoteConversionAnalytics;
  lostReasons: LostReasonDistributionMetric[];
  salesOwners: SalesOwnerPerformanceMetric[];
  customers: CustomerIntelligenceMetric;
  afterSales: AfterSalesAnalyticsMetric;
}

/**
 * Authoritative role matrix for CRM analytics.
 * - owner, admin: tenant-wide analytics.
 * - sales: commercial intelligence (scoped or benchmark).
 * - worker: forbidden (403).
 * - viewer: read-only visibility.
 */
export function canViewCrmAnalytics(role: string | null | undefined): boolean {
  if (!role) return false;
  return ["owner", "admin", "sales", "viewer"].includes(role);
}
