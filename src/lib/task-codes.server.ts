import { db } from "@/db/client.server";
import { tenantCounters } from "@/db/schema";
import { sql } from "drizzle-orm";

/**
 * Atomically generates the next sequential task code (TSK-XXXX) per tenant.
 * Uses the authoritative tenant_counters table with atomic ON CONFLICT DO UPDATE
 * row-level lock upsert, guaranteeing strict concurrency safety and monotonic
 * sequences without race conditions, duplicates, or cross-tenant leakage.
 */
export async function getNextTaskCode(tenantId: string): Promise<string> {
  const [row] = await db
    .insert(tenantCounters)
    .values({
      tenantId,
      counterType: "task",
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
  return `TSK-${nextVal}`;
}
