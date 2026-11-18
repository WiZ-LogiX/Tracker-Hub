import { db } from "@/db/client.server";
import {
  customers,
  opportunities,
  auditLog,
  tenantCounters,
} from "@/db/schema";
import { eq, and, or, sql } from "drizzle-orm";
import { forbidWorker, requirePermission, type TenantContext } from "@/lib/tenant-context";
import type { QuickCrmIntakeInput, QuickCrmIntakeResult } from "@/lib/crm-types";

/**
 * Normalize phone numbers to clean digits for deduplication.
 * Strips formatting, international prefixes (+20, 0020), and local zero.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0020")) digits = digits.slice(4);
  else if (digits.startsWith("20") && digits.length > 10) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length > 9) digits = digits.slice(1);
  return digits || null;
}

/**
 * Generate next Opportunity code (OPP-0001) atomically within transaction.
 */
export async function getNextOpportunityCode(tenantId: string, executor: any = db): Promise<string> {
  const [row] = await executor
    .insert(tenantCounters)
    .values({
      tenantId,
      counterType: "opportunity",
      lastValue: 1001,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [tenantCounters.tenantId, tenantCounters.counterType],
      set: {
        lastValue: sql`${tenantCounters.lastValue} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ lastValue: tenantCounters.lastValue });

  const nextVal = row?.lastValue ?? 1001;
  return `OPP-${nextVal}`;
}

/**
 * Core business transaction for Fast CRM Intake.
 */
export async function executeQuickCrmIntake(
  ctx: TenantContext,
  data: QuickCrmIntakeInput,
): Promise<QuickCrmIntakeResult> {
  const { tenantId, userId, role } = ctx;

  requirePermission(ctx, "crm.opportunities.create");
  forbidWorker(ctx, "CRM Fast Intake");

  return await db.transaction(async (tx) => {
    // 1. Phone deduplication & Customer resolution
    const rawPhone = data.phone.trim();
    const normPhone = normalizePhone(rawPhone);

    let targetCustomerId: string;
    let isExistingCustomer = false;

    let matchedCustomer = null;
    if (normPhone) {
      const [found] = await tx
        .select({ id: customers.id, name: customers.name, phone: customers.phone })
        .from(customers)
        .where(
          and(
            eq(customers.tenantId, tenantId),
            or(
              eq(customers.phone, rawPhone),
              sql`regexp_replace(${customers.phone}, '\\D', '', 'g') = ${normPhone}`,
              sql`regexp_replace(${customers.phone}, '\\D', '', 'g') = ${"0" + normPhone}`,
              sql`regexp_replace(${customers.phone}, '\\D', '', 'g') = ${"20" + normPhone}`,
            ),
          ),
        )
        .limit(1);
      matchedCustomer = found;
    }

    if (matchedCustomer) {
      targetCustomerId = matchedCustomer.id;
      isExistingCustomer = true;
    } else {
      const [newCust] = await tx
        .insert(customers)
        .values({
          tenantId,
          name: data.name,
          phone: rawPhone,
          address: data.location || null,
        })
        .returning({ id: customers.id });
      targetCustomerId = newCust.id;
      isExistingCustomer = false;
    }

    // 2. Generate atomic OPP-XXXX code
    const opportunityNumber = await getNextOpportunityCode(tenantId, tx);

    // 3. Derive Title (e.g. "Kitchen — Ahmed Ali")
    const catTitle = (data.category && data.category.trim()) || "Commercial Project";
    const title = `${catTitle} — ${data.name.trim()}`;

    // 4. Insert Opportunity
    const [opp] = await tx
      .insert(opportunities)
      .values({
        tenantId,
        opportunityNumber,
        customerId: targetCustomerId,
        title,
        projectType: "residential",
        value: String(data.estimatedBudget ?? 0),
        salesOwner: role === "sales" ? userId : null,
        stage: data.initialStage ?? "new_lead",
        source: data.source || "walk_in",
        siteAddress: data.location || null,
        notes: data.notes || null,
        status: "open",
      })
      .returning({ id: opportunities.id });

    // 5. Audit Log
    try {
      await tx.insert(auditLog).values({
        tenantId,
        actorId: userId,
        entityType: "opportunity",
        entityId: opp.id,
        action: "quick_crm_intake",
        details: {
          opportunityNumber,
          customerId: targetCustomerId,
          isExistingCustomer,
          stage: data.initialStage ?? "new_lead",
          value: data.estimatedBudget ?? 0,
          category: data.category,
        },
      });
    } catch {
      // Non-blocking
    }

    return {
      customerId: targetCustomerId,
      opportunityId: opp.id,
      opportunityNumber,
      isExistingCustomer,
    };
  });
}

/**
 * Synchronize quote totals and status progression to the linked CRM opportunity.
 */
export async function syncQuoteOpportunity(
  tenantId: string,
  opportunityId: string | null | undefined,
  quoteTotal: number,
  quoteStatus: string,
): Promise<void> {
  if (!opportunityId) return;
  try {
    const [opp] = await db
      .select({ id: opportunities.id, stage: opportunities.stage, value: opportunities.value })
      .from(opportunities)
      .where(and(eq(opportunities.id, opportunityId), eq(opportunities.tenantId, tenantId)))
      .limit(1);

    if (opp) {
      const earlyStages = ["new_lead", "contacted", "qualified", "site_visit", "design_measurement"];
      const isNonDraft = quoteStatus !== "draft";
      const newStage = isNonDraft && earlyStages.includes(opp.stage) ? "quotation" : opp.stage;

      await db
        .update(opportunities)
        .set({
          ...(newStage !== opp.stage ? { stage: newStage } : {}),
          ...(quoteTotal > 0 ? { value: String(quoteTotal) } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(opportunities.id, opp.id), eq(opportunities.tenantId, tenantId)));
    }
  } catch {
    // Non-blocking
  }
}

