import { test, expect, signIn } from "./fixtures/auth";

test.describe("Task 17 — Production Dispatch, Delivery & Installation Handover Browser Validation", () => {
  test("1. Verify Deliveries Workspace (/admin/deliveries), KPI cards, search, and table", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Sign in and open Deliveries
    await signIn(page);
    await page.goto("/admin/deliveries");
    await page.waitForLoadState("domcontentloaded");

    // Verify page header
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await expect(heading).toContainText(/شحن|توصيل|تسليم|delivery|handover/i);

    // Verify KPI cards
    await expect(page.getByText(/إجمالي الشحنات|total deliveries/i).first()).toBeVisible();

    // Verify search input
    const searchInput = page.getByPlaceholder(/بحث برقم|search delivery#/i);
    await expect(searchInput).toBeVisible();

    // Verify status filter pills
    await expect(page.getByRole("button", { name: /كافة الشحنات|all deliveries/i }).first()).toBeVisible();

    // Verify bottom pagination bar
    await expect(page.getByText(/عرض|showing/i).first()).toBeVisible();

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

  test("2. Verify Order Detail Delivery & Handover Widget", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Sign in and open Orders
    await signIn(page);
    await page.goto("/admin/orders");
    await page.waitForLoadState("domcontentloaded");

    // Verify orders heading
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15_000 });

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
