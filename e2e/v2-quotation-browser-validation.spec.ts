import { test, expect, signIn, MOCK_CUSTOMER_ID, MOCK_TENANT_ID } from "./fixtures/auth";

test.describe("V2 Quotation Configurator Retirement & Browser Validation", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/rest/v1/customers**", async (route) => {
      const isSingle = route.request().headers()["accept"]?.includes("vnd.pgrst.object+json");
      const customerRecord = {
        id: MOCK_CUSTOMER_ID,
        tenant_id: MOCK_TENANT_ID,
        name: "مستر شاهين",
        phone: "+20 11 16322271",
        email: "shaheen@example.com",
        address: "القاهرة - التجمع الخامس",
      };
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/1" },
        body: JSON.stringify(isSingle ? customerRecord : [customerRecord]),
      });
    });
  });

  test("Legacy Configurator Retirement: Redirects /admin/quotes/configurator to /admin/quotes/new", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // ── 1. Navigate to legacy configurator URL ───────────────────────────────
    await signIn(page);
    await page.goto("/admin/quotes/configurator");
    await page.waitForLoadState("domcontentloaded");

    // ── 2. Verify automatic TanStack Router redirect to /admin/quotes/new ─────
    await expect(page).toHaveURL(/\/admin\/quotes\/new/);

    // Verify page loads without broken UI
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/منشئ عروض الأسعار التجارية|Commercial Quotation Builder/i),
    ).toBeVisible({ timeout: 15_000 });

    // ── 3. Verify Customer & Category Pickers are Interactive ────────────────
    const catTrigger = page
      .locator('button[role="combobox"]')
      .filter({ hasText: /اختر نوع المنتج|Select product category/i })
      .first();
    await expect(catTrigger).toBeVisible({ timeout: 10_000 });
    await catTrigger.click();
    await page.getByRole("option", { name: /مطبخ|Kitchen/i }).first().click();

    // Verify item fields expand
    await expect(page.getByText(/مطبخ — مطبخ|Kitchen — Kitchen|#1/i).first()).toBeVisible();

    // Check for actual React or JavaScript application exceptions
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

    expect(appExceptions.length).toBe(0);
  });

  test("Commercial Quotation Builder elements are interactive and accessible without console crashes", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await signIn(page);
    await page.goto("/admin/quotes/new");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });

    // Check action buttons presence
    const buttons = page.getByRole("button");
    const count = await buttons.count();
    expect(count).toBeGreaterThan(2);

    // Check notes textarea is interactive
    const notesArea = page.locator("textarea").first();
    if (await notesArea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await notesArea.fill("ملاحظات تجريبية لفحص الحفظ والتسعير");
      expect(await notesArea.inputValue()).toBe("ملاحظات تجريبية لفحص الحفظ والتسعير");
    }

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

    expect(appExceptions.length).toBe(0);
  });
});
