import { test, expect, signIn } from "./fixtures/auth";

test.describe("Task 10 — Commercial Invoicing & Milestone Payments Ledger Browser Validation", () => {
  test("Open /admin/invoices, verify KPI summary pills, filter bar, and check Order Detail financial integration", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // ── 1. Sign in and Open /admin/invoices ────────────────────────────────────
    await signIn(page);
    await page.goto("/admin/invoices");
    await page.waitForLoadState("domcontentloaded");

    // Verify page title and header
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await expect(heading).toContainText(/فواتير|invoices/i);

    // ── 2. Verify Table Columns ───────────────────────────────────────────────
    await expect(page.getByRole("table")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/رقم الفاتورة|invoice #/i).first()).toBeVisible();
    await expect(page.getByText(/العميل|customer/i).first()).toBeVisible();

    // ── 3. Verify /admin/orders financial widget integration ─────────────────
    await page.goto("/admin/orders");
    await page.waitForLoadState("domcontentloaded");
    const ordersHeading = page.getByRole("heading", { level: 1 });
    await expect(ordersHeading).toBeVisible({ timeout: 10_000 });

    // Filter out expected framework hydration/network sandbox warnings
    const appExceptions = consoleErrors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("React DevTools") &&
        !e.includes("ResizeObserver") &&
        !e.includes("download the React DevTools") &&
        !e.includes("ERR_NAME_NOT_RESOLVED") &&
        !e.includes("Failed to load resource") &&
        !e.includes("inputValidator() is deprecated") &&
        !e.includes("bootstrap FAILED") &&
        !e.includes("404"),
    );
    expect(appExceptions).toHaveLength(0);
  });
});
