import { db } from "@/db/client.server";
import { tenants, appUsers, quotes } from "@/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import {
  resolvePlanConfig,
  type TenantUsageSummary,
} from "@/lib/tenant-plans";

/**
 * Returns a comprehensive usage and quota summary for the specified tenant.
 */
export async function getTenantUsageSummary(
  executor: any = db,
  tenantId: string,
): Promise<TenantUsageSummary> {
  const [tenant] = await executor
    .select({
      plan: tenants.plan,
      slug: tenants.slug,
      name: tenants.name,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const planConfig = resolvePlanConfig(tenant?.plan);

  // Count active team users
  const [userCount] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(appUsers)
    .where(and(eq(appUsers.tenantId, tenantId), eq(appUsers.status, "active")));

  const activeSeats = Number(userCount?.count) || 0;

  // Count quotations created in current calendar month
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [quoteCount] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(quotes)
    .where(and(eq(quotes.tenantId, tenantId), gte(quotes.createdAt, startOfMonth)));

  const monthlyQuotes = Number(quoteCount?.count) || 0;

  const seatsRemaining =
    planConfig.maxActiveSeats !== null
      ? Math.max(0, planConfig.maxActiveSeats - activeSeats)
      : null;

  const quotesRemaining =
    planConfig.maxMonthlyQuotes !== null
      ? Math.max(0, planConfig.maxMonthlyQuotes - monthlyQuotes)
      : null;

  return {
    plan: planConfig.id,
    planName: tenant?.name || "Workspace",
    activeSeats,
    maxActiveSeats: planConfig.maxActiveSeats,
    monthlyQuotes,
    maxMonthlyQuotes: planConfig.maxMonthlyQuotes,
    seatsRemaining,
    quotesRemaining,
  };
}

/**
 * Asserts that the tenant has not reached their maximum active seat limit.
 * Throws a descriptive plan-limit error if adding additionalSeats would exceed the plan cap.
 */
export async function assertActiveSeatAvailable(
  executor: any = db,
  tenantId: string,
  additionalSeats: number = 1,
): Promise<void> {
  const [tenant] = await executor
    .select({ plan: tenants.plan })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const planConfig = resolvePlanConfig(tenant?.plan);
  if (planConfig.maxActiveSeats === null) return; // Unlimited seats

  const [userCount] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(appUsers)
    .where(and(eq(appUsers.tenantId, tenantId), eq(appUsers.status, "active")));

  const activeSeats = Number(userCount?.count) || 0;
  if (activeSeats + additionalSeats > planConfig.maxActiveSeats) {
    throw new Error(
      `Plan seat limit reached: Your current ${planConfig.id.toUpperCase()} plan allows a maximum of ${planConfig.maxActiveSeats} active seat(s). You currently have ${activeSeats} active seat(s). Please upgrade to Pro or Enterprise to add more users.`,
    );
  }
}

/**
 * Asserts that the tenant has not reached their monthly new quotation creation quota.
 * Throws a descriptive plan-limit error if creating a new quote would exceed the monthly cap.
 */
export async function assertMonthlyQuoteQuota(
  executor: any = db,
  tenantId: string,
): Promise<void> {
  const [tenant] = await executor
    .select({ plan: tenants.plan })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const planConfig = resolvePlanConfig(tenant?.plan);
  if (planConfig.maxMonthlyQuotes === null) return; // Unlimited monthly quotes

  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [quoteCount] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(quotes)
    .where(and(eq(quotes.tenantId, tenantId), gte(quotes.createdAt, startOfMonth)));

  const monthlyQuotes = Number(quoteCount?.count) || 0;
  if (monthlyQuotes >= planConfig.maxMonthlyQuotes) {
    throw new Error(
      `Monthly quotation quota reached: Your current ${planConfig.id.toUpperCase()} plan allows up to ${planConfig.maxMonthlyQuotes} new quotations per calendar month. You have already created ${monthlyQuotes} quotations this month. Please upgrade your plan to create unlimited quotes.`,
    );
  }
}
