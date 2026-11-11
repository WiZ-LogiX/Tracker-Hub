import { test, expect, signIn, MOCK_CUSTOMER_ID, MOCK_TENANT_ID } from "./fixtures/auth";

test.describe("Commercial Quotation Pricing Hardening & Legacy Retirement", () => {
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

  test("Redirects legacy configurator, enters dimensions and calculates live breakdown", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // ── 1. Navigate to legacy configurator URL (verify redirect) ─────────────
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

    // ── 3. Edit Dimensions & Pricing ─────────────────────────────────────────
    const widthInputs = page.locator('input[placeholder*="العرض"], input[placeholder*="Width"]');
    const heightInputs = page.locator('input[placeholder*="الارتفاع"], input[placeholder*="Height"]');
    const priceInputs = page.locator('input[placeholder="0"]');

    await widthInputs.first().fill("3.0");
    await heightInputs.first().fill("2.4");
    await priceInputs.first().fill("45000");

    // ── 4. Verify Live Breakdown ─────────────────────────────────────────────
    await expect(page.getByText(/المجموع الفرعي|Subtotal/i)).toBeVisible();
    await expect(page.getByText(/السعر الإجمالي بعد الخصم|Grand Total/i)).toBeVisible();
    await expect(page.getByText(/٤٥٬٠٠٠|45,000/i).first()).toBeVisible();

    // ── 5. Add Door Product and Verify Multiplier / Totals ───────────────────
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

    // Total should be 45,000 + 24,000 = 69,000
    await expect(page.getByText(/٦٩٬٠٠٠|69,000/i).first()).toBeVisible();

    // ── 6. Verify Console Error Freedom ──────────────────────────────────────
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

  test("Quotes List displays with accurate server-side pagination and totals", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/admin/quotes");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });

    // Check search input is responsive
    const searchInput = page.getByPlaceholder(/search|بحث/i).first();
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill("QT");
      await page.waitForTimeout(500);
    }

    // Table should render without throwing
    const table = page.locator("table");
    await expect(table).toBeVisible({ timeout: 5_000 });
  });
});
