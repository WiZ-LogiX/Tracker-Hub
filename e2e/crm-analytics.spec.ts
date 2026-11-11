import { test, expect, signIn } from "./fixtures/auth";

test.describe("TASK 28 — PeleCanon CRM Intelligence & Commercial Analytics Validation", () => {
  test("1. CRM Analytics Cockpit (/admin/crm/analytics): KPIs, Pipeline Funnel, Sources, Quotes, and Lost Reasons", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // ── 1. Sign In and Navigate to /admin/crm/analytics ───────────────────────
    await signIn(page);
    await page.goto("/admin/crm/analytics");
    await page.waitForLoadState("domcontentloaded");

    // ── 2. Verify Page Header & Branding ─────────────────────────────────────
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await expect(heading).toContainText(/ذكاء وتحليلات المبيعات|commercial analytics|crm intelligence/i);

    // ── 3. Verify Time Window Toolbar ────────────────────────────────────────
    const todayBtn = page.getByRole("button", { name: /اليوم|today/i }).first();
    const thisWeekBtn = page.getByRole("button", { name: /هذا الأسبوع|this week/i }).first();
    const thisMonthBtn = page.getByRole("button", { name: /هذا الشهر|this month/i }).first();
    const thisQuarterBtn = page.getByRole("button", { name: /هذا الربع|this quarter/i }).first();
    const customBtn = page.getByRole("button", { name: /فترة مخصصة|custom/i }).first();

    await expect(todayBtn).toBeVisible();
    await expect(thisWeekBtn).toBeVisible();
    await expect(thisMonthBtn).toBeVisible();
    await expect(thisQuarterBtn).toBeVisible();
    await expect(customBtn).toBeVisible();

    // Verify Refresh Button
    const refreshBtn = page.getByRole("button", { name: /تحديث|refresh/i });
    await expect(refreshBtn).toBeVisible();

    // Wait for initial analytics data to load
    await expect(page.getByText(/Active Period|الفترة المعروضة/i)).toBeVisible({ timeout: 15_000 });

    // ── 4. Verify Summary KPI Cards ──────────────────────────────────────────
    const kpiCards = page.locator(".grid .rounded-2xl");
    await expect(kpiCards.first()).toBeVisible({ timeout: 10_000 });
    const kpiCount = await kpiCards.count();
    expect(kpiCount).toBeGreaterThanOrEqual(6);

    // ── 5. Verify Core Analytics Sections ────────────────────────────────────
    // Pipeline Distribution Card
    await expect(page.locator("body")).toContainText(/مراحل خط المبيعات|pipeline|stage distribution/i);

    // Quotation Conversion Card
    await expect(page.locator("body")).toContainText(/عروض الأسعار|quotation|quote conversion/i);

    // Lead Sources Table
    await expect(page.locator("body")).toContainText(/قنوات الاستقطاب|lead sources|acquisition/i);

    // Lost Reasons Card
    await expect(page.locator("body")).toContainText(/أسباب خسارة الصفقات|lost reasons/i);

    // Sales Activity Table
    await expect(page.locator("body")).toContainText(/فريق المبيعات|sales activity|sales representative/i);

    // Customer Loyalty & After-Sales
    await expect(page.locator("body")).toContainText(/تكرار الشراء|repeat|retention/i);
    await expect(page.locator("body")).toContainText(/ما بعد البيع|after-sales/i);

    // ── 6. Test Time Window Switcher ─────────────────────────────────────────
    // Click "This Quarter"
    await thisQuarterBtn.click();
    await expect(page.locator("body")).toContainText(/q[1-4]|الربع/i, { timeout: 15_000 });

    // Click "Custom Range" and check date inputs appear
    await customBtn.click();
    const dateInputs = page.locator("input[type='date']");
    await expect(dateInputs.first()).toBeVisible({ timeout: 5_000 });
    expect(await dateInputs.count()).toBe(2);

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

  test("2. Sidebar Navigation Link to CRM Analytics", async ({ page }) => {
    test.setTimeout(60_000);
    await signIn(page);
    await page.goto("/admin");
    await page.waitForLoadState("domcontentloaded");

    // Verify CRM Analytics link in sidebar
    const analyticsLink = page.locator("a[href='/admin/crm/analytics']").first();
    await expect(analyticsLink).toBeVisible({ timeout: 10_000 });

    // Click link and verify navigation
    await analyticsLink.click();
    await page.waitForURL("**/admin/crm/analytics**", { timeout: 10_000 });
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText(/ذكاء وتحليلات المبيعات|commercial analytics|crm intelligence/i);
  });
});
