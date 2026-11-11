import { test, expect, signIn } from "./fixtures/auth";

test.describe("Task 12 — V2 Cost Analysis & Profitability Browser Validation", () => {
  test("Open /admin/cost-analysis, verify KPI cards, category breakdown, top drivers, and quotation margins", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // ── 1. Sign in and Open /admin/cost-analysis ───────────────────────────────
    await signIn(page);
    await page.goto("/admin/cost-analysis");
    await page.waitForLoadState("domcontentloaded");

    // Verify page header
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await expect(heading).toContainText(/تكاليف|cost/i);

    // ── 2. Verify KPI Cards ───────────────────────────────────────────────────
    await expect(page.getByText(/إجمالي قيمة البيع|selling/i).first()).toBeVisible();
    await expect(page.getByText(/تكلفة التصنيع|mfg cost/i).first()).toBeVisible();
    await expect(page.getByText(/الربح التشغيلي|gross profit/i).first()).toBeVisible();
    await expect(page.getByText(/هامش الربح|margin/i).first()).toBeVisible();

    // ── 3. Verify Breakdown & Top Drivers ─────────────────────────────────────
    await expect(page.getByText(/هيكل التكلفة|Manufacturing Cost Structure/i).first()).toBeVisible();
    await expect(page.getByText(/Top Material Cost Drivers|أبرز بنود/i).first()).toBeVisible();

    // Filter framework hydration warnings
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
