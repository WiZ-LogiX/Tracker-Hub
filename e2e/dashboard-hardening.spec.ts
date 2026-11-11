import { test, expect, signIn } from "./fixtures/auth";

test.describe("Task 18 — Executive Operations & Commercial Dashboard Hardening Browser Validation", () => {
  test("1. Verify Executive Operations Command Center (/admin), Primary KPIs, and Attention Center", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Sign in and open Admin Dashboard
    await signIn(page);
    await page.goto("/admin");
    await page.waitForLoadState("domcontentloaded");

    // Verify page header
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await expect(heading).toContainText(/مركز القيادة|executive|operations/i);

    // Verify Primary KPI cards
    await expect(page.getByText(/التحصيل والمستحقات|financial|collection/i).first()).toBeVisible();
    await expect(page.getByText(/القيمة التجارية|commercial pipeline/i).first()).toBeVisible();
    await expect(page.getByText(/الإنتاج النشط|active factory/i).first()).toBeVisible();
    await expect(page.getByText(/الشحنات والتسليمات|deliveries/i).first()).toBeVisible();

    // Verify Needs Attention section
    await expect(page.getByText(/تنبيهات تتطلب إجراء|needs attention|management attention/i).first()).toBeVisible();

    // Verify Factory Pipeline
    await expect(page.getByText(/مراحل خط الإنتاج|factory production pipeline/i).first()).toBeVisible();

    // Verify Inventory Health
    await expect(page.getByText(/حالة المخزون|inventory & stock health/i).first()).toBeVisible();

    // Verify Quality & Remakes
    await expect(page.getByText(/إدارة الجودة|quality & remakes/i).first()).toBeVisible();

    // Verify Task Operations
    await expect(page.getByText(/المهام التشغيلية|task operations/i).first()).toBeVisible();

    // Verify Recent Activity
    await expect(page.getByText(/سجل النشاط|recent activity/i).first()).toBeVisible();

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
