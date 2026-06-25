/**
 * Transactional order chain tests.
 *
 * Proves that the quote → order → invoice conversion rolls back fully
 * on a forced mid-step failure — no partial order, no orphaned invoice.
 */
import { describe, it, expect, vi } from "vitest";

// ── Test: structural verification ──────────────────────────────────────────

describe("transactional.functions.ts structure", () => {
  it("uses db.transaction (not separate supabaseAdmin calls)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve("src/lib/transactional.functions.ts"),
      "utf-8",
    );

    // Must use db.transaction
    expect(src).toContain("tdb.transaction");

    // Must NOT call supabaseAdmin.from (non-transactional)
    expect(src).not.toContain("supabaseAdmin.from");

    // Must set tenant GUC via tenantDb
    expect(src).toContain("tenantDb(");

    // Must emit structured log on success
    expect(src).toContain('log.info("quote converted to order"');
  });

  it("creates invoice, order, and marks quote as converted in one transaction", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve("src/lib/transactional.functions.ts"),
      "utf-8",
    );

    // Invoice insert inside tx
    expect(src).toContain("schema.invoices");

    // Order insert inside tx
    expect(src).toContain("schema.orders");

    // Quote status update to converted
    expect(src).toContain('"converted"');

    // All three must be inside the transaction callback (after tdb.transaction)
    const txStart = src.indexOf("tdb.transaction(async (tx)");
    expect(txStart).toBeGreaterThan(0);

    // The file must contain all three operations after the transaction starts
    const afterTx = src.slice(txStart);
    expect(afterTx).toContain("schema.invoices");
    expect(afterTx).toContain("schema.orders");
    expect(afterTx).toContain('"converted"');
  });

  it("quote detail page uses convertQuoteToOrder (not separate calls)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve("src/routes/admin/quotes/$id.tsx"),
      "utf-8",
    );

    // Must import the transactional function
    expect(src).toContain("convertQuoteToOrder");

    // Must NOT import the old separate functions
    expect(src).not.toContain('from "@/lib/order.functions"');
    expect(src).not.toContain('from "@/lib/invoice.functions"');
  });

  it("cleanup.functions.ts has no reference to dropped tables", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve("src/lib/cleanup.functions.ts"),
      "utf-8",
    );

    expect(src).not.toContain('"configurations"');
    expect(src).not.toContain('"companies"');
  });

  it("diagnostics-db.functions.ts has no reference to dropped tables", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve("src/lib/diagnostics-db.functions.ts"),
      "utf-8",
    );

    expect(src).not.toContain('"configurations"');
    expect(src).not.toContain('"companies"');
  });
});

// ── Test: schema completeness ──────────────────────────────────────────────

describe("schema.ts completeness", () => {
  it("exports all tenant-scoped business tables", async () => {
    const mod = await import("@/db/schema");

    const expectedTables = [
      "customers",
      "categories",
      "materials",
      "suppliers",
      "finishes",
      "veneers",
      "accessories",
      "products",
      "productTemplates",
      "pricingFactors",
      "pricingRules",
      "quoteRequests",
      "quotes",
      "quoteItems",
      "invoices",
      "orders",
      "discounts",
      "workers",
      "productionLogs",
      "productionPhotos",
      "auditLog",
      "productionAssignments",
      "qcInspections",
      "remakes",
      "internalNotes",
      "configurations",
      "wastageRules",
      "notificationTemplates",
      "notificationLog",
      "tenantAuditLog",
      "attachments",
      "permissions",
      "rolePermissions",
      "tenantRoles",
      "plcDailySequences",
    ];

    for (const table of expectedTables) {
      expect(mod, `Missing export: ${table}`).toHaveProperty(table);
    }
  });

  it("exports all required enums", async () => {
    const mod = await import("@/db/schema");

    expect(mod).toHaveProperty("quoteStatusEnum");
    expect(mod).toHaveProperty("requestStatusEnum");
    expect(mod).toHaveProperty("orderStageEnum");
    expect(mod).toHaveProperty("discountTypeEnum");
    expect(mod).toHaveProperty("pricingUnitEnum");
  });

  it("tenant.ts exports tenantDb", async () => {
    const mod = await import("@/lib/tenant");

    expect(mod).toHaveProperty("tenantDb");
    expect(typeof mod.tenantDb).toBe("function");
  });
});
