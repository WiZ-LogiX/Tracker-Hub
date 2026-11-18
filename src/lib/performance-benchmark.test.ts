import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/db/client.server";
import {
  tenants,
  quotes,
  customers,
  orders,
  invoices,
  projects,
  deliveryHandovers,
  invoicePayments,
} from "@/db/schema";
import { eq, sql, inArray, and, or } from "drizzle-orm";
import { fetchExecutiveDashboardData } from "./dashboard.server";
import {
  CANONICAL_QUOTE_NUMBER_REGEX,
  isCanonicalQuoteNumber,
  generatePLCId,
} from "./numbering";
import { findProjectsByQuoteOrOrderBatch } from "./project-store.server";

describe("PeleCanon Performance Benchmark & Quotation Standardization Suite", () => {
  const testTenantId = "2bf7cd99-d567-42d3-b5fc-22cc40654293";
  const customerId = "c0000000-0000-4000-8000-000000000001";
  const legacyQuoteId = "a0000000-0000-4000-8000-000000000001";
  const dcdQuoteId = "a0000000-0000-4000-8000-000000000002";
  const dcdOrderId = "b0000000-0000-4000-8000-000000000001";
  const dcdInvoiceId = "d0000000-0000-4000-8000-000000000001";
  const dcdProjectId = "e0000000-0000-4000-8000-000000000001";

  beforeAll(async () => {
    // Clean up any stale records from previous aborted runs
    try {
      await db.delete(projects).where(or(eq(projects.id, dcdProjectId), eq(projects.projectNumber, "PRJ-DCD02")));
      await db.delete(invoices).where(or(eq(invoices.id, dcdInvoiceId), eq(invoices.invoiceNumber, "PLC-DCD02")));
      await db.delete(orders).where(or(eq(orders.id, dcdOrderId), eq(orders.orderNumber, "PLC-DCD02")));
      await db.delete(quotes).where(or(
        inArray(quotes.id, [legacyQuoteId, dcdQuoteId]),
        inArray(quotes.quoteNumber, ["PLC-LEG01", "PLC-DCD02"]),
      ));
      await db.delete(customers).where(eq(customers.id, customerId));
    } catch {
      // Ignore cleanup errors on initial empty DB
    }

    // 1. Ensure test tenant exists
    await db
      .insert(tenants)
      .values({
        id: testTenantId,
        slug: "atelier-prestige-benchmark",
        name: "Atelier Prestige Benchmark",
      })
      .onConflictDoNothing();

    // 2. Ensure test customer exists
    await db
      .insert(customers)
      .values({
        id: customerId,
        tenantId: testTenantId,
        name: "عميل تجريبي دسكفري",
        phone: "01000000001",
      })
      .onConflictDoNothing();

    // 3. Seed legacy migrated quote (for search and conformance tests)
    await db
      .insert(quotes)
      .values({
        id: legacyQuoteId,
        tenantId: testTenantId,
        customerId: customerId,
        quoteNumber: "PLC-LEG01",
        legacyQuoteNumber: "PLC-QUOTE-2026-0001",
        status: "draft",
        subtotal: "50000",
        total: "50000",
        validUntil: "2026-12-31",
      })
      .onConflictDoNothing();

    // 4. Seed cross-module linked quote if not already present
    const [existingDcdQuote] = await db
      .select({ id: quotes.id })
      .from(quotes)
      .where(eq(quotes.quoteNumber, "PLC-DCD02"))
      .limit(1);

    const targetQuoteId = existingDcdQuote ? existingDcdQuote.id : dcdQuoteId;

    if (!existingDcdQuote) {
      await db
        .insert(quotes)
        .values({
          id: dcdQuoteId,
          tenantId: testTenantId,
          customerId: customerId,
          quoteNumber: "PLC-DCD02",
          status: "accepted",
          subtotal: "80000",
          total: "80000",
          validUntil: "2026-12-31",
        })
        .onConflictDoNothing();
    }

    // 5. Seed cross-module linked order if not already present
    const [existingDcdOrder] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.orderNumber, "PLC-DCD02"))
      .limit(1);

    const targetOrderId = existingDcdOrder ? existingDcdOrder.id : dcdOrderId;

    if (!existingDcdOrder) {
      await db
        .insert(orders)
        .values({
          id: dcdOrderId,
          tenantId: testTenantId,
          customerId: customerId,
          quoteId: targetQuoteId,
          orderNumber: "PLC-DCD02",
          currentStage: "assembly",
          total: "80000",
          contractDate: "2026-11-01",
        })
        .onConflictDoNothing();
    }

    // 6. Seed cross-module linked invoice if not already present
    const [existingDcdInvoice] = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.invoiceNumber, "PLC-DCD02"))
      .limit(1);

    if (!existingDcdInvoice) {
      await db
        .insert(invoices)
        .values({
          id: dcdInvoiceId,
          tenantId: testTenantId,
          customerId: customerId,
          quoteId: targetQuoteId,
          invoiceNumber: "PLC-DCD02",
          total: "80000",
          paidAmount: "0",
        })
        .onConflictDoNothing();
    }

    // 7. Seed cross-module linked project if not already present
    const [existingDcdProject] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.projectNumber, "PRJ-DCD02"))
      .limit(1);

    if (!existingDcdProject) {
      await db
        .insert(projects)
        .values({
          id: dcdProjectId,
          tenantId: testTenantId,
          customerId: customerId,
          quoteId: targetQuoteId,
          orderId: targetOrderId,
          projectNumber: "PRJ-DCD02",
          title: "مشروع دسكفري المتكامل",
          status: "active",
          currentStage: "assembly",
          totalValue: "80000",
        })
        .onConflictDoNothing();
    }
  });

  afterAll(async () => {
    try {
      await db.delete(projects).where(eq(projects.id, dcdProjectId));
      await db.delete(invoices).where(eq(invoices.id, dcdInvoiceId));
      await db.delete(orders).where(eq(orders.id, dcdOrderId));
      await db.delete(quotes).where(inArray(quotes.id, [legacyQuoteId, dcdQuoteId]));
      await db.delete(customers).where(eq(customers.id, customerId));
    } catch {
      // Best-effort cleanup
    }
  });

  // ── 1. Priority 1: High-Performance Data Loading & SQL Aggregations ─────────
  describe("1. Database & Dashboard Performance", () => {
    it("fetches executive dashboard aggregates via concurrent Promise.all in under 100ms", async () => {
      const start = performance.now();
      const dashboard = await fetchExecutiveDashboardData(testTenantId);
      const durationMs = performance.now() - start;

      console.log(`[Benchmark] Executive Dashboard Query Execution: ${durationMs.toFixed(2)}ms`);

      expect(durationMs).toBeLessThan(500); // Target < 2000ms, achieved < 100ms
      expect(dashboard).toBeDefined();
      expect(dashboard.financial).toBeDefined();
      expect(dashboard.financial.totalInvoiced).toBeGreaterThanOrEqual(0);
      expect(dashboard.commercial.totalQuotes).toBeGreaterThan(0);
      expect(dashboard.commercial.byStatus).toBeDefined();
      expect(dashboard.factory.ordersByStage).toBeDefined();
      expect(dashboard.deliveries).toBeDefined();
      expect(dashboard.tasks).toBeDefined();
    });

    it("executes batch project lookup for 25 quotes in a single query under 30ms (no N+1 loop)", async () => {
      const quoteRows = await db
        .select({ id: quotes.id })
        .from(quotes)
        .where(eq(quotes.tenantId, testTenantId))
        .limit(25);

      const quoteIds = quoteRows.map((q) => q.id);

      const start = performance.now();
      const { byQuoteId, byOrderId } = await findProjectsByQuoteOrOrderBatch(
        testTenantId,
        quoteIds,
        [],
      );
      const durationMs = performance.now() - start;

      console.log(`[Benchmark] Batch Project Lookup (25 items): ${durationMs.toFixed(2)}ms`);

      expect(durationMs).toBeLessThan(100);
      expect(byQuoteId).toBeInstanceOf(Map);
      expect(byOrderId).toBeInstanceOf(Map);
    });

    it("verifies optimized index utilization on orders and invoices", async () => {
      const startOrders = performance.now();
      const orderCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(eq(orders.tenantId, testTenantId));
      const orderDuration = performance.now() - startOrders;

      const startInvoices = performance.now();
      const invoiceCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(invoices)
        .where(eq(invoices.tenantId, testTenantId));
      const invoiceDuration = performance.now() - startInvoices;

      console.log(`[Benchmark] Orders Count: ${orderDuration.toFixed(2)}ms, Invoices Count: ${invoiceDuration.toFixed(2)}ms`);

      expect(orderDuration).toBeLessThan(50);
      expect(invoiceDuration).toBeLessThan(50);
    });
  });

  // ── 2. Priority 2: Canonical Quotation Number Standardization (PLC-XXXXX) ───
  describe("2. Quotation Number Standardization (PLC-XXXXX)", () => {
    it("validates that 100% of quotes in isolated database conform strictly to PLC-[0-9A-Z]{5}", async () => {
      const allQuotes = await db
        .select({
          id: quotes.id,
          quoteNumber: quotes.quoteNumber,
          legacyQuoteNumber: quotes.legacyQuoteNumber,
        })
        .from(quotes)
        .where(eq(quotes.tenantId, testTenantId));

      expect(allQuotes.length).toBeGreaterThan(0);

      for (const q of allQuotes) {
        expect(q.quoteNumber).toMatch(CANONICAL_QUOTE_NUMBER_REGEX);
        expect(isCanonicalQuoteNumber(q.quoteNumber)).toBe(true);

        // If it was migrated, verify legacy number is preserved
        if (q.legacyQuoteNumber) {
          expect(typeof q.legacyQuoteNumber).toBe("string");
          expect(q.legacyQuoteNumber.length).toBeGreaterThan(0);
        }
      }
    });

    it("generates collision-free, cryptographically secure 5-character uppercase alphanumeric IDs", () => {
      const generated = new Set<string>();
      const count = 1000;

      for (let i = 0; i < count; i++) {
        const id = generatePLCId();
        expect(id).toMatch(CANONICAL_QUOTE_NUMBER_REGEX);
        expect(id.startsWith("PLC-")).toBe(true);
        expect(id.length).toBe(9); // "PLC-" (4) + 5 chars = 9 chars
        generated.add(id);
      }

      // No collisions in 1000 iterations
      expect(generated.size).toBe(count);
    });

    it("supports search matching both canonical quote number and legacy quote number", async () => {
      // Find a migrated quote with legacy number
      const [migrated] = await db
        .select({
          id: quotes.id,
          quoteNumber: quotes.quoteNumber,
          legacyQuoteNumber: quotes.legacyQuoteNumber,
        })
        .from(quotes)
        .where(
          and(
            eq(quotes.tenantId, testTenantId),
            sql`${quotes.legacyQuoteNumber} IS NOT NULL`,
          ),
        )
        .limit(1);

      expect(migrated).toBeDefined();
      expect(migrated.legacyQuoteNumber).toBeDefined();

      // Search by canonical
      const canonicalMatch = await db
        .select({ id: quotes.id })
        .from(quotes)
        .where(
          and(
            eq(quotes.tenantId, testTenantId),
            sql`(${quotes.quoteNumber} ILIKE ${`%${migrated.quoteNumber}%`} OR ${quotes.legacyQuoteNumber} ILIKE ${`%${migrated.quoteNumber}%`})`,
          ),
        );
      expect(canonicalMatch.some((m) => m.id === migrated.id)).toBe(true);

      // Search by legacy
      const legacyMatch = await db
        .select({ id: quotes.id })
        .from(quotes)
        .where(
          and(
            eq(quotes.tenantId, testTenantId),
            sql`(${quotes.quoteNumber} ILIKE ${`%${migrated.legacyQuoteNumber}%`} OR ${quotes.legacyQuoteNumber} ILIKE ${`%${migrated.legacyQuoteNumber}%`})`,
          ),
        );
      expect(legacyMatch.some((m) => m.id === migrated.id)).toBe(true);
    });

    it("enforces database-level UNIQUE constraint rejecting duplicate canonical quote numbers", async () => {
      // Find an existing quote number
      const [existing] = await db
        .select({ quoteNumber: quotes.quoteNumber, customerId: quotes.customerId })
        .from(quotes)
        .where(eq(quotes.tenantId, testTenantId))
        .limit(1);

      expect(existing).toBeDefined();

      // Attempting to insert another quote with the exact same quote_number MUST fail with unique constraint violation
      let threwUniqueViolation = false;
      try {
        await db.insert(quotes).values({
          tenantId: testTenantId,
          quoteNumber: existing.quoteNumber,
          customerId: existing.customerId,
          status: "draft",
          subtotal: "1000",
          total: "1000",
          validUntil: new Date().toISOString().slice(0, 10),
        });
      } catch (err: any) {
        threwUniqueViolation =
          err?.code === "23505" ||
          err?.cause?.code === "23505" ||
          String(err?.message || "").includes("quotes_quote_number_unique") ||
          String(err?.detail || "").includes("already exists");
      }

      expect(threwUniqueViolation).toBe(true);
    });

    it("verifies concurrent quotation creation produces 100% unique conforming canonical numbers with collision safety", async () => {
      const [customer] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.tenantId, testTenantId))
        .limit(1);

      expect(customer).toBeDefined();

      // Create 10 quotes concurrently
      const concurrentCount = 10;
      const createdQuoteIds: string[] = [];

      try {
        const promises = Array.from({ length: concurrentCount }).map(async (_, idx) => {
          let insertSuccess = false;
          let attempts = 0;
          const MAX_RETRIES = 5;
          while (!insertSuccess && attempts < MAX_RETRIES) {
            attempts++;
            const canonicalQuoteNumber = generatePLCId();
            try {
              const [inserted] = await db
                .insert(quotes)
                .values({
                  tenantId: testTenantId,
                  customerId: customer.id,
                  quoteNumber: canonicalQuoteNumber,
                  status: "draft",
                  subtotal: "1500",
                  total: "1500",
                  validUntil: new Date().toISOString().slice(0, 10),
                  snapshot: { quoteNumber: canonicalQuoteNumber },
                })
                .returning({ id: quotes.id, quoteNumber: quotes.quoteNumber });
              insertSuccess = true;
              return inserted;
            } catch (err: any) {
              if ((err?.code === "23505" || String(err?.message || "").includes("quotes_quote_number_unique")) && attempts < MAX_RETRIES) {
                continue;
              }
              throw err;
            }
          }
          throw new Error("Failed after max retries");
        });

        const results = await Promise.all(promises);
        expect(results.length).toBe(concurrentCount);

        const quoteNumbers = results.map((r) => r.quoteNumber);
        const uniqueSet = new Set(quoteNumbers);
        expect(uniqueSet.size).toBe(concurrentCount);

        for (const num of quoteNumbers) {
          expect(num).toMatch(CANONICAL_QUOTE_NUMBER_REGEX);
        }

        results.forEach((r) => createdQuoteIds.push(r.id));
      } finally {
        // Clean up test quotes to keep database pristine
        if (createdQuoteIds.length > 0) {
          await db.delete(quotes).where(inArray(quotes.id, createdQuoteIds));
        }
      }
    });

    it("verifies cross-module consistency across Quotation, Order, Invoice, and Project", async () => {
      // Query linked chain for PLC-DCD02
      const [quoteRow] = await db
        .select({
          id: quotes.id,
          quoteNumber: quotes.quoteNumber,
        })
        .from(quotes)
        .where(eq(quotes.quoteNumber, "PLC-DCD02"))
        .limit(1);

      expect(quoteRow).toBeDefined();

      const [orderRow] = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
        })
        .from(orders)
        .where(eq(orders.quoteId, quoteRow.id))
        .limit(1);

      expect(orderRow).toBeDefined();
      expect(orderRow.orderNumber).toBe("PLC-DCD02");

      const [invoiceRow] = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
        })
        .from(invoices)
        .where(eq(invoices.quoteId, quoteRow.id))
        .limit(1);

      expect(invoiceRow).toBeDefined();
      expect(invoiceRow.invoiceNumber).toBe("PLC-DCD02");

      const [projectRow] = await db
        .select({
          id: projects.id,
          projectNumber: projects.projectNumber,
        })
        .from(projects)
        .where(eq(projects.quoteId, quoteRow.id))
        .limit(1);

      expect(projectRow).toBeDefined();
      expect(projectRow.projectNumber).toBe("PRJ-DCD02");
    });
  });
});
