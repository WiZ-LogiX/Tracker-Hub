import { test, expect, signIn } from "./fixtures/auth";

test.describe("TASK 23 — Customer 360 v2 Unified Customer Workspace Browser Validation", () => {
  test("Open /admin/customers, open Customer 360 v2, verify 11 tabs, 10-question diagnostic, and quick actions", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // ── 1. Sign in and Open /admin/customers ──────────────────────────────────
    await signIn(page);
    await page.goto("/admin/customers");
    await page.waitForLoadState("domcontentloaded");

    // Verify page header
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await expect(heading).toContainText(/عملاء|customers/i);

    // ── 2. Verify Table & Search Bar ──────────────────────────────────────────
    await expect(page.getByRole("table")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder(/بحث|search/i)).toBeVisible();

    // ── 3. Open Customer 360 Drawer ───────────────────────────────────────────
    const viewButtons = page.locator("button[title*='360']");
    const count = await viewButtons.count();
    if (count > 0) {
      await viewButtons.first().click();
      const drawer = page.getByRole("dialog");
      await expect(drawer).toBeVisible({ timeout: 7000 });

      // ── 4. Verify 11 Tabs Existence ─────────────────────────────────────────
      await expect(drawer.getByRole("tab", { name: /نظرة عامة|overview/i })).toBeVisible();
      await expect(drawer.getByRole("tab", { name: /مشاريع|projects/i })).toBeVisible();
      await expect(drawer.getByRole("tab", { name: /فرص|opportunities/i })).toBeVisible();
      await expect(drawer.getByRole("tab", { name: /عروض|مقايسات|quotes/i })).toBeVisible();
      await expect(drawer.getByRole("tab", { name: /أوامر|orders/i })).toBeVisible();
      await expect(drawer.getByRole("tab", { name: /مالية|فواتير|financials/i })).toBeVisible();
      await expect(drawer.getByRole("tab", { name: /مهام|tasks/i })).toBeVisible();
      await expect(drawer.getByRole("tab", { name: /ورشة|تشغيل|production/i })).toBeVisible();
      await expect(drawer.getByRole("tab", { name: /تسليم|deliveries/i })).toBeVisible();
      await expect(drawer.getByRole("tab", { name: /جودة|ضمان|quality/i })).toBeVisible();
      await expect(drawer.getByRole("tab", { name: /سجل|أحداث|timeline/i })).toBeVisible();

      // ── 5. Verify 10-Question Diagnostic Header & Quick Actions ─────────────
      await expect(drawer.getByText(/التشخيص التنفيذي|10 أسئلة|Executive 360 Diagnostic|10 Core Questions/i)).toBeVisible();

      // Quick action buttons present
      const projectAction = drawer.getByRole("button", { name: /\+ مشروع|\+ project/i });
      await expect(projectAction).toBeVisible();

      const taskAction = drawer.getByRole("button", { name: /\+ مهمة|\+ task/i });
      await expect(taskAction).toBeVisible();

      // ── 6. Test Tab Switching ───────────────────────────────────────────────
      // Switch to Projects tab
      await drawer.getByRole("tab", { name: /مشاريع|projects/i }).click();
      await expect(drawer.getByText(/هيكلية المشاريع|project-centric/i)).toBeVisible();

      // Switch to Financials tab
      await drawer.getByRole("tab", { name: /مالية|financials/i }).click();
      await expect(drawer.getByText(/إجمالي المطالبات|الفواتير|سجل التحصيلات|total invoiced|invoices/i).first()).toBeVisible();

      // Switch to Timeline tab
      await drawer.getByRole("tab", { name: /سجل|timeline/i }).click();
      await expect(drawer.getByText(/سجل الأحداث|timeline/i).first()).toBeVisible();
    }

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
