/**
 * Client-safe definitions for PeleCanon SaaS subscription plans and quotas.
 * Zero database or server dependencies — safely imported by React components and server engines.
 */

export type TenantPlanId = "free" | "pro" | "enterprise";

export interface TenantPlanConfig {
  id: TenantPlanId;
  nameI18nKey: string;
  maxActiveSeats: number | null; // null = unlimited
  maxMonthlyQuotes: number | null; // null = unlimited
  badgeVariant: "secondary" | "default" | "outline";
}

export const TENANT_PLANS: Record<TenantPlanId, TenantPlanConfig> = {
  free: {
    id: "free",
    nameI18nKey: "plans.free",
    maxActiveSeats: 3,
    maxMonthlyQuotes: 25,
    badgeVariant: "secondary",
  },
  pro: {
    id: "pro",
    nameI18nKey: "plans.pro",
    maxActiveSeats: 15,
    maxMonthlyQuotes: null,
    badgeVariant: "default",
  },
  enterprise: {
    id: "enterprise",
    nameI18nKey: "plans.enterprise",
    maxActiveSeats: null,
    maxMonthlyQuotes: null,
    badgeVariant: "outline",
  },
};

export interface TenantUsageSummary {
  plan: TenantPlanId;
  planName: string;
  activeSeats: number;
  maxActiveSeats: number | null;
  monthlyQuotes: number;
  maxMonthlyQuotes: number | null;
  seatsRemaining: number | null;
  quotesRemaining: number | null;
}

/**
 * Resolves a plan string into a valid TenantPlanConfig, defaulting unknown/null to 'free'.
 * The seeded demo tenant 'pelecanon' resolves to 'enterprise' when plan is set as such in DB.
 */
export function resolvePlanConfig(plan?: string | null): TenantPlanConfig {
  const normalized = (plan || "").toLowerCase().trim();
  if (normalized === "enterprise") return TENANT_PLANS.enterprise;
  if (normalized === "pro") return TENANT_PLANS.pro;
  return TENANT_PLANS.free;
}
