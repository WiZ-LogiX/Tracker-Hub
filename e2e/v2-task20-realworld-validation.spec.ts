import { test, expect, signIn, MOCK_CUSTOMER_ID, MOCK_TENANT_ID } from "./fixtures/auth";

test.describe("Task 20.1 — Commercial Quotation Validation & Retired Configurator Redirect", () => {
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

  test("Redirects from retired configurator to commercial builder, performs dimension & pricing calculations", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    // ── 1. Sign In and Navigate to Configurator URL (Verify Redirect) ─────────
    await signIn(page);
    await page.goto("/admin/quotes/configurator");
    await page.waitForLoadState("domcontentloaded");

    await expect(page).toHaveURL(/\/admin\/quotes\/new/);
    await expect(
      page.getByText(/منشئ عروض الأسعار التجارية|Commercial Quotation Builder/i),
    ).toBeVisible({ timeout: 15_000 });

    // ── 2. Select Kitchen Product Category ───────────────────────────────────
    const catTrigger = page
      .locator('button[role="combobox"]')
      .filter({ hasText: /اختر نوع المنتج|Select product category/i })
      .first();
    await expect(catTrigger).toBeVisible({ timeout: 10_000 });
    await catTrigger.click();
    await page.getByRole("option", { name: /مطبخ|Kitchen/i }).first().click();

    // ── 3. Configure Kitchen Dimensions & Price ──────────────────────────────
    const widthInputs = page.locator('input[placeholder*="العرض"], input[placeholder*="Width"]');
    const heightInputs = page.locator('input[placeholder*="الارتفاع"], input[placeholder*="Height"]');
    const depthInputs = page.locator('input[placeholder*="العمق"], input[placeholder*="Depth"]');
    const priceInputs = page.locator('input[placeholder="0"]');

    await widthInputs.first().fill("3.0");
    await heightInputs.first().fill("2.4");
    await depthInputs.first().fill("0.6");
    await priceInputs.first().fill("45000");

    // Verify subtotal displays 45,000
    await expect(page.getByText(/٤٥٬٠٠٠|45,000/i).first()).toBeVisible();

    // ── 4. Add Second Line (Door) with Multi-Quantity (Qty = 2) ──────────────
    const addLineBtn = page.getByRole("button", { name: /إضافة بند جديد|\+ Add Item/i }).first();
    await addLineBtn.click();
    await expect(page.getByText("#2")).toBeVisible({ timeout: 5_000 });

    const categoryTrigger2 = page
      .locator('button[role="combobox"]')
      .filter({ hasText: /اختر نوع المنتج|Select product category/i })
      .first();
    await categoryTrigger2.click();
    await page.getByRole("option", { name: /باب|Door/i }).first().click();

    const qtyInputs = page.locator('input[type="number"][placeholder="1"]');
    await qtyInputs.nth(1).fill("2");
    await priceInputs.nth(1).fill("12000");

    // ── 5. Verify Totals Calculation (45,000 + 24,000 = 69,000) ──────────────
    await expect(page.getByText(/المجموع الفرعي|Subtotal/i)).toBeVisible();
    await expect(page.getByText(/٦٩٬٠٠٠|69,000/i).first()).toBeVisible();

    // ── 6. Preview Modal Verification ────────────────────────────────────────
    const previewBtn = page.getByRole("button", { name: /معاينة عرض السعر|Preview/i }).first();
    await previewBtn.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("PELECANON", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/٦٩٬٠٠٠|69,000/i).first()).toBeVisible();

    const closeBtn = dialog.getByRole("button", { name: /إغلاق المعاينة|Close Preview/i });
    await closeBtn.click();
    await expect(dialog).toBeHidden();

    // ── 7. Check for Zero Critical Console Exceptions ─────────────────────────
    const criticalExceptions = consoleErrors.filter(
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
    expect(criticalExceptions.length).toBe(0);
  });
});
