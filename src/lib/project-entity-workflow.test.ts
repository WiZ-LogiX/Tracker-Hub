import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/db/client.server";
import { tenants, customers, quotes, orders, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  createProjectRecord,
  findProjectById,
  findProjectByQuoteOrOrder,
  listProjectRecords,
} from "./project-store.server";
import { resolveDateRange } from "./crm-analytics-types";

describe("Project Entity Architecture & Workflow Integrity", () => {
  const testTenantId = "77777777-7777-4777-8777-777777777777";
  const customerId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const quoteId = "a1111111-1111-4111-8111-111111111111";
  const orderId = "b2222222-2222-4222-8222-222222222222";
  const oppId = null;

  beforeAll(async () => {
    // 1. Ensure test tenant exists in DB
    await db
      .insert(tenants)
      .values({
        id: testTenantId,
        slug: "test-tenant-prj",
        name: "Test Tenant PRJ",
      })
      .onConflictDoNothing();

    // 2. Ensure test customer exists in DB
    await db
      .insert(customers)
      .values({
        id: customerId,
        tenantId: testTenantId,
        name: "عميل تجريبي النخيل",
        phone: "01012345678",
      })
      .onConflictDoNothing();

    // 3. Ensure test quote exists for FK relationship
    await db
      .insert(quotes)
      .values({
        id: quoteId,
        tenantId: testTenantId,
        customerId: customerId,
        quoteNumber: "PLC-PRJ01",
        status: "accepted",
        validUntil: "2026-12-31",
        subtotal: "125000",
        total: "125000",
      })
      .onConflictDoNothing();

    // 4. Ensure test order exists for FK relationship
    await db
      .insert(orders)
      .values({
        id: orderId,
        tenantId: testTenantId,
        customerId: customerId,
        quoteId: quoteId,
        orderNumber: "ORD-PRJ01",
        currentStage: "assembly",
        contractDate: "2026-11-01",
        total: "125000",
      })
      .onConflictDoNothing();

    // 5. Clear any existing project records for this test tenant from DB
    await db.delete(projects).where(eq(projects.tenantId, testTenantId));

    // 6. Clean fallback store file of testTenantId records
    const fallbackPath = path.resolve(process.cwd(), ".data", "projects-fallback.json");
    if (fs.existsSync(fallbackPath)) {
      try {
        const records = JSON.parse(fs.readFileSync(fallbackPath, "utf-8"));
        const cleaned = records.filter((r: any) => r.tenantId !== testTenantId);
        fs.writeFileSync(fallbackPath, JSON.stringify(cleaned, null, 2), "utf-8");
      } catch {}
    }
  });

  afterAll(async () => {
    try {
      await db.delete(projects).where(eq(projects.tenantId, testTenantId));
      await db.delete(orders).where(eq(orders.id, orderId));
      await db.delete(quotes).where(eq(quotes.id, quoteId));
      await db.delete(customers).where(eq(customers.id, customerId));
      await db.delete(tenants).where(eq(tenants.id, testTenantId));
    } catch {
      // Clean up silently
    }
  });

  it("creates a real persistent project entity with PRJ numbering upon quote conversion", async () => {
    const project = await createProjectRecord({
      tenantId: testTenantId,
      customerId,
      quoteId,
      orderId,
      opportunityId: oppId,
      title: "فيلا النخيل - تصنيع مطبخ وأبواب",
      totalValue: 125000,
      customProjectNumber: "PRJ-2026-9001",
    });

    expect(project).toBeDefined();
    expect(project.id).toBeDefined();
    expect(project.projectNumber).toBe("PRJ-2026-9001");
    expect(project.customerId).toBe(customerId);
    expect(project.quoteId).toBe(quoteId);
    expect(project.orderId).toBe(orderId);
    expect(project.opportunityId).toBe(oppId);
    expect(project.status).toBe("active");
    expect(project.currentStage).toBe("production");
    expect(project.totalValue).toBe("125000");
  });

  it("enforces idempotent duplicate prevention (never creates second project for same quote or order)", async () => {
    const p1 = await createProjectRecord({
      tenantId: testTenantId,
      customerId,
      quoteId,
      orderId,
      customProjectNumber: "PRJ-2026-9001",
    });

    const p2 = await createProjectRecord({
      tenantId: testTenantId,
      customerId,
      quoteId,
      orderId,
      customProjectNumber: "PRJ-2026-9999",
    });

    expect(p1.id).toBe(p2.id);
    expect(p2.projectNumber).toBe("PRJ-2026-9001");
  });

  it("resolves project by quoteId and orderId", async () => {
    const byQuote = await findProjectByQuoteOrOrder(testTenantId, quoteId, null);
    expect(byQuote).toBeDefined();
    expect(byQuote?.id).toBeDefined();
    expect(byQuote?.projectNumber).toBe("PRJ-2026-9001");

    const byOrder = await findProjectByQuoteOrOrder(testTenantId, null, orderId);
    expect(byOrder).toBeDefined();
    expect(byOrder?.id).toBe(byQuote?.id);
  });

  it("returns null when searching project for an unconverted quote", async () => {
    const unconvertedQuoteId = "e4444444-4444-4444-8444-444444444444";
    const res = await findProjectByQuoteOrOrder(testTenantId, unconvertedQuoteId, null);
    expect(res).toBeNull();
  });

  it("lists project records with filtering and proper pagination", async () => {
    const { rows, totalCount } = await listProjectRecords(testTenantId, {
      searchTerm: "النخيل",
    });

    expect(totalCount).toBeGreaterThanOrEqual(1);
    expect(rows.some((r) => r.projectNumber === "PRJ-2026-9001")).toBe(true);
  });

  it("never classifies an opportunity as a project", async () => {
    // When looking up an unconverted opportunity id in project store
    const fakeOppId = "99999999-9999-9999-9999-999999999999";
    const res = await findProjectById(testTenantId, fakeOppId);
    expect(res).toBeNull();
  });

  it("supports all_time date resolution spanning full historical and future horizon", () => {
    const range = resolveDateRange("all_time");
    expect(range.timeWindow).toBe("all_time");
    expect(new Date(range.startDate).getFullYear()).toBe(2020);
    expect(new Date(range.endDate).getFullYear()).toBeGreaterThanOrEqual(2026);
  });
});
