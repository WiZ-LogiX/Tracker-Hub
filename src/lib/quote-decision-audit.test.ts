import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "@/db/client.server";
import { quotes, auditLog, tasks } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { handleCustomerQuoteDecisionInternal } from "./quote-decision.server";

describe("Quote Decision Audit Log UUID Integrity (Zero Customer Actor Crash)", () => {
  const TENANT_ID = "2bf7cd99-d567-42d3-b5fc-22cc40654293";
  const CUSTOMER_ID = "30982974-f486-4dd9-b17c-7b634547b130";

  const quoteIdAccept = "00000000-aaaa-bbbb-cccc-111111111111";
  const tokenAccept = "token-audit-accept-001";

  const quoteIdReject = "00000000-aaaa-bbbb-cccc-222222222222";
  const tokenReject = "token-audit-reject-002";

  const quoteIdRevision = "00000000-aaaa-bbbb-cccc-333333333333";
  const tokenRevision = "token-audit-revision-003";

  const quoteIdUser = "00000000-aaaa-bbbb-cccc-444444444444";
  const tokenUser = "token-audit-user-004";
  const USER_ID = "00000000-0000-0000-0000-000000000001";

  const allQuoteIds = [
    quoteIdAccept,
    quoteIdReject,
    quoteIdRevision,
    quoteIdUser,
  ];

  async function cleanup() {
    try {
      await db.delete(auditLog).where(inArray(auditLog.entityId, allQuoteIds));
      await db.delete(tasks).where(inArray(tasks.quoteId, allQuoteIds));
      await db.delete(quotes).where(inArray(quotes.id, allQuoteIds));
    } catch {
      // Best effort cleanup
    }
  }

  beforeAll(async () => {
    await cleanup();

    // Seed test quotes
    await db.insert(quotes).values([
      {
        id: quoteIdAccept,
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        quoteNumber: "PLC-AUDIT-ACC-01",
        status: "sent",
        subtotal: "10000.00",
        total: "10000.00",
        validUntil: "2026-12-31",
        snapshot: {
          tracking_token: tokenAccept,
          lifecycle: { stage: "awaiting_customer_decision" },
        },
      },
      {
        id: quoteIdReject,
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        quoteNumber: "PLC-AUDIT-REJ-02",
        status: "sent",
        subtotal: "12000.00",
        total: "12000.00",
        validUntil: "2026-12-31",
        snapshot: {
          tracking_token: tokenReject,
          lifecycle: { stage: "awaiting_customer_decision" },
        },
      },
      {
        id: quoteIdRevision,
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        quoteNumber: "PLC-AUDIT-REV-03",
        status: "sent",
        subtotal: "15000.00",
        total: "15000.00",
        validUntil: "2026-12-31",
        snapshot: {
          tracking_token: tokenRevision,
          version: 1,
          version_history: [],
          lifecycle: { stage: "awaiting_customer_decision" },
        },
      },
      {
        id: quoteIdUser,
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        quoteNumber: "PLC-AUDIT-USR-04",
        status: "sent",
        subtotal: "20000.00",
        total: "20000.00",
        validUntil: "2026-12-31",
        snapshot: {
          tracking_token: tokenUser,
          lifecycle: { stage: "awaiting_customer_decision" },
        },
      },
    ]);
  });

  afterAll(async () => {
    await cleanup();
  });

  it("1. Public customer acceptance writes audit_log with actor_id = null and actorType = customer", async () => {
    const res = await handleCustomerQuoteDecisionInternal({
      trackingToken: tokenAccept,
      decision: "accept",
      notes: "Quotation accepted by customer via portal",
      channel: "track_page",
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe("accepted");

    // Verify quote updated
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteIdAccept));
    expect(quote.status).toBe("accepted");

    // Verify audit_log row inserted without invalid UUID syntax error
    const logs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, quoteIdAccept));

    expect(logs.length).toBeGreaterThanOrEqual(1);
    const acceptLog = logs.find((l) => l.action === "quote_accepted_by_customer");
    expect(acceptLog).toBeDefined();
    expect(acceptLog?.actorId).toBeNull();
    expect(acceptLog?.entityType).toBe("quotation");

    const details = acceptLog?.details as Record<string, any>;
    expect(details?.actorType).toBe("customer");
    expect(details?.channel).toBe("track_page");
    expect(details?.quoteNumber).toBe("PLC-AUDIT-ACC-01");
    expect(details?.notes).toBe("Quotation accepted by customer via portal");
  });

  it("2. Public customer rejection writes audit_log with actor_id = null and actorType = customer", async () => {
    const res = await handleCustomerQuoteDecisionInternal({
      trackingToken: tokenReject,
      decision: "reject",
      notes: "Budget constraints",
      channel: "track_page",
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe("rejected");

    // Verify quote updated
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteIdReject));
    expect(quote.status).toBe("rejected");

    // Verify audit_log
    const logs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, quoteIdReject));

    const rejLog = logs.find((l) => l.action === "quote_rejected_by_customer");
    expect(rejLog).toBeDefined();
    expect(rejLog?.actorId).toBeNull();

    const details = rejLog?.details as Record<string, any>;
    expect(details?.actorType).toBe("customer");
    expect(details?.channel).toBe("track_page");
    expect(details?.quoteNumber).toBe("PLC-AUDIT-REJ-02");
    expect(details?.reason).toBe("Budget constraints");
  });

  it("3. Public customer revision request writes audit_log with actor_id = null and actorType = customer", async () => {
    const res = await handleCustomerQuoteDecisionInternal({
      trackingToken: tokenRevision,
      decision: "revision_requested",
      notes: "Please modify dimensions of wardrobe",
      channel: "track_page",
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe("revision_requested");

    // Verify quote updated back to draft for editing
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteIdRevision));
    expect(quote.status).toBe("draft");

    // Verify audit_log
    const logs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, quoteIdRevision));

    const revLog = logs.find((l) => l.action === "quote_revision_requested_by_customer");
    expect(revLog).toBeDefined();
    expect(revLog?.actorId).toBeNull();

    const details = revLog?.details as Record<string, any>;
    expect(details?.actorType).toBe("customer");
    expect(details?.channel).toBe("track_page");
    expect(details?.quoteNumber).toBe("PLC-AUDIT-REV-03");
    expect(details?.version).toBe(2);
    expect(details?.revisionNotes).toBe("Please modify dimensions of wardrobe");
  });

  it("4. Authenticated user decision preserves valid UUID actor_id and marks actorType = user", async () => {
    const res = await handleCustomerQuoteDecisionInternal({
      quoteId: quoteIdUser,
      decision: "accept",
      userId: USER_ID,
      channel: "crm_manual",
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe("accepted");

    const logs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, quoteIdUser));

    const userLog = logs.find((l) => l.action === "quote_accepted_by_customer");
    expect(userLog).toBeDefined();
    expect(userLog?.actorId).toBe(USER_ID);

    const details = userLog?.details as Record<string, any>;
    expect(details?.actorType).toBe("user");
    expect(details?.channel).toBe("crm_manual");
  });

  it("5. Static audit sweep: zero literal 'customer' or 'system' strings passed to actorId", () => {
    const filesToAudit = [
      resolve(__dirname, "quote-decision.server.ts"),
      resolve(__dirname, "quote.functions.ts"),
      resolve(__dirname, "transactional.functions.ts"),
    ];

    for (const filePath of filesToAudit) {
      const content = readFileSync(filePath, "utf-8");
      // Check no lines match actorId: "customer" or actorId: "system"
      expect(content).not.toMatch(/actorId:\s*["']customer["']/);
      expect(content).not.toMatch(/actorId:\s*["']system["']/);
      expect(content).not.toMatch(/actorId:\s*.*?\?\?\s*["']customer["']/);
      expect(content).not.toMatch(/actorId:\s*.*?\?\?\s*["']system["']/);
    }
  });
});
