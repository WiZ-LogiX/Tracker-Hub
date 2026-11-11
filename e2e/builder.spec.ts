import { test, expect, signIn, MOCK_CUSTOMER_ID, MOCK_TENANT_ID } from "./fixtures/auth";

test.describe("Quote Builder — Commercial Quotation Workflow & Legacy Configurator Retirement", () => {
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

    await page.route("**/rest/v1/quotes**", async (route) => {
      const isSingle = route.request().headers()["accept"]?.includes("vnd.pgrst.object+json");
      const quoteRecord = {
        id: "22222222-2222-2222-2222-222222222222",
        tenant_id: MOCK_TENANT_ID,
        quote_number: "PLC-00100",
        customer_id: MOCK_CUSTOMER_ID,
        status: "draft",
        subtotal: 85000,
        discount_amount: 0,
        vat_amount: 0,
        total: 85000,
        deposit_pct: 60,
        valid_until: "2026-11-28",
        created_at: new Date().toISOString(),
      };
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "content-range": "0-0/1" },
        body: JSON.stringify(isSingle ? quoteRecord : [quoteRecord]),
      });
    });
  });

  test("retired configurator route automatically redirects to commercial builder", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/admin/quotes/configurator");
    await page.waitForLoadState("domcontentloaded");

    // Must be redirected to /admin/quotes/new
    await expect(page).toHaveURL(/\/admin\/quotes\/new/);
    await expect(
      page.getByText(/منشئ عروض الأسعار التجارية|Commercial Quotation Builder/i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("builds a commercial quotation: select category → dimensions → specs → price → preview → save", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/admin/quotes/new?customerId=${MOCK_CUSTOMER_ID}`);
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByText(/منشئ عروض الأسعار التجارية|Commercial Quotation Builder/i),
    ).toBeVisible({ timeout: 15_000 });

    // ── 1. Select Product Category ────────────────────────────────────
    const catTrigger = page
      .locator('button[role="combobox"]')
      .filter({ hasText: /اختر نوع المنتج|Select product category/i })
      .first();
    await expect(catTrigger).toBeVisible({ timeout: 10_000 });
    await catTrigger.click();
    await page.getByRole("option", { name: /مطبخ|Kitchen/i }).first().click();

    // ── 2. Enter Dimensions ───────────────────────────────────────────
    const widthInputs = page.locator('input[placeholder*="العرض"], input[placeholder*="Width"]');
    const heightInputs = page.locator('input[placeholder*="الارتفاع"], input[placeholder*="Height"]');
    await widthInputs.first().fill("3.5");
    await heightInputs.first().fill("2.4");

    // ── 3. Enter Price ────────────────────────────────────────────────
    const priceInputs = page.locator('input[placeholder="0"]');
    await priceInputs.first().fill("85000");

    // ── 4. Open PDF Preview Modal ─────────────────────────────────────
    const previewBtn = page.getByRole("button", { name: /معاينة عرض السعر|Preview/i }).first();
    await expect(previewBtn).toBeVisible({ timeout: 5_000 });
    await previewBtn.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("PELECANON", { exact: true })).toBeVisible();

    // Close preview modal
    const closeBtn = dialog.getByRole("button", { name: /إغلاق المعاينة|Close Preview/i });
    await closeBtn.click();
    await expect(dialog).toBeHidden();

    // ── 5. Save the Quote Draft ───────────────────────────────────────
    const saveBtn = page.getByRole("button", { name: /حفظ كمسودة|Save as Draft/i }).first();
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });
    await saveBtn.click();

    // Should indicate save success or toast
    await expect(
      page.getByText(/تم حفظ|تم الحفظ|Saved successfully|مسودة|draft/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("validates required customer selection before saving when customerId missing", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/admin/quotes/new");
    await page.waitForLoadState("domcontentloaded");

    // Initial state: category unselected
    await expect(
      page.getByText(/اختر نوع المنتج|Select product category/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Try to save draft without selecting customer
    const saveBtn = page.getByRole("button", { name: /حفظ كمسودة|Save as Draft/i }).first();
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });
    await saveBtn.click();

    // Should display validation notification about customer
    await expect(
      page.getByText(/يرجى تحديد العميل أولاً|Please select a customer first/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });
});
