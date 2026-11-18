import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { db } from "@/db/client.server";
import { tenants, customers, opportunities, quotes, appUsers, auditLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  executeQuickCrmIntake,
  syncQuoteOpportunity,
} from "@/lib/crm-fast-intake.server";
import { forbidWorker, type TenantContext } from "@/lib/tenant-context";

describe("Sprint 2 — Fast CRM Intake & Relational Opportunity Sync Suite", () => {
  const TEST_TENANT_ID = "00000000-0000-0000-0000-000000000001";
  const TEST_USER_ID = "00000000-0000-0000-0000-000000000002";

  const adminCtx: TenantContext = {
    tenantId: TEST_TENANT_ID,
    userId: TEST_USER_ID,
    role: "admin",
  };

  const salesCtx: TenantContext = {
    tenantId: TEST_TENANT_ID,
    userId: TEST_USER_ID,
    role: "sales",
  };

  const workerCtx: TenantContext = {
    tenantId: TEST_TENANT_ID,
    userId: TEST_USER_ID,
    role: "worker",
  };

  beforeAll(async () => {
    // Ensure test tenant exists
    await db
      .insert(tenants)
      .values({
        id: TEST_TENANT_ID,
        name: "Test Fast Intake Tenant",
        slug: `test-fast-intake-${Date.now()}`,
      })
      .onConflictDoNothing();

    // Ensure test user exists
    await db
      .insert(appUsers)
      .values({
        id: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        username: `sales_tester_${Date.now()}`,
        displayName: "Sales Tester",
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    // Clean up created records for this test tenant
    try {
      await db.delete(quotes).where(eq(quotes.tenantId, TEST_TENANT_ID));
      await db.delete(opportunities).where(eq(opportunities.tenantId, TEST_TENANT_ID));
      await db.delete(customers).where(eq(customers.tenantId, TEST_TENANT_ID));
      await db.delete(auditLog).where(eq(auditLog.tenantId, TEST_TENANT_ID));
    } catch {
      // Non-blocking cleanup
    }
  });

  // ── 1. Relational Opportunity Binding & Sync ──────────────────────────────
  describe("1. Relational Opportunity Binding & Sync", () => {
    it("persists opportunityId directly into quotes.opportunityId column on insert and syncs opportunity stage/value", async () => {
      // 1. Create a customer
      const [cust] = await db
        .insert(customers)
        .values({
          tenantId: TEST_TENANT_ID,
          name: "Relational Opp Customer",
          phone: "01099887766",
        })
        .returning();

      // 2. Create an opportunity in 'qualified' stage
      const [opp] = await db
        .insert(opportunities)
        .values({
          tenantId: TEST_TENANT_ID,
          opportunityNumber: `OPP-TEST-${Date.now()}`,
          customerId: cust.id,
          title: "Kitchen — Relational Test",
          stage: "qualified",
          value: "0",
        })
        .returning();

      // 3. Insert quote linked to opportunity as draft
      const quoteNumber = `PLC-TEST-${Date.now()}`;
      const [createdQuote] = await db
        .insert(quotes)
        .values({
          tenantId: TEST_TENANT_ID,
          quoteNumber,
          customerId: cust.id,
          opportunityId: opp.id,
          status: "draft",
          subtotal: "30000",
          total: "30000",
          validUntil: "2026-12-31",
        })
        .returning();

      expect(createdQuote.id).toBeDefined();

      // 4. Verify relational quotes.opportunityId in PostgreSQL database
      const [dbQuote] = await db
        .select({
          id: quotes.id,
          opportunityId: quotes.opportunityId,
          status: quotes.status,
          total: quotes.total,
        })
        .from(quotes)
        .where(eq(quotes.id, createdQuote.id));

      expect(dbQuote.opportunityId).toBe(opp.id);
      expect(Number(dbQuote.total)).toBe(30000);

      // 5. Run opportunity sync with draft status: value should update, stage should remain 'qualified'
      await syncQuoteOpportunity(TEST_TENANT_ID, opp.id, 30000, "draft");

      const [dbOppDraft] = await db
        .select({ stage: opportunities.stage, value: opportunities.value })
        .from(opportunities)
        .where(eq(opportunities.id, opp.id));

      expect(Number(dbOppDraft.value)).toBe(30000);
      expect(dbOppDraft.stage).toBe("qualified");

      // 6. Run opportunity sync with 'sent' status: stage should auto-advance to 'quotation' and value update
      await syncQuoteOpportunity(TEST_TENANT_ID, opp.id, 50000, "sent");

      const [dbOppSent] = await db
        .select({ stage: opportunities.stage, value: opportunities.value })
        .from(opportunities)
        .where(eq(opportunities.id, opp.id));

      expect(dbOppSent.stage).toBe("quotation");
      expect(Number(dbOppSent.value)).toBe(50000);
    });

    it("verifies saveCommercialQuote and getQuoteCommercialContext implementation in quote.functions.ts", () => {
      const quoteFuncSrc = readFileSync(
        resolve("src/lib/quote.functions.ts"),
        "utf-8",
      );

      // Relational opportunity binding on insert and update
      expect(quoteFuncSrc).toContain("opportunityId: data.opportunity_id ?? null");
      expect(quoteFuncSrc).toContain("syncQuoteOpportunity(tenantId, data.opportunity_id, totals.total, data.status)");

      // Relational opportunityId reading in getQuoteCommercialContext
      expect(quoteFuncSrc).toContain("opportunityId: quotes.opportunityId");
      expect(quoteFuncSrc).toContain("const oppId = q.opportunityId ||");
    });
  });

  // ── 2. Atomic quickCrmIntake Server Function ──────────────────────────────
  describe("2. Atomic quickCrmIntake Server Function", () => {
    it("creates new customer and opportunity atomically when phone is new", async () => {
      const phone = `010${Math.floor(10000000 + Math.random() * 90000000)}`;
      const name = "Eng. Sherif Kamel";

      const result = await executeQuickCrmIntake(salesCtx, {
        name,
        phone,
        category: "Dressing Room",
        estimatedBudget: 85000,
        source: "walk_in",
        location: "New Cairo",
        notes: "Walk-in showroom inquiry",
        initialStage: "new_lead",
      });

      expect(result.customerId).toBeDefined();
      expect(result.opportunityId).toBeDefined();
      expect(result.isExistingCustomer).toBe(false);
      expect(result.opportunityNumber).toMatch(/^OPP-\d+$/);

      // Verify in DB
      const [opp] = await db
        .select()
        .from(opportunities)
        .where(eq(opportunities.id, result.opportunityId));

      expect(opp.title).toBe("Dressing Room — Eng. Sherif Kamel");
      expect(opp.customerId).toBe(result.customerId);
      expect(Number(opp.value)).toBe(85000);
      expect(opp.stage).toBe("new_lead");
      expect(opp.salesOwner).toBe(TEST_USER_ID); // Auto-assigned because role === 'sales'
    });

    it("deduplicates customer by normalized phone and reuses customer record", async () => {
      const basePhone = `011${Math.floor(10000000 + Math.random() * 90000000)}`;

      // 1. First intake with raw local phone (e.g. 01112345678)
      const res1 = await executeQuickCrmIntake(adminCtx, {
        name: "Amr Diab",
        phone: basePhone,
        category: "Kitchen",
        estimatedBudget: 200000,
        initialStage: "new_lead",
      });

      expect(res1.isExistingCustomer).toBe(false);

      // 2. Second intake with international prefix +20 (e.g. +20 11 1234 5678)
      const formattedPhone = `+20 ${basePhone.slice(1, 3)} ${basePhone.slice(3, 7)} ${basePhone.slice(7)}`;

      const res2 = await executeQuickCrmIntake(adminCtx, {
        name: "Amr Diab (Second Inquiry)",
        phone: formattedPhone,
        category: "Bathroom Vanity",
        estimatedBudget: 45000,
        initialStage: "quotation",
      });

      // Customer should be reused!
      expect(res2.isExistingCustomer).toBe(true);
      expect(res2.customerId).toBe(res1.customerId);
      expect(res2.opportunityId).not.toBe(res1.opportunityId);
      expect(res2.opportunityNumber).toMatch(/^OPP-\d+$/);

      // Verify second opportunity stage is 'quotation'
      const [opp2] = await db
        .select()
        .from(opportunities)
        .where(eq(opportunities.id, res2.opportunityId));

      expect(opp2.stage).toBe("quotation");
      expect(opp2.customerId).toBe(res1.customerId);
      expect(opp2.title).toBe("Bathroom Vanity — Amr Diab (Second Inquiry)");
    });

    it("strictly forbids task workers from invoking quickCrmIntake", () => {
      expect(() => forbidWorker(workerCtx, "CRM Fast Intake")).toThrowError(
        /Forbidden: Task Workers do not have access to CRM Fast Intake/i,
      );
      expect(() => forbidWorker(adminCtx, "CRM Fast Intake")).not.toThrow();
      expect(() => forbidWorker(salesCtx, "CRM Fast Intake")).not.toThrow();
    });
  });
});
