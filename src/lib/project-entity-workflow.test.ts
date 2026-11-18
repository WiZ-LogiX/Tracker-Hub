import { describe, it, expect, beforeEach } from "vitest";
import {
  createProjectRecord,
  findProjectById,
  findProjectByQuoteOrOrder,
  listProjectRecords,
} from "./project-store.server";
import { resolveDateRange } from "./crm-analytics-types";

describe("Project Entity Architecture & Workflow Integrity", () => {
  const testTenantId = "77777777-7777-7777-7777-777777777777";
  const customerId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const quoteId = "qqqqqqqq-qqqq-qqqq-qqqq-qqqqqqqqqqqq";
  const orderId = "oooooooo-oooo-oooo-oooo-oooooooooooo";
  const oppId = "11111111-1111-1111-1111-111111111111";

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
    const unconvertedQuoteId = "uuuuuuuu-uuuu-uuuu-uuuu-uuuuuuuuuuuu";
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
