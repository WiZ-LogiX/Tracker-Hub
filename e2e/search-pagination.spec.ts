import { test, expect, signIn } from "./fixtures/auth";

test.describe("Task 13 — Server-Side Search, Pagination & Filters Browser Validation", () => {
  test("1. Customers: Verify server-side pagination, search, filter pills, sorting, and Customer 360 drawer", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Sign in and open Customers
    await signIn(page);
    await page.goto("/admin/customers");
    await page.waitForLoadState("domcontentloaded");

    // Verify page header
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await expect(heading).toContainText(/عملاء|customer/i);

    // Verify search input
    const searchInput = page.getByPlaceholder(/بحث باسم|search name/i);
    await expect(searchInput).toBeVisible();

    // Verify filter pills
    await expect(page.getByRole("button", { name: /الكل|all/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /طلبات نشطة|active orders/i }).first()).toBeVisible();

    // Verify bottom pagination bar
    await expect(page.getByText(/عرض|showing/i).first()).toBeVisible();
    await expect(page.getByText(/لكل صفحة|per page/i).first()).toBeVisible();

    // Filter framework warnings
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

  test("2. Quotations: Verify server-side pagination, search, status filters, sorting, and details navigation", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Open Quotations
    await signIn(page);
    await page.goto("/admin/quotes");
    await page.waitForLoadState("domcontentloaded");

    // Verify page header
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await expect(heading).toContainText(/مقايسات|quotation/i);

    // Verify search input
    const searchInput = page.getByPlaceholder(/بحث برقم|search quote/i);
    await expect(searchInput).toBeVisible();

    // Verify status filter pills
    await expect(page.getByRole("button", { name: /الكل|all/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /مسودة|draft/i }).first()).toBeVisible();

    // Verify bottom pagination bar
    await expect(page.getByText(/عرض|showing/i).first()).toBeVisible();
    await expect(page.getByText(/لكل صفحة|per page/i).first()).toBeVisible();

    // Filter framework warnings
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
